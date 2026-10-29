/* eslint-disable import/no-relative-parent-imports, max-statements */
import { and, db, eq, gte, inArray, isNull, or, sql } from "@callcastlecare/db";
import {
  assignments,
  dispatchOffers,
  legMediaLinks,
  legStatusHistory,
  mediaAssets,
  orderMediaLinks,
  orders,
  serviceLegs,
  workers,
} from "@callcastlecare/db/schema/index";
import { renderProviderApplicationReceivedEmail } from "@callcastlecare/email";
import { Hono } from "hono";
import type { Context } from "hono";

import { requireUser, requireWorkerForUser } from "../lib/auth";
import { sendEmail } from "../lib/integrations/email";
import { getStripeMode } from "../lib/integrations/stripe-client";
import {
  createConnectAccount,
  createConnectAccountLink,
  retrieveConnectAccountState,
} from "../lib/integrations/stripe-connect";
import { logger } from "../lib/logger";
import { setOrderStatus } from "../lib/orders";
import { publishOutboxEvent } from "../lib/outbox";
import {
  createCompletionPayoutRecords,
  releasePendingWorkerPayouts,
} from "../lib/payouts";
import type { AppEnv } from "../types";
import {
  driverLocationHeartbeatSchema,
  providerProfileRequestSchema,
} from "./schemas";

const parsePositiveId = (value: string) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const DRIVER_OFFER_LOCKOUT_MS = 2 * 60 * 60 * 1000;

class DriverRouteError extends Error {
  statusCode: 404 | 409;

  constructor(message: string, statusCode: 404 | 409) {
    super(message);
    this.name = "DriverRouteError";
    this.statusCode = statusCode;
  }
}

type MediaType =
  | "lawncare_before"
  | "lawncare_after"
  | "laundry_pickup"
  | "laundry_scan"
  | "laundry_folded"
  | "laundry_dropoff";

const orderStatusTimestampPatch = (
  status: "arrived" | "in_progress" | "completed"
) => {
  if (status === "arrived") {
    return { arrivedAt: new Date() };
  }
  if (status === "in_progress") {
    return { startedAt: new Date() };
  }
  return { completedAt: new Date() };
};

const propertyPhotoTypes = [
  "property_front",
  "property_back",
  "property_left",
  "property_right",
] as const;

const hasRequiredOrderPhaseMedia = async (input: {
  orderId: number;
  phase: "after" | "before";
  serviceType: string;
}) => {
  const links = await db.query.orderMediaLinks.findMany({
    columns: { mediaAssetId: true },
    where: eq(orderMediaLinks.orderId, input.orderId),
  });
  const mediaIds = links.map((link) => link.mediaAssetId);
  if (mediaIds.length === 0) {
    return false;
  }
  const assets = await db.query.mediaAssets.findMany({
    columns: { mediaType: true, metadataJson: true },
    where: inArray(mediaAssets.id, mediaIds),
  });
  const hasPhaseMedia = (asset: (typeof assets)[number]) => {
    const metadata =
      asset.metadataJson && typeof asset.metadataJson === "object"
        ? (asset.metadataJson as Record<string, unknown>)
        : {};
    const assetPhase =
      metadata.phase ??
      (asset.mediaType.endsWith("_after") ? "after" : "before");
    return assetPhase === input.phase;
  };

  if (input.serviceType === "lawncare" || input.serviceType === "laundry") {
    const propertySlotsComplete = propertyPhotoTypes.every((mediaType) =>
      assets.some(
        (asset) => asset.mediaType === mediaType && hasPhaseMedia(asset)
      )
    );
    if (propertySlotsComplete) {
      return true;
    }
    const legacyMediaType =
      input.phase === "before" ? "lawncare_before" : "lawncare_after";
    return assets.some(
      (asset) => asset.mediaType === legacyMediaType && hasPhaseMedia(asset)
    );
  }

  const mediaType =
    input.phase === "before" ? "service_before" : "service_after";
  return assets.some(
    (asset) => asset.mediaType === mediaType && hasPhaseMedia(asset)
  );
};

const hasLegMediaType = async (legId: number, mediaType: MediaType) => {
  const links = await db.query.legMediaLinks.findMany({
    columns: {
      mediaAssetId: true,
    },
    where: eq(legMediaLinks.legId, legId),
  });

  const mediaIds = links.map((link) => link.mediaAssetId);
  if (mediaIds.length === 0) {
    return false;
  }

  const assets = await db.query.mediaAssets.findMany({
    columns: {
      id: true,
      mediaType: true,
    },
    where: inArray(mediaAssets.id, mediaIds),
  });

  return assets.some((asset) => asset.mediaType === mediaType);
};

const getRequiredMediaForLeg = (
  legType:
    | "pickup"
    | "facility_in"
    | "wash"
    | "dry"
    | "fold"
    | "facility_out"
    | "dropoff"
) => {
  if (legType === "pickup") {
    return "laundry_pickup";
  }
  if (legType === "facility_in") {
    return "laundry_scan";
  }
  if (legType === "fold") {
    return "laundry_folded";
  }
  if (legType === "dropoff") {
    return "laundry_dropoff";
  }
  return null;
};

const requireWorkerProfile = async (c: Context<AppEnv>) => {
  const userResult = requireUser(c);
  if (userResult.error) {
    return {
      error: userResult.error,
      user: null,
      worker: null,
    };
  }

  const worker = await requireWorkerForUser(userResult.user);
  if (!worker) {
    return {
      error: c.json({ error: "worker_profile_required" }, 403),
      user: userResult.user,
      worker: null,
    };
  }

  return {
    error: null,
    user: userResult.user,
    worker,
  };
};

const requireWorker = async (c: Context<AppEnv>) => {
  const workerResult = await requireWorkerProfile(c);
  if (workerResult.error || !workerResult.worker) {
    return workerResult;
  }
  if (
    workerResult.worker.onboardingStatus !== "approved" ||
    !workerResult.worker.isActive
  ) {
    return {
      error: c.json({ error: "provider_activation_required" }, 403),
      user: workerResult.user,
      worker: null,
    };
  }
  return workerResult;
};

const withDriverOrder = async (input: {
  orderId: number;
  workerId: number;
}) => {
  const order = await db.query.orders.findFirst({
    where: and(
      eq(orders.id, input.orderId),
      eq(orders.assignedWorkerId, input.workerId)
    ),
  });

  if (!order) {
    return null;
  }

  return order;
};

const updateWorkerConnectState = async (
  workerId: number,
  state: {
    accountApiVersion: "2026-06-24-v1" | "2026-06-24-v2";
    chargesEnabled: boolean;
    mode: "live" | "test";
    payoutsEnabled: boolean;
    requirements: unknown;
    status: string;
  }
) => {
  const current = await db.query.workers.findFirst({
    where: eq(workers.id, workerId),
  });
  const [updated] = await db
    .update(workers)
    .set({
      isActive:
        state.status === "ready" && current?.onboardingStatus === "approved",
      stripeAccountApiVersion: state.accountApiVersion,
      stripeAccountMode: state.mode,
      stripeAccountStatus: state.status,
      stripeChargesEnabled: state.chargesEnabled,
      stripePayoutsEnabled: state.payoutsEnabled,
      stripeRequirementsJson: state.requirements,
      updatedAt: new Date(),
    })
    .where(eq(workers.id, workerId))
    .returning();
  return updated ?? null;
};

export const driverRoutes = new Hono<AppEnv>()
  .post("/connect/status", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const workerResult = await requireWorkerForUser(userResult.user);
    if (!workerResult) {
      return c.json(
        {
          accountId: null,
          onboardingStatus: "none",
          payoutsEnabled: false,
          providerVerificationPaidAt: null,
          status: "not_started",
        },
        200
      );
    }
    if (!workerResult.stripeAccountId) {
      return c.json(
        {
          accountId: null,
          onboardingStatus: workerResult.onboardingStatus,
          payoutsEnabled: false,
          providerVerificationPaidAt:
            workerResult.providerVerificationPaidAt?.toISOString() ?? null,
          status: "not_started",
        },
        200
      );
    }

    try {
      const state = await retrieveConnectAccountState(
        workerResult.stripeAccountId
      );
      const worker = await updateWorkerConnectState(workerResult.id, state);
      if (worker && state.status === "ready") {
        await releasePendingWorkerPayouts(worker.id);
      }
      return c.json(
        {
          accountId: state.accountId,
          onboardingStatus:
            worker?.onboardingStatus ?? workerResult.onboardingStatus,
          payoutsEnabled: state.payoutsEnabled,
          providerVerificationPaidAt:
            (
              worker?.providerVerificationPaidAt ??
              workerResult.providerVerificationPaidAt
            )?.toISOString() ?? null,
          status: worker?.stripeAccountStatus ?? state.status,
          transferCapabilityStatus: state.transferCapabilityStatus,
        },
        200
      );
    } catch (error) {
      logger.error(
        {
          err: error,
          requestId: c.get("requestId"),
          workerId: workerResult.id,
        },
        "stripe_connect:status_refresh_failed"
      );
      return c.json({ error: "Connect status could not be refreshed" }, 502);
    }
  })
  .post("/connect/account-link", async (c) => {
    const workerResult = await requireWorkerProfile(c);
    if (workerResult.error) {
      return workerResult.error;
    }
    if (workerResult.worker.onboardingStatus !== "approved") {
      return c.json(
        { error: "Connect onboarding unlocks after screening approval" },
        409
      );
    }

    let accountId =
      workerResult.worker.stripeAccountMode === getStripeMode()
        ? workerResult.worker.stripeAccountId
        : null;
    let accountApiVersion = workerResult.worker.stripeAccountApiVersion as
      | "2026-06-24-v1"
      | "2026-06-24-v2"
      | null;
    try {
      if (!accountId) {
        const created = await createConnectAccount({
          email: workerResult.worker.email,
          name: `${workerResult.worker.firstName} ${workerResult.worker.lastName}`.trim(),
          workerId: workerResult.worker.id,
        });
        const {
          accountApiVersion: createdAccountApiVersion,
          accountId: createdAccountId,
        } = created;
        accountId = createdAccountId;
        accountApiVersion = createdAccountApiVersion;
        await db
          .update(workers)
          .set({
            stripeAccountApiVersion: accountApiVersion,
            stripeAccountId: accountId,
            stripeAccountMode: getStripeMode(),
            stripeAccountStatus: "pending",
            updatedAt: new Date(),
          })
          .where(eq(workers.id, workerResult.worker.id));
      }

      const { origin } = new URL(c.req.url);
      const url = await createConnectAccountLink({
        accountApiVersion: accountApiVersion ?? "2026-06-24-v1",
        accountId,
        refreshUrl: `${origin}/dashboard/provider?connect=refresh`,
        returnUrl: `${origin}/dashboard/provider?connect=complete`,
      });
      logger.info(
        {
          accountId,
          requestId: c.get("requestId"),
          userId: workerResult.user.id,
          workerId: workerResult.worker.id,
        },
        "stripe_connect:onboarding_link_created"
      );
      return c.json({ url }, 200);
    } catch (error) {
      logger.error(
        {
          err: error,
          requestId: c.get("requestId"),
          workerId: workerResult.worker.id,
        },
        "stripe_connect:onboarding_link_failed"
      );
      return c.json({ error: "Connect onboarding could not be started" }, 502);
    }
  })
  .post("/profile", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const body = await c.req.json();
    const parsed = providerProfileRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const payload = parsed.data;
    const rows = await db
      .insert(workers)
      .values({
        applicationFormData: payload.applicationFormData ?? null,
        email: payload.email.trim().toLowerCase(),
        equipmentJson: payload.equipmentJson ?? null,
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone,
        serviceRadiusMiles: payload.serviceRadiusMiles,
        servicesOffered: payload.servicesOffered,
        updatedAt: new Date(),
        userId: userResult.user.id,
      })
      .onConflictDoUpdate({
        set: {
          applicationFormData: payload.applicationFormData ?? null,
          email: payload.email.trim().toLowerCase(),
          equipmentJson: payload.equipmentJson ?? null,
          firstName: payload.firstName,
          lastName: payload.lastName,
          phone: payload.phone,
          serviceRadiusMiles: payload.serviceRadiusMiles,
          servicesOffered: payload.servicesOffered,
          updatedAt: new Date(),
        },
        target: workers.userId,
      })
      .returning();

    const [worker] = rows;
    if (!worker) {
      return c.json({ error: "Failed to save provider profile" }, 500);
    }

    try {
      const renderedEmail = await renderProviderApplicationReceivedEmail({
        applicantName: payload.firstName,
        planName: "Standard Provider",
        services: payload.servicesOffered,
      });

      await sendEmail({
        html: renderedEmail.html,
        idempotencyKey: `worker-profile/${worker.id}/application-received`,
        subject: "Your CastleCare Provider Application is Received",
        text: renderedEmail.text,
        to: payload.email,
      });
    } catch {
      // Email failure should not block profile response
    }

    return c.json({ worker }, 200);
  })
  .post("/location", async (c) => {
    const workerResult = await requireWorker(c);
    if (workerResult.error) {
      return workerResult.error;
    }

    const body = await c.req.json();
    const parsed = driverLocationHeartbeatSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const capturedAt = parsed.data.capturedAt
      ? new Date(parsed.data.capturedAt)
      : new Date();

    await db.execute(
      sql`UPDATE "workers"
          SET "current_latitude" = ${parsed.data.latitude},
              "current_longitude" = ${parsed.data.longitude},
              "last_location_updated_at" = ${capturedAt},
              "updated_at" = now(),
              "location" = ST_SetSRID(ST_MakePoint(${parsed.data.longitude}, ${parsed.data.latitude}), 4326)::geography
          WHERE "id" = ${workerResult.worker.id}`
    );

    let trackingOrderId = parsed.data.orderId ?? null;
    if (trackingOrderId) {
      const order = await withDriverOrder({
        orderId: trackingOrderId,
        workerId: workerResult.worker.id,
      });

      if (!order) {
        return c.json({ error: "Order not found for worker" }, 404);
      }
    } else {
      const activeOrder = await db.query.orders.findFirst({
        orderBy: (table, { desc }) => [desc(table.updatedAt)],
        where: and(
          eq(orders.assignedWorkerId, workerResult.worker.id),
          inArray(orders.status, [
            "assigned",
            "dispatching",
            "en_route",
            "arrived",
            "in_progress",
          ])
        ),
      });

      trackingOrderId = activeOrder?.id ?? null;
    }

    if (trackingOrderId) {
      await db.execute(sql`
        INSERT INTO "order_tracking_points" (
          "order_id",
          "worker_id",
          "latitude",
          "longitude",
          "heading",
          "speed_mps",
          "accuracy_meters",
          "captured_at",
          "location"
        ) VALUES (
          ${trackingOrderId},
          ${workerResult.worker.id},
          ${parsed.data.latitude},
          ${parsed.data.longitude},
          ${parsed.data.heading ?? null},
          ${parsed.data.speedMps ?? null},
          ${parsed.data.accuracyMeters ?? null},
          ${capturedAt},
          ST_SetSRID(ST_MakePoint(${parsed.data.longitude}, ${parsed.data.latitude}), 4326)::geography
        )
      `);
    }

    return c.json({ ok: true }, 200);
  })
  .post("/offers/:offerId/accept", async (c) => {
    const workerResult = await requireWorker(c);
    if (workerResult.error) {
      return workerResult.error;
    }

    const offerId = parsePositiveId(c.req.param("offerId"));
    if (!offerId) {
      return c.json({ error: "Invalid offer id" }, 400);
    }

    let acceptedOrderId = 0;
    try {
      await db.transaction(async (tx) => {
        const now = new Date();

        const offer = await tx.query.dispatchOffers.findFirst({
          where: and(
            eq(dispatchOffers.id, offerId),
            eq(dispatchOffers.workerId, workerResult.worker.id)
          ),
        });

        if (!offer) {
          throw new DriverRouteError("Offer not found", 404);
        }

        if (offer.status !== "pending") {
          throw new DriverRouteError("Offer is no longer actionable", 409);
        }

        if (offer.expiresAt && offer.expiresAt.getTime() < now.getTime()) {
          await tx
            .update(dispatchOffers)
            .set({
              respondedAt: now,
              status: "expired",
            })
            .where(eq(dispatchOffers.id, offer.id));
          throw new DriverRouteError("Offer expired", 409);
        }

        const claimedOrder = await tx
          .update(orders)
          .set({
            acceptedAt: now,
            assignedWorkerId: workerResult.worker.id,
            nextWaveAt: null,
            status: "assigned",
            updatedAt: now,
          })
          .where(
            and(
              eq(orders.id, offer.orderId),
              isNull(orders.assignedWorkerId),
              inArray(orders.status, ["paid", "dispatching", "en_route"])
            )
          )
          .returning({ id: orders.id });

        const [claimed] = claimedOrder;
        if (!claimed) {
          throw new DriverRouteError("Order already assigned", 409);
        }

        const acceptedOffers = await tx
          .update(dispatchOffers)
          .set({
            respondedAt: now,
            status: "accepted",
          })
          .where(
            and(
              eq(dispatchOffers.id, offer.id),
              eq(dispatchOffers.status, "pending")
            )
          )
          .returning({ id: dispatchOffers.id });

        const [acceptedOffer] = acceptedOffers;
        if (!acceptedOffer) {
          throw new DriverRouteError("Offer is no longer actionable", 409);
        }

        await tx
          .update(dispatchOffers)
          .set({
            respondedAt: now,
            status: "cancelled",
          })
          .where(
            and(
              eq(dispatchOffers.orderId, offer.orderId),
              eq(dispatchOffers.status, "pending")
            )
          );

        await tx.insert(assignments).values({
          acceptedAt: now,
          dispatchOfferId: offer.id,
          orderId: offer.orderId,
          status: "active",
          workerId: workerResult.worker.id,
        });

        await tx
          .update(workers)
          .set({
            nextOfferEligibleAt: new Date(
              now.getTime() + DRIVER_OFFER_LOCKOUT_MS
            ),
            updatedAt: now,
          })
          .where(eq(workers.id, workerResult.worker.id));

        acceptedOrderId = offer.orderId;
      });
    } catch (error) {
      if (error instanceof DriverRouteError) {
        return c.json({ error: error.message }, { status: error.statusCode });
      }

      throw error;
    }

    await publishOutboxEvent({
      eventName: "driver_assigned",
      payload: {
        orderId: acceptedOrderId,
        workerId: workerResult.worker.id,
      },
    });

    return c.json({ ok: true }, 200);
  })
  .post("/offers/:offerId/decline", async (c) => {
    const workerResult = await requireWorker(c);
    if (workerResult.error) {
      return workerResult.error;
    }

    const offerId = parsePositiveId(c.req.param("offerId"));
    if (!offerId) {
      return c.json({ error: "Invalid offer id" }, 400);
    }

    const offer = await db.query.dispatchOffers.findFirst({
      where: and(
        eq(dispatchOffers.id, offerId),
        eq(dispatchOffers.workerId, workerResult.worker.id)
      ),
    });

    if (!offer) {
      return c.json({ error: "Offer not found" }, 404);
    }

    if (offer.status !== "pending") {
      return c.json({ error: "Offer is no longer actionable" }, 409);
    }

    await db
      .update(dispatchOffers)
      .set({
        respondedAt: new Date(),
        status: "declined",
      })
      .where(
        and(
          eq(dispatchOffers.id, offer.id),
          eq(dispatchOffers.status, "pending"),
          or(
            isNull(dispatchOffers.expiresAt),
            gte(dispatchOffers.expiresAt, new Date())
          )
        )
      );

    return c.json({ ok: true }, 200);
  })
  .post("/orders/:orderId/arrived", async (c) => {
    const workerResult = await requireWorker(c);
    if (workerResult.error) {
      return workerResult.error;
    }

    const orderId = parsePositiveId(c.req.param("orderId"));
    if (!orderId) {
      return c.json({ error: "Invalid order id" }, 400);
    }

    const order = await withDriverOrder({
      orderId,
      workerId: workerResult.worker.id,
    });

    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    if (!["assigned", "en_route", "dispatching"].includes(order.status)) {
      return c.json(
        { error: "Order cannot move to arrived from current state" },
        409
      );
    }

    await setOrderStatus({
      note: "Driver arrived",
      orderId: order.id,
      toStatus: "arrived",
      triggeredByUserId: workerResult.user.id,
    });

    await db
      .update(orders)
      .set({
        ...orderStatusTimestampPatch("arrived"),
      })
      .where(eq(orders.id, order.id));

    await publishOutboxEvent({
      eventName: "driver_arrived",
      payload: {
        orderId: order.id,
      },
    });

    return c.json({ ok: true }, 200);
  })
  .post("/orders/:orderId/start", async (c) => {
    const workerResult = await requireWorker(c);
    if (workerResult.error) {
      return workerResult.error;
    }

    const orderId = parsePositiveId(c.req.param("orderId"));
    if (!orderId) {
      return c.json({ error: "Invalid order id" }, 400);
    }

    const order = await withDriverOrder({
      orderId,
      workerId: workerResult.worker.id,
    });

    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    if (order.status !== "arrived") {
      return c.json({ error: "Order cannot start from current state" }, 409);
    }

    if (order.serviceType === "lawncare" || order.serviceType === "laundry") {
      const hasBeforePhoto = await hasRequiredOrderPhaseMedia({
        orderId: order.id,
        phase: "before",
        serviceType: order.serviceType,
      });
      if (!hasBeforePhoto) {
        return c.json({ error: "Before property photos are required" }, 409);
      }
    }

    await setOrderStatus({
      note: "Driver started service",
      orderId: order.id,
      toStatus: "in_progress",
      triggeredByUserId: workerResult.user.id,
    });

    await db
      .update(orders)
      .set({
        ...orderStatusTimestampPatch("in_progress"),
      })
      .where(eq(orders.id, order.id));

    await publishOutboxEvent({
      eventName: "service_started",
      payload: {
        orderId: order.id,
      },
    });

    return c.json({ ok: true }, 200);
  })
  .post("/orders/:orderId/stop", async (c) => {
    const workerResult = await requireWorker(c);
    if (workerResult.error) {
      return workerResult.error;
    }

    const orderId = parsePositiveId(c.req.param("orderId"));
    if (!orderId) {
      return c.json({ error: "Invalid order id" }, 400);
    }

    const order = await withDriverOrder({
      orderId,
      workerId: workerResult.worker.id,
    });

    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    if (order.status !== "in_progress") {
      return c.json({ error: "Order cannot stop from current state" }, 409);
    }

    if (order.serviceType === "lawncare" || order.serviceType === "laundry") {
      const hasAfterPhoto = await hasRequiredOrderPhaseMedia({
        orderId: order.id,
        phase: "after",
        serviceType: order.serviceType,
      });
      if (!hasAfterPhoto) {
        return c.json(
          { error: "After property photos are required before stop" },
          409
        );
      }
    }

    await setOrderStatus({
      note: "Driver stopped active work",
      orderId: order.id,
      toStatus: "en_route",
      triggeredByUserId: workerResult.user.id,
    });

    return c.json({ ok: true }, 200);
  })
  .post("/orders/:orderId/complete", async (c) => {
    const workerResult = await requireWorker(c);
    if (workerResult.error) {
      return workerResult.error;
    }

    const orderId = parsePositiveId(c.req.param("orderId"));
    if (!orderId) {
      return c.json({ error: "Invalid order id" }, 400);
    }

    const order = await withDriverOrder({
      orderId,
      workerId: workerResult.worker.id,
    });

    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    if (!["arrived", "in_progress", "en_route"].includes(order.status)) {
      return c.json({ error: "Order cannot complete from current state" }, 409);
    }

    if (order.serviceType === "lawncare" || order.serviceType === "laundry") {
      const hasAfterPhoto = await hasRequiredOrderPhaseMedia({
        orderId: order.id,
        phase: "after",
        serviceType: order.serviceType,
      });
      if (!hasAfterPhoto) {
        return c.json(
          { error: "After property photos are required before completion" },
          409
        );
      }
    }

    await setOrderStatus({
      note: "Driver completed service",
      orderId: order.id,
      toStatus: "completed",
      triggeredByUserId: workerResult.user.id,
    });

    await db
      .update(orders)
      .set({
        ...orderStatusTimestampPatch("completed"),
      })
      .where(eq(orders.id, order.id));

    await createCompletionPayoutRecords({
      dispatchBonusCents: order.dispatchBonusCents,
      orderId: order.id,
      tipAmountCents: order.tipAmountCents,
      totalBasePriceCents: order.basePriceCents,
      workerId: workerResult.worker.id,
    });

    await publishOutboxEvent({
      eventName: "service_completed",
      payload: {
        orderId: order.id,
      },
    });

    return c.json({ ok: true }, 200);
  })
  .post("/orders/:orderId/legs/:legId/arrived", async (c) => {
    const workerResult = await requireWorker(c);
    if (workerResult.error) {
      return workerResult.error;
    }

    const orderId = parsePositiveId(c.req.param("orderId"));
    const legId = parsePositiveId(c.req.param("legId"));

    if (!orderId || !legId) {
      return c.json({ error: "Invalid order or leg id" }, 400);
    }

    const leg = await db.query.serviceLegs.findFirst({
      where: and(eq(serviceLegs.id, legId), eq(serviceLegs.orderId, orderId)),
    });

    if (!leg) {
      return c.json({ error: "Leg not found" }, 404);
    }

    if (!["pending", "en_route"].includes(leg.status)) {
      return c.json({ error: "Leg cannot arrive from current state" }, 409);
    }

    await db
      .update(serviceLegs)
      .set({
        status: "arrived",
      })
      .where(eq(serviceLegs.id, leg.id));

    await db.insert(legStatusHistory).values({
      fromStatus: leg.status,
      legId: leg.id,
      note: "Driver arrived at leg",
      toStatus: "arrived",
    });

    return c.json({ ok: true }, 200);
  })
  .post("/orders/:orderId/legs/:legId/start", async (c) => {
    const workerResult = await requireWorker(c);
    if (workerResult.error) {
      return workerResult.error;
    }

    const orderId = parsePositiveId(c.req.param("orderId"));
    const legId = parsePositiveId(c.req.param("legId"));

    if (!orderId || !legId) {
      return c.json({ error: "Invalid order or leg id" }, 400);
    }

    const leg = await db.query.serviceLegs.findFirst({
      where: and(eq(serviceLegs.id, legId), eq(serviceLegs.orderId, orderId)),
    });

    if (!leg) {
      return c.json({ error: "Leg not found" }, 404);
    }

    if (leg.status !== "arrived") {
      return c.json({ error: "Leg cannot start from current state" }, 409);
    }

    await db
      .update(serviceLegs)
      .set({
        actualStartedAt: new Date(),
        status: "started",
      })
      .where(eq(serviceLegs.id, leg.id));

    await db.insert(legStatusHistory).values({
      fromStatus: leg.status,
      legId: leg.id,
      note: "Driver started leg",
      toStatus: "started",
    });

    return c.json({ ok: true }, 200);
  })
  .post("/orders/:orderId/legs/:legId/stop", async (c) => {
    const workerResult = await requireWorker(c);
    if (workerResult.error) {
      return workerResult.error;
    }

    const orderId = parsePositiveId(c.req.param("orderId"));
    const legId = parsePositiveId(c.req.param("legId"));

    if (!orderId || !legId) {
      return c.json({ error: "Invalid order or leg id" }, 400);
    }

    const leg = await db.query.serviceLegs.findFirst({
      where: and(eq(serviceLegs.id, legId), eq(serviceLegs.orderId, orderId)),
    });

    if (!leg) {
      return c.json({ error: "Leg not found" }, 404);
    }

    if (leg.status !== "started") {
      return c.json({ error: "Leg cannot stop from current state" }, 409);
    }

    await db
      .update(serviceLegs)
      .set({
        actualEndedAt: new Date(),
        status: "stopped",
      })
      .where(eq(serviceLegs.id, leg.id));

    await db.insert(legStatusHistory).values({
      fromStatus: leg.status,
      legId: leg.id,
      note: "Driver stopped leg",
      toStatus: "stopped",
    });

    return c.json({ ok: true }, 200);
  })
  .post("/orders/:orderId/legs/:legId/complete", async (c) => {
    const workerResult = await requireWorker(c);
    if (workerResult.error) {
      return workerResult.error;
    }

    const orderId = parsePositiveId(c.req.param("orderId"));
    const legId = parsePositiveId(c.req.param("legId"));

    if (!orderId || !legId) {
      return c.json({ error: "Invalid order or leg id" }, 400);
    }

    const leg = await db.query.serviceLegs.findFirst({
      where: and(eq(serviceLegs.id, legId), eq(serviceLegs.orderId, orderId)),
    });

    if (!leg) {
      return c.json({ error: "Leg not found" }, 404);
    }

    if (!["arrived", "started", "stopped"].includes(leg.status)) {
      return c.json({ error: "Leg cannot complete from current state" }, 409);
    }

    const requiredMedia = getRequiredMediaForLeg(leg.legType);
    if (requiredMedia) {
      const hasMedia = await hasLegMediaType(leg.id, requiredMedia);
      if (!hasMedia) {
        return c.json(
          { error: `${requiredMedia} media is required for this leg` },
          409
        );
      }
    }

    await db
      .update(serviceLegs)
      .set({
        actualEndedAt: new Date(),
        status: "completed",
      })
      .where(eq(serviceLegs.id, leg.id));

    await db.insert(legStatusHistory).values({
      fromStatus: leg.status,
      legId: leg.id,
      note: "Driver completed leg",
      toStatus: "completed",
    });

    const remainingLegs = await db.query.serviceLegs.findMany({
      columns: {
        id: true,
        status: true,
      },
      where: eq(serviceLegs.orderId, orderId),
    });

    const allCompleted = remainingLegs.every(
      (entry) => entry.status === "completed"
    );

    if (allCompleted) {
      const order = await db.query.orders.findFirst({
        where: eq(orders.id, orderId),
      });

      if (order && order.assignedWorkerId === workerResult.worker.id) {
        await setOrderStatus({
          note: "Laundry legs completed",
          orderId,
          toStatus: "completed",
          triggeredByUserId: workerResult.user.id,
        });

        await db
          .update(orders)
          .set({
            completedAt: new Date(),
          })
          .where(eq(orders.id, order.id));

        await createCompletionPayoutRecords({
          dispatchBonusCents: order.dispatchBonusCents,
          orderId: order.id,
          tipAmountCents: order.tipAmountCents,
          totalBasePriceCents: order.basePriceCents,
          workerId: workerResult.worker.id,
        });

        await publishOutboxEvent({
          eventName: "service_completed",
          payload: {
            orderId: order.id,
          },
        });
      }
    }

    return c.json({ ok: true }, 200);
  });

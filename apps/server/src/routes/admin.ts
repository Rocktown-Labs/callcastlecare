import {
  defaultStripeCatalogItems,
  defaultStripeCoupons,
  stripeCatalogSyncRequestSchema,
  stripeIntegrationSyncRequestSchema,
} from "@callcastlecare/api";
import { and, db, desc, eq, inArray } from "@callcastlecare/db";
import {
  addresses,
  checkoutItems,
  customers,
  dispatchBatches,
  dispatchOffers,
  mediaAssets,
  orderItems,
  orderMediaLinks,
  orders,
  orderStatusHistory,
  notifications,
  stripeCatalogItems,
  stripeCoupons,
  routeStops,
  stripeSyncRuns,
  supportRequests,
  user as authUsers,
  workerRoutes,
  workers,
} from "@callcastlecare/db/schema/index";
import { env } from "@callcastlecare/env/server";
import { Hono } from "hono";

import { requireAdmin } from "../lib/admin";
import {
  getGroupStatus,
  getOrderGroupKey,
  getOrderGroupMembers,
  serviceLabels,
  statusLabels,
} from "../lib/admin-order-groups";
import type { AdminOrderStatus } from "../lib/admin-order-groups";
import {
  getCheckoutSettings,
  updateCheckoutSettings,
} from "../lib/checkout-settings";
import {
  createStripeClientOrThrow,
  ensureStripeWebhookEndpoints,
  getStripeIntegrationStatus,
  syncStripeCatalogItem,
  syncStripeCoupon,
} from "../lib/integrations/stripe-catalog";
import { getStripeMode } from "../lib/integrations/stripe-client";
import { logger } from "../lib/logger";
import { setOrderStatus } from "../lib/orders";
import { publishOutboxEvent } from "../lib/outbox";
import { createCompletionPayoutRecords } from "../lib/payouts";
import { createAdminRefund, RefundError } from "../lib/refunds";
import type { AppEnv } from "../types";
import {
  adminOrderActionRequestSchema,
  adminOrderDispatchRequestSchema,
  adminOrderNoteRequestSchema,
  adminRefundRequestSchema,
  adminRouteCreateRequestSchema,
  adminRouteStatusRequestSchema,
  adminRouteStopRequestSchema,
  adminWorkerCreateRequestSchema,
  adminWorkerStatusRequestSchema,
  adminWorkerUpdateRequestSchema,
  updateCheckoutSettingsRequestSchema,
} from "./schemas";

type OrderStatus =
  | "draft"
  | "quoted"
  | "pending_payment"
  | "paid"
  | "dispatching"
  | "assigned"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed";

const parsePositiveId = (value: string) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeCatalogRow = (row: typeof stripeCatalogItems.$inferSelect) => ({
  active: row.active,
  amountCents: row.amountCents,
  currency: row.currency,
  description: row.description,
  interval: row.interval ?? "one_time",
  lastSyncStatus: row.lastSyncStatus,
  lastSyncedAt: row.lastSyncedAt,
  lookupKey: row.lookupKey,
  name: row.name,
  serviceType: row.serviceType,
  slug: row.slug,
  stripeMode: row.stripeMode,
  stripePriceId: row.stripePriceId,
  stripeProductId: row.stripeProductId,
});

const normalizeCouponRow = (row: typeof stripeCoupons.$inferSelect) => ({
  active: row.active,
  amountOffCents: row.amountOffCents,
  code: row.code,
  currency: row.currency,
  duration: row.duration,
  durationInMonths: row.durationInMonths,
  name: row.name,
  percentOff: row.percentOff,
  stripeCouponId: row.stripeCouponId,
});

const activeOrderStatuses = [
  "pending_payment",
  "paid",
  "dispatching",
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
] as const;

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

const getOrderMediaTypes = async (orderId: number) => {
  const links = await db.query.orderMediaLinks.findMany({
    where: eq(orderMediaLinks.orderId, orderId),
  });
  const mediaIds = links.map((link) => link.mediaAssetId);
  if (mediaIds.length === 0) {
    return new Set<string>();
  }

  const assets = await db.query.mediaAssets.findMany({
    columns: {
      mediaType: true,
    },
    where: inArray(mediaAssets.id, mediaIds),
  });

  return new Set(assets.map((asset) => asset.mediaType));
};

const hasBeforeMedia = (mediaTypes: Set<string>) =>
  mediaTypes.has("service_before") || mediaTypes.has("lawncare_before");

const hasAfterMedia = (mediaTypes: Set<string>) =>
  mediaTypes.has("service_after") || mediaTypes.has("lawncare_after");

const getCheckoutMetadata = (
  items: { metadataJson: unknown }[],
  serviceType: string
) => {
  for (const item of items) {
    const metadata =
      item.metadataJson && typeof item.metadataJson === "object"
        ? (item.metadataJson as Record<string, unknown>)
        : {};
    const comboServiceTypes = Array.isArray(metadata.comboServiceTypes)
      ? metadata.comboServiceTypes
      : [];
    if (
      metadata.serviceType === serviceType ||
      (metadata.serviceType === "combo" &&
        comboServiceTypes.includes(serviceType))
    ) {
      return metadata;
    }
  }

  return null;
};

const getAdminOrderDetail = async (orderId: number) => {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });

  if (!order) {
    return null;
  }

  const members = (await getOrderGroupMembers(orderId)) ?? [order];
  const [customer, address, checkoutSessionItems] = await Promise.all([
    db.query.customers.findFirst({
      where: eq(customers.id, order.customerId),
    }),
    db.query.addresses.findFirst({
      where: eq(addresses.id, order.addressId),
    }),
    order.checkoutSessionId
      ? db.query.checkoutItems.findMany({
          where: eq(checkoutItems.checkoutSessionId, order.checkoutSessionId),
        })
      : Promise.resolve([]),
  ]);

  const services = await Promise.all(
    members.map(async (member) => {
      const [items, statusHistory, mediaLinks, offers, stops] =
        await Promise.all([
          db.query.orderItems.findMany({
            orderBy: (table, { asc }) => [asc(table.id)],
            where: eq(orderItems.orderId, member.id),
          }),
          db.query.orderStatusHistory.findMany({
            orderBy: desc(orderStatusHistory.changedAt),
            where: eq(orderStatusHistory.orderId, member.id),
          }),
          db.query.orderMediaLinks.findMany({
            orderBy: desc(orderMediaLinks.createdAt),
            where: eq(orderMediaLinks.orderId, member.id),
          }),
          db.query.dispatchOffers.findMany({
            orderBy: desc(dispatchOffers.createdAt),
            where: eq(dispatchOffers.orderId, member.id),
          }),
          db.query.routeStops.findMany({
            orderBy: (table, { asc }) => [asc(table.sequence)],
            where: eq(routeStops.orderId, member.id),
          }),
        ]);

      const mediaIds = mediaLinks.map((link) => link.mediaAssetId);
      const media =
        mediaIds.length === 0
          ? []
          : await db.query.mediaAssets.findMany({
              where: inArray(mediaAssets.id, mediaIds),
            });
      const mediaById = new Map(media.map((asset) => [asset.id, asset]));

      const workerIds = [
        ...new Set(
          [
            member.assignedWorkerId,
            ...offers.map((offer) => offer.workerId),
          ].filter((workerId): workerId is number => workerId !== null)
        ),
      ];
      const offeredWorkers =
        workerIds.length === 0
          ? []
          : await db.query.workers.findMany({
              where: inArray(workers.id, workerIds),
            });
      const workerById = new Map(
        offeredWorkers.map((worker) => [worker.id, worker])
      );

      const routeIds = [...new Set(stops.map((stop) => stop.routeId))];
      const routes =
        routeIds.length === 0
          ? []
          : await db.query.workerRoutes.findMany({
              where: inArray(workerRoutes.id, routeIds),
            });
      const routeById = new Map(routes.map((route) => [route.id, route]));

      return {
        assignedWorkerId: member.assignedWorkerId,
        checkoutMetadata: getCheckoutMetadata(
          checkoutSessionItems,
          member.serviceType
        ),
        id: member.id,
        items,
        media: mediaLinks.map((link) => ({
          ...link,
          asset: mediaById.get(link.mediaAssetId) ?? null,
        })),
        offers: offers.map((offer) => ({
          ...offer,
          worker: workerById.get(offer.workerId) ?? null,
        })),
        scheduledEndAt: member.scheduledEndAt,
        scheduledStartAt: member.scheduledStartAt,
        serviceLabel:
          serviceLabels[member.serviceType as keyof typeof serviceLabels] ??
          member.serviceType,
        serviceType: member.serviceType,
        status: member.status,
        statusHistory,
        stops: stops.map((stop) => ({
          ...stop,
          address: address
            ? { formattedAddress: address.formattedAddress }
            : null,
          route: routeById.get(stop.routeId) ?? null,
        })),
        totalPriceCents: member.totalPriceCents,
      };
    })
  );

  const statuses = members.map((member) => member.status as AdminOrderStatus);
  const groupStatus = getGroupStatus(statuses);
  const groupStatusLabel = statusLabels[groupStatus];
  const serviceIds = members.map((member) => member.id);
  const media = services.flatMap((service) => service.media);
  const items = services.flatMap((service) => service.items);
  const statusHistory = services.flatMap((service) =>
    service.statusHistory.map((entry) => ({ ...entry, orderId: service.id }))
  );

  return {
    address,
    customer,
    items,
    media,
    order: {
      ...order,
      groupStatus,
      groupStatusLabel,
      orderIds: serviceIds,
      totalPriceCents: members.reduce(
        (total, member) => total + member.totalPriceCents,
        0
      ),
    },
    services,
    statusHistory,
  };
};

const getAdminRouteDetail = async (routeId: number) => {
  const route = await db.query.workerRoutes.findFirst({
    where: eq(workerRoutes.id, routeId),
  });
  if (!route) {
    return null;
  }

  const [worker, stops] = await Promise.all([
    db.query.workers.findFirst({ where: eq(workers.id, route.workerId) }),
    db.query.routeStops.findMany({
      orderBy: (table, { asc }) => [asc(table.sequence)],
      where: eq(routeStops.routeId, route.id),
    }),
  ]);

  const stopOrders =
    stops.length === 0
      ? []
      : await db.query.orders.findMany({
          where: inArray(
            orders.id,
            stops.map((stop) => stop.orderId)
          ),
        });
  const stopCustomers =
    stopOrders.length === 0
      ? []
      : await db.query.customers.findMany({
          where: inArray(
            customers.id,
            stopOrders.map((order) => order.customerId)
          ),
        });
  const stopAddresses =
    stopOrders.length === 0
      ? []
      : await db.query.addresses.findMany({
          where: inArray(
            addresses.id,
            stopOrders.map((order) => order.addressId)
          ),
        });
  const customersById = new Map(
    stopCustomers.map((customer) => [customer.id, customer])
  );
  const addressesById = new Map(
    stopAddresses.map((address) => [address.id, address])
  );
  const ordersById = new Map(stopOrders.map((order) => [order.id, order]));

  return {
    route,
    stops: stops.map((stop) => ({
      ...stop,
      address: addressesById.get(ordersById.get(stop.orderId)?.addressId ?? 0),
      customer: customersById.get(
        ordersById.get(stop.orderId)?.customerId ?? 0
      ),
      order: ordersById.get(stop.orderId) ?? null,
    })),
    worker,
  };
};

const getNextStatusForAdminAction = (action: string): OrderStatus => {
  if (action === "confirm") {
    return "assigned";
  }
  if (action === "arrived") {
    return "arrived";
  }
  if (action === "start") {
    return "in_progress";
  }
  if (action === "complete") {
    return "completed";
  }
  if (action === "cancel") {
    return "cancelled";
  }
  return "failed";
};

const allowedAdminActionStatuses = {
  arrived: ["assigned", "dispatching", "en_route"],
  cancel: [
    "pending_payment",
    "paid",
    "dispatching",
    "assigned",
    "en_route",
    "arrived",
    "in_progress",
  ],
  complete: ["arrived", "in_progress", "en_route"],
  confirm: ["pending_payment", "paid", "dispatching"],
  fail: [
    "pending_payment",
    "paid",
    "dispatching",
    "assigned",
    "en_route",
    "arrived",
    "in_progress",
  ],
  start: ["arrived"],
} as const satisfies Record<string, readonly OrderStatus[]>;

const getAdminActionNote = (action: string, note?: string) =>
  note?.trim() ||
  {
    arrived: "Admin marked arrival in the field",
    cancel: "Admin cancelled order",
    complete: "Admin completed service",
    confirm: "Admin confirmed order",
    fail: "Admin marked order failed",
    start: "Admin started service",
  }[action] ||
  "Admin updated order";

const seedCatalogIfEmpty = async () => {
  const [existingItems, existingCoupons] = await Promise.all([
    db.query.stripeCatalogItems.findMany(),
    db.query.stripeCoupons.findMany(),
  ]);

  const itemBySlug = new Map(existingItems.map((item) => [item.slug, item]));
  const couponByCode = new Map(
    existingCoupons.map((coupon) => [coupon.code, coupon])
  );

  await Promise.all(
    defaultStripeCatalogItems.map((item) => {
      const existing = itemBySlug.get(item.slug);
      const metadata = existing?.metadataJson as
        | { source?: string }
        | null
        | undefined;
      const shouldRefresh = !existing || metadata?.source === "default";

      if (!shouldRefresh) {
        return null;
      }

      return db
        .insert(stripeCatalogItems)
        .values({
          active: item.active,
          amountCents: item.amountCents,
          currency: item.currency,
          description: item.description,
          interval: item.interval,
          lookupKey: `castlecare_${item.slug}`,
          metadataJson: {
            source: "default",
          },
          name: item.name,
          serviceType: item.serviceType,
          slug: item.slug,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          set: {
            active: item.active,
            amountCents: item.amountCents,
            currency: item.currency,
            description: item.description,
            interval: item.interval,
            lookupKey: `castlecare_${item.slug}`,
            metadataJson: {
              source: "default",
            },
            name: item.name,
            serviceType: item.serviceType,
            updatedAt: new Date(),
          },
          target: stripeCatalogItems.slug,
        });
    })
  );

  await Promise.all(
    defaultStripeCoupons.map((coupon) => {
      const existing = couponByCode.get(coupon.code);
      const metadata = existing?.metadataJson as
        | { source?: string }
        | null
        | undefined;
      const shouldRefresh = !existing || metadata?.source === "default";

      if (!shouldRefresh) {
        return null;
      }

      return db
        .insert(stripeCoupons)
        .values({
          active: coupon.active,
          amountOffCents: coupon.amountOffCents,
          code: coupon.code,
          currency: coupon.currency,
          duration: coupon.duration,
          durationInMonths: coupon.durationInMonths,
          metadataJson: {
            source: "default",
          },
          name: coupon.name,
          percentOff: coupon.percentOff,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          set: {
            active: coupon.active,
            amountOffCents: coupon.amountOffCents,
            currency: coupon.currency,
            duration: coupon.duration,
            durationInMonths: coupon.durationInMonths,
            metadataJson: {
              source: "default",
            },
            name: coupon.name,
            percentOff: coupon.percentOff,
            updatedAt: new Date(),
          },
          target: stripeCoupons.code,
        });
    })
  );
};

export const adminRoutes = new Hono<AppEnv>()
  .get("/summary", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const [orderRows, supportRows, workerRows, notificationRows] =
      await Promise.all([
        db.query.orders.findMany({
          columns: {
            checkoutSessionId: true,
            id: true,
            scheduledStartAt: true,
            status: true,
          },
          limit: 100,
          orderBy: desc(orders.createdAt),
        }),
        db.query.supportRequests
          .findMany({
            columns: {
              id: true,
              status: true,
            },
            limit: 100,
            orderBy: desc(supportRequests.createdAt),
          })
          .catch(() => []),
        db.query.workers.findMany({
          columns: {
            id: true,
            onboardingStatus: true,
          },
          limit: 100,
          orderBy: desc(workers.createdAt),
        }),
        db.query.notifications.findMany({
          columns: {
            id: true,
            readAt: true,
          },
          limit: 100,
          orderBy: desc(notifications.createdAt),
        }),
      ]);

    return c.json(
      {
        activeOrders: new Set(
          orderRows
            .filter((order) =>
              activeOrderStatuses.includes(
                order.status as (typeof activeOrderStatuses)[number]
              )
            )
            .map((order) => getOrderGroupKey(order))
        ).size,
        openSupport: supportRows.filter(
          (request) => request.status !== "closed"
        ).length,
        pendingWorkers: workerRows.filter(
          (worker) => worker.onboardingStatus === "pending"
        ).length,
        unreadNotifications: notificationRows.filter(
          (notification) => !notification.readAt
        ).length,
      },
      200
    );
  })
  .get("/orders", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const rows = await db
      .select({
        address: addresses,
        customer: customers,
        order: orders,
      })
      .from(orders)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .leftJoin(addresses, eq(addresses.id, orders.addressId))
      .where(inArray(orders.status, activeOrderStatuses))
      .orderBy(desc(orders.createdAt))
      .limit(100);

    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = getOrderGroupKey(row.order);
      const group = groups.get(key);
      if (group) {
        group.push(row);
      } else {
        groups.set(key, [row]);
      }
    }

    return c.json(
      {
        orders: [...groups.values()].map((group) => {
          const sortedGroup = group.toSorted(
            (first, second) => first.order.id - second.order.id
          );
          const [anchor] = sortedGroup;
          if (!anchor) {
            throw new Error("Admin order group has no anchor order");
          }

          const labels = [
            ...new Set(
              sortedGroup.map(
                (row) =>
                  serviceLabels[
                    row.order.serviceType as keyof typeof serviceLabels
                  ] ?? row.order.serviceType
              )
            ),
          ];
          const groupStatus = getGroupStatus(
            sortedGroup.map((row) => row.order.status as AdminOrderStatus)
          );

          return {
            address: anchor.address,
            customer: anchor.customer,
            order: {
              ...anchor.order,
              groupStatus,
              groupStatusLabel: statusLabels[groupStatus],
              orderIds: sortedGroup.map((row) => row.order.id),
              serviceCount: sortedGroup.length,
              serviceLabel:
                labels.length === 1 ? labels[0] : "Multiple services",
              serviceLabels: labels,
              statusLabel:
                statusLabels[anchor.order.status as OrderStatus] ??
                anchor.order.status,
              totalPriceCents: sortedGroup.reduce(
                (total, row) => total + row.order.totalPriceCents,
                0
              ),
            },
          };
        }),
      },
      200
    );
  })
  .get("/workers", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const list = await db.query.workers.findMany({
      limit: 200,
      orderBy: desc(workers.createdAt),
    });

    return c.json({ workers: list }, 200);
  })
  .post("/workers", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const body = await c.req.json();
    const parsed = adminWorkerCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const existingWorkerByEmail = await db.query.workers.findFirst({
      where: eq(workers.email, normalizedEmail),
    });
    if (existingWorkerByEmail) {
      return c.json(
        { error: "A staff record already exists for this email" },
        409
      );
    }

    const { auth } = await import("@callcastlecare/auth");
    const authContext = await auth.$context;
    let provisionedUser = await db.query.user.findFirst({
      where: eq(authUsers.email, normalizedEmail),
    });
    if (!provisionedUser) {
      try {
        await authContext.internalAdapter.createUser({
          email: normalizedEmail,
          emailVerified: false,
          name: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
        });
        provisionedUser = await db.query.user.findFirst({
          where: eq(authUsers.email, normalizedEmail),
        });
      } catch (error) {
        const racedUser = await db.query.user.findFirst({
          where: eq(authUsers.email, normalizedEmail),
        });
        if (!racedUser) {
          throw error;
        }
        provisionedUser = racedUser;
      }
    }

    if (!provisionedUser) {
      return c.json({ error: "Staff login could not be provisioned" }, 500);
    }

    const existingWorkerForUser = await db.query.workers.findFirst({
      where: eq(workers.userId, provisionedUser.id),
    });
    if (existingWorkerForUser) {
      return c.json(
        {
          error: "This login already has a staff record",
          worker: existingWorkerForUser,
        },
        409
      );
    }

    const applicationFormData = {
      ...parsed.data.applicationFormData,
      city: parsed.data.city ?? null,
      source: "admin_created",
      state: parsed.data.state ?? null,
      streetAddress: parsed.data.streetAddress ?? null,
      zip: parsed.data.zip ?? null,
    };

    const [worker] = await db
      .insert(workers)
      .values({
        applicationFormData,
        email: normalizedEmail,
        firstName: parsed.data.firstName.trim(),
        isActive: false,
        lastName: parsed.data.lastName.trim(),
        onboardingStatus: parsed.data.onboardingStatus,
        phone: parsed.data.phone.trim(),
        serviceRadiusMiles: parsed.data.serviceRadiusMiles,
        servicesOffered: parsed.data.servicesOffered,
        updatedAt: new Date(),
        userId: provisionedUser.id,
      })
      .returning();
    if (!worker) {
      return c.json({ error: "Staff record could not be created" }, 500);
    }

    logger.info(
      {
        adminEmail: c.get("user")?.email ?? null,
        requestId: c.get("requestId"),
        userId: provisionedUser.id,
        workerId: worker.id,
      },
      "admin:worker_created"
    );
    return c.json({ user: provisionedUser, worker }, 201);
  })
  .get("/workers/:workerId", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const workerId = parsePositiveId(c.req.param("workerId"));
    if (!workerId) {
      return c.json({ error: "Invalid worker id" }, 400);
    }

    const worker = await db.query.workers.findFirst({
      where: eq(workers.id, workerId),
    });
    if (!worker) {
      return c.json({ error: "Worker not found" }, 404);
    }

    const [linkedUser, offers, assignedOrders, workerRouteRows] =
      await Promise.all([
        db.query.user.findFirst({ where: eq(authUsers.id, worker.userId) }),
        db.query.dispatchOffers.findMany({
          limit: 20,
          orderBy: desc(dispatchOffers.createdAt),
          where: eq(dispatchOffers.workerId, worker.id),
        }),
        db.query.orders.findMany({
          limit: 20,
          orderBy: desc(orders.createdAt),
          where: eq(orders.assignedWorkerId, worker.id),
        }),
        db.query.workerRoutes.findMany({
          limit: 20,
          orderBy: desc(workerRoutes.routeDate),
          where: eq(workerRoutes.workerId, worker.id),
        }),
      ]);

    return c.json(
      {
        assignedOrders,
        offers,
        routes: workerRouteRows,
        user: linkedUser
          ? {
              email: linkedUser.email,
              emailVerified: linkedUser.emailVerified,
              id: linkedUser.id,
              name: linkedUser.name,
            }
          : null,
        worker,
      },
      200
    );
  })
  .patch("/workers/:workerId", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const workerId = parsePositiveId(c.req.param("workerId"));
    if (!workerId) {
      return c.json({ error: "Invalid worker id" }, 400);
    }

    const body = await c.req.json();
    const parsed = adminWorkerUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const existing = await db.query.workers.findFirst({
      where: eq(workers.id, workerId),
    });
    if (!existing) {
      return c.json({ error: "Worker not found" }, 404);
    }

    const currentFormData =
      existing.applicationFormData &&
      typeof existing.applicationFormData === "object"
        ? (existing.applicationFormData as Record<string, unknown>)
        : {};
    const nextFormData = { ...currentFormData };
    if (parsed.data.city !== undefined) {
      nextFormData.city = parsed.data.city;
    }
    if (parsed.data.state !== undefined) {
      nextFormData.state = parsed.data.state;
    }
    if (parsed.data.streetAddress !== undefined) {
      nextFormData.streetAddress = parsed.data.streetAddress;
    }
    if (parsed.data.zip !== undefined) {
      nextFormData.zip = parsed.data.zip;
    }

    const workerPatch: Partial<typeof workers.$inferInsert> = {
      applicationFormData: nextFormData,
      updatedAt: new Date(),
    };
    if (parsed.data.firstName !== undefined) {
      workerPatch.firstName = parsed.data.firstName.trim();
    }
    if (parsed.data.lastName !== undefined) {
      workerPatch.lastName = parsed.data.lastName.trim();
    }
    if (parsed.data.phone !== undefined) {
      workerPatch.phone = parsed.data.phone.trim();
    }
    if (parsed.data.servicesOffered !== undefined) {
      workerPatch.servicesOffered = parsed.data.servicesOffered;
    }
    if (parsed.data.serviceRadiusMiles !== undefined) {
      workerPatch.serviceRadiusMiles = parsed.data.serviceRadiusMiles;
    }
    if (parsed.data.isActive !== undefined) {
      workerPatch.isActive = parsed.data.isActive;
    }

    const [worker] = await db
      .update(workers)
      .set(workerPatch)
      .where(eq(workers.id, workerId))
      .returning();
    if (!worker) {
      return c.json({ error: "Worker not found" }, 404);
    }

    logger.info(
      {
        adminEmail: c.get("user")?.email ?? null,
        requestId: c.get("requestId"),
        workerId: worker.id,
      },
      "admin:worker_updated"
    );
    return c.json({ worker }, 200);
  })
  .post("/workers/:workerId/status", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const workerId = parsePositiveId(c.req.param("workerId"));
    if (!workerId) {
      return c.json({ error: "Invalid worker id" }, 400);
    }

    const body = await c.req.json();
    const parsed = adminWorkerStatusRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const [worker] = await db
      .update(workers)
      .set({
        isActive: false,
        onboardingStatus: parsed.data.status,
        updatedAt: new Date(),
      })
      .where(eq(workers.id, workerId))
      .returning();
    if (!worker) {
      return c.json({ error: "Worker not found" }, 404);
    }

    logger.info(
      {
        adminEmail: c.get("user")?.email ?? null,
        requestId: c.get("requestId"),
        status: parsed.data.status,
        workerId: worker.id,
      },
      "admin:worker_status_changed"
    );
    return c.json({ worker }, 200);
  })
  .post("/workers/:workerId/approve", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const workerId = parsePositiveId(c.req.param("workerId"));
    if (!workerId) {
      return c.json({ error: "Invalid worker id" }, 400);
    }

    const [worker] = await db
      .update(workers)
      .set({
        onboardingStatus: "approved",
        updatedAt: new Date(),
      })
      .where(eq(workers.id, workerId))
      .returning();
    if (!worker) {
      return c.json({ error: "Worker not found" }, 404);
    }

    logger.info(
      {
        adminEmail: c.get("user")?.email ?? null,
        requestId: c.get("requestId"),
        workerId: worker.id,
      },
      "admin:worker_approved"
    );
    return c.json({ worker }, 200);
  })
  .post("/orders/:orderId/dispatch", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const orderId = parsePositiveId(c.req.param("orderId"));
    if (!orderId) {
      return c.json({ error: "Invalid order id" }, 400);
    }

    const parsed = adminOrderDispatchRequestSchema.safeParse(
      await c.req.json()
    );
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const [order, dispatchWorker] = await Promise.all([
      db.query.orders.findFirst({ where: eq(orders.id, orderId) }),
      db.query.workers.findFirst({
        where: eq(workers.id, parsed.data.workerId),
      }),
    ]);
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }
    if (!dispatchWorker) {
      return c.json({ error: "Worker not found" }, 404);
    }
    if (
      dispatchWorker.onboardingStatus !== "approved" ||
      !dispatchWorker.isActive
    ) {
      return c.json({ error: "Worker is not active for dispatch" }, 409);
    }
    if (!dispatchWorker.servicesOffered.includes(order.serviceType)) {
      return c.json({ error: "Worker does not offer this service" }, 409);
    }
    if (["completed", "cancelled", "failed"].includes(order.status)) {
      return c.json({ error: "Finished orders cannot be dispatched" }, 409);
    }
    if (
      order.assignedWorkerId &&
      order.assignedWorkerId !== dispatchWorker.id
    ) {
      return c.json({ error: "Order is assigned to another worker" }, 409);
    }

    const existingOffer = await db.query.dispatchOffers.findFirst({
      where: and(
        eq(dispatchOffers.orderId, order.id),
        eq(dispatchOffers.workerId, dispatchWorker.id),
        eq(dispatchOffers.status, "pending")
      ),
    });
    if (existingOffer) {
      return c.json({ alreadySent: true, offer: existingOffer }, 200);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    let dispatchResult: {
      batch: typeof dispatchBatches.$inferSelect;
      offer: typeof dispatchOffers.$inferSelect;
    };
    try {
      dispatchResult = await db.transaction(async (tx) => {
        const [batch] = await tx
          .insert(dispatchBatches)
          .values({
            expiresAt,
            orderId: order.id,
            radiusMiles: 0,
            sequence: 1,
          })
          .returning();
        if (!batch) {
          throw new Error("Dispatch batch could not be created");
        }

        const [offer] = await tx
          .insert(dispatchOffers)
          .values({
            dispatchBatchId: batch.id,
            expiresAt,
            orderId: order.id,
            status: "pending",
            workerId: dispatchWorker.id,
          })
          .returning();
        if (!offer) {
          throw new Error("Dispatch offer could not be created");
        }

        await tx
          .update(orders)
          .set({
            dispatchStartedAt: order.dispatchStartedAt ?? now,
            nextWaveAt: null,
            status: "dispatching",
            updatedAt: now,
          })
          .where(eq(orders.id, order.id));

        return { batch, offer };
      });
    } catch (error) {
      logger.error(
        {
          error,
          orderId: order.id,
          requestId: c.get("requestId"),
          workerId: dispatchWorker.id,
        },
        "admin:order_dispatch_transaction_failed"
      );
      return c.json({ error: "Dispatch offer could not be created" }, 500);
    }

    const { offer } = dispatchResult;
    await publishOutboxEvent({
      eventName: "order_dispatched",
      payload: {
        adminAssigned: true,
        orderId: order.id,
        workerId: dispatchWorker.id,
      },
    });
    logger.info(
      {
        adminEmail: c.get("user")?.email ?? null,
        orderId: order.id,
        requestId: c.get("requestId"),
        workerId: dispatchWorker.id,
      },
      "admin:order_dispatch_offer_created"
    );

    return c.json({ offer, worker: dispatchWorker }, 201);
  })
  .post("/routes", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const parsed = adminRouteCreateRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const worker = await db.query.workers.findFirst({
      where: eq(workers.id, parsed.data.workerId),
    });
    if (!worker) {
      return c.json({ error: "Worker not found" }, 404);
    }

    const user = c.get("user");
    const [route] = await db
      .insert(workerRoutes)
      .values({
        createdByUserId: user?.id,
        name: parsed.data.name ?? `${worker.firstName}'s route`,
        routeDate: parsed.data.routeDate,
        workerId: worker.id,
      })
      .onConflictDoUpdate({
        set: {
          ...(parsed.data.name ? { name: parsed.data.name } : {}),
          updatedAt: new Date(),
        },
        target: [workerRoutes.workerId, workerRoutes.routeDate],
      })
      .returning();
    if (!route) {
      return c.json({ error: "Route could not be created" }, 500);
    }

    return c.json({ route, worker }, 201);
  })
  .get("/routes", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const workerIdParam = c.req.query("workerId") ?? "";
    const routeDate = c.req.query("routeDate") ?? "";
    const statusFilter = c.req.query("status") ?? "";
    const parsedStatus = statusFilter
      ? adminRouteStatusRequestSchema.shape.status.safeParse(statusFilter)
      : null;
    if (parsedStatus && !parsedStatus.success) {
      return c.json({ error: parsedStatus.error.flatten() }, 400);
    }

    // Single-route lookup keeps the historic worker+date contract.
    if (workerIdParam || routeDate) {
      const workerId = parsePositiveId(workerIdParam);
      if (!workerId || !routeDate) {
        return c.json({ error: "workerId and routeDate are required" }, 400);
      }
      const single = await db.query.workerRoutes.findFirst({
        where: and(
          eq(workerRoutes.workerId, workerId),
          eq(workerRoutes.routeDate, routeDate)
        ),
      });
      if (!single) {
        return c.json({ route: null, stops: [] }, 200);
      }
      const detail = await getAdminRouteDetail(single.id);
      return c.json(detail ?? { route: null, stops: [] }, 200);
    }

    const routeRows = await db.query.workerRoutes.findMany({
      limit: 100,
      orderBy: desc(workerRoutes.routeDate),
      ...(parsedStatus?.success
        ? { where: eq(workerRoutes.status, parsedStatus.data) }
        : {}),
    });
    const workerIds = [...new Set(routeRows.map((row) => row.workerId))];
    const [routeWorkers, stopCounts] = await Promise.all([
      workerIds.length === 0
        ? []
        : db.query.workers.findMany({
            where: inArray(workers.id, workerIds),
          }),
      routeRows.length === 0
        ? []
        : db.query.routeStops.findMany({
            columns: { id: true, routeId: true },
            where: inArray(
              routeStops.routeId,
              routeRows.map((row) => row.id)
            ),
          }),
    ]);
    const workersById = new Map(routeWorkers.map((entry) => [entry.id, entry]));
    const stopsByRouteId = new Map<number, number>();
    for (const stop of stopCounts) {
      stopsByRouteId.set(
        stop.routeId,
        (stopsByRouteId.get(stop.routeId) ?? 0) + 1
      );
    }

    return c.json(
      {
        routes: routeRows.map((route) => ({
          ...route,
          stopCount: stopsByRouteId.get(route.id) ?? 0,
          worker: workersById.get(route.workerId) ?? null,
        })),
      },
      200
    );
  })
  .get("/routes/:routeId", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const routeId = parsePositiveId(c.req.param("routeId"));
    if (!routeId) {
      return c.json({ error: "Invalid route id" }, 400);
    }

    const detail = await getAdminRouteDetail(routeId);
    if (!detail) {
      return c.json({ error: "Route not found" }, 404);
    }

    return c.json(detail, 200);
  })
  .post("/routes/:routeId/stops", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const routeId = parsePositiveId(c.req.param("routeId"));
    if (!routeId) {
      return c.json({ error: "Invalid route id" }, 400);
    }
    const parsed = adminRouteStopRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const [route, order] = await Promise.all([
      db.query.workerRoutes.findFirst({ where: eq(workerRoutes.id, routeId) }),
      db.query.orders.findFirst({ where: eq(orders.id, parsed.data.orderId) }),
    ]);
    if (!route) {
      return c.json({ error: "Route not found" }, 404);
    }
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }
    if (order.assignedWorkerId && order.assignedWorkerId !== route.workerId) {
      return c.json({ error: "Order is assigned to another worker" }, 409);
    }

    const existingStop = await db.query.routeStops.findFirst({
      where: and(
        eq(routeStops.routeId, route.id),
        eq(routeStops.orderId, order.id)
      ),
    });
    if (existingStop) {
      return c.json({ alreadyAdded: true, stop: existingStop }, 200);
    }

    const existingStops = await db.query.routeStops.findMany({
      columns: { sequence: true },
      where: eq(routeStops.routeId, route.id),
    });
    const sequence =
      parsed.data.sequence ??
      Math.max(0, ...existingStops.map((stop) => stop.sequence)) + 1;
    const [stop] = await db
      .insert(routeStops)
      .values({
        orderId: order.id,
        plannedEndAt: parsed.data.plannedEndAt
          ? new Date(parsed.data.plannedEndAt)
          : order.scheduledEndAt,
        plannedStartAt: parsed.data.plannedStartAt
          ? new Date(parsed.data.plannedStartAt)
          : order.scheduledStartAt,
        routeId: route.id,
        sequence,
      })
      .returning();
    if (!stop) {
      return c.json({ error: "Stop could not be added" }, 500);
    }

    return c.json({ stop }, 201);
  })
  .delete("/routes/:routeId/stops/:stopId", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const routeId = parsePositiveId(c.req.param("routeId"));
    const stopId = parsePositiveId(c.req.param("stopId"));
    if (!routeId || !stopId) {
      return c.json({ error: "Invalid route or stop id" }, 400);
    }

    const deleted = await db
      .delete(routeStops)
      .where(and(eq(routeStops.id, stopId), eq(routeStops.routeId, routeId)))
      .returning({ id: routeStops.id });
    return deleted.length > 0
      ? c.json({ ok: true }, 200)
      : c.json({ error: "Stop not found" }, 404);
  })
  .patch("/routes/:routeId", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const routeId = parsePositiveId(c.req.param("routeId"));
    if (!routeId) {
      return c.json({ error: "Invalid route id" }, 400);
    }
    const parsed = adminRouteStatusRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const [route] = await db
      .update(workerRoutes)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(workerRoutes.id, routeId))
      .returning();
    return route
      ? c.json({ route }, 200)
      : c.json({ error: "Route not found" }, 404);
  })
  .get("/orders/:orderId", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const orderId = parsePositiveId(c.req.param("orderId"));
    if (!orderId) {
      return c.json({ error: "Invalid order id" }, 400);
    }

    const detail = await getAdminOrderDetail(orderId);
    if (!detail) {
      return c.json({ error: "Order not found" }, 404);
    }

    return c.json({ detail }, 200);
  })
  .post("/orders/:orderId/notes", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const orderId = parsePositiveId(c.req.param("orderId"));
    if (!orderId) {
      return c.json({ error: "Invalid order id" }, 400);
    }

    const body = await c.req.json();
    const parsed = adminOrderNoteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    const user = c.get("user");
    await db.insert(orderStatusHistory).values({
      fromStatus: order.status,
      note: parsed.data.note,
      orderId: order.id,
      toStatus: order.status,
      triggeredByUserId: user?.id,
    });

    return c.json({ ok: true }, 200);
  })
  .post("/orders/:orderId/refund", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const orderId = parsePositiveId(c.req.param("orderId"));
    if (!orderId) {
      return c.json({ error: "Invalid order id" }, 400);
    }
    const body = await c.req.json();
    const parsed = adminRefundRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    try {
      const refund = await createAdminRefund({
        adminEmail: c.get("user")?.email ?? null,
        amountCents: parsed.data.amountCents,
        order,
        reason: parsed.data.reason,
      });
      return c.json({ refund }, 200);
    } catch (error) {
      if (error instanceof RefundError) {
        return c.json({ error: error.message }, error.statusCode);
      }
      throw error;
    }
  })
  .post("/orders/:orderId/actions", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const orderId = parsePositiveId(c.req.param("orderId"));
    if (!orderId) {
      return c.json({ error: "Invalid order id" }, 400);
    }

    const body = await c.req.json();
    const parsed = adminOrderActionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    const allowedStatuses = allowedAdminActionStatuses[
      parsed.data.action
    ] as readonly OrderStatus[];
    if (!allowedStatuses.includes(order.status as OrderStatus)) {
      return c.json(
        {
          error: `${parsed.data.action} cannot run while order is ${order.status}`,
        },
        409
      );
    }

    if (parsed.data.action === "start" || parsed.data.action === "complete") {
      const mediaTypes = await getOrderMediaTypes(order.id);
      if (parsed.data.action === "start" && !hasBeforeMedia(mediaTypes)) {
        return c.json({ error: "Before photo is required" }, 409);
      }
      if (parsed.data.action === "complete" && !hasAfterMedia(mediaTypes)) {
        return c.json({ error: "After photo is required" }, 409);
      }
    }

    const nextStatus = getNextStatusForAdminAction(parsed.data.action);
    const user = c.get("user");
    await setOrderStatus({
      note: getAdminActionNote(parsed.data.action, parsed.data.note),
      orderId: order.id,
      toStatus: nextStatus,
      triggeredByUserId: user?.id,
    });

    if (
      nextStatus === "arrived" ||
      nextStatus === "in_progress" ||
      nextStatus === "completed"
    ) {
      await db
        .update(orders)
        .set({
          ...orderStatusTimestampPatch(nextStatus),
        })
        .where(eq(orders.id, order.id));
    }

    if (parsed.data.action === "confirm") {
      await db
        .update(orders)
        .set({
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
    }

    if (parsed.data.action === "complete" && order.assignedWorkerId) {
      await createCompletionPayoutRecords({
        dispatchBonusCents: order.dispatchBonusCents,
        orderId: order.id,
        tipAmountCents: order.tipAmountCents,
        totalBasePriceCents: order.basePriceCents,
        workerId: order.assignedWorkerId,
      });
    }

    return c.json({ ok: true }, 200);
  })
  .get("/support", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const requests = await db.query.supportRequests
      .findMany({
        limit: 50,
        orderBy: desc(supportRequests.createdAt),
      })
      .catch(() => []);

    return c.json({ requests }, 200);
  })
  .get("/stripe/catalog", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    await seedCatalogIfEmpty();

    const [items, coupons, syncRuns] = await Promise.all([
      db.query.stripeCatalogItems.findMany({
        orderBy: (table, { asc }) => [asc(table.serviceType), asc(table.slug)],
      }),
      db.query.stripeCoupons.findMany({
        orderBy: (table, { asc }) => [asc(table.code)],
      }),
      db
        .select()
        .from(stripeSyncRuns)
        .orderBy(desc(stripeSyncRuns.createdAt))
        .limit(5),
    ]);
    const integrationStatus = await getStripeIntegrationStatus().catch(
      (error: unknown) => ({
        configured: Boolean(env.STRIPE_SECRET_KEY),
        error: error instanceof Error ? error.message : "Stripe status failed",
        mode: null,
        webhookEndpoints: [],
      })
    );
    const workerRows = await db.query.workers.findMany({
      columns: {
        stripeAccountId: true,
        stripeAccountStatus: true,
      },
    });
    const integrationStatusWithConnect = {
      ...integrationStatus,
      connectAccounts: {
        linked: workerRows.filter((worker) => worker.stripeAccountId).length,
        ready: workerRows.filter(
          (worker) => worker.stripeAccountStatus === "ready"
        ).length,
        total: workerRows.length,
      },
    };

    return c.json(
      {
        adminEmail: env.ADMIN_EMAIL,
        coupons: coupons.map(normalizeCouponRow),
        integrationStatus: integrationStatusWithConnect,
        items: items.map(normalizeCatalogRow),
        lastSync: syncRuns[0] ?? null,
        syncRuns,
      },
      200
    );
  })
  .get("/stripe/status", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const [status, workerRows] = await Promise.all([
      getStripeIntegrationStatus().catch((error: unknown) => ({
        configured: Boolean(env.STRIPE_SECRET_KEY),
        error: error instanceof Error ? error.message : "Stripe status failed",
        mode: null,
        webhookEndpoints: [],
      })),
      db.query.workers.findMany({
        columns: {
          stripeAccountId: true,
          stripeAccountStatus: true,
        },
      }),
    ]);

    return c.json(
      {
        ...status,
        connectAccounts: {
          linked: workerRows.filter((worker) => worker.stripeAccountId).length,
          ready: workerRows.filter(
            (worker) => worker.stripeAccountStatus === "ready"
          ).length,
          total: workerRows.length,
        },
      },
      200
    );
  })
  .put("/stripe/catalog", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const body = await c.req.json();
    const parsed = stripeCatalogSyncRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    await Promise.all(
      parsed.data.items.map((item) =>
        db
          .insert(stripeCatalogItems)
          .values({
            active: item.active,
            amountCents: item.amountCents,
            currency: item.currency,
            description: item.description,
            interval: item.interval,
            lookupKey: `castlecare_${item.slug}`,
            metadataJson: {
              source: "admin",
            },
            name: item.name,
            serviceType: item.serviceType,
            slug: item.slug,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            set: {
              active: item.active,
              amountCents: item.amountCents,
              currency: item.currency,
              description: item.description,
              interval: item.interval,
              lastSyncStatus: null,
              lastSyncedAt: null,
              lookupKey: `castlecare_${item.slug}`,
              name: item.name,
              serviceType: item.serviceType,
              stripeMode: null,
              stripePriceId: null,
              stripeProductId: null,
              updatedAt: new Date(),
            },
            target: stripeCatalogItems.slug,
          })
      )
    );

    await Promise.all(
      parsed.data.coupons.map((coupon) =>
        db
          .insert(stripeCoupons)
          .values({
            active: coupon.active,
            amountOffCents: coupon.amountOffCents,
            code: coupon.code,
            currency: coupon.currency,
            duration: coupon.duration,
            durationInMonths: coupon.durationInMonths,
            metadataJson: {
              source: "admin",
            },
            name: coupon.name,
            percentOff: coupon.percentOff,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            set: {
              active: coupon.active,
              amountOffCents: coupon.amountOffCents,
              currency: coupon.currency,
              duration: coupon.duration,
              durationInMonths: coupon.durationInMonths,
              name: coupon.name,
              percentOff: coupon.percentOff,
              updatedAt: new Date(),
            },
            target: stripeCoupons.code,
          })
      )
    );

    return c.json({ ok: true }, 200);
  })
  .post("/stripe/sync", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    await seedCatalogIfEmpty();

    const body = await c.req.json().catch(() => ({}));
    const parsedRequest = stripeIntegrationSyncRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      return c.json({ error: parsedRequest.error.flatten() }, 400);
    }

    const requestedPlanCodes = parsedRequest.data.planCodes
      ? new Set(parsedRequest.data.planCodes)
      : null;
    const allItems = await db.query.stripeCatalogItems.findMany();
    const items = requestedPlanCodes
      ? allItems.filter((item) => requestedPlanCodes.has(item.slug))
      : allItems;
    const coupons = await db.query.stripeCoupons.findMany();

    if (items.length === 0) {
      return c.json({ error: "No matching catalog items found" }, 400);
    }

    try {
      const stripe = createStripeClientOrThrow();
      const syncedItems: {
        lookupKey: string;
        slug: string;
        status: "created" | "matched" | "updated";
        stripePriceId: string;
        stripeProductId: string;
      }[] = [];

      for (const row of items) {
        // eslint-disable-next-line no-await-in-loop -- Stripe catalog writes run sequentially to avoid dashboard-triggered rate limits.
        const synced = await syncStripeCatalogItem(stripe, {
          active: row.active,
          amountCents: row.amountCents,
          currency: row.currency,
          description: row.description,
          interval:
            row.interval === "week" ||
            row.interval === "month" ||
            row.interval === "year"
              ? row.interval
              : "one_time",
          name: row.name,
          serviceType: row.serviceType as
            | "combo"
            | "fee"
            | "laundry"
            | "lawncare"
            | "window_washing",
          slug: row.slug,
        });

        // eslint-disable-next-line no-await-in-loop -- Keep local Stripe ids in step with each sequential Stripe write.
        await db
          .update(stripeCatalogItems)
          .set({
            lastSyncStatus: synced.status,
            lastSyncedAt: new Date(),
            lookupKey: synced.lookupKey,
            stripeMode: getStripeMode(),
            stripePriceId: synced.stripePriceId,
            stripeProductId: synced.stripeProductId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(stripeCatalogItems.slug, row.slug),
              eq(stripeCatalogItems.id, row.id)
            )
          );
        syncedItems.push({ slug: row.slug, ...synced });
      }

      const syncedCoupons: {
        code: string;
        stripeCouponId: string;
      }[] = [];

      for (const row of coupons) {
        // eslint-disable-next-line no-await-in-loop -- Stripe coupon writes run sequentially to avoid dashboard-triggered rate limits.
        const synced = await syncStripeCoupon(stripe, {
          active: row.active,
          amountOffCents: row.amountOffCents,
          code: row.code,
          currency: row.currency,
          duration:
            row.duration === "forever" || row.duration === "repeating"
              ? row.duration
              : "once",
          durationInMonths: row.durationInMonths,
          name: row.name,
          percentOff: row.percentOff,
        });

        // eslint-disable-next-line no-await-in-loop -- Keep local Stripe ids in step with each sequential Stripe write.
        await db
          .update(stripeCoupons)
          .set({
            stripeCouponId: synced.stripeCouponId,
            updatedAt: new Date(),
          })
          .where(
            and(eq(stripeCoupons.code, row.code), eq(stripeCoupons.id, row.id))
          );
        syncedCoupons.push({ code: row.code, ...synced });
      }

      const webhookEndpoints = parsedRequest.data.syncWebhooks
        ? await ensureStripeWebhookEndpoints(stripe)
        : [];
      const syncRunRows = await db
        .insert(stripeSyncRuns)
        .values({
          catalogItemCount: syncedItems.length,
          couponCount: syncedCoupons.length,
          metadataJson: {
            coupons: syncedCoupons,
            items: syncedItems,
            webhookEndpoints: webhookEndpoints.map(
              ({ secret: _secret, ...endpoint }) => endpoint
            ),
          },
          status: "success",
          stripeMode: getStripeMode(),
          stripeWebhookEndpointId: webhookEndpoints[0]?.endpointId ?? null,
        })
        .returning();

      return c.json(
        {
          coupons: syncedCoupons,
          items: syncedItems,
          syncRun: syncRunRows[0],
          webhookEndpoints,
        },
        200
      );
    } catch (error) {
      logger.error({ error }, "stripe_catalog:sync_failed");
      const message =
        error instanceof Error ? error.message : "Stripe sync failed";

      await db.insert(stripeSyncRuns).values({
        catalogItemCount: items.length,
        couponCount: coupons.length,
        errorMessage: message,
        status: "failed",
      });

      return c.json({ error: message }, 500);
    }
  })
  .get("/checkout/settings", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const settings = await getCheckoutSettings();
    return c.json(settings, 200);
  })
  .put("/checkout/settings", async (c) => {
    const adminError = requireAdmin(c);
    if (adminError) {
      return adminError;
    }

    const body = await c.req.json();
    const parsed = updateCheckoutSettingsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const settings = await updateCheckoutSettings({
      allowCashCheckout: parsed.data.allowCashCheckout,
    });

    logger.info(
      {
        adminEmail: c.get("user")?.email ?? null,
        allowCashCheckout: parsed.data.allowCashCheckout,
        requestId: c.get("requestId"),
      },
      "admin:checkout_settings_updated"
    );

    return c.json(settings, 200);
  });

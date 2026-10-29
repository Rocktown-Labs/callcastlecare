import { db, eq, inArray } from "@callcastlecare/db";
import {
  customers,
  legMediaLinks,
  mediaAssets,
  orderMediaLinks,
  orders,
  serviceLegs,
  workers,
} from "@callcastlecare/db/schema/index";
import { env } from "@callcastlecare/env/server";
import { Hono } from "hono";
import type { Context } from "hono";

import { isAdminUser } from "../lib/admin";
import { requireUser, requireWorkerForUser } from "../lib/auth";
import {
  createMediaStoragePath,
  getMediaUploadUrl,
  mediaValidation,
} from "../lib/integrations/blob";
import { logger } from "../lib/logger";
import type { AppEnv } from "../types";
import {
  mediaAttachRequestSchema,
  mediaUploadUrlRequestSchema,
} from "./schemas";

const extensionFromContentType = (contentType: string) => {
  if (contentType.includes("png")) {
    return "png";
  }
  if (contentType.includes("webp")) {
    return "webp";
  }
  if (contentType.includes("heic")) {
    return "heic";
  }
  return "jpg";
};

const orderTransitionMediaStatuses = [
  "arrived",
  "in_progress",
  "completed",
] as const;

const legTransitionMediaStatuses = [
  "arrived",
  "started",
  "stopped",
  "completed",
] as const;

const toOrderRequiredTransition = (value?: string) =>
  orderTransitionMediaStatuses.find((status) => status === value) ?? null;

const toLegRequiredTransition = (value?: string) =>
  legTransitionMediaStatuses.find((status) => status === value) ?? null;

const getMediaBucket = (c: Context<AppEnv>): R2Bucket | null => {
  const bucket = c.env.MEDIA_BUCKET;
  if (!bucket) {
    return null;
  }
  return bucket;
};

const isProviderEquipmentMedia = (mediaType: string) =>
  mediaType === "provider_equipment";

const mediaPathPattern =
  /^callcastlecare-media\/order-(?<order>\d+|none)\/leg-(?<leg>\d+|none)\/(?<mediaType>[a-z0-9_]+)\/[A-Za-z0-9._-]+$/u;

interface MediaPathTarget {
  legId: number | null;
  mediaType: string;
  orderId: number | null;
}

const parseMediaStoragePath = (storagePath: string): MediaPathTarget | null => {
  const match = mediaPathPattern.exec(storagePath);
  if (!match) {
    return null;
  }

  const {
    leg: legSegment,
    mediaType,
    order: orderSegment,
  } = match.groups ?? {};
  if (!(orderSegment && legSegment && mediaType)) {
    return null;
  }

  const orderId = orderSegment === "none" ? null : Number(orderSegment);
  const legId = legSegment === "none" ? null : Number(legSegment);
  if (
    (orderId !== null && (!Number.isInteger(orderId) || orderId <= 0)) ||
    (legId !== null && (!Number.isInteger(legId) || legId <= 0))
  ) {
    return null;
  }

  return { legId, mediaType, orderId };
};

const canAccessOrder = async (input: {
  customerId: number | null;
  orderId: number;
  user: NonNullable<ReturnType<typeof requireUser>["user"]>;
  workerId: number | null;
}) => {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, input.orderId),
  });
  if (!order) {
    return { allowed: false, found: false } as const;
  }

  const allowed =
    isAdminUser(input.user) ||
    (input.customerId !== null && order.customerId === input.customerId) ||
    (input.workerId !== null && order.assignedWorkerId === input.workerId);

  return { allowed, found: true } as const;
};

const canAccessLeg = async (input: {
  customerId: number | null;
  legId: number;
  user: NonNullable<ReturnType<typeof requireUser>["user"]>;
  workerId: number | null;
}) => {
  const leg = await db.query.serviceLegs.findFirst({
    where: eq(serviceLegs.id, input.legId),
  });
  if (!leg) {
    return { allowed: false, found: false } as const;
  }

  if (input.workerId !== null && leg.workerId === input.workerId) {
    return { allowed: true, found: true } as const;
  }

  return canAccessOrder({
    customerId: input.customerId,
    orderId: leg.orderId,
    user: input.user,
    workerId: input.workerId,
  });
};

const validateMediaPathMatch = (
  input: {
    legId?: number;
    mediaType: string;
    orderId?: number;
  },
  target: MediaPathTarget
) => {
  if (target.mediaType !== input.mediaType) {
    return { error: "media_type_mismatch", status: 400 as const };
  }

  if (
    (input.orderId !== undefined && target.orderId !== input.orderId) ||
    (input.legId !== undefined && target.legId !== input.legId)
  ) {
    return { error: "storage_path_target_mismatch", status: 400 as const };
  }

  return null;
};

const authorizeTargetAccess = async (input: {
  customerId: number | null;
  target: MediaPathTarget;
  user: NonNullable<ReturnType<typeof requireUser>["user"]>;
  worker: Awaited<ReturnType<typeof requireWorkerForUser>>;
  workerId: number | null;
}) => {
  if (input.target.orderId !== null) {
    const access = await canAccessOrder({
      customerId: input.customerId,
      orderId: input.target.orderId,
      user: input.user,
      workerId: input.workerId,
    });
    if (!access.found) {
      return { error: "Order not found", status: 404 as const };
    }
    if (!access.allowed) {
      return { error: "forbidden", status: 403 as const };
    }
  }

  if (input.target.legId !== null) {
    const access = await canAccessLeg({
      customerId: input.customerId,
      legId: input.target.legId,
      user: input.user,
      workerId: input.workerId,
    });
    if (!access.found) {
      return { error: "Leg not found", status: 404 as const };
    }
    if (!access.allowed) {
      return { error: "forbidden", status: 403 as const };
    }
  }

  if (
    input.target.orderId === null &&
    input.target.legId === null &&
    (input.target.mediaType !== "provider_equipment" || !input.worker)
  ) {
    return { error: "worker_profile_required", status: 403 as const };
  }

  return null;
};

const authorizeMediaPath = async (input: {
  legId?: number;
  mediaType: string;
  orderId?: number;
  storagePath: string;
  user: NonNullable<ReturnType<typeof requireUser>["user"]>;
}) => {
  const target = parseMediaStoragePath(input.storagePath);
  if (!target) {
    return { error: "invalid_storage_path", status: 400 as const };
  }

  const matchError = validateMediaPathMatch(input, target);
  if (matchError) {
    return matchError;
  }

  const [customer, worker] = await Promise.all([
    db.query.customers.findFirst({
      columns: { id: true },
      where: eq(customers.userId, input.user.id),
    }),
    requireWorkerForUser(input.user),
  ]);

  return authorizeTargetAccess({
    customerId: customer?.id ?? null,
    target,
    user: input.user,
    worker,
    workerId: worker?.id ?? null,
  });
};

const canReadPrivateMedia = async (input: {
  pathname: string;
  user: NonNullable<ReturnType<typeof requireUser>["user"]>;
}) => {
  const isAdmin = isAdminUser(input.user);

  const asset = await db.query.mediaAssets.findFirst({
    where: eq(mediaAssets.storagePath, input.pathname),
  });

  if (!asset) {
    return { allowed: false, found: false };
  }

  if (isAdmin) {
    return { allowed: true, found: true };
  }

  const [customer, worker, orderLinks, legLinks] = await Promise.all([
    db.query.customers.findFirst({
      where: eq(customers.userId, input.user.id),
    }),
    requireWorkerForUser(input.user),
    db.query.orderMediaLinks.findMany({
      where: eq(orderMediaLinks.mediaAssetId, asset.id),
    }),
    db.query.legMediaLinks.findMany({
      where: eq(legMediaLinks.mediaAssetId, asset.id),
    }),
  ]);

  const linkedLegIds = legLinks.map((link) => link.legId);
  const linkedLegs =
    linkedLegIds.length === 0
      ? []
      : await db.query.serviceLegs.findMany({
          where: inArray(serviceLegs.id, linkedLegIds),
        });
  const linkedOrderIds = new Set([
    ...orderLinks.map((link) => link.orderId),
    ...linkedLegs.map((leg) => leg.orderId),
  ]);

  if (worker && asset.uploadedByWorkerId === worker.id) {
    return { allowed: true, found: true };
  }

  if (linkedOrderIds.size === 0) {
    return { allowed: false, found: true };
  }

  const linkedOrders = await db.query.orders.findMany({
    where: inArray(orders.id, [...linkedOrderIds]),
  });
  const canReadAsCustomer =
    customer && linkedOrders.some((order) => order.customerId === customer.id);
  const canReadAsWorker =
    worker &&
    (linkedOrders.some((order) => order.assignedWorkerId === worker.id) ||
      linkedLegs.some((leg) => leg.workerId === worker.id));

  return {
    allowed: Boolean(canReadAsCustomer || canReadAsWorker),
    found: true,
  };
};

export const mediaRoutes = new Hono<AppEnv>()
  .get("/private", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const pathname = c.req.query("pathname");
    if (!pathname) {
      return c.json({ error: "Missing pathname" }, 400);
    }

    const access = await canReadPrivateMedia({
      pathname,
      user: userResult.user,
    });
    if (!access.found) {
      return c.text("Not found", 404);
    }
    if (!access.allowed) {
      return c.json({ error: "forbidden" }, 403);
    }

    const bucket = getMediaBucket(c);
    if (!bucket) {
      return c.json({ error: "media_not_configured" }, 503);
    }

    const r2Object = await bucket.get(pathname);
    if (!r2Object || !r2Object.body) {
      return c.text("Not found", 404);
    }

    return c.body(r2Object.body, 200, {
      "Cache-Control": "private, no-cache",
      "Content-Type": r2Object.httpMetadata?.contentType ?? "image/jpeg",
      "X-Content-Type-Options": "nosniff",
    });
  })
  .post("/upload-url", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    if (!getMediaBucket(c)) {
      return c.json({ error: "media_not_configured" }, 503);
    }

    const body = await c.req.json();
    const parsed = mediaUploadUrlRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const worker = await requireWorkerForUser(userResult.user);
    if (isProviderEquipmentMedia(parsed.data.mediaType) && !worker) {
      return c.json({ error: "worker_profile_required" }, 403);
    }

    const extension = extensionFromContentType(parsed.data.contentType);
    const storagePath = createMediaStoragePath({
      extension,
      legId: parsed.data.legId,
      mediaType: parsed.data.mediaType,
      orderId: parsed.data.orderId,
    });

    const origin = new URL(c.req.url).origin || env.BETTER_AUTH_URL;

    return c.json(
      {
        access: "private",
        storagePath,
        uploadUrl: getMediaUploadUrl(origin),
      },
      200
    );
  })
  .post("/client-upload", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const bucket = getMediaBucket(c);
    if (!bucket) {
      return c.json({ error: "media_not_configured" }, 503);
    }

    const body = await c.req.parseBody();
    const { storagePath } = body;

    if (typeof storagePath !== "string") {
      return c.json({ error: "Missing storagePath" }, 400);
    }

    if (!storagePath.startsWith(mediaValidation.pathnamePrefix)) {
      logger.warn({ storagePath }, "media:invalid_pathname");
      return c.json({ error: "invalid_storage_path" }, 400);
    }

    const parsedTarget = parseMediaStoragePath(storagePath);
    if (!parsedTarget) {
      return c.json({ error: "invalid_storage_path" }, 400);
    }

    const authorizationError = await authorizeMediaPath({
      mediaType: parsedTarget.mediaType,
      storagePath,
      user: userResult.user,
    });
    if (authorizationError) {
      return c.json(
        { error: authorizationError.error },
        authorizationError.status
      );
    }

    const { file } = body;
    if (!(file instanceof File)) {
      return c.json({ error: "Missing file" }, 400);
    }

    if (file.size > mediaValidation.maxUploadSizeBytes) {
      return c.json({ error: "file_too_large" }, 413);
    }

    if (!mediaValidation.allowedContentTypes.includes(file.type)) {
      return c.json({ error: "invalid_content_type" }, 415);
    }

    await bucket.put(storagePath, file, {
      httpMetadata: { contentType: file.type },
    });

    logger.info({ storagePath, type: file.type }, "media:upload:completed");

    return c.json({ ok: true, storagePath }, 200);
  })
  .post("/attach", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const body = await c.req.json();
    const parsed = mediaAttachRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const worker = await requireWorkerForUser(userResult.user);
    if (isProviderEquipmentMedia(parsed.data.mediaType) && !worker) {
      return c.json({ error: "worker_profile_required" }, 403);
    }

    const authorizationError = await authorizeMediaPath({
      legId: parsed.data.legId,
      mediaType: parsed.data.mediaType,
      orderId: parsed.data.orderId,
      storagePath: parsed.data.storagePath,
      user: userResult.user,
    });
    if (authorizationError) {
      return c.json(
        { error: authorizationError.error },
        authorizationError.status
      );
    }

    const insertedAssets = await db
      .insert(mediaAssets)
      .values({
        mediaType: parsed.data.mediaType,
        metadataJson: parsed.data.metadata ?? {},
        storagePath: parsed.data.storagePath,
        uploadedByWorkerId: worker?.id,
      })
      .returning();

    const [asset] = insertedAssets;
    if (!asset) {
      return c.json({ error: "Failed to register uploaded media" }, 500);
    }

    if (parsed.data.orderId) {
      await db.insert(orderMediaLinks).values({
        mediaAssetId: asset.id,
        orderId: parsed.data.orderId,
        requiredForTransition: toOrderRequiredTransition(
          parsed.data.requiredForTransition
        ),
      });
    }

    if (parsed.data.legId) {
      await db.insert(legMediaLinks).values({
        legId: parsed.data.legId,
        mediaAssetId: asset.id,
        requiredForTransition: toLegRequiredTransition(
          parsed.data.requiredForTransition
        ),
      });
    }

    if (isProviderEquipmentMedia(parsed.data.mediaType) && worker) {
      const currentEquipment =
        worker.equipmentJson && typeof worker.equipmentJson === "object"
          ? (worker.equipmentJson as Record<string, unknown>)
          : {};
      await db
        .update(workers)
        .set({
          equipmentJson: {
            ...currentEquipment,
            equipmentPhotoPath: parsed.data.storagePath,
          },
          updatedAt: new Date(),
        })
        .where(eq(workers.id, worker.id));
    }

    return c.json(
      {
        mediaAssetId: asset.id,
        ok: true,
      },
      200
    );
  });

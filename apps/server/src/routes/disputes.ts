import { and, db, desc, eq } from "@callcastlecare/db";
import { orderDisputes, orders } from "@callcastlecare/db/schema/index";
import { Hono } from "hono";
import { z } from "zod";

import { requireAdmin } from "../lib/admin";
import { getOrCreateCustomerForUser, requireUser } from "../lib/auth";
import { logger } from "../lib/logger";
import type { AppEnv } from "../types";

const createDisputeSchema = z.object({
  customerNote: z.string().trim().max(2000).optional(),
  evidenceUrls: z.array(z.string().url()).max(8).optional().default([]),
  orderId: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
});

const resolveDisputeSchema = z.object({
  resolutionNote: z.string().trim().min(3).max(2000),
  status: z.enum([
    "under_review",
    "resolved_customer",
    "resolved_provider",
    "dismissed",
  ]),
});

export const disputeRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const denied = requireAdmin(c);
    if (denied) {
      return denied;
    }

    const rows = await db
      .select()
      .from(orderDisputes)
      .orderBy(desc(orderDisputes.createdAt))
      .limit(100);

    return c.json({ disputes: rows }, 200);
  })
  .post("/", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const body = await c.req.json();
    const parsed = createDisputeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const customer = await getOrCreateCustomerForUser(userResult.user);
    const [order] = await db
      .select({
        completedAt: orders.completedAt,
        id: orders.id,
        status: orders.status,
        tipAmountCents: orders.tipAmountCents,
      })
      .from(orders)
      .where(
        and(
          eq(orders.id, parsed.data.orderId),
          eq(orders.customerId, customer.id)
        )
      )
      .limit(1);

    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    const [dispute] = await db
      .insert(orderDisputes)
      .values({
        customerNote: parsed.data.customerNote ?? null,
        evidenceJson: {
          urls: parsed.data.evidenceUrls,
        },
        orderId: parsed.data.orderId,
        reason: parsed.data.reason,
        status: "open",
      })
      .returning();

    if (!dispute) {
      return c.json({ error: "Failed to create dispute" }, 500);
    }

    logger.info(
      {
        disputeId: dispute.id,
        orderId: order.id,
        requestId: c.get("requestId"),
        tipAmountCents: order.tipAmountCents,
        userId: userResult.user.id,
      },
      "order:dispute_opened"
    );

    return c.json({ dispute }, 201);
  })
  .patch("/:disputeId", async (c) => {
    const denied = requireAdmin(c);
    if (denied) {
      return denied;
    }

    const disputeId = Number(c.req.param("disputeId"));
    if (!Number.isInteger(disputeId) || disputeId <= 0) {
      return c.json({ error: "Invalid dispute id" }, 400);
    }

    const body = await c.req.json();
    const parsed = resolveDisputeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const isResolved =
      parsed.data.status.startsWith("resolved") ||
      parsed.data.status === "dismissed";

    const [dispute] = await db
      .update(orderDisputes)
      .set({
        resolutionNote: parsed.data.resolutionNote,
        resolvedAt: isResolved ? new Date() : null,
        resolvedByUserId: c.get("user")?.id ?? null,
        status: parsed.data.status,
        updatedAt: new Date(),
      })
      .where(eq(orderDisputes.id, disputeId))
      .returning();

    if (!dispute) {
      return c.json({ error: "Dispute not found" }, 404);
    }

    logger.info(
      {
        disputeId: dispute.id,
        orderId: dispute.orderId,
        requestId: c.get("requestId"),
        status: dispute.status,
        userId: c.get("user")?.id ?? null,
      },
      "admin:dispute_updated"
    );

    return c.json({ dispute }, 200);
  });

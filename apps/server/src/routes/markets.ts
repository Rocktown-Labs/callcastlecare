import { db, desc, eq } from "@callcastlecare/db";
import { markets } from "@callcastlecare/db/schema/index";
import { Hono } from "hono";
import { z } from "zod";

import { requireAdmin } from "../lib/admin";
import { logger } from "../lib/logger";
import type { AppEnv } from "../types";

const marketModeSchema = z.enum(["on_demand", "subscription_first", "paused"]);

const upsertMarketSchema = z.object({
  activeProCount: z.number().int().nonnegative().optional(),
  autoOnDemandAtPros: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  label: z.string().trim().min(2).max(80),
  longDistanceEnabled: z.boolean().optional(),
  mode: marketModeSchema.optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  stateCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase()),
  travelFeesEnabled: z.boolean().optional(),
});

const resolveMode = (input: {
  activeProCount: number;
  autoOnDemandAtPros: number;
  mode: "on_demand" | "paused" | "subscription_first";
}) => {
  if (input.mode === "paused") {
    return "paused" as const;
  }

  if (input.activeProCount >= input.autoOnDemandAtPros) {
    return "on_demand" as const;
  }

  return input.mode;
};

export const marketRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const rows = await db
      .select()
      .from(markets)
      .orderBy(desc(markets.isActive));
    return c.json({ markets: rows }, 200);
  })
  .get("/:stateCode", async (c) => {
    const stateCode = c.req.param("stateCode").toUpperCase();
    const [row] = await db
      .select()
      .from(markets)
      .where(eq(markets.stateCode, stateCode))
      .limit(1);

    if (!row) {
      return c.json(
        {
          market: {
            label: stateCode,
            mode: stateCode === "AR" ? "on_demand" : "subscription_first",
            stateCode,
          },
        },
        200
      );
    }

    return c.json({ market: row }, 200);
  })
  .put("/", async (c) => {
    const denied = requireAdmin(c);
    if (denied) {
      return denied;
    }

    const body = await c.req.json();
    const parsed = upsertMarketSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const activeProCount = parsed.data.activeProCount ?? 0;
    const autoOnDemandAtPros = parsed.data.autoOnDemandAtPros ?? 5;
    const requestedMode = parsed.data.mode ?? "subscription_first";
    const mode = resolveMode({
      activeProCount,
      autoOnDemandAtPros,
      mode: requestedMode,
    });

    const [existing] = await db
      .select()
      .from(markets)
      .where(eq(markets.stateCode, parsed.data.stateCode))
      .limit(1);

    const values = {
      activeProCount,
      autoOnDemandAtPros,
      isActive: parsed.data.isActive ?? true,
      label: parsed.data.label,
      longDistanceEnabled: parsed.data.longDistanceEnabled ?? true,
      mode,
      notes: parsed.data.notes ?? null,
      stateCode: parsed.data.stateCode,
      travelFeesEnabled: parsed.data.travelFeesEnabled ?? true,
      updatedAt: new Date(),
    };

    const [row] = existing
      ? await db
          .update(markets)
          .set(values)
          .where(eq(markets.id, existing.id))
          .returning()
      : await db.insert(markets).values(values).returning();

    if (!row) {
      return c.json({ error: "Failed to save market" }, 500);
    }

    logger.info(
      {
        marketId: row.id,
        mode: row.mode,
        requestId: c.get("requestId"),
        stateCode: row.stateCode,
        userId: c.get("user")?.id ?? null,
      },
      "admin:market_upserted"
    );

    return c.json({ market: row }, 200);
  });

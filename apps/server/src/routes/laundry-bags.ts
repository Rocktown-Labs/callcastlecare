import { db, desc, eq } from "@callcastlecare/db";
import { laundryBags } from "@callcastlecare/db/schema/index";
import { Hono } from "hono";
import { z } from "zod";

import { requireAdmin } from "../lib/admin";
import { logger } from "../lib/logger";
import type { AppEnv } from "../types";

const createBagsSchema = z.object({
  count: z.number().int().min(1).max(100).default(12),
  prefix: z
    .string()
    .trim()
    .min(2)
    .max(8)
    .optional()
    .default("CC")
    .transform((value) => value.toUpperCase()),
});

const buildBagCode = (prefix: string, sequence: number) =>
  `${prefix}-${String(sequence).padStart(5, "0")}`;

export const laundryBagRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const denied = requireAdmin(c);
    if (denied) {
      return denied;
    }

    const rows = await db
      .select()
      .from(laundryBags)
      .orderBy(desc(laundryBags.createdAt))
      .limit(200);

    return c.json({ bags: rows }, 200);
  })
  .post("/generate", async (c) => {
    const denied = requireAdmin(c);
    if (denied) {
      return denied;
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = createBagsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const existing = await db
      .select({ code: laundryBags.code })
      .from(laundryBags)
      .orderBy(desc(laundryBags.id))
      .limit(1);
    const lastCode = existing[0]?.code ?? `${parsed.data.prefix}-00000`;
    const lastSequence = Number(lastCode.split("-").at(-1) ?? "0") || 0;

    const valuesToInsert = Array.from(
      { length: parsed.data.count },
      (_, index) => {
        const code = buildBagCode(parsed.data.prefix, lastSequence + index + 1);
        const qrPayload = `https://www.callcastlecare.com/bags/${code}`;
        return {
          code,
          qrPayload,
          status: "available" as const,
        };
      }
    );

    const created = await db
      .insert(laundryBags)
      .values(valuesToInsert)
      .returning();

    logger.info(
      {
        count: created.length,
        prefix: parsed.data.prefix,
        requestId: c.get("requestId"),
        userId: c.get("user")?.id ?? null,
      },
      "admin:laundry_bags_generated"
    );

    return c.json({ bags: created }, 201);
  })
  .get("/:code", async (c) => {
    const code = c.req.param("code").toUpperCase();
    const [row] = await db
      .select()
      .from(laundryBags)
      .where(eq(laundryBags.code, code))
      .limit(1);

    if (!row) {
      return c.json({ error: "Bag not found" }, 404);
    }

    return c.json({ bag: row }, 200);
  });

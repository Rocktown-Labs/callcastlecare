/* eslint-disable complexity */
import { db, and, eq } from "@callcastlecare/db";
import { addresses } from "@callcastlecare/db/schema/index";
import { Hono } from "hono";

import { getOrCreateCustomerForUser, requireUser } from "../lib/auth";
import { verifyAddressWithRadar } from "../lib/integrations/radar";
import { createAddressRecord } from "../lib/orders";
import type { AppEnv } from "../types";
import {
  updateAddressRequestSchema,
  upsertAddressRequestSchema,
} from "./schemas";

const parseAddressId = (value: string) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const buildFormattedAddress = (input: {
  city: string;
  country: string;
  state: string;
  street: string;
  zip: string;
}) =>
  `${input.street}, ${input.city}, ${input.state} ${input.zip}, ${input.country}`;

export const addressesRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const customer = await getOrCreateCustomerForUser(userResult.user);
    let list: unknown[] = [];
    try {
      list = await db.query.addresses.findMany({
        orderBy: (table, { desc }) => [
          desc(table.isDefault),
          desc(table.updatedAt),
        ],
        where: eq(addresses.customerId, customer.id),
      });
    } catch {
      list = await db
        .select({
          city: addresses.city,
          country: addresses.country,
          createdAt: addresses.createdAt,
          customerId: addresses.customerId,
          id: addresses.id,
          latitude: addresses.latitude,
          longitude: addresses.longitude,
          state: addresses.state,
          street: addresses.street,
          updatedAt: addresses.updatedAt,
          zip: addresses.zip,
        })
        .from(addresses)
        .where(eq(addresses.customerId, customer.id));
    }

    return c.json({ addresses: list }, 200);
  })
  .post("/", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const body = await c.req.json();
    const parsed = upsertAddressRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const customer = await getOrCreateCustomerForUser(userResult.user);
    const payload = parsed.data;

    if (payload.street && payload.city && payload.state && payload.zip) {
      const country = payload.country ?? "US";
      const formattedAddress =
        payload.formattedAddress ??
        buildFormattedAddress({
          city: payload.city,
          country,
          state: payload.state,
          street: payload.street,
          zip: payload.zip,
        });
      const verified = await verifyAddressWithRadar(formattedAddress);
      const address = await createAddressRecord({
        city: verified.city || payload.city,
        country,
        customerId: customer.id,
        formattedAddress: verified.verdict.isComplete
          ? verified.formattedAddress
          : formattedAddress,
        instructions: payload.instructions ?? null,
        isDefault: payload.isDefault,
        label: payload.label,
        latitude: verified.latitude,
        longitude: verified.longitude,
        radarGeocodeJson: verified.raw,
        // Service-area eligibility and travel pricing read state/zip, so use
        // the geocoder's canonical values rather than client-provided ones.
        state: verified.state || payload.state,
        street: verified.street || payload.street,
        zip: verified.zip || payload.zip,
      });

      return c.json({ address }, 200);
    }

    if (payload.address) {
      const parts = payload.address.split(",").map((part) => part.trim());
      const city = payload.city ?? parts[1] ?? "Little Rock";
      const state = payload.state ?? parts[2]?.split(" ")[0] ?? "AR";
      const street = payload.street ?? parts[0] ?? payload.address;
      const zip = payload.zip ?? parts[2]?.split(" ")[1] ?? "72201";
      const formattedAddress = payload.formattedAddress ?? payload.address;
      const verified = await verifyAddressWithRadar(formattedAddress);
      const address = await createAddressRecord({
        city: verified.city || city,
        country: payload.country ?? "US",
        customerId: customer.id,
        formattedAddress: verified.verdict.isComplete
          ? verified.formattedAddress
          : formattedAddress,
        instructions: payload.instructions ?? null,
        isDefault: payload.isDefault,
        label: payload.label,
        latitude: verified.latitude,
        longitude: verified.longitude,
        radarGeocodeJson: verified.raw,
        state: verified.state || state,
        street: verified.street || street,
        zip: verified.zip || zip,
      });

      return c.json({ address }, 200);
    }

    return c.json({ error: "Invalid structured address" }, 400);
  })
  .patch("/:addressId", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const addressId = parseAddressId(c.req.param("addressId"));
    if (!addressId) {
      return c.json({ error: "Invalid address id" }, 400);
    }

    const body = await c.req.json();
    const parsed = updateAddressRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const customer = await getOrCreateCustomerForUser(userResult.user);
    const target = await db.query.addresses.findFirst({
      where: and(
        eq(addresses.id, addressId),
        eq(addresses.customerId, customer.id)
      ),
    });

    if (!target) {
      return c.json({ error: "Address not found" }, 404);
    }

    const updated = await db.transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx
          .update(addresses)
          .set({
            isDefault: false,
            updatedAt: new Date(),
          })
          .where(eq(addresses.customerId, customer.id));
      }

      const updatedRows = await tx
        .update(addresses)
        .set({
          ...(parsed.data.instructions === undefined
            ? {}
            : { instructions: parsed.data.instructions }),
          ...(parsed.data.isDefault === undefined
            ? {}
            : { isDefault: parsed.data.isDefault }),
          ...(parsed.data.label ? { label: parsed.data.label } : {}),
          updatedAt: new Date(),
        })
        .where(eq(addresses.id, target.id))
        .returning();

      return updatedRows[0];
    });

    if (!updated) {
      return c.json({ error: "Failed to update address" }, 500);
    }

    return c.json({ address: updated }, 200);
  })
  .post("/:addressId/default", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const addressId = parseAddressId(c.req.param("addressId"));
    if (!addressId) {
      return c.json({ error: "Invalid address id" }, 400);
    }

    const customer = await getOrCreateCustomerForUser(userResult.user);
    const target = await db.query.addresses.findFirst({
      where: and(
        eq(addresses.id, addressId),
        eq(addresses.customerId, customer.id)
      ),
    });

    if (!target) {
      return c.json({ error: "Address not found" }, 404);
    }

    const updated = await db.transaction(async (tx) => {
      await tx
        .update(addresses)
        .set({
          isDefault: false,
          updatedAt: new Date(),
        })
        .where(eq(addresses.customerId, customer.id));

      const updatedRows = await tx
        .update(addresses)
        .set({
          isDefault: true,
          updatedAt: new Date(),
        })
        .where(eq(addresses.id, target.id))
        .returning();

      return updatedRows[0];
    });

    if (!updated) {
      return c.json({ error: "Failed to set default address" }, 500);
    }

    return c.json({ address: updated }, 200);
  })
  .delete("/:addressId", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const addressId = parseAddressId(c.req.param("addressId"));
    if (!addressId) {
      return c.json({ error: "Invalid address id" }, 400);
    }

    const customer = await getOrCreateCustomerForUser(userResult.user);
    const target = await db.query.addresses.findFirst({
      where: and(
        eq(addresses.id, addressId),
        eq(addresses.customerId, customer.id)
      ),
    });

    if (!target) {
      return c.json({ error: "Address not found" }, 404);
    }

    await db.delete(addresses).where(eq(addresses.id, target.id));
    return c.json({ success: true }, 200);
  });

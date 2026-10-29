import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../types";
import { addressesRoutes } from "./addresses";

const mocks = vi.hoisted(() => ({
  createAddressRecord: vi.fn(),
  verifyAddressWithRadar: vi.fn(),
}));

vi.mock("../lib/auth", () => ({
  getOrCreateCustomerForUser: vi.fn().mockResolvedValue({ id: 1 }),
  requireUser: (c: { get: (key: string) => unknown }) => {
    const user = c.get("user");
    return user
      ? { error: null, user }
      : { error: new Response("unauthorized", { status: 401 }), user: null };
  },
}));

vi.mock("../lib/integrations/radar", () => ({
  verifyAddressWithRadar: mocks.verifyAddressWithRadar,
}));

vi.mock("../lib/orders", () => ({
  createAddressRecord: mocks.createAddressRecord,
}));

const app = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    c.set("user", {
      email: "customer@example.com",
      id: "user_1",
      name: "Customer",
      role: "user",
    });
    return await next();
  })
  .route("/addresses", addressesRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyAddressWithRadar.mockResolvedValue({
    city: "Little Rock",
    country: "US",
    formattedAddress: "123 Castle Way, Little Rock, AR 72201, US",
    latitude: 34.7465,
    longitude: -92.2896,
    placeId: "radar_place",
    raw: { source: "radar" },
    state: "AR",
    street: "123 Castle Way",
    verdict: {
      hasUnconfirmedComponents: false,
      isComplete: true,
      verificationStatus: "verified",
    },
    zip: "72201",
  });
  mocks.createAddressRecord.mockImplementation((input: unknown) => input);
});

describe("POST /addresses coordinate trust", () => {
  it("ignores client-supplied coordinates for structured addresses", async () => {
    const response = await app.request("/addresses", {
      body: JSON.stringify({
        city: "Little Rock",
        country: "US",
        formattedAddress: "123 Castle Way, Little Rock, AR 72201, US",
        latitude: 0,
        longitude: 0,
        state: "TX",
        street: "123 Castle Way",
        zip: "72201",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mocks.verifyAddressWithRadar).toHaveBeenCalledWith(
      "123 Castle Way, Little Rock, AR 72201, US"
    );
    expect(mocks.createAddressRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 34.7465,
        longitude: -92.2896,
        radarGeocodeJson: { source: "radar" },
        state: "AR",
      })
    );
  });

  it("ignores client-supplied coordinates for free-text addresses", async () => {
    const response = await app.request("/addresses", {
      body: JSON.stringify({
        address: "123 Castle Way, Little Rock, AR 72201",
        latitude: 0,
        longitude: 0,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mocks.createAddressRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 34.7465,
        longitude: -92.2896,
      })
    );
  });
});

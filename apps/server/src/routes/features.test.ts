import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../types";
import { featureRoutes } from "./features";

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("../lib/feature-settings", () => ({
  getFeatureSettings: mocks.read,
  updateFeatureSettings: mocks.write,
}));

const buildApp = (role: "admin" | "customer" | null) =>
  new Hono<AppEnv>()
    .use("*", async (c, next) => {
      c.set(
        "user",
        role
          ? { email: "test@example.com", id: "test", name: "Test", role }
          : null
      );
      c.set("requestId", "test-request");
      return await next();
    })
    .route("/features", featureRoutes);

describe("feature availability", () => {
  beforeEach(() => vi.clearAllMocks());
  it("publishes the current setting without caching it", async () => {
    mocks.read.mockResolvedValue({ homesEnabled: false });
    const response = await buildApp(null).request("/features");
    expect(await response.json()).toEqual({ homesEnabled: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each([null, "customer"] as const)("denies writes for %s", async (role) => {
    const response = await buildApp(role).request("/features", {
      body: JSON.stringify({ homesEnabled: false }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });
    expect(response.status).toBe(role ? 403 : 401);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("validates boolean values before saving", async () => {
    const response = await buildApp("admin").request("/features", {
      body: JSON.stringify({ homesEnabled: "false" }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });
    expect(response.status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("allows admins to disable Homes", async () => {
    mocks.write.mockResolvedValue({ homesEnabled: false });
    const response = await buildApp("admin").request("/features", {
      body: JSON.stringify({ homesEnabled: false }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });
    expect(response.status).toBe(200);
    expect(mocks.write).toHaveBeenCalledWith(false);
  });
});

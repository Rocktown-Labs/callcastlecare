import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import type { AppEnv } from "../types";
import { isOriginAllowed, originGuard, parseAllowedOrigins } from "./origin";

const originalCorsOrigin = process.env.CORS_ORIGIN;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.CORS_ORIGIN = originalCorsOrigin;
  process.env.NODE_ENV = originalNodeEnv;
});

describe("origin allowlist", () => {
  it("accepts only configured origins", () => {
    expect(
      isOriginAllowed({
        configured: "https://callcastlecare.com",
        nodeEnv: "production",
        origin: "https://callcastlecare.com",
      })
    ).toBe(true);
    expect(
      isOriginAllowed({
        configured: "https://callcastlecare.com",
        nodeEnv: "production",
        origin: "https://evil.workers.dev",
      })
    ).toBe(false);
    expect(
      isOriginAllowed({
        configured: "https://callcastlecare.com",
        nodeEnv: "production",
        origin: "https://evil-localhost.com",
      })
    ).toBe(false);
  });

  it("allows localhost only outside production", () => {
    expect(
      isOriginAllowed({
        configured: undefined,
        nodeEnv: "development",
        origin: "http://localhost:3001",
      })
    ).toBe(true);
    expect(
      isOriginAllowed({
        configured: undefined,
        nodeEnv: "production",
        origin: "http://localhost:3001",
      })
    ).toBe(false);
  });

  it("parses comma-separated configured origins", () => {
    expect(
      parseAllowedOrigins(
        "https://callcastlecare.com, https://staging.callcastlecare.com"
      )
    ).toEqual([
      "https://callcastlecare.com",
      "https://staging.callcastlecare.com",
    ]);
  });
});

const buildApp = () =>
  new Hono<AppEnv>()
    .use("*", originGuard())
    .post("/orders/1/cancel", (c) => c.json({ ok: true }))
    .get("/health", (c) => c.json({ ok: true }))
    .post("/webhooks/stripe", (c) => c.json({ ok: true }));

const env = {
  CORS_ORIGIN: "https://callcastlecare.com",
  NODE_ENV: "production",
};

describe("originGuard", () => {
  it("rejects a cross-site state-changing request", async () => {
    const response = await buildApp().request(
      "/orders/1/cancel",
      {
        headers: { origin: "https://evil.workers.dev" },
        method: "POST",
      },
      env
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "invalid_origin" });
  });

  it("allows the configured web origin", async () => {
    const response = await buildApp().request(
      "/orders/1/cancel",
      {
        headers: { origin: "https://callcastlecare.com" },
        method: "POST",
      },
      env
    );

    expect(response.status).toBe(200);
  });

  it("allows safe methods and signature-protected webhooks", async () => {
    const getResponse = await buildApp().request(
      "/health",
      { headers: { origin: "https://evil.workers.dev" } },
      env
    );
    const webhookResponse = await buildApp().request(
      "/webhooks/stripe",
      {
        headers: { origin: "https://evil.workers.dev" },
        method: "POST",
      },
      env
    );

    expect(getResponse.status).toBe(200);
    expect(webhookResponse.status).toBe(200);
  });
});

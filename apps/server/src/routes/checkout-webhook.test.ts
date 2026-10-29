import { homePreorders } from "@callcastlecare/db/schema/index";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../types";
import { handleStripeWebhook } from "./checkout";

const mocks = vi.hoisted(() => ({
  dbInsert: vi.fn(),
  dbInsertValues: vi.fn(),
  dbQueryUserFindFirst: vi.fn(),
  dbUpdate: vi.fn(),
  dbUpdateSet: vi.fn(),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  renderEmail: vi.fn(),
  sendEmail: vi.fn(),
  signUpEmail: vi.fn(),
}));

const workerRow = {
  applicationFormData: { plan: "pro", source: "express_onboarding_checkout" },
  createdAt: new Date(),
  email: "provider@example.com",
  firstName: "Jamie",
  id: 42,
  lastName: "Provider",
  phone: "",
  serviceRadiusMiles: 10,
  servicesOffered: [],
  updatedAt: new Date(),
  userId: "user_provider_1",
};

vi.mock("@callcastlecare/db", () => ({
  and: vi.fn(),
  db: {
    insert: mocks.dbInsert,
    query: {
      checkoutSessions: {
        findFirst: vi.fn(),
      },
      user: {
        findFirst: mocks.dbQueryUserFindFirst,
      },
    },
    update: mocks.dbUpdate,
  },
  eq: vi.fn(),
  gt: vi.fn(),
  inArray: vi.fn(),
  lt: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@callcastlecare/db/schema/index", () => ({
  addresses: { id: "id" },
  checkoutDrafts: { id: "id" },
  checkoutItems: { id: "id" },
  checkoutSessions: { id: "id" },
  homePreorders: { id: "id" },
  homeQuotes: { id: "id" },
  orderDisputes: { stripeDisputeId: "stripeDisputeId" },
  orders: { id: "id" },
  quoteRequests: { id: "id" },
  serviceSubscriptions: { stripeSubscriptionId: "stripeSubscriptionId" },
  stripeWebhookEvents: { id: "id", stripeEventId: "stripeEventId" },
  user: { email: "email" },
  workers: { userId: "userId" },
}));

vi.mock("@callcastlecare/auth", () => ({
  auth: {
    api: {
      signUpEmail: mocks.signUpEmail,
    },
  },
}));

vi.mock("@callcastlecare/email", () => ({
  renderProviderApplicationReceivedEmail: mocks.renderEmail,
}));

vi.mock("@callcastlecare/env/server", () => ({
  env: {},
}));

vi.mock("../lib/integrations/email", () => ({
  sendEmail: mocks.sendEmail,
}));

vi.mock("../lib/integrations/radar", () => ({
  verifyAddressWithRadar: vi.fn(),
}));

vi.mock("../lib/integrations/rentcast", () => ({
  lookupPropertyWithRentCast: vi.fn(),
}));

vi.mock("../lib/integrations/stripe-payments", () => ({
  createStripeCheckoutSession: vi.fn(),
  parseStripeWebhookEvent: (input: { rawBody: string }) => {
    try {
      return JSON.parse(input.rawBody);
    } catch {
      return null;
    }
  },
}));

vi.mock("../lib/logger", () => ({
  logger: mocks.logger,
}));

vi.mock("../lib/orders", () => ({
  createAddressRecord: vi.fn(),
  finalizeCheckoutPayment: vi.fn(),
}));

vi.mock("../lib/auth", () => ({
  getOrCreateCustomerForCheckoutContact: vi.fn(),
  getOrCreateCustomerForUser: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("../lib/domain/checkout", () => ({
  computeCheckoutPreview: vi.fn(),
  getComboPricingTier: vi.fn(),
  getComboServiceTypes: vi.fn(),
  isRecurringCheckoutItem: vi.fn(),
}));

vi.mock("./schemas", () => ({
  checkoutConfirmRequestSchema: { safeParse: vi.fn() },
  checkoutDraftRequestSchema: { safeParse: vi.fn() },
  checkoutPreviewRequestSchema: { safeParse: vi.fn() },
  publicQuoteRequestSchema: { safeParse: vi.fn() },
}));

const app = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    c.set("requestId", "test-request");
    c.set("user", null);
    c.set("session", null);
    return await next();
  })
  .post("/webhook/stripe", handleStripeWebhook);

const buildProviderCheckoutEvent = () => ({
  data: {
    object: {
      id: "cs_provider_1",
      metadata: {
        email: "provider@example.com",
        firstName: "Jamie",
        lastName: "Provider",
        plan: "pro",
        type: "provider_express_onboarding",
      },
      payment_intent: "pi_123",
    },
  },
  id: "evt_1",
  type: "checkout.session.completed",
});

describe("provider express onboarding webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbQueryUserFindFirst.mockResolvedValue(null);
    mocks.renderEmail.mockResolvedValue({
      html: "<p>Application received</p>",
      text: "Application received",
    });
    mocks.sendEmail.mockResolvedValue({});
    mocks.signUpEmail.mockResolvedValue({
      token: null,
      user: {
        createdAt: new Date(),
        email: "provider@example.com",
        id: "user_provider_1",
        name: "Jamie Provider",
      },
    });
    mocks.dbInsert.mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([workerRow]),
      }),
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([workerRow]),
      }),
      returning: vi.fn().mockResolvedValue([workerRow]),
      values: mocks.dbInsertValues.mockReturnThis(),
    });
    mocks.dbUpdate.mockReturnValue({
      set: mocks.dbUpdateSet.mockReturnThis(),
    });
    mocks.dbUpdateSet.mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });
  });

  it("creates the worker record for the account created at checkout", async () => {
    mocks.dbQueryUserFindFirst.mockResolvedValue({
      email: "provider@example.com",
      id: "user_provider_1",
    });

    const response = await app.request("/webhook/stripe", {
      body: JSON.stringify(buildProviderCheckoutEvent()),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });

    expect(mocks.dbQueryUserFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.signUpEmail).not.toHaveBeenCalled();

    expect(mocks.dbInsert).toHaveBeenCalledWith(expect.objectContaining({}));
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationFormData: expect.objectContaining({
          plan: "pro",
          source: "express_onboarding_checkout",
        }),
        email: "provider@example.com",
        firstName: "Jamie",
        lastName: "Provider",
        phone: "",
        serviceRadiusMiles: 10,
        servicesOffered: [],
        userId: "user_provider_1",
      })
    );
  });

  it("sends the ProviderApplicationReceivedEmail", async () => {
    mocks.dbQueryUserFindFirst.mockResolvedValue({
      email: "provider@example.com",
      id: "user_provider_1",
    });

    const response = await app.request("/webhook/stripe", {
      body: JSON.stringify(buildProviderCheckoutEvent()),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);

    expect(mocks.renderEmail).toHaveBeenCalledWith({
      applicantName: "Jamie",
      planName: "CastleCare Pro",
      services: [],
    });

    expect(mocks.sendEmail).toHaveBeenCalledWith({
      html: "<p>Application received</p>",
      idempotencyKey: "provider-checkout/42/application-received",
      subject: "Your CastleCare Provider Application is Received",
      text: "Application received",
      to: "provider@example.com",
    });
  });

  it("reuses an existing user instead of creating a duplicate", async () => {
    mocks.dbQueryUserFindFirst.mockResolvedValue({
      email: "provider@example.com",
      id: "user_existing",
    });

    const response = await app.request("/webhook/stripe", {
      body: JSON.stringify(buildProviderCheckoutEvent()),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
    expect(mocks.dbInsert).toHaveBeenCalled();
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_existing" })
    );
  });

  it("does not onboard a provider from an unpaid delayed-method session", async () => {
    mocks.dbQueryUserFindFirst.mockResolvedValue({
      email: "provider@example.com",
      id: "user_provider_1",
    });
    const event = buildProviderCheckoutEvent();
    (event.data.object as Record<string, unknown>).payment_status = "unpaid";

    const response = await app.request("/webhook/stripe", {
      body: JSON.stringify(event),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mocks.dbInsertValues).not.toHaveBeenCalledWith(
      expect.objectContaining({ email: "provider@example.com" })
    );
    expect(mocks.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ paymentStatus: "unpaid" }),
      "stripe_webhook:checkout_not_paid"
    );
  });

  it("does not create an account when the checkout user is missing", async () => {
    const response = await app.request("/webhook/stripe", {
      body: JSON.stringify(buildProviderCheckoutEvent()),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
    expect(mocks.dbInsertValues).not.toHaveBeenCalledWith(
      expect.objectContaining({ email: "provider@example.com" })
    );
    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ email: "provider@example.com" }),
      "provider:checkout_user_missing"
    );
  });

  it("returns 400 for malformed webhook payloads", async () => {
    const response = await app.request("/webhook/stripe", {
      body: "{not-json",
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
  });
  it.each([
    ["checkout.session.expired", "cancelled"],
    ["checkout.session.async_payment_failed", "failed"],
  ])("updates unpaid home preorders for %s", async (type, status) => {
    const response = await app.request("/webhook/stripe", {
      body: JSON.stringify({
        data: { object: { id: "cs_home" } },
        id: `evt_${type}`,
        type,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(mocks.dbUpdate).toHaveBeenCalledWith(homePreorders);
    expect(mocks.dbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status })
    );
  });
});

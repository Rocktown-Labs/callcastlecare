import type * as AuthEmailModule from "@callcastlecare/auth/email";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCheckoutAccessToken } from "../lib/checkout-access";
import type { AppEnv } from "../types";
import { checkoutRoutes } from "./checkout";

const mocks = vi.hoisted(() => ({
  checkoutItemsFindMany: vi.fn(),
  checkoutSessionFindFirst: vi.fn(),
  createStripeCheckoutSession: vi.fn(),
  createVerificationOTP: vi.fn(),
  customerFindFirst: vi.fn(),
  dbAddressFindFirst: vi.fn(),
  dbInsert: vi.fn(),
  env: {
    ADMIN_EMAIL: "admin@callcastlecare.com",
    BETTER_AUTH_SECRET: "test-secret-for-checkout-claim-routes-1234",
    RESEND_API_KEY: undefined as string | undefined,
  },
  getStripeClient: vi.fn(),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  ordersFindMany: vi.fn(),
  retrieveStripeSession: vi.fn(),
  sendAuthOtpEmail: vi.fn(),
  signUpEmail: vi.fn(),
  userFindFirst: vi.fn(),
  workersFindFirst: vi.fn(),
}));

vi.mock("@callcastlecare/db", () => ({
  and: vi.fn(),
  db: {
    execute: vi.fn(),
    insert: mocks.dbInsert,
    query: {
      addresses: { findFirst: mocks.dbAddressFindFirst },
      checkoutItems: { findMany: mocks.checkoutItemsFindMany },
      checkoutSessions: { findFirst: mocks.checkoutSessionFindFirst },
      customers: { findFirst: mocks.customerFindFirst },
      orders: { findMany: mocks.ordersFindMany },
      user: { findFirst: mocks.userFindFirst },
      workers: { findFirst: mocks.workersFindFirst },
    },
    transaction: vi.fn(),
    update: vi.fn(),
  },
  eq: vi.fn(),
  gt: vi.fn(),
  inArray: vi.fn(),
  lt: vi.fn(),
  sql: vi.fn(() => "advisory-lock"),
}));

vi.mock("@callcastlecare/db/schema/index", () => ({
  addresses: { id: "id" },
  checkoutDrafts: { id: "id" },
  checkoutItems: { checkoutSessionId: "checkoutSessionId" },
  checkoutSessions: { id: "id", stripeCheckoutSessionId: "stripeId" },
  customers: { id: "id" },
  homePreorders: { id: "id" },
  homeQuotes: { id: "id" },
  orderDisputes: { stripeDisputeId: "stripeDisputeId" },
  orders: { checkoutSessionId: "checkoutSessionId" },
  payouts: { id: "id" },
  quoteRequests: { id: "id" },
  stripeCatalogItems: { id: "id" },
  stripeRefunds: { stripeRefundId: "stripeRefundId" },
  stripeWebhookEvents: { id: "id" },
  user: { email: "email" },
  workers: { id: "id", userId: "userId" },
}));

vi.mock("@callcastlecare/auth", () => ({
  auth: {
    api: {
      createVerificationOTP: mocks.createVerificationOTP,
      signUpEmail: mocks.signUpEmail,
    },
  },
}));

vi.mock("@callcastlecare/auth/email", async (importOriginal) => {
  const original = await importOriginal<typeof AuthEmailModule>();
  return {
    ...original,
    sendAuthOtpEmail: mocks.sendAuthOtpEmail,
  };
});

vi.mock("@callcastlecare/email", () => ({
  renderProviderApplicationReceivedEmail: vi.fn(),
}));

vi.mock("@callcastlecare/env/server", () => ({
  env: mocks.env,
}));

vi.mock("../lib/auth", () => ({
  getOrCreateCustomerForCheckoutContact: vi.fn(),
  getOrCreateCustomerForUser: vi.fn(),
  requireUser: (c: {
    get: (key: string) => unknown;
    json: (body: unknown, status: 401) => Response;
  }) => {
    const user = c.get("user");
    return user
      ? { error: null, user }
      : { error: c.json({ error: "unauthorized" }, 401), user: null };
  },
}));

vi.mock("../lib/checkout-settings", () => ({
  getCheckoutSettings: vi.fn(),
  updateCheckoutSettings: vi.fn(),
}));

vi.mock("../lib/dispatch", () => ({
  dispatchOrder: vi.fn(),
}));

vi.mock("../lib/domain/checkout", () => ({
  computeCheckoutPreview: vi.fn(),
  getComboPricingTier: vi.fn(),
  getComboServiceTypes: vi.fn(),
  isRecurringCheckoutItem: vi.fn(),
}));

vi.mock("../lib/integrations/email", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("../lib/integrations/radar", () => ({
  verifyAddressWithRadar: vi.fn(),
}));

vi.mock("../lib/integrations/rentcast", () => ({
  lookupPropertyWithRentCast: vi.fn(),
}));

vi.mock("../lib/integrations/stripe-client", () => ({
  getStripeClient: mocks.getStripeClient,
  getStripeMode: vi.fn(() => "test"),
  isStripeMockMode: vi.fn(() => true),
}));

vi.mock("../lib/integrations/stripe-connect", () => ({
  reverseWorkerTransfer: vi.fn(),
}));

vi.mock("../lib/integrations/stripe-payments", () => ({
  createStripeCheckoutSession: mocks.createStripeCheckoutSession,
  getOrCreateStripeCustomer: vi.fn(),
  parseStripeWebhookEvent: vi.fn(),
  retrieveStripeCheckoutSession: mocks.retrieveStripeSession,
  retrieveStripeSubscription: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  logger: mocks.logger,
}));

vi.mock("../lib/orders", () => ({
  buildFormattedAddress: (input: {
    city: string;
    country: string;
    state: string;
    street: string;
    zip: string;
  }) =>
    `${input.street}, ${input.city}, ${input.state} ${input.zip}, ${input.country}`,
  createAddressRecord: vi.fn(),
  finalizeCheckoutPayment: vi.fn(),
  formatAppointmentWindow: vi.fn(() => "Mon, Sep 1, 2:00 PM – 4:00 PM"),
}));

vi.mock("../lib/payouts", () => ({
  releasePendingWorkerPayouts: vi.fn(),
}));

vi.mock("../lib/subscriptions", () => ({
  materializeSubscriptionPeriodOrders: vi.fn(),
  updateServiceSubscriptionStatus: vi.fn(),
  upsertServiceSubscription: vi.fn(),
}));

const buildApp = (userId: string | null = null) => {
  const app = new Hono<AppEnv>().use("*", async (c, next) => {
    c.set("user", {
      email: "owner@example.com",
      id: userId ?? "someone-else",
      name: "Owner",
      role: null,
    });
    c.set("session", { id: "session" });
    return await next();
  });
  return app.route("/checkout", checkoutRoutes);
};

const buildGuestApp = () => {
  const app = new Hono<AppEnv>().use("*", async (c, next) => {
    c.set("requestId", "test-request");
    c.set("user", null);
    c.set("session", null);
    return await next();
  });
  return app.route("/checkout", checkoutRoutes);
};

const paidStripeSession = {
  payment_status: "paid",
  status: "complete",
};

const checkoutSessionRow = {
  addressId: 11,
  customerId: 22,
  id: 7,
  mode: "payment",
  status: "paid",
  totalCents: 30_000,
};

const customerRow = {
  email: "taylor@example.com",
  firstName: "Taylor",
  id: 22,
  lastName: "Swift",
  phone: "555-0100",
  userId: "user_customer_1",
};

const addressRow = {
  city: "Avalon",
  country: "USA",
  formattedAddress: null,
  id: 11,
  state: "CA",
  street: "123 Castle Way",
  zip: "90210",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.RESEND_API_KEY = undefined;
  mocks.retrieveStripeSession.mockResolvedValue(paidStripeSession);
  mocks.checkoutSessionFindFirst.mockResolvedValue(checkoutSessionRow);
  mocks.customerFindFirst.mockResolvedValue(customerRow);
  mocks.dbAddressFindFirst.mockResolvedValue(addressRow);
  mocks.ordersFindMany.mockResolvedValue([
    {
      id: 1,
      scheduledEndAt: new Date("2026-09-01T16:00:00.000Z"),
      scheduledStartAt: new Date("2026-09-01T14:00:00.000Z"),
    },
  ]);
  mocks.checkoutItemsFindMany.mockResolvedValue([
    {
      label: "Lawn Care",
      scheduledEndAt: new Date("2026-09-01T16:00:00.000Z"),
      scheduledStartAt: new Date("2026-09-01T14:00:00.000Z"),
    },
  ]);
  mocks.userFindFirst.mockResolvedValue({
    email: customerRow.email,
    id: customerRow.userId,
  });
  mocks.createVerificationOTP.mockResolvedValue("123456");
  mocks.sendAuthOtpEmail.mockResolvedValue({ sent: true });
});

describe("GET /checkout/access-token", () => {
  it("rejects malformed session ids without touching Stripe", async () => {
    const app = buildApp();
    const response = await app.request("/checkout/access-token");

    expect(response.status).toBe(400);
    expect(mocks.retrieveStripeSession).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown checkout sessions", async () => {
    mocks.checkoutSessionFindFirst.mockResolvedValue(null);
    const app = buildApp();

    const response = await app.request(
      "/checkout/access-token?session_id=cs_test_missing"
    );

    expect(response.status).toBe(404);
  });

  it("blocks unpaid sessions even with a valid session id", async () => {
    mocks.retrieveStripeSession.mockResolvedValue({
      payment_status: "unpaid",
      status: "open",
    });
    const app = buildApp();

    const response = await app.request(
      "/checkout/access-token?session_id=cs_test_unpaid"
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Checkout payment is not complete",
    });
  });

  it("returns the minimal receipt payload without customer PII", async () => {
    const app = buildApp();

    const response = await app.request(
      "/checkout/access-token?session_id=cs_test_paid"
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(typeof payload.accessToken).toBe("string");
    expect(payload.orderId).toBe(1);
    expect(payload.orderNumber).toBe("1");
    expect(payload.address).toBe("123 Castle Way, Avalon, CA 90210, USA");
    expect(payload.customerEmail).toBe("taylor@example.com");
    expect(payload.maskedEmail).toBe("t***@***.com");
    expect(payload.payment).toMatchObject({
      depositCents: 5000,
      isPaidInFull: false,
      totalCents: 30_000,
    });
    expect(payload).not.toHaveProperty("customer");
    expect(payload).not.toHaveProperty("orderIds");
    expect(payload).not.toHaveProperty("paymentChoice");
    expect(JSON.stringify(payload)).not.toContain("555-0100");
    expect(JSON.stringify(payload)).not.toContain("Swift");
  });

  it("marks the payload authenticated for the owning customer", async () => {
    const app = buildApp(customerRow.userId);

    const response = await app.request(
      "/checkout/access-token?session_id=cs_test_paid"
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ isAuthenticated: true });
  });
});

describe("POST /checkout/send-login-code", () => {
  it("rejects empty payloads", async () => {
    const app = buildApp();

    const response = await app.request("/checkout/send-login-code", {
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(mocks.createVerificationOTP).not.toHaveBeenCalled();
    expect(mocks.sendAuthOtpEmail).not.toHaveBeenCalled();
  });

  it("gates raw session ids on live payment completion", async () => {
    mocks.retrieveStripeSession.mockResolvedValue({
      payment_status: "unpaid",
      status: "open",
    });
    const app = buildApp();

    const response = await app.request("/checkout/send-login-code", {
      body: JSON.stringify({ sessionId: "cs_test_unpaid" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(409);
    expect(mocks.createVerificationOTP).not.toHaveBeenCalled();
    expect(mocks.sendAuthOtpEmail).not.toHaveBeenCalled();
  });

  it("refuses to conjure a login for unknown users", async () => {
    mocks.userFindFirst.mockResolvedValue(null);
    const app = buildApp();
    const token = createCheckoutAccessToken(
      checkoutSessionRow.id,
      mocks.env.BETTER_AUTH_SECRET
    );

    const response = await app.request("/checkout/send-login-code", {
      body: JSON.stringify({ token }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(404);
    expect(mocks.createVerificationOTP).not.toHaveBeenCalled();
    expect(mocks.sendAuthOtpEmail).not.toHaveBeenCalled();
  });

  it("fails loudly when email delivery is unconfigured", async () => {
    const app = buildApp();
    const token = createCheckoutAccessToken(
      checkoutSessionRow.id,
      mocks.env.BETTER_AUTH_SECRET
    );

    const response = await app.request("/checkout/send-login-code", {
      body: JSON.stringify({ token }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Sign-in codes are unavailable right now",
    });
    expect(mocks.createVerificationOTP).not.toHaveBeenCalled();
    expect(mocks.sendAuthOtpEmail).not.toHaveBeenCalled();
  });

  it("returns a masked email instead of customer PII on success", async () => {
    mocks.env.RESEND_API_KEY = "re_test_key";
    const app = buildApp();
    const token = createCheckoutAccessToken(
      checkoutSessionRow.id,
      mocks.env.BETTER_AUTH_SECRET
    );

    const response = await app.request("/checkout/send-login-code", {
      body: JSON.stringify({ token }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mocks.createVerificationOTP).toHaveBeenCalledWith({
      body: { email: customerRow.email, type: "sign-in" },
    });
    expect(mocks.sendAuthOtpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        otp: "123456",
        subject: "Your CastleCare sign-in code",
        to: customerRow.email,
      })
    );
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toEqual({ maskedEmail: "t***@***.com", success: true });
    expect(JSON.stringify(payload)).not.toContain("taylor@example.com");
  });

  it("surfaces OTP mint failures instead of false success", async () => {
    mocks.env.RESEND_API_KEY = "re_test_key";
    mocks.createVerificationOTP.mockRejectedValue(new Error("otp store down"));
    const app = buildApp();
    const token = createCheckoutAccessToken(
      checkoutSessionRow.id,
      mocks.env.BETTER_AUTH_SECRET
    );

    const response = await app.request("/checkout/send-login-code", {
      body: JSON.stringify({ token }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Sign-in code could not be sent",
    });
    expect(mocks.sendAuthOtpEmail).not.toHaveBeenCalled();
  });

  it("surfaces OTP delivery failures instead of false success", async () => {
    mocks.env.RESEND_API_KEY = "re_test_key";
    mocks.sendAuthOtpEmail.mockResolvedValue({
      reason: "missing_resend_api_key",
      sent: false,
    });
    const app = buildApp();
    const token = createCheckoutAccessToken(
      checkoutSessionRow.id,
      mocks.env.BETTER_AUTH_SECRET
    );

    const response = await app.request("/checkout/send-login-code", {
      body: JSON.stringify({ token }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Sign-in code could not be sent",
    });
  });
});

describe("POST /checkout/provider", () => {
  beforeEach(() => {
    mocks.createStripeCheckoutSession.mockResolvedValue({
      id: "cs_provider_1",
      mode: "payment",
      subscriptionId: null,
      url: "https://stripe.test/provider",
    });
    mocks.signUpEmail.mockResolvedValue({
      user: {
        email: "provider@example.com",
        id: "user_provider_1",
        name: "Jamie Provider",
      },
    });
    mocks.dbInsert.mockReturnValue({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: () => [],
        }),
      }),
    });
  });

  it("requires a password for a new provider account", async () => {
    mocks.userFindFirst.mockResolvedValue(null);

    const response = await buildApp().request("/checkout/provider", {
      body: JSON.stringify({
        email: "provider@example.com",
        firstName: "Jamie",
        lastName: "Provider",
        plan: "pro",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("rejects an existing email instead of attaching provider onboarding", async () => {
    mocks.userFindFirst.mockResolvedValue({
      email: "provider@example.com",
      emailVerified: true,
      id: "user_existing",
    });

    const response = await buildApp().request("/checkout/provider", {
      body: JSON.stringify({
        email: "provider@example.com",
        firstName: "Jamie",
        lastName: "Provider",
        password: "chosen-password",
        plan: "pro",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(409);
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
    expect(mocks.createStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it("lets an authenticated provider resume verification", async () => {
    mocks.workersFindFirst.mockResolvedValue(null);

    const response = await buildApp("user_provider_1").request(
      "/checkout/provider/resume",
      {
        body: JSON.stringify({ plan: "pro" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
    expect(mocks.createStripeCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: "owner@example.com",
        metadata: expect.objectContaining({
          providerUserId: "user_provider_1",
          type: "provider_express_onboarding",
        }),
      })
    );
  });

  it("reuses an open verification session instead of creating another", async () => {
    mocks.workersFindFirst.mockResolvedValue({
      id: 9,
      providerVerificationSessionId: "cs_open_1",
      userId: "user_provider_1",
    });
    mocks.getStripeClient.mockReturnValue({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "open",
            url: "https://stripe.test/open",
          }),
        },
      },
    });

    const response = await buildApp("user_provider_1").request(
      "/checkout/provider/resume",
      {
        body: JSON.stringify({ plan: "pro" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: "https://stripe.test/open",
    });
    expect(mocks.createStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it("blocks resume while a completed delayed payment is still unsettled", async () => {
    mocks.workersFindFirst.mockResolvedValue({
      id: 9,
      providerVerificationSessionId: "cs_complete_1",
      userId: "user_provider_1",
    });
    mocks.getStripeClient.mockReturnValue({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            payment_status: "unpaid",
            status: "complete",
          }),
        },
      },
    });

    const response = await buildApp("user_provider_1").request(
      "/checkout/provider/resume",
      {
        body: JSON.stringify({ plan: "pro" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );

    expect(response.status).toBe(409);
    expect(mocks.createStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it("blocks resume when a completed payment is awaiting webhook finalization", async () => {
    mocks.workersFindFirst.mockResolvedValue({
      id: 9,
      providerVerificationSessionId: "cs_paid_1",
      userId: "user_provider_1",
    });
    mocks.getStripeClient.mockReturnValue({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            payment_status: "paid",
            status: "complete",
          }),
        },
      },
    });

    const response = await buildApp("user_provider_1").request(
      "/checkout/provider/resume",
      {
        body: JSON.stringify({ plan: "pro" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );

    expect(response.status).toBe(409);
    expect(mocks.createStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it("does not let a paid provider start a second verification charge", async () => {
    mocks.workersFindFirst.mockResolvedValue({
      id: 9,
      providerVerificationPaidAt: new Date(),
      userId: "user_provider_1",
    });

    const response = await buildApp("user_provider_1").request(
      "/checkout/provider/resume",
      {
        body: JSON.stringify({ plan: "pro" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );

    expect(response.status).toBe(409);
    expect(mocks.createStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects a guest using a saved address id", async () => {
    const response = await buildGuestApp().request("/checkout/confirm", {
      body: JSON.stringify({
        addressId: 11,
        contact: {
          email: "victim@example.com",
          name: "Victim Customer",
          phone: "5015550101",
        },
        items: [{ itemKind: "lawncare", planId: "groundskeeper-one-time" }],
        paymentOption: "pay_full",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Sign in to book with a saved address.",
    });
    expect(mocks.dbAddressFindFirst).not.toHaveBeenCalled();
  });

  it("uses the applicant's password and never a hardcoded default", async () => {
    mocks.userFindFirst.mockResolvedValue(null);

    const response = await buildApp().request("/checkout/provider", {
      body: JSON.stringify({
        email: "provider@example.com",
        firstName: "Jamie",
        lastName: "Provider",
        password: "chosen-password",
        plan: "pro",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mocks.signUpEmail).toHaveBeenCalledWith({
      body: expect.objectContaining({
        email: "provider@example.com",
        password: "chosen-password",
      }),
    });
    expect(mocks.createStripeCheckoutSession).toHaveBeenCalled();
  });
});

describe("home deposit receipt", () => {
  it("shows the actual home deposit and saved total without a service appointment", async () => {
    mocks.checkoutSessionFindFirst.mockResolvedValue({
      ...checkoutSessionRow,
      totalCents: 500_000,
    });
    mocks.checkoutItemsFindMany.mockResolvedValue([
      {
        basePriceCents: 500_000,
        itemKind: "home_preorder",
        label: "CastleCare Residential — $5,000 preorder deposit",
        metadataJson: { homeTotalCents: 4_870_000 },
      },
    ]);
    const response = await buildGuestApp().request(
      "/checkout/access-token?session_id=cs_home_test"
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      appointmentWindow: "Delivery confirmed after project review",
      checkoutKind: "homes",
      payment: {
        depositCents: 500_000,
        isPaidInFull: false,
        totalCents: 4_870_000,
      },
    });
  });
});

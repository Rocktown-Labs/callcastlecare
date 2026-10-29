import type * as DatabaseModule from "@callcastlecare/db";
import {
  checkoutItems,
  checkoutSessions,
  homePreorders,
  homeQuotes,
} from "@callcastlecare/db/schema/index";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../types";
import { checkoutRoutes } from "./checkout";

const mocks = vi.hoisted(() => ({
  address: vi.fn(),
  customer: vi.fn(),
  featureSettings: vi.fn(),
  insert: vi.fn(),
  stripe: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  values: vi.fn(),
}));
vi.mock("../lib/feature-settings", () => ({
  getFeatureSettings: mocks.featureSettings,
}));
vi.mock("../lib/auth", () => ({
  getOrCreateCustomerForCheckoutContact: mocks.customer,
  getOrCreateCustomerForUser: mocks.customer,
  requireUser: vi.fn(),
}));
vi.mock("../lib/integrations/radar", () => ({
  verifyAddressWithRadar: vi.fn(() => Promise.resolve({ state: "AR" })),
}));
vi.mock("../lib/orders", () => ({
  buildFormattedAddress: vi.fn(),
  createAddressRecord: mocks.address,
  finalizeCheckoutPayment: vi.fn(),
  formatAppointmentWindow: vi.fn(),
}));
vi.mock("../lib/integrations/stripe-payments", () => ({
  createStripeCheckoutSession: mocks.stripe,
  getOrCreateStripeCustomer: vi.fn(() => Promise.resolve("cus_test")),
  parseStripeWebhookEvent: vi.fn(),
  retrieveStripeCheckoutSession: vi.fn(),
  retrieveStripeSubscription: vi.fn(),
}));
vi.mock("@callcastlecare/db", async (importOriginal) => {
  const original = await importOriginal<typeof DatabaseModule>();
  return {
    ...original,
    db: {
      query: {
        stripeCatalogItems: { findMany: vi.fn(() => Promise.resolve([])) },
      },
      transaction: mocks.transaction,
      update: mocks.update,
    },
  };
});

const app = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    c.set("user", null);
    c.set("requestId", "homes-test");
    return await next();
  })
  .route("/checkout", checkoutRoutes);

const configuration = {
  emptyContainer: true,
  exteriorColor: "blue",
  model: "residential",
};
const request = {
  address: "123 Main St, Little Rock, AR 72201",
  contact: {
    email: "test@example.com",
    name: "Test Customer",
    phone: "5015550100",
  },
  items: [{ homeConfiguration: configuration, itemKind: "home_preorder" }],
  paymentOption: "pay_full",
};
const confirm = (body: unknown = request) =>
  app.request("/checkout/confirm", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

describe("Homes Stripe checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.featureSettings.mockResolvedValue({ homesEnabled: true });
    mocks.customer.mockResolvedValue({ id: 22, userId: "customer_test" });
    mocks.address.mockResolvedValue({
      customerId: 22,
      id: 11,
      latitude: 34.7465,
      longitude: -92.2896,
      state: "AR",
    });
    mocks.stripe.mockResolvedValue({
      id: "cs_test",
      url: "https://checkout.stripe.com/test",
    });
    mocks.insert.mockImplementation((table: unknown) => ({
      values: (values: unknown) => {
        mocks.values(table, values);
        return {
          returning: () => [{ id: table === checkoutSessions ? 99 : 101 }],
        };
      },
    }));
    mocks.update.mockReturnValue({ set: mocks.updateSet });
    mocks.updateSet.mockReturnValue({ where: vi.fn(() => Promise.resolve()) });
    mocks.transaction.mockImplementation((runTransaction) =>
      Reflect.apply(runTransaction, undefined, [
        {
          insert: mocks.insert,
          query: {
            homeQuotes: {
              findFirst: vi.fn(() => Promise.resolve({ id: 101 })),
            },
          },
        },
      ])
    );
  });
  it("saves the configuration and charges exactly $5,000 through the existing Stripe checkout", async () => {
    const response = await confirm();
    expect(response.status).toBe(200);
    expect(mocks.values).toHaveBeenCalledWith(
      homeQuotes,
      expect.objectContaining({
        addressId: 11,
        customerId: 22,
        quotePayloadJson: configuration,
        totalPriceCents: 4_870_000,
      })
    );
    expect(mocks.values).toHaveBeenCalledWith(checkoutItems, [
      expect.objectContaining({
        basePriceCents: 500_000,
        itemKind: "home_preorder",
        metadataJson: expect.objectContaining({ homeQuoteId: 101 }),
      }),
    ]);
    expect(mocks.values).toHaveBeenCalledWith(homePreorders, [
      expect.objectContaining({
        depositAmountCents: 500_000,
        homeQuoteId: 101,
        status: "pending_payment",
      }),
    ]);
    expect(mocks.stripe).toHaveBeenCalledWith(
      expect.objectContaining({
        amountDueCents: 500_000,
        cancelUrl: expect.stringContaining("/#homes"),
        lineItems: [expect.objectContaining({ amountCents: 500_000 })],
        successUrl: expect.stringContaining("&type=homes"),
      })
    );
  });
  it("blocks new checkout after an admin disables Homes", async () => {
    mocks.featureSettings.mockResolvedValue({ homesEnabled: false });
    const response = await confirm();
    expect(response.status).toBe(409);
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.stripe).not.toHaveBeenCalled();
  });
  it("rejects the service deposit payment option", async () => {
    const response = await confirm({
      ...request,
      paymentOption: "deposit_invoice",
    });
    expect(response.status).toBe(409);
    expect(mocks.stripe).not.toHaveBeenCalled();
  });
  it("rejects a stale client quote id or price plan before accessing Stripe", async () => {
    const response = await confirm({
      ...request,
      items: [
        { ...request.items[0], homeQuoteId: 1, planId: "royal-wash-small" },
      ],
    });
    expect(response.status).toBe(400);
    expect(mocks.stripe).not.toHaveBeenCalled();
  });
  it("marks the preorder failed when Stripe cannot create a payment session", async () => {
    mocks.stripe.mockRejectedValue(new Error("Stripe unavailable"));
    const response = await confirm();
    expect(response.status).toBe(500);
    expect(mocks.update).toHaveBeenCalledWith(homePreorders);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });
});

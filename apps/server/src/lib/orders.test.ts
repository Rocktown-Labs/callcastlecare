import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addresses: {},
  and: vi.fn(),
  checkoutItems: {},
  checkoutSessions: {},
  customers: {},
  dbQueryAddress: vi.fn(),
  dbQueryCheckoutItems: vi.fn(),
  dbQueryCheckoutSession: vi.fn(),
  dbQueryCustomer: vi.fn(),
  dbTransaction: vi.fn(),
  dispatchOrder: vi.fn(),
  eq: vi.fn(),
  execute: vi.fn(),
  homePreorders: {},
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  orderInsertReturning: vi.fn(),
  orders: {},
  publishOutboxEvent: vi.fn(),
  sendEmail: vi.fn(),
  serviceLegs: {},
  txHomePreorderFindFirst: vi.fn(),
  txInsert: vi.fn(),
  txOrdersFindMany: vi.fn(),
  txQueryCheckoutItems: vi.fn(),
  txUpdate: vi.fn(),
}));

vi.mock("@callcastlecare/db", () => ({
  and: mocks.and,
  db: {
    query: {
      addresses: {
        findFirst: mocks.dbQueryAddress,
      },
      checkoutItems: {
        findMany: mocks.dbQueryCheckoutItems,
      },
      checkoutSessions: {
        findFirst: mocks.dbQueryCheckoutSession,
      },
      customers: {
        findFirst: mocks.dbQueryCustomer,
      },
    },
    transaction: mocks.dbTransaction,
  },
  eq: mocks.eq,
  sql: vi.fn(() => "advisory-lock"),
}));

vi.mock("@callcastlecare/db/schema/index", () => ({
  addresses: mocks.addresses,
  checkoutItems: mocks.checkoutItems,
  checkoutSessions: mocks.checkoutSessions,
  customers: mocks.customers,
  homePreorders: mocks.homePreorders,
  orderItems: {},
  orderStatusHistory: {},
  orders: mocks.orders,
  serviceLegs: mocks.serviceLegs,
  serviceSubscriptions: {},
}));

vi.mock("./dispatch", () => ({
  dispatchOrder: mocks.dispatchOrder,
}));

vi.mock("./domain/checkout", () => ({
  getComboServiceTypes: vi.fn(),
}));

vi.mock("./integrations/email", () => ({
  sendEmail: mocks.sendEmail,
}));

vi.mock("@callcastlecare/email", () => ({
  castleCareUrl: vi.fn((path: string) => `https://callcastlecare.com${path}`),
  renderAdminBookingAlertEmail: vi.fn(() =>
    Promise.resolve({
      html: "<p>admin alert</p>",
      text: "admin alert",
    })
  ),
  renderBookingReceivedEmail: vi.fn(() =>
    Promise.resolve({
      html: "<p>booking received</p>",
      text: "booking received",
    })
  ),
}));

vi.mock("@callcastlecare/env/server", () => ({
  env: {
    ADMIN_EMAIL: "admin@callcastlecare.com",
    BETTER_AUTH_URL: "https://callcastlecare.com",
  },
}));

vi.mock("./logger", () => ({
  logger: mocks.logger,
}));

vi.mock("./outbox", () => ({
  publishOutboxEvent: mocks.publishOutboxEvent,
}));

const { finalizeCheckoutPayment } = await import("./orders");

const checkoutSession = {
  addressId: 11,
  customerId: 22,
  id: 33,
  status: "pending_payment",
  stripePaymentIntentId: "pi_combo",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbQueryCheckoutSession.mockResolvedValue(checkoutSession);
  mocks.dbQueryCustomer.mockResolvedValue({
    email: "arthur@camelot.test",
    firstName: "Arthur",
    id: 22,
    lastName: "Pendragon",
    phone: "555-0100",
  });
  mocks.dbQueryAddress.mockResolvedValue({
    city: "Avalon",
    country: "USA",
    formattedAddress: "123 Castle Way, Avalon, CA 90210, USA",
    id: 11,
    state: "CA",
    street: "123 Castle Way",
    zip: "90210",
  });
  mocks.dbQueryCheckoutItems.mockResolvedValue([
    {
      label: "Lawn Care",
      scheduledEndAt: new Date("2026-09-01T16:00:00.000Z"),
      scheduledStartAt: new Date("2026-09-01T14:00:00.000Z"),
    },
  ]);
  mocks.sendEmail.mockImplementation(() => Promise.resolve());
  mocks.txQueryCheckoutItems.mockResolvedValue([
    {
      basePriceCents: 30_000,
      itemKind: "lawncare",
      metadataJson: {
        comboServiceTypes: ["lawncare", "laundry", "window_washing"],
        pricingTier: "small",
        serviceType: "combo",
      },
      scheduledEndAt: new Date("2026-09-01T16:00:00.000Z"),
      scheduledStartAt: new Date("2026-09-01T14:00:00.000Z"),
      timingType: "scheduled",
      tipAmountCents: 0,
      totalPriceCents: 30_000,
    },
  ]);
  mocks.txOrdersFindMany.mockResolvedValue([]);
  mocks.txUpdate.mockReturnValue({
    set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
  });
  let orderId = 0;
  mocks.orderInsertReturning.mockImplementation(() => {
    orderId += 1;
    return [
      {
        id: orderId,
        serviceType: ["lawncare", "laundry", "window_washing"][orderId - 1],
      },
    ];
  });
  mocks.txInsert.mockImplementation((table: unknown) => ({
    values: vi.fn(() => {
      if (table === mocks.orders) {
        return { returning: mocks.orderInsertReturning };
      }
      return Promise.resolve();
    }),
  }));
  const transaction = {
    execute: mocks.execute,
    insert: mocks.txInsert,
    query: {
      checkoutItems: { findMany: mocks.txQueryCheckoutItems },
      homePreorders: { findFirst: mocks.txHomePreorderFindFirst },
      orders: { findMany: mocks.txOrdersFindMany },
    },
    update: mocks.txUpdate,
  };
  mocks.dbTransaction.mockImplementation((transactionCallback) =>
    Reflect.apply(transactionCallback, undefined, [transaction])
  );
});

describe("finalizeCheckoutPayment", () => {
  it("materializes combo checkout items into service orders", async () => {
    const result = await finalizeCheckoutPayment({
      checkoutSessionId: checkoutSession.id,
      stripePaymentIntentId: "pi_combo",
    });

    expect(result.createdOrderIds).toEqual([1, 2, 3]);
    expect(mocks.dispatchOrder).toHaveBeenCalledTimes(3);
    expect(mocks.dispatchOrder).toHaveBeenCalledWith({
      orderId: 1,
      sequence: 1,
    });
    expect(mocks.dispatchOrder).toHaveBeenCalledWith({
      orderId: 2,
      sequence: 1,
    });
    expect(mocks.dispatchOrder).toHaveBeenCalledWith({
      orderId: 3,
      sequence: 1,
    });
    expect(mocks.publishOutboxEvent).toHaveBeenCalledWith({
      eventName: "checkout_confirmed",
      payload: {
        checkoutSessionId: checkoutSession.id,
        customerId: checkoutSession.customerId,
        orderId: 1,
      },
    });
    expect(mocks.publishOutboxEvent).toHaveBeenCalledWith({
      eventKey: "customer-welcome:22",
      eventName: "customer_welcome",
      payload: {
        checkoutSessionId: checkoutSession.id,
        customerId: checkoutSession.customerId,
        orderId: 1,
      },
    });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("re-publishes the welcome event on retry when orders already exist", async () => {
    mocks.txOrdersFindMany.mockResolvedValue([{ id: 7 }]);

    const result = await finalizeCheckoutPayment({
      checkoutSessionId: checkoutSession.id,
      stripePaymentIntentId: "pi_combo",
    });

    expect(result.createdOrderIds).toEqual([7]);
    expect(mocks.publishOutboxEvent).toHaveBeenCalledWith({
      eventName: "checkout_confirmed",
      payload: {
        checkoutSessionId: checkoutSession.id,
        customerId: checkoutSession.customerId,
        orderId: 7,
      },
    });
    expect(mocks.publishOutboxEvent).toHaveBeenCalledWith({
      eventKey: "customer-welcome:22",
      eventName: "customer_welcome",
      payload: {
        checkoutSessionId: checkoutSession.id,
        customerId: checkoutSession.customerId,
        orderId: 7,
      },
    });
  });

  it("materializes recurring service units for the first billing period", async () => {
    mocks.txQueryCheckoutItems.mockResolvedValue([
      {
        basePriceCents: 20_000,
        itemKind: "laundry",
        metadataJson: {
          serviceType: "laundry",
          serviceUnits: [{ serviceType: "laundry", spacingDays: 7, units: 4 }],
        },
        scheduledEndAt: new Date("2026-09-01T16:00:00.000Z"),
        scheduledStartAt: new Date("2026-09-01T14:00:00.000Z"),
        timingType: "scheduled",
        tipAmountCents: 0,
        totalPriceCents: 20_000,
      },
    ]);
    let orderId = 0;
    mocks.orderInsertReturning.mockImplementation(() => {
      orderId += 1;
      return [{ id: orderId, serviceType: "laundry" }];
    });

    const result = await finalizeCheckoutPayment({
      checkoutSessionId: checkoutSession.id,
      stripePaymentIntentId: "pi_subscription",
    });

    expect(result.createdOrderIds).toEqual([1, 2, 3, 4]);
    expect(mocks.dispatchOrder).toHaveBeenCalledTimes(4);
  });
});

describe("paid home preorder fulfillment", () => {
  it("marks the existing preorder paid without dispatching service work", async () => {
    mocks.txHomePreorderFindFirst.mockResolvedValue({ id: 44 });
    mocks.txQueryCheckoutItems.mockResolvedValue([
      {
        basePriceCents: 500_000,
        itemKind: "home_preorder",
        metadataJson: { homeQuoteId: 55 },
        totalPriceCents: 500_000,
      },
    ]);
    const result = await finalizeCheckoutPayment({
      checkoutSessionId: checkoutSession.id,
      stripePaymentIntentId: "pi_home_deposit",
    });
    expect(result.createdOrderIds).toEqual([]);
    expect(mocks.txUpdate).toHaveBeenCalledWith(mocks.homePreorders);
    expect(mocks.txUpdate.mock.results[1]?.value.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "paid",
        stripePaymentIntentId: "pi_home_deposit",
      })
    );
    expect(mocks.dispatchOrder).not.toHaveBeenCalled();
    expect(mocks.publishOutboxEvent).toHaveBeenCalledWith({
      eventName: "home_preorder_confirmed",
      payload: {
        checkoutSessionId: checkoutSession.id,
        customerId: checkoutSession.customerId,
      },
    });
  });
});

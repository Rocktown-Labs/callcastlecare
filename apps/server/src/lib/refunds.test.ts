import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminRefund, RefundError } from "./refunds";

const tables = vi.hoisted(() => ({
  payouts: { name: "payouts" },
  stripeRefunds: { name: "stripeRefunds" },
}));

const mocks = vi.hoisted(() => ({
  createRefund: vi.fn(),
  dbDelete: vi.fn(),
  dbInsert: vi.fn(),
  dbQueryPayoutsFindFirst: vi.fn(),
  dbQueryRefundsFindMany: vi.fn(),
  dbUpdate: vi.fn(),
}));

vi.mock("@callcastlecare/db", () => ({
  and: vi.fn(),
  db: {
    delete: mocks.dbDelete,
    insert: mocks.dbInsert,
    query: {
      payouts: { findFirst: mocks.dbQueryPayoutsFindFirst },
      stripeRefunds: { findMany: mocks.dbQueryRefundsFindMany },
    },
    update: mocks.dbUpdate,
  },
  eq: vi.fn(),
}));

vi.mock("@callcastlecare/db/schema/index", () => ({
  payouts: tables.payouts,
  stripeRefunds: tables.stripeRefunds,
}));

vi.mock("./integrations/stripe-client", () => ({
  getStripeClient: () => ({ refunds: { create: mocks.createRefund } }),
  getStripeRequestOptions: vi.fn(() => ({})),
}));

vi.mock("./integrations/stripe-connect", () => ({
  reverseWorkerTransfer: vi.fn(),
}));

vi.mock("./logger", () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

const order = {
  id: 1,
  stripePaymentIntentId: "pi_1",
  totalPriceCents: 10_000,
} as unknown as Parameters<typeof createAdminRefund>[0]["order"];

const claimRow = {
  amountCents: 4000,
  id: 7,
  orderId: 1,
  status: "pending",
  stripeRefundId: "claim:1",
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbQueryRefundsFindMany.mockResolvedValue([]);
  mocks.dbQueryPayoutsFindFirst.mockResolvedValue(null);
  mocks.createRefund.mockResolvedValue({
    id: "re_1",
    status: "succeeded",
  });

  let claimCount = 0;
  mocks.dbInsert.mockImplementation((table: unknown) => {
    if (table === tables.stripeRefunds) {
      return {
        values: () => ({
          onConflictDoNothing: () => ({
            returning: () => {
              claimCount += 1;
              return claimCount === 1 ? [claimRow] : [];
            },
          }),
        }),
      };
    }

    return { values: () => [] };
  });
  mocks.dbUpdate.mockReturnValue({
    set: () => ({
      where: () => ({
        returning: () => [
          {
            ...claimRow,
            status: "succeeded",
            stripeRefundId: "re_1",
          },
        ],
      }),
    }),
  });
  mocks.dbDelete.mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  });
});

describe("createAdminRefund", () => {
  it("uses a single claim row so concurrent refunds cannot over-refund", async () => {
    const results = await Promise.allSettled([
      createAdminRefund({ adminEmail: "admin@example.com", order }),
      createAdminRefund({ adminEmail: "admin@example.com", order }),
    ]);

    expect(mocks.createRefund).toHaveBeenCalledTimes(1);
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection).toBeDefined();
    if (rejection?.status === "rejected") {
      expect(rejection.reason).toBeInstanceOf(RefundError);
      expect(rejection.reason.statusCode).toBe(409);
    }
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCompletionPayoutRecords } from "./payouts";

const tables = vi.hoisted(() => ({
  earningsLedger: { name: "earningsLedger" },
  payouts: { name: "payouts" },
  tipHolds: { name: "tipHolds" },
  workers: { name: "workers" },
}));

const mocks = vi.hoisted(() => ({
  dbInsert: vi.fn(),
  dbQueryPayoutsFindFirst: vi.fn(),
  dbQueryWorkersFindFirst: vi.fn(),
  dbUpdate: vi.fn(),
  releaseWorkerPayout: vi.fn(),
}));

vi.mock("@callcastlecare/db", () => ({
  and: vi.fn(),
  db: {
    insert: mocks.dbInsert,
    query: {
      payouts: { findFirst: mocks.dbQueryPayoutsFindFirst },
      workers: { findFirst: mocks.dbQueryWorkersFindFirst },
    },
    // eslint-disable-next-line promise/prefer-await-to-callbacks, require-await -- Mirrors the Drizzle transaction callback shape.
    transaction: async (callback: (tx: unknown) => unknown) =>
      // eslint-disable-next-line promise/prefer-await-to-callbacks -- Drizzle transaction contract.
      callback({
        insert: mocks.dbInsert,
        query: {
          payouts: { findFirst: mocks.dbQueryPayoutsFindFirst },
          workers: { findFirst: mocks.dbQueryWorkersFindFirst },
        },
        update: mocks.dbUpdate,
      }),
    update: mocks.dbUpdate,
  },
  eq: vi.fn(),
  isNull: vi.fn(),
  lte: vi.fn(),
}));

vi.mock("@callcastlecare/db/schema/index", () => ({
  earningsLedger: tables.earningsLedger,
  payouts: tables.payouts,
  tipHolds: tables.tipHolds,
  workers: tables.workers,
}));

vi.mock("@callcastlecare/env/server", () => ({
  env: { PROVIDER_PAYOUT_BPS: 6000 },
}));

vi.mock("./integrations/stripe-connect", () => ({
  releaseWorkerPayout: mocks.releaseWorkerPayout,
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn() },
}));

const payoutRow = {
  amountCents: 6000,
  id: 1,
  orderId: 10,
  status: "processing" as const,
  workerId: 3,
};

beforeEach(() => {
  vi.clearAllMocks();

  let claimCount = 0;
  mocks.dbInsert.mockImplementation((table: unknown) => {
    if (table === tables.payouts) {
      return {
        values: () => ({
          onConflictDoNothing: () => ({
            returning: () => {
              claimCount += 1;
              return claimCount === 1 ? [payoutRow] : [];
            },
          }),
        }),
      };
    }

    return { values: () => [] };
  });
  mocks.dbQueryPayoutsFindFirst.mockResolvedValue(payoutRow);
  mocks.dbQueryWorkersFindFirst.mockResolvedValue({
    stripeAccountId: "acct_1",
    stripeAccountStatus: "ready",
    stripePayoutsEnabled: true,
  });
  mocks.dbUpdate.mockReturnValue({
    set: () => ({
      where: () => ({
        returning: () => [payoutRow],
      }),
    }),
  });
  mocks.releaseWorkerPayout.mockResolvedValue({
    providerPayoutId: "tr_1",
    success: true,
  });
});

describe("createCompletionPayoutRecords", () => {
  it("claims the order payout before transferring, so a concurrent completion does not double-pay", async () => {
    await Promise.all([
      createCompletionPayoutRecords({
        orderId: 10,
        tipAmountCents: 0,
        totalBasePriceCents: 10_000,
        workerId: 3,
      }),
      createCompletionPayoutRecords({
        orderId: 10,
        tipAmountCents: 0,
        totalBasePriceCents: 10_000,
        workerId: 3,
      }),
    ]);

    expect(mocks.releaseWorkerPayout).toHaveBeenCalledTimes(1);
    expect(mocks.releaseWorkerPayout).toHaveBeenCalledWith({
      amountCents: 6000,
      orderId: 10,
      workerStripeAccountId: "acct_1",
    });
  });
});

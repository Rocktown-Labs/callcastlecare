import { and, db, eq, isNull, lt, lte } from "@callcastlecare/db";
import {
  earningsLedger,
  payouts,
  tipHolds,
  workers,
} from "@callcastlecare/db/schema/index";
import { env } from "@callcastlecare/env/server";

import { releaseWorkerPayout } from "./integrations/stripe-connect";
import { logger } from "./logger";

const STALE_PAYOUT_CLAIM_MS = 15 * 60 * 1000;

type InsertExecutor = Pick<typeof db, "insert">;

const createWorkerEarnings = async (
  input: {
    dispatchBonusCents?: number;
    orderId: number;
    tipAmountCents: number;
    workerId: number;
  },
  basePayCents: number,
  executor: InsertExecutor = db
) => {
  await executor.insert(earningsLedger).values({
    amountCents: basePayCents,
    earningType: "base_pay",
    orderId: input.orderId,
    releaseAt: new Date(),
    workerId: input.workerId,
  });

  const dispatchBonusCents = Math.max(0, input.dispatchBonusCents ?? 0);
  if (dispatchBonusCents > 0) {
    await executor.insert(earningsLedger).values({
      amountCents: dispatchBonusCents,
      earningType: "adjustment",
      orderId: input.orderId,
      releaseAt: new Date(),
      workerId: input.workerId,
    });
  }

  if (input.tipAmountCents > 0) {
    await executor.insert(earningsLedger).values({
      amountCents: input.tipAmountCents,
      earningType: "tip",
      orderId: input.orderId,
      releaseAt: new Date(),
      workerId: input.workerId,
    });
  }
};

const settlePayoutRecord = async (claimed: typeof payouts.$inferSelect) => {
  const worker = await db.query.workers.findFirst({
    columns: {
      stripeAccountId: true,
      stripeAccountStatus: true,
      stripePayoutsEnabled: true,
    },
    where: eq(workers.id, claimed.workerId),
  });

  const isReady = Boolean(
    worker?.stripeAccountId &&
    worker.stripeAccountStatus === "ready" &&
    worker.stripePayoutsEnabled
  );
  if (!isReady || !worker?.stripeAccountId) {
    const [pending] = await db
      .update(payouts)
      .set({ status: "pending" })
      .where(and(eq(payouts.id, claimed.id), eq(payouts.status, "processing")))
      .returning();
    return pending ?? claimed;
  }

  const transfer = await releaseWorkerPayout({
    amountCents: claimed.amountCents,
    orderId: claimed.orderId ?? 0,
    workerStripeAccountId: worker.stripeAccountId,
  });

  const [settled] = await db
    .update(payouts)
    .set({
      failureReason: transfer.success ? null : "stripe_transfer_failed",
      paidAt: transfer.success ? new Date() : null,
      providerPayoutId: transfer.providerPayoutId,
      // Transient Stripe/network failures stay pending so the next release
      // attempt can retry them; Stripe idempotency keeps the retry safe.
      status: transfer.success ? "paid" : "pending",
    })
    .where(and(eq(payouts.id, claimed.id), eq(payouts.status, "processing")))
    .returning();

  return settled ?? claimed;
};

export const createCompletionPayoutRecords = async (input: {
  dispatchBonusCents?: number;
  orderId: number;
  tipAmountCents: number;
  totalBasePriceCents: number;
  workerId: number;
}) => {
  const basePayCents = Math.max(
    0,
    Math.round((input.totalBasePriceCents * env.PROVIDER_PAYOUT_BPS) / 10_000)
  );
  const dispatchBonusCents = Math.max(0, input.dispatchBonusCents ?? 0);
  const payoutAmountCents =
    basePayCents + dispatchBonusCents + Math.max(0, input.tipAmountCents);

  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(payouts)
      .values({
        amountCents: payoutAmountCents,
        orderId: input.orderId,
        status: "processing",
        workerId: input.workerId,
      })
      .onConflictDoNothing({ target: payouts.orderId })
      .returning();

    if (!row) {
      return null;
    }

    // The claim and its earnings ledger rows commit together, so a crash
    // cannot leave a processing payout without matching earnings.
    await createWorkerEarnings(input, basePayCents, tx);
    return row;
  });

  if (!claimed) {
    return db.query.payouts.findFirst({
      where: eq(payouts.orderId, input.orderId),
    });
  }

  return settlePayoutRecord(claimed);
};

export const releasePendingWorkerPayouts = async (workerId: number) => {
  const worker = await db.query.workers.findFirst({
    columns: {
      stripeAccountId: true,
      stripeAccountStatus: true,
      stripePayoutsEnabled: true,
    },
    where: eq(workers.id, workerId),
  });
  if (
    !(
      worker?.stripeAccountId &&
      worker.stripeAccountStatus === "ready" &&
      worker.stripePayoutsEnabled
    )
  ) {
    return [] as number[];
  }

  // A crashed process can leave a claim in processing. Return stale claims to
  // pending; Stripe's per-order idempotency key keeps a retry safe.
  await db
    .update(payouts)
    .set({
      failureReason: "stale_processing_claim",
      status: "pending",
    })
    .where(
      and(
        eq(payouts.workerId, workerId),
        eq(payouts.status, "processing"),
        lt(payouts.createdAt, new Date(Date.now() - STALE_PAYOUT_CLAIM_MS))
      )
    );

  const pendingPayouts = await db.query.payouts.findMany({
    where: and(eq(payouts.workerId, workerId), eq(payouts.status, "pending")),
  });
  const workerStripeAccountId = worker.stripeAccountId;
  const settlementResults = await Promise.all(
    pendingPayouts.map(async (payout) => {
      if (!payout.orderId) {
        return null;
      }

      const [claimed] = await db
        .update(payouts)
        .set({ status: "processing" })
        .where(and(eq(payouts.id, payout.id), eq(payouts.status, "pending")))
        .returning();
      if (!claimed) {
        return null;
      }

      const transfer = await releaseWorkerPayout({
        amountCents: claimed.amountCents,
        orderId: claimed.orderId ?? 0,
        workerStripeAccountId,
      });

      const [settled] = await db
        .update(payouts)
        .set({
          failureReason: transfer.success ? null : "stripe_transfer_failed",
          paidAt: transfer.success ? new Date() : null,
          providerPayoutId: transfer.providerPayoutId,
          status: transfer.success ? "paid" : "pending",
        })
        .where(
          and(eq(payouts.id, claimed.id), eq(payouts.status, "processing"))
        )
        .returning();

      return settled?.status === "paid" ? settled.id : null;
    })
  );
  const settledPayoutIds = settlementResults.filter(
    (payoutId): payoutId is number => payoutId !== null
  );

  logger.info(
    { settledPayoutIds, workerId },
    "stripe_connect:pending_payouts_released"
  );
  return settledPayoutIds;
};

export const releaseEligibleTipHolds = async (orderId?: number) => {
  const holds = await db.query.tipHolds.findMany({
    where:
      orderId === undefined
        ? and(
            isNull(tipHolds.releasedAt),
            lte(tipHolds.scheduledReleaseAt, new Date())
          )
        : and(
            eq(tipHolds.orderId, orderId),
            isNull(tipHolds.releasedAt),
            lte(tipHolds.scheduledReleaseAt, new Date())
          ),
  });

  await Promise.all(
    holds.map(async (hold) => {
      const released = await db.transaction(async (tx) => {
        const [claimed] = await tx
          .update(tipHolds)
          .set({
            releasedAt: new Date(),
          })
          .where(and(eq(tipHolds.id, hold.id), isNull(tipHolds.releasedAt)))
          .returning();
        if (!claimed) {
          return null;
        }

        await tx.insert(earningsLedger).values({
          amountCents: claimed.amountCents,
          earningType: "tip",
          orderId: claimed.orderId,
          releaseAt: new Date(),
          workerId: claimed.workerId,
        });

        return claimed;
      });

      if (!released) {
        return;
      }

      logger.info(
        {
          amountCents: released.amountCents,
          holdId: released.id,
          orderId: released.orderId,
        },
        "tip_hold:released"
      );
    })
  );
};

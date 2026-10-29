import { and, db, eq, isNull, lte } from "@callcastlecare/db";
import {
  earningsLedger,
  payouts,
  tipHolds,
  workers,
} from "@callcastlecare/db/schema/index";
import { env } from "@callcastlecare/env/server";

import { releaseWorkerPayout } from "./integrations/stripe-connect";
import { logger } from "./logger";

const createWorkerEarnings = async (
  input: {
    dispatchBonusCents?: number;
    orderId: number;
    tipAmountCents: number;
    workerId: number;
  },
  basePayCents: number
) => {
  await db.insert(earningsLedger).values({
    amountCents: basePayCents,
    earningType: "base_pay",
    orderId: input.orderId,
    releaseAt: new Date(),
    workerId: input.workerId,
  });

  const dispatchBonusCents = Math.max(0, input.dispatchBonusCents ?? 0);
  if (dispatchBonusCents > 0) {
    await db.insert(earningsLedger).values({
      amountCents: dispatchBonusCents,
      earningType: "adjustment",
      orderId: input.orderId,
      releaseAt: new Date(),
      workerId: input.workerId,
    });
  }

  if (input.tipAmountCents > 0) {
    await db.insert(earningsLedger).values({
      amountCents: input.tipAmountCents,
      earningType: "tip",
      orderId: input.orderId,
      releaseAt: new Date(),
      workerId: input.workerId,
    });
  }
};

const claimPayoutRecord = async (input: {
  amountCents: number;
  orderId: number;
  workerId: number;
}) => {
  const [claimed] = await db
    .insert(payouts)
    .values({
      amountCents: input.amountCents,
      orderId: input.orderId,
      status: "processing",
      workerId: input.workerId,
    })
    .onConflictDoNothing({ target: payouts.orderId })
    .returning();

  return claimed ?? null;
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
      status: transfer.success ? "paid" : "failed",
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

  const claimed = await claimPayoutRecord({
    amountCents: payoutAmountCents,
    orderId: input.orderId,
    workerId: input.workerId,
  });
  if (!claimed) {
    return db.query.payouts.findFirst({
      where: eq(payouts.orderId, input.orderId),
    });
  }

  try {
    await createWorkerEarnings(input, basePayCents);
  } catch (error) {
    await db
      .update(payouts)
      .set({
        failureReason: "earnings_ledger_write_failed",
        status: "failed",
      })
      .where(and(eq(payouts.id, claimed.id), eq(payouts.status, "processing")));
    throw error;
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
          status: transfer.success ? "paid" : "failed",
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
      const [claimed] = await db
        .update(tipHolds)
        .set({
          releasedAt: new Date(),
        })
        .where(and(eq(tipHolds.id, hold.id), isNull(tipHolds.releasedAt)))
        .returning();
      if (!claimed) {
        return;
      }

      try {
        await db.insert(earningsLedger).values({
          amountCents: claimed.amountCents,
          earningType: "tip",
          orderId: claimed.orderId,
          releaseAt: new Date(),
          workerId: claimed.workerId,
        });
      } catch (error) {
        await db
          .update(tipHolds)
          .set({ releasedAt: null })
          .where(eq(tipHolds.id, claimed.id));
        throw error;
      }

      logger.info(
        {
          amountCents: claimed.amountCents,
          holdId: claimed.id,
          orderId: claimed.orderId,
        },
        "tip_hold:released"
      );
    })
  );
};

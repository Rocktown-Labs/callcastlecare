import { db, eq } from "@callcastlecare/db";
import type { orders } from "@callcastlecare/db/schema/index";
import { payouts, stripeRefunds } from "@callcastlecare/db/schema/index";

import {
  getStripeClient,
  getStripeRequestOptions,
} from "./integrations/stripe-client";
import { reverseWorkerTransfer } from "./integrations/stripe-connect";
import { logger } from "./logger";

const STALE_REFUND_CLAIM_MS = 10 * 60 * 1000;
const getRefundClaimId = (orderId: number) => `claim:${orderId}`;

const getErrorCode = (error: unknown): string | undefined => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === "object" && current !== null && "code" in current) {
      const { code } = current as { code?: unknown };
      if (typeof code === "string") {
        return code;
      }
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return undefined;
};

const isUniqueViolation = (error: unknown) => getErrorCode(error) === "23505";

export class RefundError extends Error {
  statusCode: 404 | 409 | 503;

  constructor(message: string, statusCode: 404 | 409 | 503) {
    super(message);
    this.name = "RefundError";
    this.statusCode = statusCode;
  }
}

const reversePayoutIfNeeded = async (input: {
  amountCents: number;
  orderId: number;
}) => {
  const payout = await db.query.payouts.findFirst({
    where: eq(payouts.orderId, input.orderId),
  });
  if (!(payout?.status === "paid" && payout.providerPayoutId)) {
    return;
  }

  try {
    await reverseWorkerTransfer({
      amountCents: Math.min(input.amountCents, payout.amountCents),
      providerPayoutId: payout.providerPayoutId,
    });
    await db
      .update(payouts)
      .set({ status: "cancelled" })
      .where(eq(payouts.id, payout.id));
  } catch (error) {
    logger.error(
      { err: error, orderId: input.orderId, payoutId: payout.id },
      "admin:refund:payout_reversal_failed"
    );
  }
};

export const createAdminRefund = async (input: {
  adminEmail: string | null;
  amountCents?: number;
  order: typeof orders.$inferSelect;
  reason?: string;
}) => {
  if (!input.order.stripePaymentIntentId) {
    throw new RefundError("Order has no Stripe payment to refund", 409);
  }

  const stripe = getStripeClient();
  if (!stripe) {
    throw new RefundError("Stripe payments are not configured", 503);
  }
  const paymentIntentId = input.order.stripePaymentIntentId;
  const requestedCents = input.amountCents ?? input.order.totalPriceCents;
  if (requestedCents <= 0) {
    throw new RefundError("Refund amount must be positive", 409);
  }

  const claimId = getRefundClaimId(input.order.id);
  const staleCutoff = new Date(Date.now() - STALE_REFUND_CLAIM_MS);
  const existingRefunds = await db.query.stripeRefunds.findMany({
    where: eq(stripeRefunds.orderId, input.order.id),
  });

  const staleClaim = existingRefunds.find(
    (refund) =>
      refund.stripeRefundId === claimId && refund.updatedAt <= staleCutoff
  );
  if (staleClaim) {
    await db.delete(stripeRefunds).where(eq(stripeRefunds.id, staleClaim.id));
  }

  const activeRefunds = existingRefunds.filter(
    (refund) => refund.id !== staleClaim?.id
  );
  const refundedCents = activeRefunds.reduce(
    (total, refund) => total + refund.amountCents,
    0
  );
  if (refundedCents + requestedCents > input.order.totalPriceCents) {
    throw new RefundError("Refund exceeds the remaining order balance", 409);
  }

  // A deterministic claim id makes the unique stripeRefundId index a
  // single-writer gate for this order without holding a DB transaction open
  // across the Stripe network call.
  const [claim] = await db
    .insert(stripeRefunds)
    .values({
      amountCents: requestedCents,
      metadataJson: {
        adminEmail: input.adminEmail,
        claim: true,
      },
      orderId: input.order.id,
      reason: input.reason || null,
      status: "pending",
      stripeRefundId: claimId,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: stripeRefunds.stripeRefundId })
    .returning();
  if (!claim) {
    throw new RefundError(
      "A refund is already in progress for this order",
      409
    );
  }

  let refund;
  try {
    refund = await stripe.refunds.create(
      {
        amount: requestedCents,
        metadata: {
          castlecareOrderId: String(input.order.id),
        },
        payment_intent: paymentIntentId,
        reason: "requested_by_customer",
      },
      getStripeRequestOptions(
        "refund",
        String(input.order.id),
        String(refundedCents),
        String(requestedCents)
      )
    );
  } catch (error) {
    await db.delete(stripeRefunds).where(eq(stripeRefunds.id, claim.id));
    throw error;
  }

  let createdRefund: typeof stripeRefunds.$inferSelect | null | undefined;
  try {
    [createdRefund] = await db
      .update(stripeRefunds)
      .set({
        metadataJson: {
          adminEmail: input.adminEmail,
          stripeStatus: refund.status,
        },
        status: refund.status ?? "pending",
        stripeRefundId: refund.id,
        updatedAt: new Date(),
      })
      .where(eq(stripeRefunds.id, claim.id))
      .returning();
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    // A webhook may have recorded the same Stripe refund first. Drop our
    // placeholder and use the webhook row instead of failing after Stripe has
    // already moved money.
    await db.delete(stripeRefunds).where(eq(stripeRefunds.id, claim.id));
    createdRefund = await db.query.stripeRefunds.findFirst({
      where: eq(stripeRefunds.stripeRefundId, refund.id),
    });
  }

  await reversePayoutIfNeeded({
    amountCents: requestedCents,
    orderId: input.order.id,
  });
  logger.info(
    {
      adminEmail: input.adminEmail,
      amountCents: requestedCents,
      orderId: input.order.id,
      stripeRefundId: refund.id,
    },
    "admin:refund:created"
  );
  return createdRefund ?? null;
};

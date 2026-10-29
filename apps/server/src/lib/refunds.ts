import { db, eq, sql } from "@callcastlecare/db";
import type { orders } from "@callcastlecare/db/schema/index";
import { payouts, stripeRefunds } from "@callcastlecare/db/schema/index";

import {
  getStripeClient,
  getStripeRequestOptions,
} from "./integrations/stripe-client";
import { reverseWorkerTransfer } from "./integrations/stripe-connect";
import { logger } from "./logger";

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

  // Serialize refunds for one order so two admins cannot both pass the
  // remaining-balance check and over-refund the payment intent.
  const { amountCents, createdRefund, stripeRefundId } = await db.transaction(
    async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.order.id})`);

      const existingRefunds = await tx.query.stripeRefunds.findMany({
        where: eq(stripeRefunds.orderId, input.order.id),
      });
      const refundedCents = existingRefunds.reduce(
        (total, refund) => total + refund.amountCents,
        0
      );
      const requestedCents = input.amountCents ?? input.order.totalPriceCents;
      if (
        requestedCents <= 0 ||
        refundedCents + requestedCents > input.order.totalPriceCents
      ) {
        throw new RefundError(
          "Refund exceeds the remaining order balance",
          409
        );
      }

      const refund = await stripe.refunds.create(
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
          String(requestedCents)
        )
      );
      const [created] = await tx
        .insert(stripeRefunds)
        .values({
          amountCents: requestedCents,
          metadataJson: {
            adminEmail: input.adminEmail,
            stripeStatus: refund.status,
          },
          orderId: input.order.id,
          reason: input.reason || null,
          status: refund.status ?? "pending",
          stripeRefundId: refund.id,
          updatedAt: new Date(),
        })
        .onConflictDoNothing({ target: stripeRefunds.stripeRefundId })
        .returning();

      return {
        amountCents: requestedCents,
        createdRefund: created ?? null,
        stripeRefundId: refund.id,
      };
    }
  );

  await reversePayoutIfNeeded({ amountCents, orderId: input.order.id });
  logger.info(
    {
      adminEmail: input.adminEmail,
      amountCents,
      orderId: input.order.id,
      stripeRefundId,
    },
    "admin:refund:created"
  );
  return createdRefund;
};

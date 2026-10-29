import {
  bookingTimeSlots,
  buildTravelEstimate,
  getBookingZoneDate,
  getCheckoutDepositCents,
  getLawncareLotTier,
  getLawncarePlanId,
  getScheduledWindowForSlot,
  STANDARD_DEPOSIT_CENTS,
} from "@callcastlecare/api";
import type { CheckoutPreviewRequest } from "@callcastlecare/api";
import { auth } from "@callcastlecare/auth";
import {
  getOtpEmailContent,
  sendAuthOtpEmail,
} from "@callcastlecare/auth/email";
import { and, db, eq, gt, inArray, lt, sql } from "@callcastlecare/db";
import {
  addresses,
  checkoutDrafts,
  checkoutItems,
  checkoutSessions,
  customers,
  homePreorders,
  homeQuotes,
  orderDisputes,
  orders,
  payouts,
  quoteRequests,
  stripeCatalogItems,
  stripeRefunds,
  stripeWebhookEvents,
  user as authUsers,
  workers,
} from "@callcastlecare/db/schema/index";
import { renderProviderApplicationReceivedEmail } from "@callcastlecare/email";
import { env } from "@callcastlecare/env/server";
import { Hono } from "hono";
import type { Context as HonoContext } from "hono";
import { z } from "zod";

import {
  getOrCreateCustomerForCheckoutContact,
  requireUser,
  getOrCreateCustomerForUser,
} from "../lib/auth";
import {
  createCheckoutAccessToken,
  readCheckoutAccessToken,
} from "../lib/checkout-access";
import { getCheckoutSettings } from "../lib/checkout-settings";
import {
  computeCheckoutPreview,
  getComboPricingTier,
  getComboServiceTypes,
  isRecurringCheckoutItem,
} from "../lib/domain/checkout";
import { sendEmail } from "../lib/integrations/email";
import { verifyAddressWithRadar } from "../lib/integrations/radar";
import { lookupPropertyWithRentCast } from "../lib/integrations/rentcast";
import {
  getStripeClient,
  getStripeMode,
  isStripeMockMode,
} from "../lib/integrations/stripe-client";
import type { StripeWebhookEndpointKind } from "../lib/integrations/stripe-client";
import { reverseWorkerTransfer } from "../lib/integrations/stripe-connect";
import {
  createStripeCheckoutSession,
  getOrCreateStripeCustomer,
  parseStripeWebhookEvent,
  retrieveStripeCheckoutSession,
  retrieveStripeSubscription,
} from "../lib/integrations/stripe-payments";
import type {
  CastleCareCheckoutLineItem,
  StripeWebhookEvent,
} from "../lib/integrations/stripe-payments";
import { logger } from "../lib/logger";
import {
  buildFormattedAddress,
  createAddressRecord,
  finalizeCheckoutPayment,
  formatAppointmentWindow,
} from "../lib/orders";
import { getPrimaryOrigin } from "../lib/origin";
import { releasePendingWorkerPayouts } from "../lib/payouts";
import {
  materializeSubscriptionPeriodOrders,
  updateServiceSubscriptionStatus,
  upsertServiceSubscription,
} from "../lib/subscriptions";
import type { AppEnv } from "../types";
import {
  checkoutDraftRequestSchema,
  checkoutConfirmRequestSchema,
  checkoutPreviewRequestSchema,
  publicQuoteRequestSchema,
  sendLoginCodeRequestSchema,
} from "./schemas";

const parsePositiveId = (value: string) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseScheduledDate = (value: string | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const SQFT_PER_ACRE = 43_560;
const CHECKOUT_SLOT_LOCK_KEY = 7_318_204;
const CHECKOUT_SLOT_HOLD_MS = 30 * 60 * 1000;
const ACTIVE_ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "dispatching",
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
] as const;

class CheckoutSlotUnavailableError extends Error {
  constructor() {
    super("That appointment window was just reserved. Choose another time.");
    this.name = "CheckoutSlotUnavailableError";
  }
}

interface ScheduledCheckoutSlot {
  end: Date;
  start: Date;
}

const getScheduledCheckoutSlots = (
  items: {
    scheduledEndAt?: string;
    scheduledStartAt?: string;
    timingType?: "asap" | "scheduled";
  }[]
): ScheduledCheckoutSlot[] => {
  const slots = new Map<string, ScheduledCheckoutSlot>();

  for (const item of items) {
    const isScheduled =
      item.timingType === "scheduled" ||
      (item.timingType === undefined && item.scheduledStartAt);
    if (!isScheduled) {
      continue;
    }

    if (!(item.scheduledStartAt && item.scheduledEndAt)) {
      throw new Error("Scheduled services require an appointment window.");
    }

    const start = new Date(item.scheduledStartAt);
    const end = new Date(item.scheduledEndAt);
    const bookingDate = getBookingZoneDate(start);
    const isKnownSlot = bookingTimeSlots.some((slot) => {
      const scheduledWindow = getScheduledWindowForSlot(bookingDate, slot);
      return (
        scheduledWindow.scheduledStartAt === start.toISOString() &&
        scheduledWindow.scheduledEndAt === end.toISOString()
      );
    });

    if (!isKnownSlot) {
      throw new Error("Choose an available CastleCare appointment window.");
    }

    slots.set(start.toISOString(), { end, start });
  }

  return [...slots.values()];
};

const getCheckoutOrigin = (c: HonoContext) => {
  const requestOrigin = new URL(c.req.url).origin;
  const configured = getPrimaryOrigin(env.CORS_ORIGIN);
  if (configured && configured !== "*") {
    return configured;
  }
  return requestOrigin;
};

const getAmountDueCents = (input: {
  paymentOption: "deposit_cash" | "deposit_invoice" | "pay_full";
  totalCents: number;
}) =>
  input.paymentOption === "pay_full"
    ? input.totalCents
    : getCheckoutDepositCents(input.totalCents);

const applyCatalogPriceOverrides = (
  preview: ReturnType<typeof computeCheckoutPreview>,
  catalogRows: (typeof stripeCatalogItems.$inferSelect)[],
  planIds: string[]
) => {
  const catalogBySlug = new Map(catalogRows.map((row) => [row.slug, row]));
  const selectedPlans = new Set(planIds);
  let { subtotalCents } = preview;
  let { totalCents } = preview;
  const lineItems = preview.lineItems.map((lineItem) => {
    if (!lineItem.planId || !selectedPlans.has(lineItem.planId)) {
      return lineItem;
    }

    const catalogItem = catalogBySlug.get(lineItem.planId);
    if (!catalogItem || catalogItem.serviceType === "fee") {
      return lineItem;
    }

    const basePriceCents = catalogItem.amountCents;
    const difference =
      (basePriceCents - lineItem.basePriceCents) * lineItem.quantity;
    subtotalCents += difference;
    totalCents += difference;
    return {
      ...lineItem,
      basePriceCents,
      totalPriceCents:
        basePriceCents * lineItem.quantity + lineItem.tipAmountCents,
    };
  });

  return { ...preview, lineItems, subtotalCents, totalCents };
};

const getStripeLineItems = (
  lineItems: ReturnType<typeof computeCheckoutPreview>["lineItems"],
  catalogRows: (typeof stripeCatalogItems.$inferSelect)[]
): CastleCareCheckoutLineItem[] => {
  const catalogBySlug = new Map(catalogRows.map((row) => [row.slug, row]));
  const stripeMode = getStripeMode();

  return lineItems.map((lineItem) => {
    const catalogItem = lineItem.planId
      ? catalogBySlug.get(lineItem.planId)
      : undefined;
    const canUseSyncedPrice = Boolean(
      catalogItem?.active &&
      catalogItem.stripePriceId &&
      catalogItem.stripeMode === stripeMode
    );

    return {
      amountCents: lineItem.totalPriceCents,
      currency: "usd",
      description: lineItem.label,
      name: lineItem.label,
      ...(canUseSyncedPrice && catalogItem?.stripePriceId
        ? { priceId: catalogItem.stripePriceId }
        : {}),
      quantity: lineItem.quantity,
    };
  });
};

const getStripeCheckoutLineItems = (input: {
  catalogRows: (typeof stripeCatalogItems.$inferSelect)[];
  hasRecurringCheckout: boolean;
  paymentOption: ParsedCheckoutConfirm["paymentOption"];
  preview: ReturnType<typeof computeCheckoutPreview>;
}) => {
  if (!(input.hasRecurringCheckout || input.paymentOption === "pay_full")) {
    return;
  }
  return getStripeLineItems(input.preview.lineItems, input.catalogRows);
};

const getAddressLabel = (address: {
  city: string;
  country: string;
  formattedAddress?: string | null;
  state: string;
  street: string;
  zip: string;
}) =>
  address.formattedAddress ??
  `${address.street}, ${address.city}, ${address.state} ${address.zip}, ${address.country}`;

const getTrustedTravelEstimate = (address: {
  latitude: number | null;
  longitude: number | null;
  state: string;
}) => {
  if (
    typeof address.latitude !== "number" ||
    typeof address.longitude !== "number"
  ) {
    return null;
  }

  return buildTravelEstimate({
    latitude: address.latitude,
    longitude: address.longitude,
    stateCode: address.state,
  });
};

const getLawncareFrequency = (planId: string) => {
  if (planId.includes("bi-weekly")) {
    return "bi_weekly" as const;
  }
  if (planId.includes("monthly")) {
    return "monthly" as const;
  }
  return "one_time" as const;
};

const validateLawncarePlans = async (input: {
  address: {
    city: string;
    country: string;
    formattedAddress?: string | null;
    state: string;
    street: string;
    zip: string;
  };
  items: CheckoutPreviewRequest["items"];
}) => {
  const lawncareItems = input.items.filter(
    (item) => item.itemKind === "lawncare"
  );
  if (lawncareItems.length === 0) {
    return null;
  }

  const property = await lookupPropertyWithRentCast(
    getAddressLabel(input.address)
  );
  const lotSizeAcres =
    property.source === "rentcast" &&
    typeof property.lotSizeSqft === "number" &&
    property.lotSizeSqft > 0
      ? property.lotSizeSqft / SQFT_PER_ACRE
      : null;
  const lotTier = getLawncareLotTier(lotSizeAcres);

  for (const item of lawncareItems) {
    if (!item.planId) {
      return "Choose a lawn care product before checkout.";
    }

    const comboServices = getComboServiceTypes(item.planId);
    if (comboServices) {
      if (!comboServices.some((serviceType) => serviceType === "lawncare")) {
        continue;
      }
      if (lotTier === "custom") {
        return "This property needs an on-site custom lawn care quote.";
      }
      if (getComboPricingTier(item.planId) !== lotTier) {
        return "The selected lawn care plan does not match this property.";
      }
      continue;
    }

    const expectedPlanId =
      lotTier === "custom"
        ? "groundskeeper-custom-quote-deposit"
        : getLawncarePlanId({
            frequency: getLawncareFrequency(item.planId),
            lotSizeAcres,
          });
    if (item.planId !== expectedPlanId) {
      return lotTier === "custom"
        ? "This property needs an on-site custom lawn care quote."
        : "The selected lawn care plan does not match this property.";
    }
  }

  return null;
};

const getObjectMetadata = (value: Record<string, unknown>) =>
  typeof value.metadata === "object" && value.metadata
    ? (value.metadata as Record<string, unknown>)
    : null;

const finalizeFromMetadata = async (input: {
  metadata: Record<string, unknown> | null;
  stripePaymentIntentId?: string;
  stripeSubscriptionId?: string;
}) => {
  const checkoutSessionId = input.metadata
    ? Number(input.metadata.checkoutSessionId)
    : null;

  if (!(checkoutSessionId && Number.isInteger(checkoutSessionId))) {
    return false;
  }

  await finalizeCheckoutPayment({
    checkoutSessionId,
    ...(input.stripePaymentIntentId
      ? { stripePaymentIntentId: input.stripePaymentIntentId }
      : {}),
    ...(input.stripeSubscriptionId
      ? { stripeSubscriptionId: input.stripeSubscriptionId }
      : {}),
  });
  return true;
};

const getProviderPlanLabel = (plan: string) =>
  plan === "pro" ? "CastleCare Pro" : "Standard Provider";

const getProviderUserByEmail = (email: string) =>
  db.query.user.findFirst({
    where: eq(authUsers.email, email.trim().toLowerCase()),
  });

const createProviderUser = async (input: {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}) => {
  const normalizedEmail = input.email.trim().toLowerCase();

  const signup = await auth.api.signUpEmail({
    body: {
      callbackURL: "/dashboard/provider",
      email: normalizedEmail,
      name: `${input.firstName} ${input.lastName}`.trim(),
      password: input.password,
    },
  });

  logger.info(
    {
      email: normalizedEmail,
      userId: signup.user.id,
    },
    "provider:account_created_from_checkout"
  );

  return signup.user;
};

const handleProviderExpressOnboarding = async (input: {
  email: string;
  firstName: string;
  lastName: string;
  plan: string;
}) => {
  const normalizedEmail = input.email.trim().toLowerCase();

  const user = await getProviderUserByEmail(normalizedEmail);
  if (!user) {
    logger.error(
      {
        email: normalizedEmail,
      },
      "provider:checkout_user_missing"
    );
    return;
  }

  const rows = await db
    .insert(workers)
    .values({
      applicationFormData: {
        source: "express_onboarding_checkout",
        ...(input.plan ? { plan: input.plan } : {}),
      },
      email: normalizedEmail,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: "",
      providerVerificationPaidAt: new Date(),
      providerVerificationSessionId: null,
      serviceRadiusMiles: 10,
      servicesOffered: [],
      userId: user.id,
    })
    .onConflictDoUpdate({
      set: {
        applicationFormData: {
          source: "express_onboarding_checkout",
          ...(input.plan ? { plan: input.plan } : {}),
        },
        providerVerificationPaidAt: new Date(),
        providerVerificationSessionId: null,
        updatedAt: new Date(),
      },
      target: workers.userId,
    })
    .returning();

  const [worker] = rows;
  if (!worker) {
    logger.error(
      {
        email: normalizedEmail,
        userId: user.id,
      },
      "provider:worker_record_create_failed"
    );
    return;
  }

  logger.info(
    {
      email: normalizedEmail,
      plan: input.plan,
      workerId: worker.id,
    },
    "provider:application_recorded_from_checkout"
  );

  try {
    const renderedEmail = await renderProviderApplicationReceivedEmail({
      applicantName: input.firstName,
      planName: getProviderPlanLabel(input.plan),
      services: [],
    });

    await sendEmail({
      html: renderedEmail.html,
      idempotencyKey: `provider-checkout/${worker.id}/application-received`,
      subject: "Your CastleCare Provider Application is Received",
      text: renderedEmail.text,
      to: normalizedEmail,
    });
  } catch (error) {
    logger.error(
      {
        error,
        workerId: worker.id,
      },
      "provider:application_email_send_failed"
    );
  }
};

const getRecordField = (value: unknown, key: string) => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return (value as Record<string, unknown>)[key] ?? null;
};

const getStringField = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

const getStripeObjectId = (value: unknown) => {
  const directId = getStringField(value);
  if (directId) {
    return directId;
  }
  return getStringField(getRecordField(value, "id"));
};

const getCheckoutSessionMode = (checkoutObject: Record<string, unknown>) =>
  getStringField(checkoutObject.mode) ?? "payment";

const handleProviderCheckoutCompleted = async (
  metadata: Record<string, unknown> | null
) => {
  if (metadata?.type !== "provider_express_onboarding") {
    return false;
  }

  const email = getStringField(metadata.email);
  if (email) {
    await handleProviderExpressOnboarding({
      email,
      firstName: getStringField(metadata.firstName) ?? "",
      lastName: getStringField(metadata.lastName) ?? "",
      plan: getStringField(metadata.plan) ?? "free",
    });
  }
  return true;
};

const handleCheckoutSessionCompleted = async (event: StripeWebhookEvent) => {
  const checkoutObject = event.data.object;
  const metadata = getObjectMetadata(checkoutObject);

  const stripeCheckoutSessionId = getStripeObjectId(checkoutObject.id);
  const stripePaymentIntentId = getStripeObjectId(
    checkoutObject.payment_intent
  );
  const stripeSubscriptionId = getStripeObjectId(checkoutObject.subscription);
  const checkoutMode = getCheckoutSessionMode(checkoutObject);
  const paymentStatus = getStringField(checkoutObject.payment_status);

  if (paymentStatus && paymentStatus !== "paid") {
    logger.info(
      { paymentStatus, stripeCheckoutSessionId },
      "stripe_webhook:checkout_not_paid"
    );
    return;
  }

  // Provider verification is a one-time payment. Do not mark it paid from a
  // completed-but-unpaid delayed-method session.
  if (await handleProviderCheckoutCompleted(metadata)) {
    return;
  }

  if (checkoutMode === "subscription" && stripeSubscriptionId) {
    const retrievedSubscription =
      await retrieveStripeSubscription(stripeSubscriptionId);
    const stripeSubscription = retrievedSubscription
      ? (retrievedSubscription as unknown as Record<string, unknown>)
      : {
          customer: getStripeObjectId(checkoutObject.customer),
          id: stripeSubscriptionId,
          metadata,
          status: "active",
        };
    await upsertServiceSubscription({
      ...(getStringField(metadata?.checkoutSessionId)
        ? { checkoutSessionId: Number(metadata?.checkoutSessionId) }
        : {}),
      stripeSubscription,
    });
  }

  const finalizedFromMetadata = await finalizeFromMetadata({
    metadata,
    ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
    ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
  });
  if (finalizedFromMetadata || !stripeCheckoutSessionId) {
    return;
  }

  const checkoutSession = await db.query.checkoutSessions.findFirst({
    where: eq(
      checkoutSessions.stripeCheckoutSessionId,
      stripeCheckoutSessionId
    ),
  });

  if (!checkoutSession) {
    logger.warn(
      {
        stripeCheckoutSessionId,
      },
      "stripe_webhook:checkout_session_not_found"
    );
    return;
  }

  await finalizeCheckoutPayment({
    checkoutSessionId: checkoutSession.id,
    ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
    ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
  });
};

const clearProviderVerificationSession = async (event: StripeWebhookEvent) => {
  const metadata = getObjectMetadata(event.data.object);
  if (metadata?.type !== "provider_express_onboarding") {
    return;
  }

  const sessionId = getStringField(event.data.object.id);
  const providerUserId = getStringField(metadata.providerUserId);
  const email = getStringField(metadata.email);
  if (!sessionId) {
    return;
  }

  let target;
  if (providerUserId) {
    target = and(
      eq(workers.userId, providerUserId),
      eq(workers.providerVerificationSessionId, sessionId)
    );
  } else if (email) {
    target = and(
      eq(workers.email, email.toLowerCase()),
      eq(workers.providerVerificationSessionId, sessionId)
    );
  }

  if (!target) {
    return;
  }

  await db
    .update(workers)
    .set({
      providerVerificationSessionId: null,
      updatedAt: new Date(),
    })
    .where(target);
};

const handleCheckoutSessionAsyncPaymentFailed = async (
  event: StripeWebhookEvent
) => {
  const stripeCheckoutSessionId = getStringField(event.data.object.id);
  if (!stripeCheckoutSessionId) {
    return;
  }

  await clearProviderVerificationSession(event);

  await db
    .update(checkoutSessions)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      eq(checkoutSessions.stripeCheckoutSessionId, stripeCheckoutSessionId)
    );
};

const handleSubscriptionEvent = async (event: StripeWebhookEvent) => {
  const subscription = await upsertServiceSubscription({
    stripeSubscription: event.data.object,
  });
  if (!subscription) {
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    await updateServiceSubscriptionStatus({
      canceledAt: new Date(),
      status: "canceled",
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });
  }
};

const getEpochDate = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000)
    : null;

const handleInvoiceEvent = async (event: StripeWebhookEvent) => {
  const invoice = event.data.object;
  const stripeSubscriptionId = getStripeObjectId(invoice.subscription);
  if (!stripeSubscriptionId) {
    return;
  }

  const retrievedSubscription =
    await retrieveStripeSubscription(stripeSubscriptionId);
  if (!retrievedSubscription) {
    return;
  }

  const serviceSubscription = await upsertServiceSubscription({
    stripeSubscription: retrievedSubscription as unknown as Record<
      string,
      unknown
    >,
  });
  if (!serviceSubscription) {
    return;
  }

  if (event.type === "invoice.payment_failed") {
    await updateServiceSubscriptionStatus({
      status: "past_due",
      stripeSubscriptionId,
    });
    return;
  }

  const periodStart = getEpochDate(invoice.period_start);
  const periodEnd = getEpochDate(invoice.period_end);
  await updateServiceSubscriptionStatus({
    currentPeriodEnd: periodEnd,
    currentPeriodStart: periodStart,
    status: "active",
    stripeSubscriptionId,
  });
  await materializeSubscriptionPeriodOrders({
    periodEnd,
    periodStart,
    serviceSubscriptionId: serviceSubscription.id,
  });
};

const handleCheckoutSessionExpired = async (event: StripeWebhookEvent) => {
  const stripeSessionId =
    typeof event.data.object.id === "string" ? event.data.object.id : null;
  if (!stripeSessionId) {
    return;
  }

  await clearProviderVerificationSession(event);

  await db
    .update(checkoutSessions)
    .set({
      status: "failed",
      updatedAt: new Date(),
    })
    .where(eq(checkoutSessions.stripeCheckoutSessionId, stripeSessionId));

  logger.info(
    { stripeCheckoutSessionId: stripeSessionId },
    "checkout:slot_hold_released"
  );
};

const handlePaymentIntentSucceeded = async (event: StripeWebhookEvent) => {
  const paymentIntentObject = event.data.object;
  const paymentIntentId =
    typeof paymentIntentObject.id === "string" ? paymentIntentObject.id : null;

  if (!paymentIntentId) {
    return;
  }

  const finalizedFromMetadata = await finalizeFromMetadata({
    metadata: getObjectMetadata(paymentIntentObject),
    stripePaymentIntentId: paymentIntentId,
  });
  if (finalizedFromMetadata) {
    return;
  }

  const checkoutSession = await db.query.checkoutSessions.findFirst({
    where: eq(checkoutSessions.stripePaymentIntentId, paymentIntentId),
  });

  if (!checkoutSession) {
    logger.warn(
      {
        paymentIntentId,
      },
      "stripe_webhook:session_not_found"
    );
    return;
  }

  await finalizeCheckoutPayment({
    checkoutSessionId: checkoutSession.id,
    stripePaymentIntentId: paymentIntentId,
  });
};

const handleStripeConnectAccountEvent = async (event: StripeWebhookEvent) => {
  const account = event.data.object;
  const stripeAccountId =
    getStringField(account.id) ?? getStringField(account.account);
  if (!stripeAccountId) {
    return;
  }

  if (event.type === "payout.failed") {
    await db
      .update(workers)
      .set({
        isActive: false,
        stripeAccountStatus: "restricted",
        stripePayoutsEnabled: false,
        updatedAt: new Date(),
      })
      .where(eq(workers.stripeAccountId, stripeAccountId));
    return;
  }
  if (event.type === "payout.paid") {
    return;
  }

  const configuration = getRecordField(account, "configuration");
  const recipient = getRecordField(configuration, "recipient");
  const recipientCapabilities = getRecordField(recipient, "capabilities");
  const stripeBalance = getRecordField(recipientCapabilities, "stripe_balance");
  const transferCapability = getRecordField(stripeBalance, "stripe_transfers");
  const payoutCapability = getRecordField(stripeBalance, "payouts");
  const transferStatus = getStringField(
    getRecordField(transferCapability, "status")
  );
  const payoutStatus = getStringField(
    getRecordField(payoutCapability, "status")
  );
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled =
    account.payouts_enabled === true ||
    payoutStatus === "active" ||
    (payoutStatus === null && transferStatus === "active");
  const transferReady = transferStatus === "active" || payoutsEnabled;
  const requirements =
    account.requirements ?? account.future_requirements ?? null;
  const requirementValues =
    requirements && typeof requirements === "object"
      ? Object.values(requirements as Record<string, unknown>)
      : [];
  const hasRequirements = requirementValues.some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value)
  );
  let status = "pending";
  if (hasRequirements) {
    status = "restricted";
  }
  if (transferReady) {
    status = "ready";
  }
  if (event.type === "account.application.deauthorized") {
    status = "deauthorized";
  }

  const worker = await db.query.workers.findFirst({
    where: eq(workers.stripeAccountId, stripeAccountId),
  });
  await db
    .update(workers)
    .set({
      isActive: status === "ready" && worker?.onboardingStatus === "approved",
      stripeAccountMode: getStripeMode(),
      stripeAccountStatus: status,
      stripeChargesEnabled: chargesEnabled,
      stripePayoutsEnabled: payoutsEnabled,
      stripeRequirementsJson: requirements,
      updatedAt: new Date(),
    })
    .where(eq(workers.stripeAccountId, stripeAccountId));

  if (worker && status === "ready") {
    await releasePendingWorkerPayouts(worker.id);
  }

  logger.info(
    {
      chargesEnabled,
      payoutsEnabled,
      status,
      stripeAccountId,
      transferStatus,
    },
    "stripe_connect:account_status_updated"
  );
};

const handleRefundEvent = async (event: StripeWebhookEvent) => {
  const refundObject =
    event.type === "refund.created"
      ? event.data.object
      : (() => {
          const refunds = getRecordField(event.data.object, "refunds");
          const data = getRecordField(refunds, "data");
          return Array.isArray(data) && data[0] && typeof data[0] === "object"
            ? (data[0] as Record<string, unknown>)
            : null;
        })();
  const refundId = getStripeObjectId(refundObject?.id);
  const paymentIntentId = getStripeObjectId(
    refundObject?.payment_intent ?? event.data.object.payment_intent
  );
  let amountCents: number | null = null;
  if (typeof refundObject?.amount === "number") {
    amountCents = refundObject.amount;
  } else if (typeof event.data.object.amount_refunded === "number") {
    amountCents = event.data.object.amount_refunded;
  }
  if (!(refundId && paymentIntentId && amountCents !== null)) {
    return;
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.stripePaymentIntentId, paymentIntentId),
  });
  if (!order) {
    logger.warn(
      { paymentIntentId, stripeRefundId: refundId },
      "stripe_refund:order_not_found"
    );
    return;
  }

  await db
    .insert(stripeRefunds)
    .values({
      amountCents,
      metadataJson: refundObject,
      orderId: order.id,
      reason: getStringField(refundObject?.reason),
      status: getStringField(refundObject?.status) ?? "succeeded",
      stripeRefundId: refundId,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: stripeRefunds.stripeRefundId });
};

const handleChargeDisputeCreated = async (event: StripeWebhookEvent) => {
  const dispute = event.data.object;
  const stripeDisputeId = getStripeObjectId(dispute.id);
  const paymentIntentId = getStripeObjectId(dispute.payment_intent);
  if (!(stripeDisputeId && paymentIntentId)) {
    return;
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.stripePaymentIntentId, paymentIntentId),
  });
  if (!order) {
    logger.warn(
      { paymentIntentId, stripeDisputeId },
      "stripe_dispute:order_not_found"
    );
    return;
  }

  await db
    .insert(orderDisputes)
    .values({
      customerNote: "Stripe dispute opened; operations review required.",
      evidenceJson: dispute,
      orderId: order.id,
      reason: getStringField(dispute.reason) ?? "stripe_dispute",
      status: "open",
      stripeDisputeId,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: orderDisputes.stripeDisputeId });

  const payout = await db.query.payouts.findFirst({
    where: eq(payouts.orderId, order.id),
  });
  if (payout?.status === "paid" && payout.providerPayoutId) {
    try {
      await reverseWorkerTransfer({
        amountCents: payout.amountCents,
        providerPayoutId: payout.providerPayoutId,
      });
      await db
        .update(payouts)
        .set({ status: "cancelled" })
        .where(eq(payouts.id, payout.id));
    } catch (error) {
      logger.error(
        { err: error, orderId: order.id, payoutId: payout.id },
        "stripe_dispute:payout_reversal_failed"
      );
    }
  }
};

const processStripeEvent = async (event: StripeWebhookEvent) => {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    await handleCheckoutSessionCompleted(event);
    return;
  }

  if (event.type === "checkout.session.async_payment_failed") {
    await handleCheckoutSessionAsyncPaymentFailed(event);
    return;
  }

  if (event.type === "checkout.session.expired") {
    await handleCheckoutSessionExpired(event);
    return;
  }

  if (event.type === "payment_intent.succeeded") {
    await handlePaymentIntentSucceeded(event);
    return;
  }

  if (
    event.type === "account.updated" ||
    event.type === "account.application.deauthorized" ||
    event.type === "capability.updated" ||
    event.type === "payout.failed" ||
    event.type === "payout.paid"
  ) {
    await handleStripeConnectAccountEvent(event);
    return;
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await handleSubscriptionEvent(event);
    return;
  }

  if (
    event.type === "invoice.paid" ||
    event.type === "invoice.payment_failed"
  ) {
    await handleInvoiceEvent(event);
    return;
  }

  if (event.type === "charge.refunded" || event.type === "refund.created") {
    await handleRefundEvent(event);
    return;
  }

  if (event.type === "charge.dispute.created") {
    await handleChargeDisputeCreated(event);
  }
};

const handleStripeWebhookForEndpoint = async (
  c: HonoContext,
  endpointKind: StripeWebhookEndpointKind
) => {
  const rawBody = await c.req.text();

  const parsedEvent = await parseStripeWebhookEvent({
    endpointKind,
    rawBody,
    signatureHeader: c.req.header("stripe-signature"),
  });

  if (!parsedEvent) {
    return c.json({ error: "invalid webhook payload" }, 400);
  }

  let [storedEvent] = await db
    .insert(stripeWebhookEvents)
    .values({
      endpointKind,
      eventType: parsedEvent.type,
      payloadJson: parsedEvent,
      status: "received",
      stripeEventId: parsedEvent.id,
    })
    .onConflictDoNothing({ target: stripeWebhookEvents.stripeEventId })
    .returning({ id: stripeWebhookEvents.id });

  if (!storedEvent) {
    const existingEvent = await db.query.stripeWebhookEvents.findFirst({
      where: eq(stripeWebhookEvents.stripeEventId, parsedEvent.id),
    });
    if (!existingEvent || existingEvent.status === "processed") {
      return c.json({ duplicate: true, received: true }, 200);
    }
    storedEvent = { id: existingEvent.id };
  }

  await db
    .update(stripeWebhookEvents)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(stripeWebhookEvents.id, storedEvent.id));

  try {
    await processStripeEvent(parsedEvent);
    await db
      .update(stripeWebhookEvents)
      .set({
        processedAt: new Date(),
        status: "processed",
        updatedAt: new Date(),
      })
      .where(eq(stripeWebhookEvents.id, storedEvent.id));
  } catch (error) {
    await db
      .update(stripeWebhookEvents)
      .set({
        attemptCount: sql`${stripeWebhookEvents.attemptCount} + 1`,
        failedAt: new Date(),
        lastError: error instanceof Error ? error.message : "Webhook failed",
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(stripeWebhookEvents.id, storedEvent.id));
    throw error;
  }

  return c.json({ received: true }, 200);
};

export const handleStripeWebhook = (c: HonoContext) =>
  handleStripeWebhookForEndpoint(c, "commerce");

export const createStripeWebhookHandler =
  (endpointKind: StripeWebhookEndpointKind) => (c: HonoContext) =>
    handleStripeWebhookForEndpoint(c, endpointKind);

interface PublicQuoteRequestInput {
  address?: string;
  contact?: {
    email?: string;
    name?: string;
    phone?: string;
  };
  lastCompletedStep: number;
  payload: Record<string, unknown>;
  status:
    | "draft"
    | "contact_captured"
    | "checkout_started"
    | "paid"
    | "abandoned"
    | "cancelled";
  trackingId: string;
}

const resolveQuoteRequestStatus = (input: PublicQuoteRequestInput) =>
  input.lastCompletedStep >= 2 && input.status === "draft"
    ? "contact_captured"
    : input.status;

const toQuoteRequestValues = (input: PublicQuoteRequestInput) => ({
  addressText: input.address ?? null,
  contactEmail: input.contact?.email || null,
  contactName: input.contact?.name || null,
  contactPhone: input.contact?.phone || null,
  lastCompletedStep: input.lastCompletedStep,
  payloadJson: input.payload,
  status: resolveQuoteRequestStatus(input),
});

const toQuoteRequestResponse = (quoteRequest: {
  id: number;
  status: string;
  trackingId: string;
  updatedAt: Date;
}) => ({
  id: quoteRequest.id,
  status: quoteRequest.status,
  trackingId: quoteRequest.trackingId,
  updatedAt: quoteRequest.updatedAt.toISOString(),
});

const upsertPublicQuoteRequest = async (input: PublicQuoteRequestInput) => {
  const existing = await db.query.quoteRequests.findFirst({
    where: eq(quoteRequests.trackingId, input.trackingId),
  });

  if (existing) {
    const [updated] = await db
      .update(quoteRequests)
      .set({
        ...toQuoteRequestValues(input),
        updatedAt: new Date(),
      })
      .where(eq(quoteRequests.id, existing.id))
      .returning();

    if (!updated) {
      throw new Error("Failed to update quote request");
    }

    return { quoteRequest: updated, statusCode: 200 as const };
  }

  const [created] = await db
    .insert(quoteRequests)
    .values({
      ...toQuoteRequestValues(input),
      trackingId: input.trackingId,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create quote request");
  }

  return { quoteRequest: created, statusCode: 201 as const };
};

const providerCheckoutSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z.string().min(8).max(128),
  plan: z.string().default("standard_provider"),
});

interface CheckoutAddress {
  city: string;
  country: string;
  formattedAddress?: string | null;
  id: number;
  latitude: number | null;
  longitude: number | null;
  state: string;
  street: string;
  zip: string;
}

type ParsedCheckoutConfirm = z.infer<typeof checkoutConfirmRequestSchema>;

const getCheckoutCustomer = (c: HonoContext, input: ParsedCheckoutConfirm) => {
  const user = c.get("user");
  if (user) {
    return getOrCreateCustomerForUser(user);
  }
  return getOrCreateCustomerForCheckoutContact(input.contact);
};

const resolveCheckoutAddress = async (input: {
  addressId?: number;
  address?: string;
  customerId: number;
}): Promise<{
  address: CheckoutAddress | null;
  error?: string;
  status?: 400 | 404;
}> => {
  if (input.addressId) {
    const address = await db.query.addresses.findFirst({
      where: and(
        eq(addresses.id, input.addressId),
        eq(addresses.customerId, input.customerId)
      ),
    });
    return address
      ? { address }
      : { address: null, error: "Address not found", status: 404 };
  }

  if (!input.address) {
    return { address: null, error: "Address is required", status: 400 };
  }

  const verifiedAddress = await verifyAddressWithRadar(input.address);
  return {
    address: await createAddressRecord({
      city: verifiedAddress.city,
      country: verifiedAddress.country,
      customerId: input.customerId,
      formattedAddress: verifiedAddress.formattedAddress,
      isDefault: false,
      latitude: verifiedAddress.latitude,
      longitude: verifiedAddress.longitude,
      radarGeocodeJson: verifiedAddress.raw,
      state: verifiedAddress.state,
      street: verifiedAddress.street,
      zip: verifiedAddress.zip,
    }),
  };
};

const getCheckoutPricing = async (input: {
  address: CheckoutAddress;
  checkout: ParsedCheckoutConfirm;
  travel: NonNullable<ReturnType<typeof getTrustedTravelEstimate>>;
}) => {
  const hasRecurringCheckout = input.checkout.items.some(
    isRecurringCheckoutItem
  );
  if (input.address.state.toUpperCase() !== "AR" && !hasRecurringCheckout) {
    return {
      error:
        "This service area is currently subscription-only. Choose a recurring plan to continue.",
      status: 409 as const,
    } as const;
  }

  const lawncarePlanError = await validateLawncarePlans({
    address: input.address,
    items: input.checkout.items,
  });
  if (lawncarePlanError) {
    return { error: lawncarePlanError, status: 409 as const } as const;
  }

  const checkoutInput = {
    ...input.checkout,
    travelDistanceMiles: input.travel.distanceMiles,
    travelFeeCents: input.travel.feeCents,
    travelStateCode: input.address.state,
  } satisfies CheckoutPreviewRequest;
  const scheduledSlots = getScheduledCheckoutSlots(checkoutInput.items);
  const preview = computeCheckoutPreview(checkoutInput);
  const planIds = input.checkout.items.flatMap((item) =>
    item.planId ? [item.planId] : []
  );
  const catalogRows =
    planIds.length === 0
      ? []
      : await db.query.stripeCatalogItems.findMany({
          where: inArray(stripeCatalogItems.slug, planIds),
        });
  const catalogBySlug = new Map(catalogRows.map((row) => [row.slug, row]));
  const hasInactiveSelectedPlan = input.checkout.items.some(
    (item) =>
      item.planId &&
      catalogBySlug.has(item.planId) &&
      !catalogBySlug.get(item.planId)?.active
  );
  if (hasInactiveSelectedPlan) {
    return {
      error: "One of the selected service plans is not currently available.",
      status: 409 as const,
    } as const;
  }
  const adjustedPreview = applyCatalogPriceOverrides(
    preview,
    catalogRows,
    planIds
  );
  const amountDueCents = getAmountDueCents({
    paymentOption: input.checkout.paymentOption,
    totalCents: adjustedPreview.totalCents,
  });
  const recurringPlans = input.checkout.items
    .filter(isRecurringCheckoutItem)
    .map((item) => (item.planId ? catalogBySlug.get(item.planId) : null));
  const hasUnsyncedRecurringPlan = recurringPlans.some(
    (item) =>
      !item ||
      !item.active ||
      item.interval === "one_time" ||
      !item.stripePriceId ||
      (!isStripeMockMode() && item.stripeMode !== getStripeMode())
  );
  if (hasUnsyncedRecurringPlan) {
    return {
      error:
        "Recurring pricing is not ready yet. An administrator must sync the Stripe catalog first.",
      status: 503 as const,
    } as const;
  }

  return {
    amountDueCents,
    catalogRows,
    hasRecurringCheckout,
    planIds,
    preview: adjustedPreview,
    recurringPlans,
    scheduledSlots,
  } as const;
};

const reserveCheckoutSession = (input: {
  address: CheckoutAddress;
  amountDueCents: number;
  contact: ParsedCheckoutConfirm["contact"];
  customerId: number;
  hasRecurringCheckout: boolean;
  paymentOption: ParsedCheckoutConfirm["paymentOption"];
  planIds: string[];
  preview: ReturnType<typeof computeCheckoutPreview>;
  requestId: string;
  scheduledSlots: ScheduledCheckoutSlot[];
  travel: NonNullable<ReturnType<typeof getTrustedTravelEstimate>>;
}) =>
  db.transaction(async (tx) => {
    if (input.scheduledSlots.length > 0) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${CHECKOUT_SLOT_LOCK_KEY})`
      );
      const holdCutoff = new Date(Date.now() - CHECKOUT_SLOT_HOLD_MS);
      const slotConflicts = await Promise.all(
        input.scheduledSlots.map(async (slot) => {
          const [[overlappingOrder], [heldCheckout]] = await Promise.all([
            tx
              .select({ id: orders.id })
              .from(orders)
              .where(
                and(
                  inArray(orders.status, ACTIVE_ORDER_STATUSES),
                  lt(orders.scheduledStartAt, slot.end),
                  gt(orders.scheduledEndAt, slot.start)
                )
              )
              .limit(1),
            tx
              .select({ id: checkoutSessions.id })
              .from(checkoutSessions)
              .innerJoin(
                checkoutItems,
                eq(checkoutItems.checkoutSessionId, checkoutSessions.id)
              )
              .where(
                and(
                  inArray(checkoutSessions.status, ["pending_payment", "paid"]),
                  gt(checkoutSessions.updatedAt, holdCutoff),
                  lt(checkoutItems.scheduledStartAt, slot.end),
                  gt(checkoutItems.scheduledEndAt, slot.start)
                )
              )
              .limit(1),
          ]);
          return Boolean(overlappingOrder || heldCheckout);
        })
      );
      if (slotConflicts.some(Boolean)) {
        throw new CheckoutSlotUnavailableError();
      }
    }

    const [createdCheckoutSession] = await tx
      .insert(checkoutSessions)
      .values({
        addressId: input.address.id,
        customerId: input.customerId,
        metadataJson: {
          amountDueCents: input.amountDueCents,
          checkoutMode: input.hasRecurringCheckout ? "subscription" : "payment",
          contact: input.contact,
          paymentOption: input.paymentOption,
          planIds: input.planIds,
          requestId: input.requestId,
          travelDistanceMiles: input.travel.distanceMiles,
          travelFeeCents: input.travel.feeCents,
          travelStateCode: input.address.state,
        },
        mode: input.hasRecurringCheckout ? "subscription" : "payment",
        status: "pending_payment",
        subtotalCents: input.preview.subtotalCents,
        totalCents: input.preview.totalCents,
      })
      .returning();
    if (!createdCheckoutSession) {
      throw new Error("Failed to create checkout session");
    }

    await tx.insert(checkoutItems).values(
      input.preview.lineItems.map((lineItem) => ({
        basePriceCents: lineItem.basePriceCents,
        checkoutSessionId: createdCheckoutSession.id,
        itemKind: lineItem.itemKind,
        label: lineItem.label,
        metadataJson: lineItem.metadata,
        quantity: lineItem.quantity,
        scheduledEndAt: parseScheduledDate(
          lineItem.metadata.scheduledEndAt as string | undefined
        ),
        scheduledStartAt: parseScheduledDate(
          lineItem.metadata.scheduledStartAt as string | undefined
        ),
        timingType:
          lineItem.metadata.timingType === "scheduled"
            ? ("scheduled" as const)
            : ("asap" as const),
        tipAmountCents: lineItem.tipAmountCents,
        totalPriceCents: lineItem.totalPriceCents,
      }))
    );

    const homePreorderResults = await Promise.all(
      input.preview.lineItems
        .filter((lineItem) => lineItem.itemKind === "home_preorder")
        .map(async (lineItem) => {
          const homeQuoteId =
            typeof lineItem.metadata.homeQuoteId === "number"
              ? lineItem.metadata.homeQuoteId
              : null;
          if (homeQuoteId === null) {
            return null;
          }

          const quote = await tx.query.homeQuotes.findFirst({
            where: eq(homeQuotes.id, homeQuoteId),
          });
          return quote
            ? {
                addressId: input.address.id,
                checkoutSessionId: createdCheckoutSession.id,
                customerId: input.customerId,
                depositAmountCents: lineItem.basePriceCents,
                homeQuoteId,
                status: "pending_payment" as const,
              }
            : null;
        })
    );
    const homePreorderValues = homePreorderResults.filter(
      (value) => value !== null
    );

    if (homePreorderValues.length > 0) {
      await tx.insert(homePreorders).values(homePreorderValues);
    }

    return createdCheckoutSession;
  });

const validateCheckoutPaymentOption = async (input: ParsedCheckoutConfirm) => {
  const hasRecurringCheckout = input.items.some(isRecurringCheckoutItem);
  if (hasRecurringCheckout && input.paymentOption !== "pay_full") {
    return {
      error: "Recurring plans require payment in full today.",
      hasRecurringCheckout,
    } as const;
  }

  if (input.paymentOption === "deposit_cash") {
    const settings = await getCheckoutSettings();
    if (!settings.allowCashCheckout) {
      return {
        error: "Pay-in-cash checkout is currently disabled.",
        hasRecurringCheckout,
      } as const;
    }
  }

  return { error: null, hasRecurringCheckout } as const;
};

// eslint-disable-next-line complexity -- Checkout confirmation keeps validation, pricing, and payment setup in one auditable flow.
const handleCheckoutConfirm = async (c: HonoContext) => {
  const body = await c.req.json();
  const parsed = checkoutConfirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const paymentValidation = await validateCheckoutPaymentOption(parsed.data);
  if (paymentValidation.error) {
    return c.json({ error: paymentValidation.error }, 409);
  }

  // A saved address id is only meaningful to the signed-in owner. Guest
  // checkout must provide the address text, otherwise knowing an email and a
  // sequential address id would expose another customer's saved address.
  if (parsed.data.addressId && !c.get("user")) {
    return c.json({ error: "Sign in to book with a saved address." }, 401);
  }

  const { hasRecurringCheckout } = paymentValidation;
  const customer = await getCheckoutCustomer(c, parsed.data);
  const addressResult = await resolveCheckoutAddress({
    address: parsed.data.address,
    addressId: parsed.data.addressId,
    customerId: customer.id,
  });
  if (addressResult.error) {
    return c.json({ error: addressResult.error }, addressResult.status ?? 400);
  }
  if (!addressResult.address) {
    return c.json({ error: "Address is required" }, 400);
  }

  const travel = getTrustedTravelEstimate(addressResult.address);
  if (!travel) {
    return c.json({ error: "Address could not be verified" }, 422);
  }

  let pricing: Awaited<ReturnType<typeof getCheckoutPricing>>;
  try {
    pricing = await getCheckoutPricing({
      address: addressResult.address,
      checkout: parsed.data,
      travel,
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Choose an available CastleCare appointment window.",
      },
      400
    );
  }
  if ("error" in pricing) {
    return c.json({ error: pricing.error }, pricing.status);
  }

  let checkoutSession;
  try {
    checkoutSession = await reserveCheckoutSession({
      address: addressResult.address,
      amountDueCents: pricing.amountDueCents,
      contact: parsed.data.contact,
      customerId: customer.id,
      hasRecurringCheckout,
      paymentOption: parsed.data.paymentOption,
      planIds: pricing.planIds,
      preview: pricing.preview,
      requestId: c.get("requestId"),
      scheduledSlots: pricing.scheduledSlots,
      travel,
    });
  } catch (error) {
    if (error instanceof CheckoutSlotUnavailableError) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }

  const origin = getCheckoutOrigin(c);
  const successUrl = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  let stripeCheckoutSession;
  try {
    const stripeCustomerId = await getOrCreateStripeCustomer({
      email: parsed.data.contact.email,
      name: parsed.data.contact.name,
      userId: customer.userId,
    });
    stripeCheckoutSession = await createStripeCheckoutSession({
      amountDueCents: pricing.amountDueCents,
      cancelUrl: `${origin}/book?checkout=cancelled`,
      checkoutSessionId: checkoutSession.id,
      customerEmail: parsed.data.contact.email,
      expiresAt: new Date(Date.now() + CHECKOUT_SLOT_HOLD_MS),
      lineItems: getStripeCheckoutLineItems({
        catalogRows: pricing.catalogRows,
        hasRecurringCheckout,
        paymentOption: parsed.data.paymentOption,
        preview: pricing.preview,
      }),
      metadata: {
        amountDueCents: String(pricing.amountDueCents),
        checkoutMode: hasRecurringCheckout ? "subscription" : "payment",
        checkoutSessionId: String(checkoutSession.id),
        customerId: String(customer.id),
        paymentOption: parsed.data.paymentOption,
        planIds: pricing.planIds.join(","),
        totalCents: String(pricing.preview.totalCents),
      },
      mode: hasRecurringCheckout ? "subscription" : "payment",
      stripeCustomerId,
      subscriptionMetadata: {
        billingInterval: pricing.recurringPlans[0]?.interval ?? "month",
        checkoutSessionId: String(checkoutSession.id),
        customerId: String(customer.id),
        planCode: pricing.planIds[0] ?? "",
        planIds: pricing.planIds.join(","),
      },
      successUrl,
    });
  } catch (error) {
    await db
      .update(checkoutSessions)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(checkoutSessions.id, checkoutSession.id));
    logger.error(
      {
        checkoutSessionId: checkoutSession.id,
        err: error,
        requestId: c.get("requestId"),
      },
      "checkout:stripe_session_create_failed"
    );
    throw error;
  }

  await db
    .update(checkoutSessions)
    .set({
      stripeCheckoutSessionId: stripeCheckoutSession.id,
      stripeSubscriptionId: stripeCheckoutSession.subscriptionId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(checkoutSessions.id, checkoutSession.id));

  return c.json(
    {
      checkoutSessionId: checkoutSession.id,
      checkoutUrl: stripeCheckoutSession.url,
      status: "pending_payment",
      stripeCheckoutSessionId: stripeCheckoutSession.id,
    },
    200
  );
};

/**
 * Minimal PII exposure for unauthenticated post-checkout surfaces. Shows the
 * first character plus the top-level domain so customers can recognize their
 * inbox without leaking the full address to bearer-token holders.
 */
const maskEmail = (email: string) => {
  const [localPart, domain = ""] = email.split("@");
  if (!localPart || !domain.includes(".")) {
    return "***";
  }
  const topLevelDomain = domain.slice(domain.lastIndexOf(".") + 1);
  return `${localPart.slice(0, 1)}***@***.${topLevelDomain}`;
};

const formatCustomerAddress = (
  address: typeof addresses.$inferSelect | null | undefined
) => {
  if (address?.formattedAddress) {
    return address.formattedAddress;
  }
  if (address) {
    return buildFormattedAddress({
      city: address.city,
      country: address.country,
      state: address.state,
      street: address.street,
      zip: address.zip,
    });
  }
  return "Address on file";
};

const buildCheckoutAccessTokenPayload = async (
  checkoutSession: typeof checkoutSessions.$inferSelect,
  currentUserId: string | null | undefined
) => {
  const [customer, address, relatedOrders, items] = await Promise.all([
    db.query.customers.findFirst({
      where: eq(customers.id, checkoutSession.customerId),
    }),
    db.query.addresses.findFirst({
      where: eq(addresses.id, checkoutSession.addressId),
    }),
    db.query.orders.findMany({
      where: eq(orders.checkoutSessionId, checkoutSession.id),
    }),
    db.query.checkoutItems.findMany({
      where: eq(checkoutItems.checkoutSessionId, checkoutSession.id),
    }),
  ]);

  const primaryOrder = relatedOrders[0] ?? null;
  const orderId = primaryOrder?.id ?? null;

  const isAuthenticated = Boolean(
    currentUserId && customer && currentUserId === customer.userId
  );

  const serviceLabels = items.map((item) => item.label).filter(Boolean);
  const [firstItem] = items;
  const scheduledStart =
    primaryOrder?.scheduledStartAt ?? firstItem?.scheduledStartAt ?? null;
  const scheduledEnd =
    primaryOrder?.scheduledEndAt ?? firstItem?.scheduledEndAt ?? null;
  const appointmentWindow = formatAppointmentWindow(
    scheduledStart,
    scheduledEnd
  );

  const { totalCents } = checkoutSession;
  const depositAmountCents = getCheckoutDepositCents(totalCents);
  const isPaidInFull =
    checkoutSession.mode === "payment" && totalCents <= STANDARD_DEPOSIT_CENTS;

  // Deliberately minimal for unauthenticated bearer use (Stripe cs_ id):
  // the success page needs the service address, receipt amounts, and the
  // claim email — customer name, phone, and payment-choice internals stay
  // server-side until the customer authenticates.
  return {
    accessToken: createCheckoutAccessToken(checkoutSession.id),
    address: formatCustomerAddress(address),
    appointmentWindow,
    customerEmail: customer?.email ?? null,
    isAuthenticated,
    maskedEmail: customer ? maskEmail(customer.email) : null,
    orderId,
    orderNumber: orderId ? String(orderId) : null,
    payment: {
      depositCents: depositAmountCents,
      isPaidInFull,
      totalCents,
    },
    services: serviceLabels.length > 0 ? serviceLabels : ["CastleCare Service"],
  };
};

/**
 * Shared payment gate for unauthenticated post-checkout surfaces.
 * A Stripe checkout-session id is only a lookup key; completed payment is
 * verified live with Stripe before any customer data or OTP leaves the API.
 */
const requireCompleteStripePayment = async (
  stripeCheckoutSessionId: string
) => {
  const stripeCheckoutSession = await retrieveStripeCheckoutSession(
    stripeCheckoutSessionId
  );
  if (!stripeCheckoutSession) {
    return {
      error: "Checkout access is unavailable" as const,
      status: 503 as const,
    };
  }

  const paymentComplete =
    stripeCheckoutSession.status === "complete" &&
    (stripeCheckoutSession.payment_status === "paid" ||
      stripeCheckoutSession.payment_status === "no_payment_required");
  if (!paymentComplete) {
    return {
      error: "Checkout payment is not complete" as const,
      status: 409 as const,
    };
  }

  return { session: stripeCheckoutSession };
};

export const checkoutRoutes = new Hono<AppEnv>()
  .get("/settings", async (c) => {
    const settings = await getCheckoutSettings();
    return c.json(settings, 200);
  })
  /**
   * GET /checkout/access-token?session_id=cs_...
   *
   * Unauthenticated post-payment receipt for the success page. The Stripe
   * session id is an unguessable lookup key, NOT an auth credential: payment
   * is re-verified live with Stripe on every call, responses are `no-store`,
   * and the payload is the minimal set the success page renders (receipt
   * amounts, service address, appointment window, order id, claim email).
   * Customer name, phone, and payment internals are never included; the
   * email is also returned masked for display.
   */
  .get("/access-token", async (c) => {
    c.header("Cache-Control", "no-store");
    const stripeCheckoutSessionId = c.req.query("session_id");
    if (!stripeCheckoutSessionId?.startsWith("cs_")) {
      return c.json({ error: "Invalid checkout session" }, 400);
    }

    const checkoutSession = await db.query.checkoutSessions.findFirst({
      where: eq(
        checkoutSessions.stripeCheckoutSessionId,
        stripeCheckoutSessionId
      ),
    });
    if (!checkoutSession) {
      return c.json({ error: "Checkout session not found" }, 404);
    }

    const paymentGate = await requireCompleteStripePayment(
      stripeCheckoutSessionId
    );
    if ("error" in paymentGate) {
      return c.json({ error: paymentGate.error }, paymentGate.status);
    }

    const currentUser = c.get("user");
    const payload = await buildCheckoutAccessTokenPayload(
      checkoutSession,
      currentUser?.id
    );
    return c.json(payload, 200);
  })
  /**
   * POST /checkout/send-login-code { sessionId?: cs_..., token?: accessToken }
   *
   * Mints an email-OTP sign-in code for post-checkout account claiming.
   * Gated on completed payment: token callers present the short-lived
   * server-minted access token (issued only post-payment); raw cs_ callers
   * are re-verified live with Stripe. Never auto-provisions: the auth user
   * must already exist (checkout provisioning creates it), otherwise a 404
   * is returned instead of letting email-OTP signup create one. Email
   * delivery failures surface as 5xx — never `{ success: true }`.
   */
  .post("/send-login-code", async (c) => {
    const parsed = sendLoginCodeRequestSchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return c.json({ error: "Invalid checkout session" }, 400);
    }
    const { sessionId: stripeCheckoutSessionId, token } = parsed.data;

    let checkoutSessionId: number | null = null;
    if (token) {
      const claims = readCheckoutAccessToken(token);
      checkoutSessionId = claims?.checkoutSessionId ?? null;
    }

    if (!checkoutSessionId && stripeCheckoutSessionId?.startsWith("cs_")) {
      const paymentGate = await requireCompleteStripePayment(
        stripeCheckoutSessionId
      );
      if ("error" in paymentGate) {
        return c.json({ error: paymentGate.error }, paymentGate.status);
      }
      const session = await db.query.checkoutSessions.findFirst({
        columns: { id: true },
        where: eq(
          checkoutSessions.stripeCheckoutSessionId,
          stripeCheckoutSessionId
        ),
      });
      if (session) {
        checkoutSessionId = session.id;
      }
    }

    if (!checkoutSessionId) {
      return c.json({ error: "Invalid checkout session" }, 400);
    }

    const checkoutSession = await db.query.checkoutSessions.findFirst({
      where: eq(checkoutSessions.id, checkoutSessionId),
    });
    if (!checkoutSession) {
      return c.json({ error: "Checkout session not found" }, 404);
    }

    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, checkoutSession.customerId),
    });
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }

    // Account claiming only: never let an OTP request conjure a new login.
    const existingUser = await db.query.user.findFirst({
      where: eq(authUsers.email, customer.email),
    });
    if (!existingUser) {
      return c.json({ error: "Account not found for this booking" }, 404);
    }

    if (!env.RESEND_API_KEY) {
      logger.warn(
        { checkoutSessionId: checkoutSession.id },
        "checkout:login_code_unavailable"
      );
      return c.json({ error: "Sign-in codes are unavailable right now" }, 503);
    }

    // Mint the OTP directly instead of sendVerificationOTP: better-auth
    // swallows sender failures into its own logger, which would turn a
    // failed Resend call into a false `{ success: true }`. Minting never
    // creates users, and the existing-user check above already closed the
    // signup auto-provisioning path.
    let otp: string;
    try {
      otp = await auth.api.createVerificationOTP({
        body: {
          email: customer.email,
          type: "sign-in",
        },
      });
    } catch (error) {
      logger.error(
        {
          checkoutSessionId: checkoutSession.id,
          err: error,
        },
        "checkout:login_code_mint_failed"
      );
      return c.json({ error: "Sign-in code could not be sent" }, 502);
    }

    try {
      const content = getOtpEmailContent("sign-in");
      const sent = await sendAuthOtpEmail({
        ...content,
        otp,
        to: customer.email,
      });
      if (!sent.sent) {
        throw new Error(`OTP email not sent: ${sent.reason ?? "unknown"}`);
      }
    } catch (error) {
      logger.error(
        {
          checkoutSessionId: checkoutSession.id,
          err: error,
        },
        "checkout:login_code_send_failed"
      );
      return c.json({ error: "Sign-in code could not be sent" }, 502);
    }

    return c.json(
      { maskedEmail: maskEmail(customer.email), success: true },
      200
    );
  })
  .get("/access-token/resolve", async (c) => {
    c.header("Cache-Control", "no-store");
    const token = c.req.query("token");
    if (!token) {
      return c.json({ error: "Invalid checkout access token" }, 400);
    }

    const claims = readCheckoutAccessToken(token);
    if (!claims) {
      return c.json({ error: "Invalid checkout access token" }, 401);
    }

    const checkoutSession = await db.query.checkoutSessions.findFirst({
      columns: {
        customerId: true,
      },
      where: eq(checkoutSessions.id, claims.checkoutSessionId),
    });
    if (!checkoutSession) {
      return c.json({ error: "Checkout session not found" }, 404);
    }

    const customer = await db.query.customers.findFirst({
      columns: {
        email: true,
      },
      where: eq(customers.id, checkoutSession.customerId),
    });
    if (!customer) {
      return c.json({ error: "Checkout customer not found" }, 404);
    }

    return c.json({ email: customer.email }, 200);
  })
  .post("/provider", async (c) => {
    const body = await c.req.json();
    const parsed = providerCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { email, firstName, lastName, password, plan } = parsed.data;
    const existingUser = await getProviderUserByEmail(email);
    let providerUser;
    let createdProviderUser = false;

    if (existingUser) {
      // Never verify a password on an unauthenticated endpoint: that would be
      // an online password oracle for any email. Existing accounts resume
      // through the authenticated /checkout/provider/resume route.
      return c.json(
        {
          error:
            "An account with this email already exists. Sign in and continue from the provider dashboard.",
        },
        409
      );
    }

    try {
      providerUser = await createProviderUser({
        email,
        firstName,
        lastName,
        password,
      });
      createdProviderUser = true;
    } catch (error) {
      const racedUser = await getProviderUserByEmail(email);
      if (racedUser) {
        return c.json(
          {
            error:
              "An account with this email already exists. Sign in to continue provider onboarding.",
          },
          409
        );
      }
      throw error;
    }

    const origin = getCheckoutOrigin(c);
    const successUrl = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=provider&plan=${encodeURIComponent(plan)}`;
    const cancelUrl = `${origin}/earn#apply?checkout=cancelled`;

    let stripeCheckoutSession;
    try {
      stripeCheckoutSession = await createStripeCheckoutSession({
        amountDueCents: 5000,
        cancelUrl,
        checkoutSessionId: Date.now(),
        customerEmail: email,
        metadata: {
          email,
          firstName,
          lastName,
          plan,
          providerUserId: providerUser.id,
          type: "provider_express_onboarding",
        },
        successUrl,
      });
    } catch (error) {
      // Do not leave a brand-new account behind when Stripe cannot start the
      // checkout. Pre-existing unverified accounts are intentionally kept so
      // the applicant can retry.
      if (createdProviderUser) {
        await db.delete(authUsers).where(eq(authUsers.id, providerUser.id));
      }
      throw error;
    }

    await db
      .insert(workers)
      .values({
        email,
        firstName,
        lastName,
        phone: "",
        providerVerificationSessionId: stripeCheckoutSession.id,
        serviceRadiusMiles: 10,
        servicesOffered: [],
        userId: providerUser.id,
      })
      .onConflictDoUpdate({
        set: {
          providerVerificationSessionId: stripeCheckoutSession.id,
          updatedAt: new Date(),
        },
        target: workers.userId,
      });

    return c.json({ url: stripeCheckoutSession.url }, 200);
  })
  .post("/provider/resume", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = z
      .object({ plan: z.string().trim().min(1).max(64).optional() })
      .safeParse(body);
    const plan = parsed.success
      ? (parsed.data.plan ?? "standard_provider")
      : "standard_provider";

    const worker = await db.query.workers.findFirst({
      where: eq(workers.userId, userResult.user.id),
    });
    if (worker?.providerVerificationPaidAt) {
      return c.json({ error: "Provider verification is already paid." }, 409);
    }

    if (worker?.providerVerificationSessionId) {
      const stripe = getStripeClient();
      const existingSession = stripe
        ? await stripe.checkout.sessions
            .retrieve(worker.providerVerificationSessionId)
            .catch(() => null)
        : null;
      if (existingSession?.status === "open" && existingSession.url) {
        return c.json({ url: existingSession.url }, 200);
      }
      if (existingSession?.status === "complete") {
        return c.json(
          {
            error:
              existingSession.payment_status === "paid"
                ? "Verification payment was received and is being finalized."
                : "Verification payment is still processing. Try again after it settles.",
          },
          409
        );
      }
    }

    const [firstName = "", ...rest] = (userResult.user.name ?? "")
      .trim()
      .split(/\s+/u);
    const lastName = rest.join(" ");
    const origin = getCheckoutOrigin(c);
    const successUrl = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=provider&plan=${encodeURIComponent(plan)}`;
    const cancelUrl = `${origin}/dashboard/provider?checkout=cancelled`;

    const stripeCheckoutSession = await createStripeCheckoutSession({
      amountDueCents: 5000,
      cancelUrl,
      checkoutSessionId: Date.now(),
      customerEmail: userResult.user.email,
      metadata: {
        email: userResult.user.email,
        firstName,
        lastName,
        plan,
        providerUserId: userResult.user.id,
        type: "provider_express_onboarding",
      },
      successUrl,
    });

    await db
      .insert(workers)
      .values({
        email: userResult.user.email,
        firstName,
        lastName,
        phone: "",
        providerVerificationSessionId: stripeCheckoutSession.id,
        serviceRadiusMiles: 10,
        servicesOffered: [],
        userId: userResult.user.id,
      })
      .onConflictDoUpdate({
        set: {
          providerVerificationSessionId: stripeCheckoutSession.id,
          updatedAt: new Date(),
        },
        target: workers.userId,
      });

    return c.json({ url: stripeCheckoutSession.url }, 200);
  })
  .post("/preview", async (c) => {
    const body = await c.req.json();
    const parsed = checkoutPreviewRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    let resolvedAddress: string | null = null;
    let resolvedAddressId: number | null = parsed.data.addressId ?? null;
    let addressForPricing: {
      city: string;
      country: string;
      formattedAddress?: string | null;
      latitude: number | null;
      longitude: number | null;
      state: string;
      street: string;
      zip: string;
    } | null = null;

    if (parsed.data.addressId) {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "unauthorized" }, 401);
      }

      const customer = await getOrCreateCustomerForUser(user);
      const existingAddress = await db.query.addresses.findFirst({
        where: and(
          eq(addresses.id, parsed.data.addressId),
          eq(addresses.customerId, customer.id)
        ),
      });

      if (!existingAddress) {
        return c.json({ error: "Address not found" }, 404);
      }

      resolvedAddressId = existingAddress.id;
      addressForPricing = existingAddress;
      resolvedAddress = getAddressLabel(existingAddress);
    } else if (parsed.data.address) {
      const verifiedAddress = await verifyAddressWithRadar(parsed.data.address);
      addressForPricing = verifiedAddress;
      resolvedAddress = verifiedAddress.formattedAddress;
    }

    if (!addressForPricing) {
      return c.json({ error: "Address is required" }, 400);
    }

    const travel = getTrustedTravelEstimate(addressForPricing);
    if (!travel) {
      return c.json({ error: "Address could not be verified" }, 422);
    }

    const lawncarePlanError = await validateLawncarePlans({
      address: addressForPricing,
      items: parsed.data.items,
    });
    if (lawncarePlanError) {
      return c.json({ error: lawncarePlanError }, 409);
    }

    const preview = computeCheckoutPreview({
      ...parsed.data,
      travelDistanceMiles: travel.distanceMiles,
      travelFeeCents: travel.feeCents,
      travelStateCode: addressForPricing.state,
    });
    const planIds = parsed.data.items.flatMap((item) =>
      item.planId ? [item.planId] : []
    );
    const catalogRows =
      planIds.length === 0
        ? []
        : await db.query.stripeCatalogItems.findMany({
            where: inArray(stripeCatalogItems.slug, planIds),
          });
    const adjustedPreview = applyCatalogPriceOverrides(
      preview,
      catalogRows,
      planIds
    );

    return c.json(
      {
        address: resolvedAddress,
        addressId: resolvedAddressId,
        lineItems: adjustedPreview.lineItems,
        subtotalCents: adjustedPreview.subtotalCents,
        totalCents: adjustedPreview.totalCents,
      },
      200
    );
  })
  .get("/quote-request/:trackingId", async (c) => {
    const trackingId = c.req.param("trackingId");
    const parsed =
      publicQuoteRequestSchema.shape.trackingId.safeParse(trackingId);
    if (!parsed.success) {
      return c.json({ error: "Invalid quote request id" }, 400);
    }

    const quoteRequest = await db.query.quoteRequests
      .findFirst({
        where: eq(quoteRequests.trackingId, parsed.data),
      })
      .catch((error: unknown) => {
        logger.error(
          {
            err: error,
            requestId: c.get("requestId"),
            trackingId: parsed.data,
          },
          "quote_request:lookup_failed"
        );

        return null;
      });

    if (!quoteRequest) {
      return c.json({ error: "Quote request not found" }, 404);
    }

    return c.json(
      {
        quoteRequest: {
          ...toQuoteRequestResponse(quoteRequest),
          lastCompletedStep: quoteRequest.lastCompletedStep,
          payload: quoteRequest.payloadJson as Record<string, unknown>,
        },
      },
      200
    );
  })
  .put("/quote-request", async (c) => {
    const body = await c.req.json();
    const parsed = publicQuoteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const result = await upsertPublicQuoteRequest(parsed.data).catch(
      (error: unknown) => {
        logger.error(
          {
            err: error,
            lastCompletedStep: parsed.data.lastCompletedStep,
            requestId: c.get("requestId"),
            status: parsed.data.status,
            trackingId: parsed.data.trackingId,
          },
          "quote_request:persist_failed"
        );

        return null;
      }
    );

    if (!result) {
      return c.json(
        {
          quoteRequest: null,
          saved: false,
          trackingId: parsed.data.trackingId,
        },
        202
      );
    }

    const { quoteRequest, statusCode } = result;

    logger.info(
      {
        lastCompletedStep: quoteRequest.lastCompletedStep,
        quoteRequestId: quoteRequest.id,
        requestId: c.get("requestId"),
        status: quoteRequest.status,
      },
      statusCode === 201 ? "quote_request:created" : "quote_request:updated"
    );

    return c.json(
      {
        quoteRequest: toQuoteRequestResponse(quoteRequest),
        saved: true,
      },
      statusCode
    );
  })
  .post("/confirm", handleCheckoutConfirm)
  .put("/draft", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const body = await c.req.json();
    const parsed = checkoutDraftRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const customer = await getOrCreateCustomerForUser(userResult.user);
    const existing = await db.query.checkoutDrafts.findFirst({
      where: eq(checkoutDrafts.customerId, customer.id),
    });

    if (existing) {
      const [updated] = await db
        .update(checkoutDrafts)
        .set({
          payloadJson: parsed.data.payload,
          updatedAt: new Date(),
        })
        .where(eq(checkoutDrafts.id, existing.id))
        .returning();

      if (!updated) {
        return c.json({ error: "Failed to update checkout draft" }, 500);
      }

      return c.json(
        {
          draft: {
            checkoutDraftId: updated.id,
            payload: updated.payloadJson as Record<string, unknown>,
            updatedAt: updated.updatedAt.toISOString(),
          },
        },
        200
      );
    }

    const [created] = await db
      .insert(checkoutDrafts)
      .values({
        customerId: customer.id,
        payloadJson: parsed.data.payload,
      })
      .returning();

    if (!created) {
      return c.json({ error: "Failed to create checkout draft" }, 500);
    }

    return c.json(
      {
        draft: {
          checkoutDraftId: created.id,
          payload: created.payloadJson as Record<string, unknown>,
          updatedAt: created.updatedAt.toISOString(),
        },
      },
      200
    );
  })
  .get("/draft", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const customer = await getOrCreateCustomerForUser(userResult.user);
    const draft = await db.query.checkoutDrafts.findFirst({
      where: eq(checkoutDrafts.customerId, customer.id),
    });

    if (!draft) {
      return c.json({ draft: null }, 200);
    }

    return c.json(
      {
        draft: {
          checkoutDraftId: draft.id,
          payload: draft.payloadJson as Record<string, unknown>,
          updatedAt: draft.updatedAt.toISOString(),
        },
      },
      200
    );
  })
  .get("/sessions/:sessionId", async (c) => {
    const userResult = requireUser(c);
    if (userResult.error) {
      return userResult.error;
    }

    const sessionId = parsePositiveId(c.req.param("sessionId"));
    if (!sessionId) {
      return c.json({ error: "Invalid checkout session id" }, 400);
    }

    const customer = await getOrCreateCustomerForUser(userResult.user);
    const checkoutSession = await db.query.checkoutSessions.findFirst({
      where: and(
        eq(checkoutSessions.id, sessionId),
        eq(checkoutSessions.customerId, customer.id)
      ),
    });

    if (!checkoutSession) {
      return c.json({ error: "Checkout session not found" }, 404);
    }

    const relatedOrders = await db.query.orders.findMany({
      columns: {
        id: true,
      },
      where: eq(orders.checkoutSessionId, checkoutSession.id),
    });

    return c.json(
      {
        checkoutSessionId: checkoutSession.id,
        createdOrderIds: relatedOrders.map((entry) => entry.id),
        status: checkoutSession.status,
      },
      200
    );
  })
  .post("/webhook/stripe", handleStripeWebhook);

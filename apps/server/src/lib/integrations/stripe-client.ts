import { env } from "@callcastlecare/env/server";
import Stripe from "stripe";

import { getPrimaryOrigin } from "../origin";

export type StripeMode = "live" | "test";
export type StripeWebhookEndpointKind = "billing" | "commerce" | "connect";

// stripe-node 22.3.2 currently ships the 2026-06-24.dahlia API types.
export const STRIPE_API_VERSION = "2026-06-24.dahlia" as const;

const isPlaceholderSecret = (secret: string) =>
  secret.includes("replace_me") || secret.includes("replace-me");

export const getStripeMode = (secret = env.STRIPE_SECRET_KEY): StripeMode =>
  secret?.includes("_live_") ? "live" : "test";

const assertStripeKeyModesMatch = () => {
  if (
    env.STRIPE_SECRET_KEY &&
    env.STRIPE_PUBLISHABLE_KEY &&
    getStripeMode(env.STRIPE_SECRET_KEY) !==
      getStripeMode(env.STRIPE_PUBLISHABLE_KEY)
  ) {
    throw new Error(
      "STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY must use the same mode."
    );
  }
};

export const isStripeSecretUsable = (secret = env.STRIPE_SECRET_KEY) =>
  Boolean(secret && !isPlaceholderSecret(secret));

export const getStripeClient = () => {
  assertStripeKeyModesMatch();
  const secret = env.STRIPE_SECRET_KEY;
  if (!(secret && isStripeSecretUsable(secret))) {
    return null;
  }

  return new Stripe(secret, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
  });
};

export const requireStripeClient = () => {
  const client = getStripeClient();
  if (!client) {
    throw new Error(
      "A real STRIPE_SECRET_KEY is required for this Stripe operation."
    );
  }
  return client;
};

export const getStripeWebhookSecret = (
  kind: StripeWebhookEndpointKind
): string | undefined => {
  if (kind === "billing") {
    return env.STRIPE_BILLING_WEBHOOK_SECRET ?? env.STRIPE_WEBHOOK_SECRET;
  }
  if (kind === "commerce") {
    return env.STRIPE_COMMERCE_WEBHOOK_SECRET ?? env.STRIPE_WEBHOOK_SECRET;
  }
  return env.STRIPE_CONNECT_WEBHOOK_SECRET;
};

export const getStripeWebhookBaseUrl = () => {
  const configured =
    env.STRIPE_WEBHOOK_BASE_URL ?? getPrimaryOrigin(env.CORS_ORIGIN);
  if (!configured) {
    return null;
  }
  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
};

export const getStripeWebhookUrl = (
  kind: StripeWebhookEndpointKind
): string | null => {
  const baseUrl = getStripeWebhookBaseUrl();
  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/api/v1/webhooks/stripe/${kind}`;
};

export const isStripeMockMode = () =>
  (env.NODE_ENV === "development" || env.NODE_ENV === "test") &&
  !isStripeSecretUsable();

export const getStripeIdempotencyKey = (...parts: string[]) =>
  `castlecare:${getStripeMode()}:${parts.join(":")}`;

export const getStripeRequestOptions = (
  ...parts: string[]
): Stripe.RequestOptions => ({
  idempotencyKey: getStripeIdempotencyKey(...parts),
});

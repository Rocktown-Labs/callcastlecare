import { expo } from "@better-auth/expo";
import { stripe } from "@better-auth/stripe";
import { configureDatabase, createDb } from "@callcastlecare/db";
import type { Database } from "@callcastlecare/db";
import * as schema from "@callcastlecare/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { emailOTP } from "better-auth/plugins/email-otp";
import StripeSdk from "stripe";

import {
  getOtpEmailContent,
  sendAdminSignupNotification,
  sendAuthEmail,
  sendAuthOtpEmail,
  sendWelcomeAuthEmail,
} from "./email";

export interface AuthConfig {
  ADMIN_EMAIL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  CORS_ORIGIN: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  STRIPE_BILLING_WEBHOOK_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

let authInstance: ReturnType<typeof createAuth> | undefined;

const createStripePlugin = (config: AuthConfig) => {
  const webhookSecret =
    config.STRIPE_BILLING_WEBHOOK_SECRET ?? config.STRIPE_WEBHOOK_SECRET;
  if (
    !(config.STRIPE_SECRET_KEY && webhookSecret) ||
    config.STRIPE_SECRET_KEY.includes("replace_me")
  ) {
    return null;
  }

  const stripeClient = new StripeSdk(config.STRIPE_SECRET_KEY, {
    apiVersion: "2026-06-24.dahlia",
  });

  return stripe({
    createCustomerOnSignUp: true,
    getCustomerCreateParams: (user) =>
      Promise.resolve({
        email: user.email,
        metadata: {
          betterAuthUserId: user.id,
          castlecareAdmin:
            user.email.toLowerCase() === config.ADMIN_EMAIL.toLowerCase()
              ? "true"
              : "false",
        },
        name: user.name,
      }),
    stripeClient,
    stripeWebhookSecret: webhookSecret,
  });
};

const authAllowedHosts = [
  "callcastlecare.com",
  "www.callcastlecare.com",
  "api.callcastlecare.com",
  "localhost:3000",
  "localhost:3001",
  "localhost:5173",
  "127.0.0.1:3000",
  "127.0.0.1:3001",
  "127.0.0.1:5173",
  "*.workers.dev",
];

const isCrossSiteDeployment = (origin: string) => {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname.endsWith(".workers.dev") || hostname.endsWith(".vercel.app")
    );
  } catch {
    return false;
  }
};

const createAuth = (config: AuthConfig, database: Database) => {
  const stripePlugin = createStripePlugin(config);

  return betterAuth({
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        // Production web and API share the callcastlecare.com site, so Lax is
        // enough and blocks cross-site state-changing requests. Preview hosts
        // are different sites (workers.dev/vercel.app), so those keep None.
        sameSite: isCrossSiteDeployment(config.CORS_ORIGIN) ? "none" : "lax",
        secure: true,
      },
      trustedProxyHeaders: true,
    },
    basePath: "/api/auth",
    baseURL: {
      allowedHosts: authAllowedHosts,
      fallback: config.BETTER_AUTH_URL,
      protocol: "auto",
    },
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            if (user.email) {
              try {
                await sendWelcomeAuthEmail({
                  customerName: user.name,
                  to: user.email,
                });
              } catch {
                // Non-blocking welcome email delivery failure
              }

              try {
                await sendAdminSignupNotification({
                  customerEmail: user.email,
                  customerName: user.name,
                });
              } catch {
                // Non-blocking admin alert delivery failure
              }
            }
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ url, user }) => {
        await sendAuthEmail({
          body: "We received a request to reset your CastleCare password. This link will take you back to CastleCare to choose a new password.",
          buttonLabel: "Reset password",
          preview: "Reset your CastleCare password.",
          subject: "Reset your CastleCare password",
          title: "Reset your password",
          to: user.email,
          url,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ url, user }) => {
        await sendAuthEmail({
          body: "Confirm this email address to finish setting up your CastleCare account and access your booking dashboard.",
          buttonLabel: "Verify email",
          preview: "Verify your CastleCare email address.",
          subject: "Verify your CastleCare email",
          title: "Verify your email",
          to: user.email,
          url,
        });
      },
    },
    plugins: [
      expo(),
      admin({
        adminRoles: ["admin"],
        defaultRole: "user",
      }),
      emailOTP({
        allowedAttempts: 5,
        expiresIn: 600,
        sendVerificationOTP: async ({ email, otp, type }) => {
          const content = getOtpEmailContent(type);
          await sendAuthOtpEmail({
            ...content,
            otp,
            to: email,
          });
        },
      }),
      ...(stripePlugin ? [stripePlugin] : []),
    ],
    secret: config.BETTER_AUTH_SECRET,
    socialProviders:
      config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: config.GOOGLE_CLIENT_ID,
              clientSecret: config.GOOGLE_CLIENT_SECRET,
            },
          }
        : undefined,
    trustedOrigins: [
      config.CORS_ORIGIN,
      "https://callcastlecare.com",
      "https://www.callcastlecare.com",
      "callcastlecare-driver://",
      "exp://",
      "http://localhost:3001",
      "http://localhost:5173",
      "http://localhost:8081",
    ],
  });
};

export const configureAuth = (config: AuthConfig, database: Database): void => {
  authInstance = createAuth(config, database);
};

export const configureAuthFromEnv = (
  config: AuthConfig,
  databaseUrl: string
): void => {
  configureDatabase(databaseUrl);
  authInstance = createAuth(config, createDb(databaseUrl));
};

export const getAuth = (): ReturnType<typeof createAuth> => {
  if (!authInstance) {
    throw new Error(
      "Auth is not configured. Call configureAuth() or configureAuthFromEnv() before handling requests."
    );
  }

  return authInstance;
};

export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  get(_, property) {
    const instance = getAuth();
    const value = (instance as Record<string | symbol, unknown>)[property];

    if (typeof value === "function") {
      return value.bind(instance);
    }

    return value;
  },
}) as ReturnType<typeof createAuth>;

import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

type EnvSource = Record<string, string | undefined>;

const isNode =
  typeof (globalThis as { process?: { versions?: { node?: string } } }).process
    ?.versions?.node === "string";

if (isNode) {
  // Load .env files only in Node-based environments; Cloudflare Workers receive
  // env values through bindings instead.
  await import("dotenv/config");
}

let envSource: EnvSource =
  typeof process !== "undefined" && process.env ? process.env : {};
let cachedEnv: Env | undefined;

const buildEnv = (source: EnvSource) => {
  const runtimeEnv = {
    ...source,
  };

  return createEnv({
    emptyStringAsUndefined: true,
    runtimeEnv,
    server: {
      ADMIN_EMAIL: z.email().default("cg@rocktownlabs.com"),
      BETTER_AUTH_SECRET: z.string().min(32),
      BETTER_AUTH_URL: z.url(),
      CORS_ORIGIN: z
        .string()
        .min(1)
        .refine(
          (value) =>
            value
              .split(",")
              .every((origin) => z.url().safeParse(origin.trim()).success),
          "CORS_ORIGIN must be a URL or a comma-separated list of URLs"
        ),
      DATABASE_URL: z.string().min(1),
      GOOGLE_CLIENT_ID: z.string().min(1).optional(),
      GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
      NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
      PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(0),
      PROVIDER_PAYOUT_BPS: z.coerce
        .number()
        .int()
        .min(0)
        .max(10_000)
        .default(6000),
      RADAR_API_KEY: z.string().min(1).optional(),
      RAPIDAPI_KEY: z.string().min(1).optional(),
      RAPIDAPI_ZILLOW_HOST: z.string().min(1).optional(),
      RENTCAST_API_KEY: z.string().min(1).optional(),
      RESEND_API_KEY: z.string().min(1).optional(),
      RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
      STRIPE_BILLING_WEBHOOK_SECRET: z.string().min(1).optional(),
      STRIPE_COMMERCE_WEBHOOK_SECRET: z.string().min(1).optional(),
      STRIPE_CONNECT_WEBHOOK_SECRET: z.string().min(1).optional(),
      STRIPE_PRICE_BASIC_MONTHLY: z.string().min(1).optional(),
      STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
      STRIPE_SECRET_KEY: z
        .string()
        .regex(/^(?:sk|rk)_(?:test|live)_[A-Za-z0-9_]+$/u)
        .optional(),
      STRIPE_WEBHOOK_BASE_URL: z.url().optional(),
      STRIPE_WEBHOOK_PUBLIC_URL: z.url().optional(),
      STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    },
    skipValidation:
      typeof process !== "undefined" && process.env
        ? !!process.env.SKIP_ENV_VALIDATION
        : false,
  });
};

export type Env = ReturnType<typeof buildEnv>;

export const setRuntimeEnvSource = (
  source: Record<string, string | undefined>
): void => {
  envSource = source;
  cachedEnv = undefined;
};

const getEnv = (): Env => {
  if (!cachedEnv) {
    cachedEnv = buildEnv(envSource);
  }

  return cachedEnv;
};

export const env = new Proxy({} as Env, {
  get(_, property) {
    return getEnv()[property as keyof Env];
  },
}) as Env;

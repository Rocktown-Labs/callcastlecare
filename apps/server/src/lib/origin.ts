import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../types";

const LOCAL_ORIGIN_PATTERN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/u;

export const getRuntimeEnv = (c: {
  env?: Record<string, unknown>;
}): Record<string, string | undefined> => {
  const bindings = c.env as Record<string, string | undefined> | undefined;
  if (bindings?.CORS_ORIGIN || bindings?.NODE_ENV) {
    return bindings;
  }

  if (typeof process !== "undefined" && process.env) {
    return process.env;
  }

  return bindings ?? {};
};

export const parseAllowedOrigins = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export const getPrimaryOrigin = (value: string | undefined) =>
  parseAllowedOrigins(value)[0] ?? value;

/**
 * Credentialed CORS must never reflect arbitrary origins. Accept the
 * configured origin list exactly, plus localhost in non-production so local
 * development keeps working without weakening the deployed allowlist.
 */
export const isOriginAllowed = (input: {
  configured: string | undefined;
  nodeEnv: string | undefined;
  origin: string;
}): boolean => {
  const allowedOrigins = parseAllowedOrigins(input.configured);

  if (allowedOrigins.includes(input.origin)) {
    return true;
  }

  // Expo development and the dedicated driver app are not browser origins.
  if (
    input.origin.startsWith("exp://") ||
    input.origin.startsWith("callcastlecare-driver://")
  ) {
    return true;
  }

  if (
    (input.nodeEnv === "development" || input.nodeEnv === "test") &&
    LOCAL_ORIGIN_PATTERN.test(input.origin)
  ) {
    return true;
  }

  return false;
};

const isWebhookPath = (path: string) =>
  path.includes("/webhooks/") ||
  path.includes("/webhook/") ||
  path.startsWith("/webhooks") ||
  path.endsWith("/webhook");

const isAuthPath = (path: string) =>
  path.startsWith("/api/auth") || path.startsWith("/auth");

/**
 * Browser state-changing requests must come from a configured origin. Native
 * clients and server-to-server callers do not send Origin, so an absent header
 * is allowed; a present but unlisted header is rejected. Webhook and Better
 * Auth routes have their own signature/origin controls.
 */
export const originGuard = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  if (
    c.req.method === "GET" ||
    c.req.method === "HEAD" ||
    c.req.method === "OPTIONS"
  ) {
    return await next();
  }

  const { path } = c.req;
  if (isWebhookPath(path) || isAuthPath(path)) {
    return await next();
  }

  const origin = c.req.header("origin");
  if (!origin) {
    return await next();
  }

  const runtimeEnv = getRuntimeEnv(c);
  const allowed = isOriginAllowed({
    configured: runtimeEnv.CORS_ORIGIN,
    nodeEnv: runtimeEnv.NODE_ENV,
    origin,
  });

  if (!allowed) {
    return c.json({ error: "invalid_origin" }, 403);
  }

  return await next();
};

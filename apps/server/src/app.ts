import { configureAuth, getAuth } from "@callcastlecare/auth";
import type { AuthConfig } from "@callcastlecare/auth";
import { configureDatabase, db } from "@callcastlecare/db";
import {
  env as validatedEnv,
  setRuntimeEnvSource,
} from "@callcastlecare/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import notFound from "stoker/middlewares/not-found";
import onError from "stoker/middlewares/on-error";

import { toPublicSession, toPublicUser } from "./lib/auth";
import { requestLogger, logger } from "./lib/logger";
import { getRuntimeEnv, isOriginAllowed, originGuard } from "./lib/origin";
import { configureQueue } from "./lib/queue";
import { addressesRoutes } from "./routes/addresses";
import { adminRoutes } from "./routes/admin";
import { checkoutRoutes } from "./routes/checkout";
import { disputeRoutes } from "./routes/disputes";
import { driverRoutes } from "./routes/driver";
import { laundryBagRoutes } from "./routes/laundry-bags";
import { locationRoutes } from "./routes/locations";
import { marketRoutes } from "./routes/markets";
import { meRoutes } from "./routes/me";
import { mediaRoutes } from "./routes/media";
import { notificationRoutes } from "./routes/notifications";
import { orderRoutes } from "./routes/orders";
import { subscriptionRoutes } from "./routes/subscriptions";
import { supportRoutes } from "./routes/support";
import { webhookRoutes } from "./routes/webhooks";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

const toStringOrNull = (value: unknown) =>
  typeof value === "string" ? value : null;

const toNumberOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const getErrorLogFields = (error: unknown) => {
  if (error instanceof Response) {
    return {
      errorStatus: error.status,
      errorStatusText: error.statusText,
      errorType: "Response",
    };
  }

  if (error instanceof Error) {
    const candidate = error as Error & {
      cause?: unknown;
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
    };

    return {
      errorCode: toStringOrNull(candidate.code),
      errorMessage: error.message,
      errorStatus:
        toNumberOrNull(candidate.status) ??
        toNumberOrNull(candidate.statusCode),
      errorType: error.name,
      hasCause: candidate.cause !== undefined,
    };
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as Record<string, unknown>;
    return {
      errorCode: toStringOrNull(candidate.code),
      errorMessage:
        toStringOrNull(candidate.message) ??
        toStringOrNull(candidate.error) ??
        "non_error_throwable",
      errorStatus:
        toNumberOrNull(candidate.status) ??
        toNumberOrNull(candidate.statusCode),
      errorType:
        toStringOrNull(candidate.name) ??
        toStringOrNull(candidate.type) ??
        "object",
    };
  }

  return {
    errorMessage: String(error),
    errorType: typeof error,
  };
};

app.use(requestLogger());
app.use(
  secureHeaders({
    // The web and API are separate origins; private media is loaded by <img>
    // from the web origin and must remain readable there.
    crossOriginResourcePolicy: "cross-origin",
  })
);
app.use("/*", originGuard());

// Bind the database and auth stack to the request lifecycle. On Cloudflare
// Workers the environment arrives via `c.env`; on the local Node dev server it
// is read from process.env.
// eslint-disable-next-line require-await
app.use("/*", async (c, next) => {
  const incomingEnv = c.env as Record<string, unknown> | undefined;
  const runtimeEnv =
    incomingEnv && typeof incomingEnv.DATABASE_URL === "string"
      ? (incomingEnv as Record<string, string | undefined>)
      : process.env;
  const databaseUrl = runtimeEnv.DATABASE_URL;

  if (!databaseUrl) {
    logger.error("DATABASE_URL is not configured in the runtime environment");
    return c.json({ error: "database_not_configured" }, 500);
  }

  try {
    configureDatabase(databaseUrl);
    configureAuth(runtimeEnv as unknown as AuthConfig, db);
    configureQueue(c.env.QUEUE as Queue | undefined);
    setRuntimeEnvSource(runtimeEnv);
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      "auth:configuration_failed"
    );
    return c.json({ error: "auth_not_configured" }, 500);
  }

  return next();
});

app.use("/*", async (c, next) => {
  const session = await getAuth().api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    c.set("user", null);
    c.set("session", null);
    return await next();
  }

  c.set("user", session.user);
  c.set("session", session.session);
  return await next();
});

app.use(
  "/*",
  cors({
    allowHeaders: ["Content-Type", "Authorization", "Cookie", "x-request-id"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    origin: (origin, c) => {
      if (!origin) {
        return;
      }

      const runtimeEnv = getRuntimeEnv(c);
      const configured = runtimeEnv.CORS_ORIGIN ?? validatedEnv.CORS_ORIGIN;
      const nodeEnv = runtimeEnv.NODE_ENV ?? validatedEnv.NODE_ENV;

      return isOriginAllowed({ configured, nodeEnv, origin })
        ? origin
        : undefined;
    },
  })
);

app.on(["POST", "GET", "OPTIONS"], ["/api/auth/*", "/auth/*"], (c) =>
  getAuth().handler(c.req.raw)
);

export const apiRoutes = new Hono<AppEnv>()
  .get("/health", (c) => c.json({ ok: true }, 200))
  .get("/me", (c) => {
    const user = c.get("user");
    const session = c.get("session");

    if (!user || !session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const isAdmin =
      user.role === "admin" ||
      user.email.toLowerCase() === validatedEnv.ADMIN_EMAIL.toLowerCase();

    return c.json(
      {
        isAdmin,
        session: toPublicSession(session),
        user: toPublicUser(user),
      },
      200
    );
  })
  .route("/checkout", checkoutRoutes)
  .route("/me", meRoutes)
  .route("/addresses", addressesRoutes)
  .route("/locations", locationRoutes)
  .route("/markets", marketRoutes)
  .route("/laundry-bags", laundryBagRoutes)
  .route("/disputes", disputeRoutes)
  .route("/driver", driverRoutes)
  .route("/media", mediaRoutes)
  .route("/orders", orderRoutes)
  .route("/notifications", notificationRoutes)
  .route("/support", supportRoutes)
  .route("/subscriptions", subscriptionRoutes)
  .route("/webhooks", webhookRoutes)
  .route("/admin", adminRoutes);

const routes = app
  .route("/api/v1", apiRoutes)
  .route("/v1", apiRoutes)
  .route("/api", apiRoutes)
  .route("/", apiRoutes)
  .get("/", (c) => c.text("OK"));

app.notFound(notFound);
// eslint-disable-next-line promise/prefer-await-to-callbacks -- Hono onError requires handler callback shape.
app.onError(async (error, c) => {
  logger.error(
    {
      err: error,
      ...getErrorLogFields(error),
      method: c.req.method,
      path: c.req.path,
      requestId: c.get("requestId"),
      userId: c.get("user")?.id ?? null,
    },
    "request:error"
  );

  return await onError(error, c);
});

export { app, routes };
export type ApiType = typeof apiRoutes;
export type AppType = typeof routes;

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

const mediaBucket = Cloudflare.R2.Bucket("media", {
  cors: [
    {
      allowedHeaders: ["content-type"],
      allowedMethods: ["GET", "PUT"],
      allowedOrigins: ["*"],
    },
  ],
});

const jobQueue = Cloudflare.Queues.Queue("jobs");

const WEB_DOMAIN = "callcastlecare.com";
const WEB_WWW_DOMAIN = `www.${WEB_DOMAIN}`;
const API_DOMAIN = `api.${WEB_DOMAIN}`;
const WEB_ORIGIN = `https://${WEB_DOMAIN}`;
const API_ORIGIN = `https://${API_DOMAIN}`;

export const server = Cloudflare.Worker("castlecare-server", {
  compatibility: {
    flags: ["nodejs_compat"],
  },
  dev: {
    port: 3000,
  },
  domain: API_DOMAIN,
  env: {
    ADMIN_EMAIL: Config.String("ADMIN_EMAIL").pipe(
      Config.withDefault("cg@rocktownlabs.com")
    ),
    BETTER_AUTH_SECRET: Config.Redacted("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: Cloudflare.Worker.URL,
    CORS_ORIGIN: Config.String("CORS_ORIGIN").pipe(
      Config.withDefault(WEB_ORIGIN)
    ),
    DATABASE_URL: Config.Redacted("DATABASE_URL"),
    GOOGLE_CLIENT_ID: Config.String("GOOGLE_CLIENT_ID").pipe(
      Config.withDefault("")
    ),
    GOOGLE_CLIENT_SECRET: Config.String("GOOGLE_CLIENT_SECRET").pipe(
      Config.withDefault("")
    ),
    LOG_LEVEL: Config.String("LOG_LEVEL").pipe(Config.withDefault("info")),
    MEDIA_BUCKET: mediaBucket,
    NODE_ENV: Config.String("NODE_ENV").pipe(Config.withDefault("production")),
    PLATFORM_FEE_BPS: Config.String("PLATFORM_FEE_BPS").pipe(
      Config.withDefault("0")
    ),
    PROVIDER_PAYOUT_BPS: Config.String("PROVIDER_PAYOUT_BPS").pipe(
      Config.withDefault("6000")
    ),
    QUEUE: jobQueue,
    RADAR_API_KEY: Config.String("RADAR_API_KEY").pipe(Config.withDefault("")),
    RAPIDAPI_KEY: Config.String("RAPIDAPI_KEY").pipe(Config.withDefault("")),
    RAPIDAPI_ZILLOW_HOST: Config.String("RAPIDAPI_ZILLOW_HOST").pipe(
      Config.withDefault("")
    ),
    RENTCAST_API_KEY: Config.String("RENTCAST_API_KEY").pipe(
      Config.withDefault("")
    ),
    RESEND_API_KEY: Config.String("RESEND_API_KEY").pipe(
      Config.withDefault("")
    ),
    RESEND_WEBHOOK_SECRET: Config.String("RESEND_WEBHOOK_SECRET").pipe(
      Config.withDefault("")
    ),
    STRIPE_BILLING_WEBHOOK_SECRET: Config.String(
      "STRIPE_BILLING_WEBHOOK_SECRET"
    ).pipe(Config.withDefault("")),
    STRIPE_COMMERCE_WEBHOOK_SECRET: Config.String(
      "STRIPE_COMMERCE_WEBHOOK_SECRET"
    ).pipe(Config.withDefault("")),
    STRIPE_CONNECT_WEBHOOK_SECRET: Config.String(
      "STRIPE_CONNECT_WEBHOOK_SECRET"
    ).pipe(Config.withDefault("")),
    STRIPE_PRICE_BASIC_MONTHLY: Config.String(
      "STRIPE_PRICE_BASIC_MONTHLY"
    ).pipe(Config.withDefault("")),
    STRIPE_PUBLISHABLE_KEY: Config.String("STRIPE_PUBLISHABLE_KEY").pipe(
      Config.withDefault("")
    ),
    STRIPE_SECRET_KEY: Config.String("STRIPE_SECRET_KEY").pipe(
      Config.withDefault("")
    ),
    STRIPE_WEBHOOK_BASE_URL: Config.String("STRIPE_WEBHOOK_BASE_URL").pipe(
      Config.withDefault(API_ORIGIN)
    ),
    STRIPE_WEBHOOK_PUBLIC_URL: Config.String("STRIPE_WEBHOOK_PUBLIC_URL").pipe(
      Config.withDefault(API_ORIGIN)
    ),
    STRIPE_WEBHOOK_SECRET: Config.String("STRIPE_WEBHOOK_SECRET").pipe(
      Config.withDefault("")
    ),
  },
  main: "../../apps/server/src/worker.ts",
  name: "castlecare-server",
});

export type ServerEnv = Cloudflare.InferEnv<typeof server>;

export default Alchemy.Stack(
  "callcastlecare",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* callcastlecare() {
    const serverWorker = yield* server;
    const webWorker = yield* Cloudflare.Website.Vite("web", {
      compatibility: {
        flags: ["nodejs_compat"],
      },
      dev: {
        port: 3001,
      },
      domain: {
        name: WEB_DOMAIN,
        redirects: [WEB_WWW_DOMAIN],
      },
      env: {
        VITE_SERVER_URL: serverWorker.url.as<string>(),
      },
      name: "castlecare-web",
      rootDir: "../../apps/web",
    });

    return {
      serverUrl: serverWorker.url,
      webUrl: webWorker.url,
    };
  })
);

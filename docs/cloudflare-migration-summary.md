# Cloudflare Migration Summary

This document summarizes the work done to migrate the CastleCare monorepo from Vercel to Cloudflare Workers, what changed, and what still needs to happen before the migration is fully complete.

## Goals

- Move hosting from Vercel to Cloudflare Workers.
- Manage infrastructure with Alchemy in `packages/infra`.
- Keep the existing stack: TanStack Start (web), Hono (server), Better Auth, Drizzle/PostgreSQL, Expo (mobile).
- Keep `callcastlecare.com` available but transfer it last.

## What changed

### Infrastructure (`packages/infra`)

- Added `packages/infra/alchemy.run.ts`, a single Alchemy stack that declares:
  - `castlecare-server` — Hono API Worker.
  - `castlecare-web` — TanStack Start Vite Worker.
  - `media` — R2 bucket for file uploads.
  - `jobs` — Cloudflare Queue for background work.
  - All necessary Worker env bindings (secrets, URLs, CORS origins, etc.).
- Added `ADMIN_EMAIL` to the server Worker env map so the default admin email is available in production.

### Server (`apps/server`)

- Migrated from `@neondatabase/serverless` to `drizzle-orm/postgres-js` for Worker compatibility.
- Added a Cloudflare Worker entry (`apps/server/src/worker.ts`) that exports both `fetch` (Hono) and `queue` (batch handler).
- Added `apps/server/src/queue-handler.ts` for `dispatch_retry`, `outbox_delivery`, and `tip_release` messages.
- Replaced Vercel Blob with R2 via `apps/server/src/lib/integrations/blob.ts`.
- Replaced Vercel Queue with Cloudflare Queues via `apps/server/src/lib/queue.ts`.
- Updated `apps/server/src/routes/media.ts` to stream multipart uploads to the R2 `MEDIA_BUCKET` binding.
- Fixed the runtime environment handoff in `apps/server/src/app.ts` so the same code works on:
  - Cloudflare Workers (`c.env.DATABASE_URL`)
  - Local Node/Bun dev (`process.env.DATABASE_URL`)
- Lazy-loaded Resend in `apps/server/src/routes/webhooks.ts` so the Worker starts when `RESEND_API_KEY` is unset.

### Web (`apps/web`)

- Removed `apps/web/nitro.config.ts`, `@vercel/analytics`, and `evlog/nitro/v3`.
- Updated `apps/web/vite.config.ts` and `apps/web/src/router.tsx` for TanStack Start on Workers.
- Replaced Vercel Blob client uploads with a server-mediated multipart upload to `/api/v1/media/client-upload`.
- Removed Vercel-specific URL fallbacks in `apps/web/src/lib/server-url.ts` and `apps/web/src/lib/auth-client.ts`.
- Removed `*.vercel.app` from the Better Auth `allowedHosts` list.

### Auth (`packages/auth`)

- Refactored to runtime `configureAuth(config, db)` plus a `getAuth()` proxy so bindings are configured per request.
- Fixed `packages/auth/src/email.ts` entropy key helpers to use the existing lazy `getResendClient()` helper.

### Database (`packages/db`)

- Migrated to `postgres-js` with a lazy `db` proxy and a `configureDatabase(url)` helper.

### Env (`packages/env`)

- Made `@callcastlecare/env/server` Worker-safe via `setRuntimeEnvSource()` and neutral `.env` access.

### Dependencies and cleanup

- Removed `vercel.json`, `scripts/sync-vercel-env.ts`, root `vercel` devDependency, and all `@vercel/blob` / `@vercel/queue` packages.
- Added root `overrides` in `package.json` to pin `react` and `react-dom` to `19.2.7`.

## Current live deployment

- Server: `https://castlecare-server.rocktown-labs.workers.dev`
- Web: `https://castlecare-web.rocktown-labs.workers.dev`

Both respond successfully:

- `GET /api/v1/health` → `{"ok":true}`
- `GET /` → `200`

## What's left

### Before the migration is complete

1. **Redeploy from `master`**
   - `cd packages/infra && bun run deploy`
   - This currently fails locally because `BETTER_AUTH_SECRET` is not set in the shell.
   - Set all required secrets first (see below) and then run the deploy.

2. **Add `RESEND_API_KEY`**
   - Without it, transactional and auth emails will silently fail.
   - Add it to the Alchemy env map and to the deployment context.

3. **Transfer `callcastlecare.com`**
   - Add custom-domain records in `packages/infra/alchemy.run.ts` once DNS is ready.
   - Update `CORS_ORIGIN` from the workers.dev placeholder to `https://callcastlecare.com`.

4. **Update `STRIPE_WEBHOOK_PUBLIC_URL`**
   - Point it to the final API URL after the domain transfer.

5. **Update driver app config**
   - Set `EXPO_PUBLIC_SERVER_URL=https://castlecare-server.rocktown-labs.workers.dev` in the driver app `.env` (`apps/driver/.env`) until the custom domain is live.

6. **Clean up stale Vercel references**
   - `README.md` still documents `bun run dev:vercel`, `env:preview`, `deploy:prod`, and Vercel deployment steps.
   - `.vercelignore` and `bts.jsonc` still reference Vercel-only workflows.
   - These should be updated/removed in a small follow-up PR.

### Optional / nice-to-have

- Add Cloudflare observability/logging integration if you want to replace Vercel Analytics.
- Review and reduce the diff size in future PRs by keeping `.agents/skills` and unrelated apps (like `apps/worker`) out of migration branches.

## Required secrets for deployment

When redeploying, make sure these are exported or present in the environment:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `CORS_ORIGIN`
- `DATABASE_URL`
- `ADMIN_EMAIL` (has a default, but can be explicit)
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_WEBHOOK_PUBLIC_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `STRIPE_PLATFORM_ACCOUNT`

## Verification commands

```bash
# Type-check the workspace
bun run check-types

# Run server tests
bun run test

# Start local server
bun run dev

# Deploy infrastructure
bun run deploy
```

## Notes

- `localhost` and `*.workers.dev` origins are currently accepted for CORS until the custom domain is connected.
- Currency continues to be stored and transmitted as integer cents across DB, API, Stripe, and UI calculations.
- Local development now uses the same code paths as the deployed Worker; there are no Vercel-specific runtime branches left.

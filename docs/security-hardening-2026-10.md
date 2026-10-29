# Security hardening — October 2026

A source-and-local security pass reviewed the web app, API, auth, database access, and payments boundaries. It found and fixed nine concrete issues and left two deployment-dependent leads. No live endpoint, provider API, or production data was used.

## Fixed

| Severity | Issue | Fix |
| --- | --- | --- |
| High | Credentialed CORS reflected any `*.workers.dev` or substring-`localhost` origin | Exact allowlist in `apps/server/src/lib/origin.ts`; unsafe-method `originGuard` |
| High | CSRF on cookie-authenticated JSON endpoints | Origin guard plus `SameSite=Lax` production cookies |
| High | Provider checkout created accounts with `TempPassword123!` | Required applicant password; existing emails use an authenticated resume endpoint; webhook no longer creates users |
| Medium | `GET /api/v1/me` exposed the session token | `toPublicSession` / `toPublicUser` projections |
| Medium | Unauthenticated media upload to R2 | Auth plus target/path authorization; `crypto.randomUUID` path segment |
| Medium | Any user could attach media to any order/leg | Ownership/assignment checks on upload and attach |
| Medium | Guest checkout could read a saved address by id | Guests must use address text, not `addressId` |
| Medium | Client-supplied address coordinates/state were trusted | Server-side Radar geocoding for coordinates and state/zip |
| Medium | Non-atomic payout/refund/tip transitions | Durable claims before Stripe calls; transient failures retry; refunds use a claim row |

## Deployment leads

- **Unsigned Stripe webhooks outside production** — mock mode is now limited to exact `development`/`test`. Confirm every deployed API host sets `NODE_ENV=production` and non-placeholder Stripe/webhook secrets.
- **`@tanstack/react-start` version floor** — the local tree resolves `1.168.32`; Vercel blocks versions below `1.168.60`. Track with PR #33.

## Residual hardening

- Guest checkout still reuses an existing customer by email for order attribution. Consider a dedicated guest customer or a sign-in requirement for verified accounts.
- Admin Stripe sync returns newly created webhook signing secrets to the browser; consider a one-time reveal or write-only flow.
- Add a stale-`processing` reconciliation job for payout claims.
- Add a CSP and explicit Referrer-Policy for the web Worker.

## Verification

```bash
bun run check-types
bun run test
bun x ultracite check <changed files>
```

Regression suites: `origin.test.ts`, `media.test.ts`, `addresses.test.ts`, `payouts.test.ts`, plus provider/guest cases in `checkout-claim.test.ts` and webhook cases in `checkout-webhook.test.ts`.

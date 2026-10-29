# CastleCare Stripe operations

## Money flow

CastleCare is a marketplace. Customer payments are collected on the platform account. Service providers are paid only after a job is completed, so provider settlement uses separate charges and transfers rather than destination charges. The default provider payout is 60% of the service amount plus the customer tip. Stripe fees, refunds, disputes, and negative balances remain platform responsibilities unless the platform policy changes.

The $50 Express provider verification charge is a platform-only Checkout payment. It does not transfer funds to a provider. After screening approval, the provider can start Express Connect onboarding from the Provider Hub.

## Environment

Set these server variables in the deployment secret manager:

- `STRIPE_SECRET_KEY` — prefer an appropriately restricted `rk_test_` or `rk_live_` key.
- `STRIPE_PUBLISHABLE_KEY` — public key for any future browser Stripe UI; never put a secret key in `VITE_` variables.
- `STRIPE_WEBHOOK_BASE_URL` — the canonical public **API** origin, such as `https://api.callcastlecare.com`. The web origin (`https://callcastlecare.com`) does not serve `/api/v1/webhooks/*`.
- `STRIPE_BILLING_WEBHOOK_SECRET` — signing secret for recurring subscription events.
- `STRIPE_COMMERCE_WEBHOOK_SECRET` — signing secret for one-time checkout, payment, refund, and dispute events.
- `STRIPE_CONNECT_WEBHOOK_SECRET` — signing secret for connected-account events.
- `PROVIDER_PAYOUT_BPS` — defaults to `6000` (60%).
- `PLATFORM_FEE_BPS` — reserved for a future explicit platform fee policy.

`STRIPE_WEBHOOK_SECRET` and `STRIPE_WEBHOOK_PUBLIC_URL` remain supported for legacy commerce deployments, but new setups should use the three endpoint secrets above.

Test and live keys, prices, customers, subscriptions, Connect accounts, and webhook secrets are separate Stripe resources. Do not mix them.

## Catalog sync

1. Set the desired test or live `STRIPE_SECRET_KEY` in the deployment secret manager (the Cloudflare Worker secrets used by Alchemy).
2. Apply the database migrations through the latest migration.
3. Sign in as the configured admin and open `/admin/catalog`.
4. Review local product prices and intervals.
5. Click **Sync**.
6. If new webhook endpoints were created, copy the one-time secrets from the warning panel into the matching Worker secrets and redeploy.
7. Click **Sync** again to confirm the endpoints show as enabled.

When the API origin changes, Stripe endpoint lookup is by exact URL. The sync creates new endpoints with new signing secrets; install those secrets and redeploy before expecting webhook verification to pass.

Sync is safe to repeat. Products are identified by stable metadata and prices by stable lookup keys plus currency, interval, and amount. Stripe prices are not mutated when an amount changes; a new price is created and selected.

## Webhooks

The sync operation manages these fixed URLs on the API origin:

- `https://api.callcastlecare.com/api/v1/webhooks/stripe/billing`
- `https://api.callcastlecare.com/api/v1/webhooks/stripe/commerce`
- `https://api.callcastlecare.com/api/v1/webhooks/stripe/connect`

The handlers verify the raw request body with the endpoint-specific signing secret before parsing it. Event IDs are stored uniquely and failed events can be retried safely.

Billing events update local service subscriptions. `invoice.paid` creates the service orders for the paid period. `invoice.payment_failed` marks the local subscription `past_due`. One-time checkout fulfillment remains driven by Checkout webhook events, not the success-page redirect.

## Provider onboarding and payout

After the $50 Express Checkout completes, the provider is placed in the holding state for email verification and screening review. An admin approves the provider in `/admin/staff`; the Provider Hub then exposes the Connect onboarding link. Connect status is refreshed from Stripe and transfers are blocked until the recipient account is payout-ready.

The platform records a payout per order. Completion is idempotent, records the 60% base earnings plus tip, and creates a transfer only for a ready connected account. Orders whose provider is not yet payout-ready remain pending for operations to retry after onboarding.

## Domain cutover

`BETTER_AUTH_URL` and `VITE_SERVER_URL` follow the Worker URLs automatically, but provider dashboards do not. After switching to `callcastlecare.com` / `api.callcastlecare.com`:

1. Update the Google OAuth authorized redirect URI to `https://api.callcastlecare.com/api/auth/callback/google`.
2. Run **Catalog Sync** in `/admin/catalog`; install any new `STRIPE_BILLING_WEBHOOK_SECRET`, `STRIPE_COMMERCE_WEBHOOK_SECRET`, and `STRIPE_CONNECT_WEBHOOK_SECRET` values and redeploy.
3. Repoint the Resend webhook endpoint to `https://api.callcastlecare.com/api/v1/webhooks/resend` and update `RESEND_WEBHOOK_SECRET` if Resend rotates it.
4. Update `STRIPE_WEBHOOK_BASE_URL` to the API origin if it was pinned to the old host.

## Testing

Use Stripe test mode first. Recommended checks:

```bash
stripe listen --forward-to http://localhost:3000/api/v1/webhooks/stripe/commerce
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger invoice.paid
```

Use the Stripe Dashboard or CLI to verify the Checkout Session mode, recurring Price ID, local checkout ID metadata, subscription ID, webhook delivery, and Connect transfer. Never fulfill from a browser success redirect alone.

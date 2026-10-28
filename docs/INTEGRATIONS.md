# Integrations

Every external service the platform depends on, what it is used for, which environment variables configure it, and what must be set up outside the codebase. Variable names come from `.env.local.example` and from `process.env` usage in `src/`. Never commit values.

**Account owner, login, and billing contact are not recorded in the repository.** The "Owner / login" column is deliberately blank for the current owner to fill in before handoff. Do not rely on the author's memory for these.

Legend: **Required** = the app is broken or a core feature is off without it. **Optional** = the feature turns itself off cleanly when unset.

## Summary

| Service | Purpose | Required? | Owner / login | Webhook or callback to configure |
|---|---|---|---|---|
| Supabase (PROD + TEST) | DB, auth, storage, realtime, edge function | Required | | Postgres settings for approval emails |
| Vercel | Hosting, cron, builds | Required | | Cron needs `CRON_SECRET` |
| Stripe | Plan billing, add-ons, seat overage, per-org card payments (Connect), deposits | Required for billing and card payments | | 3 webhook endpoints (below) |
| Resend | Transactional and marketing email | Required for email | | Webhook to `/api/webhooks/resend` |
| Twilio | SMS, A2P 10DLC onboarding, subaccounts | Optional (SMS add-on) | | Messaging Service inbound URL; status callback is automatic |
| QuickBooks Online | One-way sync of customers, invoices, payments | Optional | | Redirect URI |
| Google Maps | Maps, geocoding, address validation, route optimization | Required for maps/route features | | API enablement |
| Anthropic | AI features | Optional | | |
| Cloudflare Turnstile | Bot protection on public forms | Optional | | |
| Sentry | Error tracking | Optional | | |
| Samsara | Telematics sync (daily) | Optional | | |
| Zapier | Triggers and actions for customers | Optional | | Hooks managed in-app |
| GitHub | Source, CI, Dependabot, drift check | Required | | `SUPABASE_DB_URL` secret |

## Supabase

- **Variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secret; bypasses RLS).
- **Projects:** PROD and TEST. The PROD project ref appears in `.github/workflows/migration-drift-check.yml` (`mhphatxiqxbscivffejl`). The TEST ref is not recorded in the repo (see [RUNBOOKS.md](RUNBOOKS.md) for how to find it).
- **Edge Function** `send-approval-email`: secrets `RESEND_API_KEY`, `FROM_EMAIL`, `APP_URL` (set with `supabase secrets set`). **This function holds its own Resend key, separate from Vercel's.** Rotating one does not rotate the other.
- **Postgres settings** `app.edge_function_base_url` and `app.service_role_key` must be set per project (see [supabase/DEPLOYMENT.md](../supabase/DEPLOYMENT.md)). The trigger silently skips when they are missing, so a missing setting looks like "approval emails never arrive."
- **Storage:** attachments, invoices, manuals, job photos. Store paths in the DB, never signed URLs. Storage RLS must name every role that needs access (crew uploads were once broken by omitting the `crew` role).

## Vercel

- **Build machine:** the production build needs the **Enhanced** build machine. The Standard 8 GB tier hung for 45 minutes and was killed with SIGKILL.
- **Cron:** 23 entries in `vercel.json`. Each handler requires `Authorization: Bearer $CRON_SECRET`; set `CRON_SECRET` in Vercel.
- **Preview deploys:** `claude/**` branches are disabled; an ignore script skips builds with no relevant changes.
- Keep `next/font/google` call sites to two; duplicates fetch concurrently and get throttled, failing builds with a misleading page name.
- Never test the public site with a Googlebot user agent; Vercel's spoof check adds a ~10 s delay.

## Stripe

- **Plan billing:** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, plan price IDs `STRIPE_PRICE_{STARTER,CMMS,GROWTH,ENTERPRISE}`, add-on price IDs `STRIPE_PRICE_ADDON_{SMS,JOB_PHOTOS,CLIENT_PORTAL,ROUTE_OPTIMIZATION,ADVANCED_REPORTING,API_ACCESS}`, seat overage `STRIPE_PRICE_SEAT_OVERAGE_{STARTER,CMMS,GROWTH,ENTERPRISE}`. A plan or add-on with no price ID shows as "Not configured."
- **Connect (per-org card payments):** `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_CONNECT_WEBHOOK_SECRET`. Each org connects its own Standard account; invoice card payments are direct charges on that account.
- **Legacy:** `STRIPE_CRM_PAYMENTS_WEBHOOK_SECRET` is only for PaymentIntents created before Connect shipped.
- **Test-mode variants** used in code: `STRIPE_SECRET_KEY_TEST`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST`, `STRIPE_CONNECT_WEBHOOK_SECRET_TEST`. Also `STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION`. These four are used in code but are **not** in `.env.local.example`; add them there.
- **Webhook endpoints to register in the Stripe dashboard:**
  1. `/api/billing/webhook`, plan and subscription events.
  2. `/api/crm/payments/connect-webhook`, a Connect-scoped endpoint ("Listen to events on Connected accounts") for `account.updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`.
  3. `/api/crm/payments/webhook`, legacy; remove once no pre-Connect PaymentIntents are in flight.
- **Rules that have bitten before:** the webhook is the only writer of payment results; a refund that breaks the allocation sum makes the next charge debit the card and then fail to record it; the deposit-at-acceptance flow needs a TEST publishable key for the sandbox org.
- A live-vs-test key mismatch between the platform key and a sandbox org's Connect account was an open decision at last notes; confirm the current state.

## Resend (email)

- **Variables:** `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `FROM_EMAIL`, `SUPPORT_INBOX_EMAIL`.
- **Webhook:** point Resend at `/api/webhooks/resend` and subscribe to delivered, opened, clicked, bounced, failed **and `email.complained`**. `complained` opts the client out of marketing email; if the dashboard webhook does not subscribe to it, that protection is dead.
- **Semantics:** `do_not_market` is a marketing preference; `email_bounced_at` marks a dead address and blocks *all* sends.
- **Two keys:** Vercel and the Supabase edge function hold different Resend keys. Match a leaked key prefix to its consumer before rotating.
- The sender domain must be verified in Resend.

## Twilio (SMS)

- **Platform-wide fallback account:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`.
- **ISV parent account (a separate Twilio account on purpose):** `TWILIO_PLATFORM_ACCOUNT_SID`, `TWILIO_PLATFORM_AUTH_TOKEN`, `TWILIO_PRIMARY_CUSTOMER_PROFILE_SID`. Each org's own subaccount is provisioned under it (`lib/twilio/provisioning.ts`). Keeping it separate means a compliance problem on one org cannot affect the fallback account.
- `TWILIO_A2P_MOCK=true` runs onboarding in Twilio's free mock mode for testing the pipeline. `TWILIO_A2P_PROFILE_BUNDLE_SID_TEMPLATE_NOTE` is referenced in code; confirm what it is for before removing.
- **Webhooks:** outbound sends set `StatusCallback` automatically (`/api/webhooks/twilio/status`). The Messaging Service's inbound URL must be set manually in the Twilio Console to `<site>/api/webhooks/twilio/inbound`; nothing works for inbound replies without it. Both routes verify `X-Twilio-Signature` with a hand-rolled HMAC-SHA1 check (`lib/sms/verify-twilio-request.ts`).
- **Consent:** all sends are gated on `clients.sms_opt_in` (TCPA), enforced at both content resolution and send.
- **Legal pages:** `/legal/privacy-policy` and `/legal/sms-terms` are the text approved for the A2P 10DLC campaign and must keep naming "Twins Lawn Service". New SaaS terms live at `/legal/terms`, `/legal/privacy`, `/legal/dpa`.
- Cron: `twilio-status-check` (daily) and `bill-sms-overage` (daily).

## QuickBooks Online

- **Variables:** `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_ENVIRONMENT` (`sandbox` or `production`; the ID/secret pair must match).
- **Setup:** create the app at developer.intuit.com and register the redirect URI `https://<domain>/api/integrations/quickbooks/callback`.
- **Behavior:** one-way sync (customers, invoices, payments, terms, tax, voids, Stripe payments, refunds) on a 15-minute cron plus a reconcile pass. Code in `lib/integrations/quickbooks*.ts`, routes under `/api/integrations/quickbooks/*` and `/api/cron/quickbooks-sync`. Built recently (#343); treat as the least battle-tested integration.

## Google Maps

- **Variables:** `GOOGLE_MAPS_PLATFORM_API_KEY` (platform key, used for route optimization when the org's plan or add-on includes it). Orgs without that fall back to their own key stored in `organizations.customizations` (Settings -> Integrations).
- Address Validation was enabled on the key on 2026-09-19; confirm the full list of enabled APIs in the Google Cloud console. The address check is advisory and must key on the route-level `confirmationLevel`, not `hasUnconfirmedComponents`.

## Anthropic

- **Variable:** `ANTHROPIC_API_KEY`. Used for AI features (SDK `@anthropic-ai/sdk`). Confirm which features and which billing account.

## Other

- **Turnstile:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`. Unset = forms submit with no widget.
- **Sentry:** `NEXT_PUBLIC_SENTRY_DSN`; optional source-map upload via `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. Unset = disabled.
- **Samsara:** daily sync at `/api/integrations/samsara/sync`; confirm credentials storage with the owner (not in `.env.local.example`).
- **Zapier:** customer-facing, handled through API keys and `/api/integrations/zapier/*`; see [zapier-integration.md](zapier-integration.md). The `API_ACCESS` add-on gates API keys.
- **Work-requests webhook:** `WORK_REQUESTS_WEBHOOK_SECRET` secures `/api/public/work-requests`.
- **Other config variables:** `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`.

## Gaps to fix

- Add to `.env.local.example`: `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `FROM_EMAIL`, `SUPPORT_INBOX_EMAIL`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `WORK_REQUESTS_WEBHOOK_SECRET`, and the `_TEST` Stripe variables. They are used in code but undocumented.
- Fill in the owner/login column and store credentials in a team password manager, not in anyone's personal account.

## Key rotation checklist (any secret)

1. Identify every consumer of the key (Vercel env, Supabase edge function secrets, Postgres settings, third-party dashboards).
2. Create the new key, update all consumers, redeploy (Vercel env changes need a redeploy).
3. Revoke the old key only after confirming the new one works.
4. For `SUPABASE_SERVICE_ROLE_KEY`, also update the `app.service_role_key` Postgres setting, or approval emails stop.
5. For webhook signing secrets, update the secret and the dashboard endpoint together; events sent in between will fail verification and be retried by the provider.

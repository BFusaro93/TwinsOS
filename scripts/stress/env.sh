#!/bin/bash
# Source this: it loads the TEST project's env (same form as `npm run dev:test`) and blanks every
# outbound side-effect key so a stress run cannot send email/SMS, report to Sentry, talk to QuickBooks
# or charge a card. lib.js additionally refuses to run unless NEXT_PUBLIC_SUPABASE_URL is the TEST project.
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export $(grep -v '^#' .env.local.test | xargs)
export RESEND_API_KEY="" TWILIO_ACCOUNT_SID="" TWILIO_AUTH_TOKEN="" TWILIO_MESSAGING_SERVICE_SID=""
export NEXT_PUBLIC_SENTRY_DSN="" QUICKBOOKS_CLIENT_ID="" QUICKBOOKS_CLIENT_SECRET=""
export NEXT_PUBLIC_TURNSTILE_SITE_KEY="" TURNSTILE_SECRET_KEY=""
export STRIPE_SECRET_KEY="" STRIPE_SECRET_KEY_TEST="" NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
export NEXT_TELEMETRY_DISABLED=1

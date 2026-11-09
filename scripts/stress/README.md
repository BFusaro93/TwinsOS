# Stress / concurrency sweep (TEST project only)

Drives real logged-in users from several orgs at the app at once and asserts invariants afterwards:
no duplicate numbers, stock never negative, no cross-tenant rows, no double billing, no corrupt visit
state. Built for the 2026-11-08 sweep (findings: see the PR that added it).

**Safety.** `lib.js` throws unless `NEXT_PUBLIC_SUPABASE_URL` is the TEST project, and `env.sh` blanks
the Resend/Twilio/Stripe/QuickBooks/Sentry/Turnstile keys. Never point this at PROD. It creates
clearly labelled `STRESS Org A/B/C` orgs (`is_demo`) with `@stress.invalid` users and leaves them
behind; TEST is disposable, `fixtures.json` (gitignored) holds their generated password.

```bash
scripts/stress/serve.sh build            # production build against TEST, then:
scripts/stress/serve.sh start &          # server on :3100
. scripts/stress/env.sh                  # (or prefix each command with `bash -c '. scripts/stress/env.sh; node ...'`)
node scripts/stress/setup-fixtures.js    # 3 orgs x 7 users (admin x3, manager, technician, purchaser, viewer), signed in
node scripts/stress/s1-numbering.js      # WO/PO/REQ numbers + inserts under mixed-org load
node scripts/stress/s2-inventory.js      # concurrent stock decrements, overdraw, double-receive (seeds parts/POs)
node scripts/stress/s3-isolation.js      # every org-scoped table/view read by every org; cross-org write attacks
node scripts/stress/s3c-rpc.js           # org-parameterised RPCs called with another org's ids, and anonymously
node scripts/stress/s4-http-correctness.js   # cookie sessions through Next: markers, forms races, refresh storm, login limiter
node scripts/stress/s7-invoices.js && node scripts/stress/s7b-tax.js   # two visits of a weekly client completed together
node scripts/stress/s8-receipts.js       # two users receive the same PO line at once
node scripts/stress/s9-forms.js          # public form: RPC shape, identical/different simultaneous submissions
node scripts/stress/s10-cap.js           # 1,200 vendors: unpaged read is capped at 1,000
node scripts/stress/s11-toctou.js        # dispatcher edit vs crew clock-in on the same visit
LEVELS=20,60,120 SECS=20 node scripts/stress/s5-load.js   # mixed multi-org load (pages, API routes, PostgREST)
node scripts/stress/s6-saturation.js     # database-only ceiling (no Next in the path)
TABS=60,120,180 RATES=5,20 node scripts/stress/s12-realtime.js   # Realtime: 12-channel tabs, fan-out, refetch storm, reconnect storm
#   variants vs today's app: FILTER=1 (org-filtered subscriptions)  THROTTLE=3000 (refetch at most once per 3s)
#   VIEW_SHARE=0 (nobody on the list)  WAVE=2 (tabs connecting per second)  SKIP_STORM=1  - read the extra/detail in results.json
```

Results append to `results.json` (gitignored). Expected today: everything passes. `P4` always "passes" by design: it records a documented known limit
(three different messages from one email in the same instant can still create duplicate clients). Scripts that seed data are not idempotent across runs of the same
fixtures (use fresh emails/part numbers, or rerun `setup-fixtures.js`).

Reading the load numbers: the throughput ceiling you see is the TEST database's compute tier, not the
Next server (`s6-saturation.js` measures it separately). Re-run `s5-load.js` against a bigger tier
before drawing capacity conclusions for production.

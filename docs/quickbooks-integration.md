# QuickBooks Online Integration — Support Runbook

Internal reference for answering "why isn't X in QuickBooks?" tickets. The
customer-facing version is the in-app guide at `/settings/support/quickbooks-guide`
(source: `src/components/docs/guides/quickbooks-guide.tsx`).

## What it is

One-way sync, Landscapt → QuickBooks Online (QBO). Nothing is ever read back
into Landscapt. Per-org OAuth2 connection to Intuit; QBO only (not Desktop).
Syncs: clients (as QBO customers), invoices, payments, and later changes
(invoice edits, voids, refunds, chargebacks).

**Not a backfill.** Only records created after the org connected
(`integrations.created_at` for provider `quickbooks`) are ever pushed.

## Where things live

| Thing | Location |
|---|---|
| Core logic | `src/lib/integrations/quickbooks.ts` |
| OAuth routes | `src/app/api/integrations/quickbooks/{connect,callback,disconnect,status,sync-status}` |
| Per-record push routes | `src/app/api/crm/invoices/[id]/quickbooks-sync`, `payments/[id]/quickbooks-sync`, `clients/[clientId]/quickbooks-sync` |
| Safety-net cron | `src/app/api/cron/quickbooks-sync` (every 15 min, `CRON_SECRET` bearer) |
| Client-side triggers | `src/lib/integrations/quickbooks-client.ts`, `src/lib/hooks/use-invoices.ts` |
| Settings UI | `src/components/settings/LandscaptSettingsTabs.tsx` (Integrations card + Accounting > Sync Status) |
| Per-record state | `crm_invoices.qbo_invoice_id / qbo_sync_error / qbo_sync_attempted_at`, `crm_payment_allocations.qbo_payment_id / qbo_sync_error / qbo_sync_attempted_at`, `clients.qbo_customer_id`, `crm_services.qbo_item_id` |

## When each push fires

- **Send / print / mark Sent** (draft → issued): immediate create.
- **Edit or void a synced invoice**: update/void, debounced ~1.5 s client-side.
  `?onlyIfSynced=1` ensures an edit never *creates* an invoice.
- **Payment recorded** (manual, Stripe webhook, autopay, portal): immediate,
  invoice pushed first if it isn't in QBO yet. One QBO Payment per
  `crm_payment_allocations` row.
- **AR write-off** (payment method "AR Write-off"): pushed as a QBO **credit memo**
  applied to the invoice by a zero-total linking Payment — never as a cash Payment.
  The allocation's `qbo_payment_id` is stored as `cm:<creditMemoId>:<applyingPaymentId>`;
  a refund/removal voids the linking Payment, then the credit memo.
- **Credit application** (`is_credit` payments): NOT pushed. They apply a prepayment/
  credit whose original payment is already in QBO, so pushing again would double count.
  The reconcile cron skips them.
- Every QBO create carries a `requestid` (the allocation id), so a Stripe-webhook push
  racing a manual/cron push yields one QBO transaction.
- **Refund / chargeback**: QBO payment voided (full) or reduced (partial).
  The allocation row — and its `qbo_payment_id` — is deleted by
  `refund_payment()` on a full refund, so links are snapshotted first.
- **Cron (every 15 min)**: creates issued invoices never pushed, updates/voids
  invoices changed since last sync (changed = `updated_at` > `qbo_sync_attempted_at` + 60 s),
  pushes payments whose invoice is now in QBO. Skips anything updated in the
  last 10 minutes (avoids racing the immediate triggers); retries failures at
  most hourly.

## Mapping rules

- **Customers:** exact `DisplayName` match (inactive customers included)
  auto-links — unless another live client already holds that
  `qbo_customer_id`, in which case a new customer "<Name> (acct #<account
  number>)" is created (`ref <8 hex>` without an account number). An inactive
  exact match raises `QboInactiveCustomerError` (fix in QBO). Zero matches
  creates a customer, retrying under the disambiguated name on 6240. Fuzzy-only
  matches (even one) need a human to choose; "create new" uses the same
  fallback. One client per customer is enforced by the partial unique index
  `clients_org_qbo_customer_unique`. Every client is a top-level customer (no
  parent/child sub-customers).
- **After Merge Clients:** an invoice already in QBO keeps its own
  `CustomerRef` on update, and a payment uses its QBO invoice's `CustomerRef`
  (QBO rejects re-parenting a paid invoice / a payment for another customer's
  invoice).
- **Lines:** a line whose name matches a `crm_services` row (case-insensitive)
  uses that service's own QBO item; anything else uses the shared "Services" item.
- **Terms:** matched to a QBO Term by days-to-due (created as `Net N` /
  `Due on receipt` if missing). Due date falls back to invoice date + terms.
- **Discount:** one discount line. **Invoice number:** sent as `DocNumber`.
- **Tax:** QBO "Automated Sales Tax" ignores a hand-set total. The push finds
  or creates a tax code named `Landscapt <rate>%` and flags lines TAX/NON, and
  QBO computes the tax. Every create/update compares QBO's total with ours.
- **Payment reference:** `PaymentRefNum`, truncated to 21 characters.

## Diagnosing a ticket

Start at **Settings > Accounting > Sync Status** (needs QB Reconciliation; Retry
needs QuickBooks Resync). Or check `qbo_sync_error` on the invoice/allocation.

| Message / symptom | Cause | Fix |
|---|---|---|
| "Client match is ambiguous — resolve it from the client's QuickBooks section." | Only similar customer names exist in QBO | Client > QuickBooks section > Sync to QuickBooks, pick one or "create new", then Retry |
| "This client's QuickBooks customer is inactive in QuickBooks…" | Exact-name customer exists but is inactive in QBO | Reactivate it in QBO, or link the client to another customer; Retry. (Not in the cron's skip list, so it retries each run until fixed.) |
| "QuickBooks totals $X but this invoice is $Y — usually sales tax…" | QBO computed different tax (wrong tax code/agency, or QBO company not using the same rate) | Fix tax setup in QBO or the invoice rate; Retry. The invoice **was** created — this is a warning, not a failure |
| "This invoice was voided in QuickBooks and can't be reopened there" | Voided directly in QBO, then reopened/edited here | Create a new Landscapt invoice; cannot be undone |
| "This payment's invoice hasn't been pushed to QuickBooks yet." | Payment synced before its invoice | Retry the invoice first (or wait for the cron) |
| Stale object / SyncToken (5010) | QBO record edited elsewhere mid-push | Handled automatically with one retry; if it persists, Retry manually |
| Token / auth errors, "connection expired" | Refresh token revoked or expired (~100 days idle) | Admin: Disconnect, then Connect again to the **same** company |
| Nothing at all for an old invoice | Created before the org connected | By design — no backfill |
| Draft not in QBO | Drafts never sync | Send/print it |
| "Coming soon" on the card | `QUICKBOOKS_CLIENT_ID/SECRET` not set in that deployment | See environment below |

Also check: the invoice isn't in a status that skips sync (`draft`); the org
still has a `quickbooks` row in `integrations`; `CRON_SECRET` is set (the cron
returns 401 otherwise).

## Known limits (tell the customer plainly)

- No backfill; no two-way sync; QBO Online only.
- Credit applications (they re-use a payment already in QBO), prepayments/credits with no invoice allocation, and edits to an existing
  payment's allocations, do not sync.
- **Disconnect deletes the `integrations` row but keeps the per-record QBO
  ids.** Reconnecting to the same company is fine (but the "after connect"
  cut-off restarts, so invoices created while disconnected are not sent).
  Reconnecting to a **different** company leaves stale `qbo_customer_id` /
  `qbo_invoice_id` values that fail; needs manual cleanup by engineering.
- An un-void in Landscapt cannot reopen a voided QBO invoice.
- Per-service income accounts, classes and locations are not mapped.

## Environment

- `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_ENVIRONMENT`
  (`sandbox` | `production`) — **per deployment, not per org.** Sandbox tokens do
  not work against production keys; every org reconnects when the deployment
  flips. Watch for stray `<` `>` copied around the values.
- Redirect URI registered at Intuit must be exactly
  `https://<domain>/api/integrations/quickbooks/callback`.
- `CRON_SECRET` for `/api/cron/quickbooks-sync` (`vercel.json`).
- Intuit requires its app assessment (privacy/terms/EULA URLs) before
  production keys and production redirect URIs unlock.

## Escalate to engineering when

- Customer switched or wants to switch QBO companies.
- Errors persist after Retry and a Disconnect/Reconnect.
- QBO and Landscapt totals differ and the tax setup looks correct.
- Duplicates appear in QBO (should be impossible — `qbo_invoice_id` makes pushes
  idempotent — so capture the invoice number and both QBO ids).

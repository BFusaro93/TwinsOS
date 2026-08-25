# TASKS

## Deferred — waiting on Landscapt dev/prod split
Blocked until you branch into a true dev/prod scenario (currently using Job Photos, Damage Cases, and Projects live with no real customers yet).

- [ ] Job Photos: implement the "matched by name" client auto-linking that the UI already claims to do (currently just descriptive text, no code) — [JobPhotosPage.tsx:345-361](src/components/photo-docs/JobPhotosPage.tsx:345), [photo.types.ts:37](src/modules/photo-docs/types/photo.types.ts:37)
- [ ] Decide whether to add a manual "Link to Client" picker on Damage Cases (currently 100% automatic exact-match via [use-damage-cases.ts:94-111](src/lib/hooks/use-damage-cases.ts:94), no manual override UI)
- [ ] Consider adding a `job_photo_created` (or similar) automation trigger type once Job Photos client-linking is real — no such trigger exists yet in [crm-automations.ts](src/types/crm-automations.ts)

## Deferred — automation condition fields with no backing data model
- [ ] `custom_field` condition — schemaless by design (any org-defined custom field on a client). Needs its own field-picker (which custom field?) + per-type value input (text/number/date/boolean), plus wiring in [condition-fields.ts](src/lib/automations/condition-fields.ts) and the evaluator in [sequence-enrollment.ts](src/lib/automations/sequence-enrollment.ts). Currently silently never matches.
- [ ] `opt_in_texts` condition — there's no SMS/text opt-in column anywhere in the schema (checked `clients` table columns exhaustively). Needs the actual texting-opt-in feature built first; the condition field is purely decorative until then. Currently silently never matches.

## Deferred — automation action event types with no runtime execution
Found via live-fire testing in the it@twinslawnservice.com sandbox: several event types the sequence builder lets you add ([AutomationBuilder.tsx](src/components/crm/automations/AutomationBuilder.tsx)) were never wired into the actual processor in [route.ts](src/app/api/automations/run/route.ts) — a configured step would just sit there forever, logged as `unsupported_event_type`. `tags` and `note` are now fixed (tags applies add_tags/remove_tags to `client_tags`; note is a builder-only annotation with no runtime effect, so it just advances). Two remain:

- [ ] `if_branch` — [IfBranchEventDialog.tsx:58](src/components/crm/automations/IfBranchEventDialog.tsx:58) tells the user "events nested under this IF block only run when ALL conditions are met... clients skip the IF block and continue" — but `CRMSequenceEvent` ([crm-automations.ts:309](src/types/crm-automations.ts:309)) has no parent/block field at all, just a flat `position` order. There's no way to know which subsequent events are "inside" the block vs. after it. Needs either a block-start/block-end position pair or a `parentEventId` column before the processor can implement real skip-the-block semantics — implementing against the current schema would just guess.
- [ ] `text_message` — [TextEventDialog.tsx](src/components/crm/automations/TextEventDialog.tsx) has a full config UI (message, recipient selection, 160-char limit) but there is no SMS provider integration anywhere in the codebase (no Twilio or equivalent). Needs the actual texting infrastructure built first, same as the `opt_in_texts` condition field above.

## Deferred — nav placement: Photos into Landscapt
Decided 2026-08-18: Projects stays under Equipt (it's PO/procurement cost tracking — PO line items and materials assign to a Project, tightly coupled to that module). Photos (photo-docs module) is conceptually Landscapt's, not Equipt's, and should eventually move — but nav/sidebar links stay exactly where they are today until a full nav reorg happens. Do not move the Photos link into the Landscapt nav menu until explicitly asked.

- [ ] Move the Photos nav entry into the Landscapt sidebar/menu (routes, links, any Equipt-specific gating) once a full nav reorg is greenlit.

## Backlog — Home Works pricing-page feature parity
Identified 2026-08-19 comparing TwinsOS's plan/feature matrix against homeworks.com/pricing. Not started; no design decisions made yet on scope/UI. Explicitly declined (do not build): card-on-file requirement, pay-in-full as a distinct enforced option, automated/scheduled invoicing, and expense tracking beyond the existing PO/vendor cost flow.

- [ ] Bulk pricing update — raise/lower Products catalog prices in bulk, flat-rate or percentage-based
- [ ] Two-way text messaging — inbound SMS replies land in the client's activity timeline/tickets, not just outbound sends
- [ ] Upsells — a curated list of add-on services crews can offer/sell from the field
- [ ] Offline mode — crew mobile app keeps working (queues actions) when cell coverage drops
- [ ] Saved routes — persist and reuse a dispatch route instead of re-optimizing from scratch each time
- [ ] Unscheduled work — a dedicated queue of accepted-estimate jobs not yet scheduled, for bulk scheduling
- [ ] Multi-location support — one login spanning multiple org/business accounts (current model is strictly one org per user)

## Resolved — public API / MCP: constrained estimate creation
Decided 2026-08-24, built 2026-08-25. `estimates` was read-only in both `/api/v1/estimates` and the MCP tool set (see git history for the original reasoning). `POST /api/v1/estimates` (and the `create_estimates` MCP tool) now exist, but deliberately narrow: caller picks `clientId` + `serviceId` (from the org's own `crm_services` catalog) + `qty` — nothing else. Every dollar figure (rate, cost, margin, subtotal, tax, total) is computed by the exact same `computeLineItem()`/`recalcEstimateTotals()` functions the app's own `NewEstimateDialog`/`EstimateLineItemsGrid` use ([estimate-calc.ts](src/lib/estimate-calc.ts)), run server-side with the org's real service catalog and overhead/labor-rate settings — never taken from the request body. Verified against a live Supabase branch: inserted rows satisfy every schema constraint, and the rollup formula was hand-checked against `computeLineItem`'s real output.

Still out of scope, not built: multi-line estimates in one call, discounts, tiers, milestones, and payment plans — those still require the app itself.

## In progress — QuickBooks one-way sync
Decided 2026-08-25, scoped in phases. Phase 1 (OAuth2 connection, `src/lib/integrations/quickbooks.ts` + `/api/integrations/quickbooks/*`) and Phase 2 (client ↔ QBO customer matching, `/api/crm/clients/[clientId]/quickbooks-sync`) are built. Matching policy, decided with the user: an exact `DisplayName` match auto-links (safe — QuickBooks enforces DisplayName uniqueness, so an exact match can only ever be 0 or 1 row); zero matches at all auto-creates a new QBO customer; any fuzzy-only match (even a single one) is surfaced for a human to pick rather than guessed. Every client gets its own top-level QBO customer — no sub-customer hierarchy for commercial parent/child clients (deliberately skipped, not in real use yet). No periodic re-verification that a link is still valid — a broken link surfaces the next time a sync against it fails.

- [ ] Phase 3: push invoices/payments to the matched QBO customer, storing the returned QBO ID back on `crm_invoices`/`crm_payments` for idempotency.
- [ ] Phase 4: reconciliation + error surface UI — a "Sync Status" panel (`integrations.last_sync_status`/`last_sync_at` already exist) showing failed pushes with the reason, plus manual retry. No auto-retry-forever.
- [ ] Not yet tested against a real Intuit sandbox app — no sandbox credentials available in this dev environment. Needs verification with real QuickBooks credentials before this ships to any customer.

## Cleanup — dead ConditionField union members
- [ ] `client_type`, `client_status`, `job_type` (as a condition field), `job_status`, `tag` (as a condition field), `property_city`, `revenue_ytd`, `last_job_date` in [crm-automations.ts](src/types/crm-automations.ts)'s `ConditionField` type are leftover "Legacy" entries — not in the `CONDITION_GROUPS` picklist (unselectable in the UI) and not referenced anywhere in the evaluator. Harmless but dead; safe to delete next time this file is touched.

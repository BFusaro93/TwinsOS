# TASKS

## Deferred — waiting on Landscapt dev/prod split
Blocked until you branch into a true dev/prod scenario (currently using Job Photos, Damage Cases, and Projects live with no real customers yet).

- [ ] Job Photos: implement the "matched by name" client auto-linking that the UI already claims to do (currently just descriptive text, no code) — [JobPhotosPage.tsx:345-361](src/components/photo-docs/JobPhotosPage.tsx:345), [photo.types.ts:37](src/modules/photo-docs/types/photo.types.ts:37)
- [ ] Decide whether to add a manual "Link to Client" picker on Damage Cases (currently 100% automatic exact-match via [use-damage-cases.ts:94-111](src/lib/hooks/use-damage-cases.ts:94), no manual override UI)
- [ ] Consider adding a `job_photo_created` (or similar) automation trigger type once Job Photos client-linking is real — no such trigger exists yet in [crm-automations.ts](src/types/crm-automations.ts)

## Deferred — automation condition fields with no backing data model
- [ ] `custom_field` condition — schemaless by design (any org-defined custom field on a client). Needs its own field-picker (which custom field?) + per-type value input (text/number/date/boolean), plus wiring in [condition-fields.ts](src/lib/automations/condition-fields.ts) and the evaluator in [sequence-enrollment.ts](src/lib/automations/sequence-enrollment.ts). Currently silently never matches.
- [ ] `opt_in_texts` condition — `clients.sms_opt_in` now exists (built 2026-08-15, see the SMS automation channel below) but this condition field is still only declared in [condition-fields.ts:30](src/lib/automations/condition-fields.ts:30) and the `ConditionField` type — never read by the actual evaluator in [sequence-enrollment.ts](src/lib/automations/sequence-enrollment.ts). Currently silently never matches; wiring it up is now just a data read, no new feature needed.

## Deferred — automation action event types with no runtime execution
Found via live-fire testing in the it@twinslawnservice.com sandbox: several event types the sequence builder lets you add ([AutomationBuilder.tsx](src/components/crm/automations/AutomationBuilder.tsx)) were never wired into the actual processor (originally in `route.ts`, extracted since into [sequence-processor.ts](src/lib/automations/sequence-processor.ts)) — a configured step would just sit there forever, logged as `unsupported_event_type`. `tags` and `note` are now fixed (tags applies add_tags/remove_tags to `client_tags`; note is a builder-only annotation with no runtime effect, so it just advances); `text_message` is now fixed too (see the Resolved entry below). One remains:

- [ ] `if_branch` — [IfBranchEventDialog.tsx:58](src/components/crm/automations/IfBranchEventDialog.tsx:58) tells the user "events nested under this IF block only run when ALL conditions are met... clients skip the IF block and continue" — but `CRMSequenceEvent` ([crm-automations.ts:309](src/types/crm-automations.ts:309)) has no parent/block field at all, just a flat `position` order. There's no way to know which subsequent events are "inside" the block vs. after it. Needs either a block-start/block-end position pair or a `parentEventId` column before the processor can implement real skip-the-block semantics — implementing against the current schema would just guess.

## Resolved — SMS automation channel (Twilio)
Built 2026-08-15 through 2026-08-25 for Twins Lawn Service's own A2P 10DLC campaign. `text_message` sequence steps now actually send via Twilio ([sms/send.ts](src/lib/sms/send.ts), [sequence-sms.ts](src/lib/automations/sequence-sms.ts)), gated on `clients.sms_opt_in` (TCPA consent, default false — enforced at both the content resolver and the actual send call so no future call site can bypass it) which can be set either through a web form's `sms_optin` field type (auto-detected, no field mapping) or a manual "verbal consent" toggle on the client record. Approval-gated SMS steps share the same `crm_sequence_step_approvals` queue as email, discriminated by a `channel` column. Public form pages (`/forms/[slug]`) and the internal "Fill Out Form" preview dialog both render the consent checkbox identically, including live links to the two `/legal/*` pages.

Known gaps from this work are tracked separately above (the multi-tenant one) and in `opt_in_texts` above (the automation-condition one) rather than here.

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

## Deferred — multi-tenant gaps in the SMS/legal-pages work (single org today)
Built 2026-08-15 through 2026-08-25 for Twins Lawn Service's own Twilio A2P 10DLC campaign — works correctly for one org, but has real gaps before a second licensed org could use it:

- [ ] `/legal/privacy-policy` and `/legal/sms-terms` ([src/app/legal/](src/app/legal/)) hardcode "Twins Lawn Service" as static text — no org lookup at all. These are public pages with no session, so there's no way to know "which org" without something in the URL or domain to key off of. Two options considered: an org-slug URL segment (`/legal/[orgSlug]/privacy-policy`, buildable now) vs. custom-domain-per-org (matches typical multi-tenant SaaS presentation, but needs domain/DNS infra that doesn't exist yet). Holding off until a second org is actually being onboarded.
- [ ] `organizations.twilio_account_sid`/`twilio_messaging_service_sid` ([migration](supabase/migrations/20260815152847_org_scoped_twilio_settings.sql)) exist as per-org override columns, but every org still shares one platform-wide `TWILIO_AUTH_TOKEN` — a real per-tenant Twilio subaccount needs its own auth token too, which is a secret and needs encrypted-at-rest storage (Supabase Vault or equivalent) that hasn't been designed. `sendClientSms()` in [send.ts](src/lib/sms/send.ts) already reads the org-level SID overrides, so this is the one remaining piece before true subaccount isolation.

## Resolved — public API / MCP: constrained estimate creation
Decided 2026-08-24, built 2026-08-25. `estimates` was read-only in both `/api/v1/estimates` and the MCP tool set (see git history for the original reasoning). `POST /api/v1/estimates` (and the `create_estimates` MCP tool) now exist, but deliberately narrow: caller picks `clientId` + `serviceId` (from the org's own `crm_services` catalog) + `qty` — nothing else. Every dollar figure (rate, cost, margin, subtotal, tax, total) is computed by the exact same `computeLineItem()`/`recalcEstimateTotals()` functions the app's own `NewEstimateDialog`/`EstimateLineItemsGrid` use ([estimate-calc.ts](src/lib/estimate-calc.ts)), run server-side with the org's real service catalog and overhead/labor-rate settings — never taken from the request body. Verified against a live Supabase branch: inserted rows satisfy every schema constraint, and the rollup formula was hand-checked against `computeLineItem`'s real output.

Still out of scope, not built: multi-line estimates in one call, discounts, tiers, milestones, and payment plans — those still require the app itself.

## Cleanup — dead ConditionField union members
- [ ] `client_type`, `client_status`, `job_type` (as a condition field), `job_status`, `tag` (as a condition field), `property_city`, `revenue_ytd`, `last_job_date` in [crm-automations.ts](src/types/crm-automations.ts)'s `ConditionField` type are leftover "Legacy" entries — not in the `CONDITION_GROUPS` picklist (unselectable in the UI) and not referenced anywhere in the evaluator. Harmless but dead; safe to delete next time this file is touched.

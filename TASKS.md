# TASKS

## Deferred — waiting on Landscapt dev/prod split
Blocked until you branch into a true dev/prod scenario (currently using Job Photos, Damage Cases, and Projects live with no real customers yet).

- [ ] Job Photos: implement the "matched by name" client auto-linking that the UI already claims to do (currently just descriptive text, no code) — [JobPhotosPage.tsx:345-361](src/components/photo-docs/JobPhotosPage.tsx:345), [photo.types.ts:37](src/modules/photo-docs/types/photo.types.ts:37)
- [ ] Decide whether to add a manual "Link to Client" picker on Damage Cases (currently 100% automatic exact-match via [use-damage-cases.ts:94-111](src/lib/hooks/use-damage-cases.ts:94), no manual override UI)
- [ ] Consider adding a `job_photo_created` (or similar) automation trigger type once Job Photos client-linking is real — no such trigger exists yet in [crm-automations.ts](src/types/crm-automations.ts)

## Deferred — automation condition fields with no backing data model
- [ ] `custom_field` condition — schemaless by design (any org-defined custom field on a client). Needs its own field-picker (which custom field?) + per-type value input (text/number/date/boolean), plus wiring in [condition-fields.ts](src/lib/automations/condition-fields.ts) and the evaluator in [sequence-enrollment.ts](src/lib/automations/sequence-enrollment.ts). Currently silently never matches.
- [ ] `opt_in_texts` condition — there's no SMS/text opt-in column anywhere in the schema (checked `clients` table columns exhaustively). Needs the actual texting-opt-in feature built first; the condition field is purely decorative until then. Currently silently never matches.

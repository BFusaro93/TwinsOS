# TASKS

## Deferred — waiting on Landscapt dev/prod split
Blocked until you branch into a true dev/prod scenario (currently using Job Photos, Damage Cases, and Projects live with no real customers yet).

- [ ] Job Photos: implement the "matched by name" client auto-linking that the UI already claims to do (currently just descriptive text, no code) — [JobPhotosPage.tsx:345-361](src/components/photo-docs/JobPhotosPage.tsx:345), [photo.types.ts:37](src/modules/photo-docs/types/photo.types.ts:37)
- [ ] Decide whether to add a manual "Link to Client" picker on Damage Cases (currently 100% automatic exact-match via [use-damage-cases.ts:94-111](src/lib/hooks/use-damage-cases.ts:94), no manual override UI)
- [ ] Consider adding a `job_photo_created` (or similar) automation trigger type once Job Photos client-linking is real — no such trigger exists yet in [crm-automations.ts](src/types/crm-automations.ts)

## Open bug
- [ ] No "Add new Job Photo" option from a Client's detail panel Photos tab (Projects tab fixed — now has a "New Project" button pre-scoped to the client)

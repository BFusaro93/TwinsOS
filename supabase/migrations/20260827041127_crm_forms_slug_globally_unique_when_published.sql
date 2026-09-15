-- crm_forms.slug is only unique per-org (crm_forms_org_id_slug_key), but the
-- public form portal at /forms/[slug] and its API routes
-- (/api/public/forms/[slug], /api/public/forms/[slug]/submit) resolve the
-- form — and therefore the org a submission belongs to — by slug ALONE,
-- with no org in the URL. Two different orgs can independently create a
-- form named e.g. "Contact Us" (slug "contact-us"); if both are published,
-- crm_forms's .single() lookup in those routes becomes ambiguous (2 rows
-- for the same slug+status='published'), and the public form 404s for
-- legitimate visitors of BOTH orgs.
--
-- A draft-only collision is harmless (never reachable publicly), so this is
-- a partial unique index that only fires once a slug is actually published
-- — the point at which the ambiguity becomes real.
create unique index if not exists crm_forms_slug_published_key
  on crm_forms (slug)
  where status = 'published' and deleted_at is null;

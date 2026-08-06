-- crm_form_responses_public_insert (20260621000001_crm_forms.sql) was
-- `FOR INSERT WITH CHECK (true)` — completely unscoped. The app's own submit
-- route (src/app/api/public/forms/[slug]/submit/route.ts) always resolves
-- org_id/form_id/related_client_id/related_ticket_id server-side from a
-- published form looked up by slug, so the app itself never misuses this.
-- But the anon key is public in every client bundle, and this RLS policy is
-- the only gate on a direct PostgREST insert — anyone holding the anon key
-- could POST a crm_form_responses row with ANY org_id/form_id/related_*_id,
-- polluting another org's Form Responses inbox and fabricating a link to a
-- real client/ticket in that org, entirely bypassing the slug/status lookup.
--
-- Scope it to require: the form_id/org_id pair actually is a published, not
-- deleted form, and any related_client_id/related_ticket_id (if provided)
-- belongs to that same org — matching exactly what the legitimate submit
-- route already guarantees, so no behavior changes for real submissions.

DROP POLICY IF EXISTS crm_form_responses_public_insert ON crm_form_responses;
CREATE POLICY crm_form_responses_public_insert ON crm_form_responses
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_forms f
      WHERE f.id = crm_form_responses.form_id
        AND f.org_id = crm_form_responses.org_id
        AND f.status = 'published'
        AND f.deleted_at IS NULL
    )
    AND (
      related_client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM clients c
        WHERE c.id = crm_form_responses.related_client_id
          AND c.org_id = crm_form_responses.org_id
      )
    )
    AND (
      related_ticket_id IS NULL
      OR EXISTS (
        SELECT 1 FROM crm_tickets t
        WHERE t.id = crm_form_responses.related_ticket_id
          AND t.org_id = crm_form_responses.org_id
      )
    )
  );

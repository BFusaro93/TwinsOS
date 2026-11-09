-- Security audit 2026-11-08: pin search_path on the five remaining functions
-- the Supabase linter flags as "role mutable search_path"
-- (function_search_path_mutable). All five are SECURITY DEFINER trigger
-- functions; without a fixed search_path a role that can create objects in a
-- schema earlier on its own search_path could shadow the tables/functions the
-- body references. Nothing else changes — same bodies, same triggers.
ALTER FUNCTION public.crm_jobs_clear_coords_on_address_change() SET search_path = public;
ALTER FUNCTION public.clients_clear_coords_on_address_change() SET search_path = public;
ALTER FUNCTION public.client_properties_clear_coords_on_address_change() SET search_path = public;
ALTER FUNCTION public.trg_chemical_application_inventory() SET search_path = public;
ALTER FUNCTION public.trg_chemical_visit_inventory() SET search_path = public;

-- ── Self-signup founder binding ──────────────────────────────────────────────
-- /api/orgs/create is unauthenticated and, for a retry, hands back the id of a
-- member-less org created in the last 24h for the SAME contact email. The
-- founder path below then made ANY signup carrying that org_id the org's
-- admin while it was <1 day old with no confirmed member. The practical window
-- was tiny (the victim's own profile row lands on signUp, before confirmation),
-- but nothing bound the founder to the address the org was created for. Now,
-- when the org recorded a contact address, the founder's sign-in email must
-- match it. Orgs created without one (older rows) keep the previous rule.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
BEGIN
  IF (NEW.raw_user_meta_data ->> 'portal') = 'true' THEN
    RETURN NEW;
  END IF;

  IF (NEW.raw_user_meta_data ->> 'org_id') IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_org_id := (NEW.raw_user_meta_data ->> 'org_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NEW;
  END;

  IF NEW.invited_at IS NOT NULL THEN
    -- Service-role invite: metadata was written by /api/users/invite.
    INSERT INTO public.profiles (id, org_id, name, email, role, status)
    VALUES (
      NEW.id,
      v_org_id,
      COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data ->> 'role', 'viewer'),
      'active'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

  -- Self-signup: only the founder of an org /api/orgs/create just made, and
  -- only from the address that org was created for (when one was recorded).
  IF EXISTS (
       SELECT 1 FROM public.organizations o
       WHERE o.id = v_org_id
         AND o.created_at > now() - interval '1 day'
         AND (
           o.customizations ->> 'reply_to_email' IS NULL
           OR lower(o.customizations ->> 'reply_to_email') = lower(NEW.email)
         )
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE p.org_id = v_org_id AND u.email_confirmed_at IS NOT NULL
     )
  THEN
    INSERT INTO public.profiles (id, org_id, name, email, role, status)
    VALUES (
      NEW.id,
      v_org_id,
      COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
      NEW.email,
      'admin',
      'active'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── Public forms: stop exposing whole rows to anon ───────────────────────────
-- crm_forms_public_read / crm_form_fields_public_read / crm_form_rules_public_read
-- let the `public` role (anon AND every other tenant's signed-in users) SELECT
-- the full row of every published form via PostgREST — including
-- crm_forms.settings (staff notification recipients, fromEmail, tagsOnSubmit)
-- and org_id. /api/public/forms/[slug] whitelisted the settings keys it
-- returned, but nothing stopped `GET /rest/v1/crm_forms?select=*` with the
-- publishable anon key. The public renderer now goes through one SECURITY
-- DEFINER function that returns exactly the shape the page needs, and the
-- table policies are dropped (the submit route already reads with the
-- service role). Staff keep their org-scoped policies.
CREATE OR REPLACE FUNCTION public.get_public_form(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', f.id,
    'name', f.name,
    'slug', f.slug,
    'description', f.description,
    'settings', COALESCE((
      SELECT jsonb_object_agg(e.key, e.value)
      FROM jsonb_each(COALESCE(f.settings, '{}'::jsonb)) AS e(key, value)
      WHERE e.key IN ('confirmationType', 'confirmationUrl', 'confirmationMessage', 'successMessage', 'submitLabel')
    ), '{}'::jsonb),
    'fields', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'field_type', x.field_type, 'label', x.label, 'placeholder', x.placeholder,
        'description', x.description, 'required', x.required, 'sort_order', x.sort_order,
        'page_number', x.page_number, 'options', x.options, 'config', x.config
      ) ORDER BY x.sort_order)
      FROM public.crm_form_fields x
      WHERE x.form_id = f.id AND x.deleted_at IS NULL
    ), '[]'::jsonb),
    'rules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'source_field_id', r.source_field_id, 'operator', r.operator, 'operand', r.operand,
        'action', r.action, 'action_value', r.action_value, 'sort_order', r.sort_order
      ) ORDER BY r.sort_order)
      FROM public.crm_form_rules r
      WHERE r.form_id = f.id AND r.deleted_at IS NULL
    ), '[]'::jsonb)
  )
  FROM public.crm_forms f
  WHERE f.slug = p_slug AND f.status = 'published' AND f.deleted_at IS NULL
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_form(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_form(text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS crm_forms_public_read ON public.crm_forms;
DROP POLICY IF EXISTS crm_form_fields_public_read ON public.crm_form_fields;
DROP POLICY IF EXISTS crm_form_rules_public_read ON public.crm_form_rules;

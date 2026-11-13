-- get_public_form: only the rules the public form needs (round 13, security / low).
--
-- The anonymous form endpoint returned every logic rule, including the
-- add_tag / remove_tag rules — exposing the org's internal client tags and the
-- answers that trigger them to anyone with the form link. Tag rules run
-- server-side on submit (submit-form-response), so the browser only needs the
-- page-jump and show/hide rules. Otherwise identical to the live definition.
--
-- PROD: apply BEFORE or AFTER the deploy (the public renderer ignores tag rules).

create or replace function public.get_public_form(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
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
        AND r.action IN ('jump_to_page', 'show_field', 'hide_field')
    ), '[]'::jsonb)
  )
  FROM public.crm_forms f
  WHERE f.slug = p_slug AND f.status = 'published' AND f.deleted_at IS NULL
  LIMIT 1;
$function$;

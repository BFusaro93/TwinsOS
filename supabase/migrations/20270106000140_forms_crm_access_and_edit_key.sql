-- Round 14 (equipt F2): lead forms and their submissions need Landscapt
-- access, and writes need the Forms permission keys.
--
-- crm_forms / crm_form_fields / crm_form_rules / crm_form_responses only had
-- "org_id = my_org_id()" FOR ALL policies (kept out of the wide
-- require_crm_access pass because public forms are anonymous), so Equipt-only
-- users, viewers and the shared crew login could edit forms and edit or
-- hard-delete submissions (names, emails, answers).
--
-- New RESTRICTIVE policies, TO authenticated only (anon and the service role
-- are untouched — the public form page and /api/public/forms/* use the
-- service role, so anonymous submissions keep working):
--   all 4 tables, every command: has_crm_access() and my_role() <> 'crew'
--   crm_forms / _fields / _rules INSERT, UPDATE, DELETE: forms_edit
--   crm_form_responses INSERT, UPDATE: forms_view_submit or forms_edit
--     (the internal Test Submit and mark-read are view-level actions, as in
--     /api/crm/forms/*); changing status or deleted_at needs forms_edit
--     (column trigger below, direct user writes only)
--   crm_form_responses DELETE: never (soft delete via deleted_at only)
-- The Forms keys already exist in crm_roles (forms_view_submit "View/Submit
-- Forms", forms_edit "Edit Forms") and the UI and routes already gate on them,
-- so no role backfill is needed.
--
-- Deploy order: BEFORE or AFTER the code deploy (no code change needed).

do $$
declare
  t text;
begin
  foreach t in array array['crm_forms','crm_form_fields','crm_form_rules','crm_form_responses'] loop
    execute format('drop policy if exists forms_require_crm_access on public.%I', t);
    execute format($p$create policy forms_require_crm_access on public.%I
      as restrictive for all to authenticated
      using ((select public.has_crm_access()) and coalesce((select public.my_role()), '') <> 'crew')
      with check ((select public.has_crm_access()) and coalesce((select public.my_role()), '') <> 'crew')$p$, t);
  end loop;

  foreach t in array array['crm_forms','crm_form_fields','crm_form_rules'] loop
    execute format('drop policy if exists forms_edit_key_ins on public.%I', t);
    execute format('drop policy if exists forms_edit_key_upd on public.%I', t);
    execute format('drop policy if exists forms_edit_key_del on public.%I', t);
    execute format($p$create policy forms_edit_key_ins on public.%I
      as restrictive for insert to authenticated
      with check ((select public.has_settings_permission('forms_edit')))$p$, t);
    execute format($p$create policy forms_edit_key_upd on public.%I
      as restrictive for update to authenticated
      using ((select public.has_settings_permission('forms_edit')))
      with check ((select public.has_settings_permission('forms_edit')))$p$, t);
    execute format($p$create policy forms_edit_key_del on public.%I
      as restrictive for delete to authenticated
      using ((select public.has_settings_permission('forms_edit')))$p$, t);
  end loop;
end $$;

drop policy if exists form_responses_key_ins on public.crm_form_responses;
drop policy if exists form_responses_key_upd on public.crm_form_responses;
drop policy if exists form_responses_no_hard_delete on public.crm_form_responses;

create policy form_responses_key_ins on public.crm_form_responses
  as restrictive for insert to authenticated
  with check ((select public.has_settings_permission('forms_view_submit'))
              or (select public.has_settings_permission('forms_edit')));

create policy form_responses_key_upd on public.crm_form_responses
  as restrictive for update to authenticated
  using ((select public.has_settings_permission('forms_view_submit'))
         or (select public.has_settings_permission('forms_edit')))
  with check ((select public.has_settings_permission('forms_view_submit'))
              or (select public.has_settings_permission('forms_edit')));

create policy form_responses_no_hard_delete on public.crm_form_responses
  as restrictive for delete to authenticated
  using (false);

-- Status / delete resolve a submission for everyone: Edit Forms only.
-- SECURITY INVOKER on purpose: _crm_direct_user_write() reads current_user,
-- which a definer function would replace with its owner.
create or replace function public.guard_form_response_edit_columns()
 returns trigger
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
begin
  if not public._crm_direct_user_write() then
    return new;
  end if;
  if (new.status is distinct from old.status or new.deleted_at is distinct from old.deleted_at)
     and not public.has_settings_permission('forms_edit') then
    raise exception 'You need the Edit Forms permission to change a submission''s status or delete it.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_form_response_edit_columns() from public, anon, authenticated;

drop trigger if exists trg_guard_form_response_edit_columns on public.crm_form_responses;
create trigger trg_guard_form_response_edit_columns
  before update on public.crm_form_responses
  for each row execute function public.guard_form_response_edit_columns();

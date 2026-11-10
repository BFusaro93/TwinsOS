-- Scheduled reports run as their creator (created_by) with the service role.
-- A deactivated creator's schedules kept emailing company data:
--   * report_user_has_permission() never looked at profiles.status, so an
--     inactive ADMIN still passed every check (admins short-circuit to true);
--   * prebuilt-report schedules never re-checked the creator at all.
--
-- Owner decision: a deactivated creator's schedules are PAUSED (reason shown
-- in the Scheduled tab), the creator's own address is dropped from their
-- recipients, and an admin can take a schedule over and resume it.
--
-- 1. last_run_status gains 'paused' (the Scheduled tab shows the reason).
-- 2. report_user_has_permission() is false for an inactive profile.
-- 3. Deactivating a profile pauses that person's live schedules at once and
--    removes their own email from the recipients of every schedule they made
--    (the cron also pauses any it finds, for rows that predate this trigger).

-- 1 ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.report_schedules DROP CONSTRAINT IF EXISTS report_schedules_last_run_status_check;
ALTER TABLE public.report_schedules
  ADD CONSTRAINT report_schedules_last_run_status_check
  CHECK (last_run_status = ANY (ARRAY['success'::text, 'error'::text, 'paused'::text]));

-- 2 ─────────────────────────────────────────────────────────────────────────
-- Live definition (TEST, 2026-11-08) plus the status check.
CREATE OR REPLACE FUNCTION public.report_user_has_permission(p_user_id uuid, p_key text, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_org uuid;
  v_status text;
  v_permissions jsonb;
begin
  if p_user_id is null then return false; end if;
  select role, org_id, status into v_role, v_org, v_status from public.profiles where id = p_user_id;
  if not found then return false; end if;
  if p_org_id is not null and v_org is distinct from p_org_id then return false; end if;
  -- A deactivated login grants nothing, admin or not.
  if v_status = 'inactive' then return false; end if;
  if v_role = 'admin' then return true; end if;

  select cr.permissions into v_permissions
  from public.crm_employees ce
  join public.crm_roles cr on cr.id = ce.crm_role_id
  where ce.user_id = p_user_id
    and ce.deleted_at is null
    and ce.is_active
    and cr.deleted_at is null
    and cr.is_active;
  if v_permissions is null then return false; end if;
  return coalesce((v_permissions ->> p_key)::boolean, false);
end;
$function$;

REVOKE ALL ON FUNCTION public.report_user_has_permission(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_user_has_permission(uuid, text, uuid) TO service_role;

-- 3 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pause_report_schedules_of_inactive_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'inactive' and old.status is distinct from 'inactive' then
    update public.report_schedules s
       set last_run_status = case when s.enabled then 'paused' else s.last_run_status end,
           last_run_error = case
             when s.enabled then 'Paused: the person who created this schedule was deactivated. An admin can take it over and resume it.'
             else s.last_run_error end,
           enabled = false,
           recipients = case
             when new.email is null then s.recipients
             else coalesce(array(select r from unnest(s.recipients) r where lower(r) <> lower(new.email)), '{}'::text[])
           end,
           updated_at = now()
     where s.created_by = new.id
       and s.org_id = new.org_id
       and s.deleted_at is null;
  end if;
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION public.pause_report_schedules_of_inactive_creator() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_pause_report_schedules ON public.profiles;
CREATE TRIGGER trg_profiles_pause_report_schedules
  AFTER UPDATE OF status ON public.profiles
  FOR EACH ROW
  WHEN (new.status = 'inactive' AND old.status IS DISTINCT FROM 'inactive')
  EXECUTE FUNCTION public.pause_report_schedules_of_inactive_creator();

-- Schedules already owned by a deactivated creator: pause them now.
UPDATE public.report_schedules s
   SET last_run_status = 'paused',
       last_run_error = 'Paused: the person who created this schedule was deactivated. An admin can take it over and resume it.',
       enabled = false,
       recipients = coalesce(array(select r from unnest(s.recipients) r where p.email is null or lower(r) <> lower(p.email)), '{}'::text[]),
       updated_at = now()
  FROM public.profiles p
 WHERE p.id = s.created_by
   AND p.status = 'inactive'
   AND s.enabled
   AND s.deleted_at IS NULL;

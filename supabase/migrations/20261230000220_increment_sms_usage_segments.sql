-- The SMS add-on's usage counts SEGMENTS (what carriers bill), not messages:
-- a 300-character text is 2 segments, an emoji text over 70 characters is 2+.
-- increment_sms_usage gains p_count (default 1, so an old caller still works);
-- src/lib/sms/send.ts passes Twilio's num_segments (or the computed GSM-7 /
-- UCS-2 count). The org guard from 20260928120100 is kept verbatim.
-- Apply BEFORE deploying the code that passes p_count.

drop function if exists public.increment_sms_usage(uuid, date);

create or replace function public.increment_sms_usage(p_org_id uuid, p_period_start date, p_count integer default 1)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  -- One send is 1..~25 segments (1600 chars / 67); clamp so a bad caller can't
  -- zero out or blow up the counter.
  v_count integer := greatest(1, least(coalesce(p_count, 1), 50));
BEGIN
  IF auth.uid() IS NOT NULL AND p_org_id IS DISTINCT FROM public.my_org_id() THEN
    RAISE EXCEPTION 'not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  insert into organization_sms_usage (org_id, period_start, count)
  values (p_org_id, p_period_start, v_count)
  on conflict (org_id, period_start)
  do update set count = organization_sms_usage.count + v_count, updated_at = now();
END;
$function$;

revoke all on function public.increment_sms_usage(uuid, date, integer) from public, anon;
grant execute on function public.increment_sms_usage(uuid, date, integer) to authenticated, service_role;

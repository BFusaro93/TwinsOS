-- Atomic, idempotent email unsubscribe used by POST /api/crm/unsubscribe/[token].
-- The UPDATE ... WHERE do_not_market = false claims the opt-out, so only one
-- concurrent caller logs the activity and bumps the campaign counter, and the
-- counter uses `n = n + 1` instead of read-then-write.
create or replace function public.crm_unsubscribe_client(p_token uuid, p_campaign_id uuid default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_org uuid;
  v_exists boolean;
begin
  update clients
     set do_not_market = true, updated_at = now()
   where unsubscribe_token = p_token
     and deleted_at is null
     and do_not_market = false
  returning id, org_id into v_id, v_org;

  if v_id is null then
    select exists(select 1 from clients where unsubscribe_token = p_token and deleted_at is null)
      into v_exists;
    return case when v_exists then 'already' else 'not_found' end;
  end if;

  insert into client_activity (org_id, client_id, activity_type, subject, body, occurred_at)
  values (
    v_org, v_id, 'note', 'Unsubscribed from marketing emails',
    case when p_campaign_id is not null
         then 'Unsubscribed via campaign ' || p_campaign_id::text
         else 'Unsubscribed via email footer link' end,
    now()
  );

  if p_campaign_id is not null then
    update crm_campaigns
       set unsubscribed_count = coalesce(unsubscribed_count, 0) + 1
     where id = p_campaign_id and org_id = v_org;
  end if;

  return 'unsubscribed';
end;
$$;

revoke all on function public.crm_unsubscribe_client(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_unsubscribe_client(uuid, uuid) to service_role;

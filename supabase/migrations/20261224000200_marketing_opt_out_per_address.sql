-- Marketing opt-outs are per EMAIL ADDRESS, not per client account.
--
-- Two accounts can share one mailbox (a couple with two properties, a property
-- manager, a duplicate created later). Unsubscribing via one account's link used
-- to opt out only that account, so the same person kept getting campaigns through
-- the other one.
--
-- 1. crm_unsubscribe_client (re-stated from the live definition, every guard
--    kept: live-token only, atomic `do_not_market = false` claim so only one
--    concurrent caller logs/counts, campaign counter scoped to the client's org)
--    now also opts out every other live client in the same org whose primary
--    email is the same address (trimmed, case-insensitive). It does this on an
--    'already' click too, so a repeat click completes an older unsubscribe.
-- 2. crm_marketing_suppressed_emails(org, emails[]) — which of these addresses
--    belong to an opted-out client in the org. The send paths (campaigns, bulk
--    email, marketing automation steps) check it at send time, so a client
--    created LATER with an unsubscribed address doesn't resubscribe it.
--    SECURITY INVOKER: RLS on clients still scopes an app user to their org.

create or replace function public.crm_unsubscribe_client(p_token uuid, p_campaign_id uuid default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_org uuid;
  v_claimed boolean := false;
  v_email text;
begin
  update clients
     set do_not_market = true, updated_at = now()
   where unsubscribe_token = p_token
     and deleted_at is null
     and do_not_market = false
  returning id, org_id into v_id, v_org;

  if v_id is not null then
    v_claimed := true;

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
  else
    select id, org_id into v_id, v_org
      from clients
     where unsubscribe_token = p_token and deleted_at is null;
    if v_id is null then
      return 'not_found';
    end if;
  end if;

  -- The address that was unsubscribed: campaigns and bulk email mail the
  -- primary email, and the token belongs to that client.
  select nullif(lower(btrim(primary_email)), '') into v_email from clients where id = v_id;

  if v_email is not null then
    with flipped as (
      update clients c
         set do_not_market = true, updated_at = now()
       where c.org_id = v_org
         and c.id <> v_id
         and c.deleted_at is null
         and c.do_not_market = false
         and lower(btrim(c.primary_email)) = v_email
      returning c.id, c.org_id
    )
    insert into client_activity (org_id, client_id, activity_type, subject, body, occurred_at)
    select f.org_id, f.id, 'note', 'Unsubscribed from marketing emails',
           'Unsubscribed via another account''s email link (same address: ' || v_email || ')',
           now()
      from flipped f;
  end if;

  return case when v_claimed then 'unsubscribed' else 'already' end;
end;
$$;

revoke all on function public.crm_unsubscribe_client(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_unsubscribe_client(uuid, uuid) to service_role;

create or replace function public.crm_marketing_suppressed_emails(p_org_id uuid, p_emails text[])
returns setof text
language sql
stable
security invoker
set search_path to 'public'
as $$
  -- Soft-deleted clients count too: deleting a duplicate account doesn't
  -- withdraw the person's opt-out.
  select distinct lower(btrim(c.primary_email))
    from clients c
   where c.org_id = p_org_id
     and c.do_not_market
     and c.primary_email is not null
     and lower(btrim(c.primary_email)) in (
       select lower(btrim(e)) from unnest(p_emails) e where e is not null
     );
$$;

revoke all on function public.crm_marketing_suppressed_emails(uuid, text[]) from public, anon;
grant execute on function public.crm_marketing_suppressed_emails(uuid, text[]) to authenticated, service_role;

create index if not exists idx_clients_dnm_email
  on public.clients (org_id, lower(btrim(primary_email)))
  where do_not_market;

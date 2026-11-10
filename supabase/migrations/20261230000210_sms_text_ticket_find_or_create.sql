-- Two quick inbound texts from the same client used to open two "text"
-- tickets: the webhook looked for an open text ticket, found none, and both
-- requests inserted one. Find-or-create is now one RPC that first takes a
-- transaction-scoped advisory lock per matched client (sorted, so two calls
-- for overlapping client sets can't deadlock); the second text waits, then
-- sees the first one's ticket and is appended to it as a comment.
-- Service role only (the Twilio webhook).

create or replace function public.find_or_create_sms_text_ticket(
  p_org_id        uuid,
  p_client_ids    uuid[],
  p_new_client_id uuid,
  p_subject       text,
  p_body          text
)
returns table (
  id             uuid,
  ticket_number  integer,
  subject        text,
  assigned_to_id uuid,
  assigned_to    text,
  client_id      uuid,
  created        boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_cid uuid;
  v_new uuid;
begin
  if p_org_id is null or p_new_client_id is null or not (p_new_client_id = any (p_client_ids)) then
    raise exception 'find_or_create_sms_text_ticket: bad arguments' using errcode = '22023';
  end if;

  for v_cid in select distinct c from unnest(p_client_ids) as c order by c loop
    perform pg_advisory_xact_lock(hashtextextended('sms_text_ticket:' || v_cid::text, 0));
  end loop;

  return query
    select t.id, t.ticket_number, t.subject, t.assigned_to_id, t.assigned_to, t.client_id, false
      from public.crm_tickets t
     where t.org_id = p_org_id
       and t.client_id = any (p_client_ids)
       and t.type = 'text'
       and t.status in ('open', 'pending', 'on_hold')
       and t.deleted_at is null
     order by t.created_at desc
     limit 1;
  if found then
    return;
  end if;

  insert into public.crm_tickets (org_id, type, client_id, subject, body, priority)
  values (p_org_id, 'text', p_new_client_id, p_subject, p_body, 'normal')
  returning public.crm_tickets.id into v_new;

  return query
    select t.id, t.ticket_number, t.subject, t.assigned_to_id, t.assigned_to, t.client_id, true
      from public.crm_tickets t
     where t.id = v_new;
end;
$$;

revoke all on function public.find_or_create_sms_text_ticket(uuid, uuid[], uuid, text, text) from public, anon, authenticated;
grant execute on function public.find_or_create_sms_text_ticket(uuid, uuid[], uuid, text, text) to service_role;

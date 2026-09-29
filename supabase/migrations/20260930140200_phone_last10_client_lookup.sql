-- The Twilio inbound webhook matched a texter to a client by loading EVERY
-- client with a primary_phone across all candidate orgs (all orgs on the
-- shared sender) and comparing last-10 digits in JS. PostgREST caps that
-- select at 1000 rows, so once the candidate orgs had >1000 phone clients
-- a reply (including a STOP) from a client past the cap silently matched
-- nobody. Move the match into SQL with an expression index.
--
-- phone_last10 mirrors the route's JS last10Digits(): strip everything but
-- ASCII 0-9, keep the last 10. Plain SQL, IMMUTABLE (required for the index),
-- no SECURITY DEFINER. The lookup RPC is SECURITY INVOKER (RLS still applies
-- to any non-service caller) and is only granted to service_role, which is
-- what the webhook uses.
--
-- Idempotent: safe to re-run.

create or replace function public.phone_last10(p text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select right(regexp_replace(p, '[^0-9]', '', 'g'), 10)
$$;

create index if not exists clients_org_primary_phone_last10_idx
  on public.clients (org_id, public.phone_last10(primary_phone))
  where primary_phone is not null and deleted_at is null;

create or replace function public.find_clients_by_phone_last10(p_digits text, p_org_ids uuid[])
returns table (id uuid, org_id uuid, display_name text, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.org_id, c.display_name, c.created_at
  from public.clients c
  where c.org_id = any (p_org_ids)
    and c.primary_phone is not null
    and c.deleted_at is null
    and public.phone_last10(c.primary_phone) = p_digits
  order by c.created_at asc
$$;

revoke all on function public.find_clients_by_phone_last10(text, uuid[]) from public, anon, authenticated;
grant execute on function public.find_clients_by_phone_last10(text, uuid[]) to service_role;

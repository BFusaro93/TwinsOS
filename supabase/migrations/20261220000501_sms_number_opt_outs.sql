-- STOP / START from any number we text, not just a client's primary phone.
--
-- Automations text a client's billing phone and its contacts' phones under the
-- client's consent (src/lib/automations/sequence-sms.ts), but the inbound
-- webhook matched a reply only against clients.primary_phone
-- (find_clients_by_phone_last10). A contact who texted STOP matched no client:
-- the reply was dropped, the app kept showing the client as opted in, and every
-- later text to that number failed at Twilio (its own opt-out list, error 21610)
-- and was logged as skipped.
--
-- Now:
--   * crm_sms_opt_outs remembers a STOP per (org, number). Every send skips a
--     number that opted out; START removes it.
--   * clients.sms_opt_in still flips only when the client's PRIMARY phone sent
--     the keyword — a contact's STOP stops texts to that contact's number, not
--     to the client.
--   * find_clients_by_any_phone_last10 matches a texter against primary phones,
--     the client's phone list, and contact phones, saying which it was.

create table if not exists public.crm_sms_opt_outs (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null default my_org_id() references public.organizations(id),
  -- Last 10 digits, the same key the inbound match and the sender use (phone_last10).
  phone_last10       text not null check (phone_last10 ~ '^[0-9]{10}$'),
  client_id          uuid references public.clients(id),
  opted_out_at       timestamptz not null default now(),
  source_message_sid text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid(),
  -- Soft delete = the number texted START (opted back in).
  deleted_at         timestamptz
);

create unique index if not exists crm_sms_opt_outs_live_number
  on public.crm_sms_opt_outs (org_id, phone_last10) where deleted_at is null;

drop trigger if exists crm_sms_opt_outs_set_updated_at on public.crm_sms_opt_outs;
create trigger crm_sms_opt_outs_set_updated_at
  before update on public.crm_sms_opt_outs
  for each row execute function public.set_updated_at();

alter table public.crm_sms_opt_outs enable row level security;

-- Read-only for CRM seats in the org; written only by the inbound webhook
-- (service role). An opt-out is the texter's choice, so the office can't lift it.
drop policy if exists "sms opt outs select" on public.crm_sms_opt_outs;
create policy "sms opt outs select"
  on public.crm_sms_opt_outs for select to authenticated
  using (org_id = my_org_id());

drop policy if exists "require_crm_access" on public.crm_sms_opt_outs;
create policy "require_crm_access"
  on public.crm_sms_opt_outs as restrictive for all
  using (public.has_crm_access()) with check (public.has_crm_access());

revoke all on public.crm_sms_opt_outs from anon;
revoke insert, update, delete on public.crm_sms_opt_outs from authenticated;
grant select on public.crm_sms_opt_outs to authenticated;

-- ── Match a texter against every number we text ─────────────────────────────
-- match_kind: 'primary' (clients.primary_phone), 'client_phone' (an entry in
-- clients.phones), 'contact' (a live contact's phone or phones). One row per
-- client, the strongest match winning (primary > client_phone > contact).
create or replace function public.find_clients_by_any_phone_last10(p_digits text, p_org_ids uuid[])
returns table (id uuid, org_id uuid, display_name text, created_at timestamptz, match_kind text)
language sql
stable
security invoker
set search_path = ''
as $$
  with matches as (
    select c.id, c.org_id, c.display_name, c.created_at, 'primary'::text as match_kind, 1 as rank
      from public.clients c
     where c.org_id = any (p_org_ids)
       and c.deleted_at is null
       and c.primary_phone is not null
       and public.phone_last10(c.primary_phone) = p_digits
    union all
    select c.id, c.org_id, c.display_name, c.created_at, 'client_phone', 2
      from public.clients c
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(c.phones) = 'array' then c.phones else '[]'::jsonb end
      ) p
     where c.org_id = any (p_org_ids)
       and c.deleted_at is null
       and public.phone_last10(p ->> 'phone') = p_digits
    union all
    select c.id, c.org_id, c.display_name, c.created_at, 'contact', 3
      from public.client_contacts cc
      join public.clients c on c.id = cc.client_id
     where cc.org_id = any (p_org_ids)
       and cc.deleted_at is null
       and c.deleted_at is null
       and (
         (cc.phone is not null and public.phone_last10(cc.phone) = p_digits)
         or exists (
           select 1 from jsonb_array_elements(
             case when jsonb_typeof(cc.phones) = 'array' then cc.phones else '[]'::jsonb end
           ) cp
           where public.phone_last10(cp ->> 'phone') = p_digits
         )
       )
  )
  select b.id, b.org_id, b.display_name, b.created_at, b.match_kind
    from (
      select distinct on (m.id) m.id, m.org_id, m.display_name, m.created_at, m.match_kind
        from matches m
       order by m.id, m.rank
    ) b
   order by b.created_at asc
$$;

revoke all on function public.find_clients_by_any_phone_last10(text, uuid[]) from public, anon, authenticated;
grant execute on function public.find_clients_by_any_phone_last10(text, uuid[]) to service_role;

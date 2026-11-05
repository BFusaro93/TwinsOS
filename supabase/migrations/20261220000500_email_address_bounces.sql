-- Hard bounces are remembered per email ADDRESS, not per client.
--
-- clients.email_bounced_at was set for whichever client a bounced message
-- belonged to, whatever address bounced. Sends go to several addresses — the
-- invoice email defaults to the billing email, automations mail primary +
-- billing + contacts, staff add CCs — so one typo'd billing email or bad CC
-- blocked campaigns, automations, invoices and 1:1 email to the client's good
-- primary address. Fixing the billing email didn't clear it either: only a
-- primary_email change did (20261002000100).
--
-- Now:
--   * crm_email_bounces holds one live row per (org, address). Every sender
--     drops just the bounced recipients (src/lib/email/bounced-addresses.ts).
--   * clients.email_bounced_at is DERIVED: set while the client's current
--     primary_email has a live bounce, null otherwise. Primary-only senders and
--     existing reports/filters keep reading it unchanged.
--   * A different address is a new delivery target, so editing an address
--     "clears" it naturally; crm_clear_email_bounce() clears one explicitly
--     (the office confirmed the mailbox works again).

create table if not exists public.crm_email_bounces (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default my_org_id() references public.organizations(id),
  email             text not null check (email = lower(btrim(email)) and email <> ''),
  -- The client whose message bounced (for the timeline / where it is shown). The
  -- suppression itself is by address and applies to every client in the org.
  client_id         uuid references public.clients(id),
  bounced_at        timestamptz not null default now(),
  source_message_id text,
  bounce_message    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  -- Soft delete = the bounce was cleared.
  deleted_at        timestamptz,
  cleared_by        uuid
);

create unique index if not exists crm_email_bounces_live_address
  on public.crm_email_bounces (org_id, email) where deleted_at is null;
create index if not exists crm_email_bounces_client_idx
  on public.crm_email_bounces (client_id) where deleted_at is null;

drop trigger if exists crm_email_bounces_set_updated_at on public.crm_email_bounces;
create trigger crm_email_bounces_set_updated_at
  before update on public.crm_email_bounces
  for each row execute function public.set_updated_at();

alter table public.crm_email_bounces enable row level security;

-- Read: any CRM seat in the org (the client page shows which addresses bounced).
-- Writes: the Resend webhook (service role) records bounces; clearing goes
-- through crm_clear_email_bounce(). No authenticated write policies on purpose.
drop policy if exists "email bounces select" on public.crm_email_bounces;
create policy "email bounces select"
  on public.crm_email_bounces for select to authenticated
  using (org_id = my_org_id());

drop policy if exists "require_crm_access" on public.crm_email_bounces;
create policy "require_crm_access"
  on public.crm_email_bounces as restrictive for all
  using (public.has_crm_access()) with check (public.has_crm_access());

revoke all on public.crm_email_bounces from anon;
revoke insert, update, delete on public.crm_email_bounces from authenticated;
grant select on public.crm_email_bounces to authenticated;

-- ── clients.email_bounced_at follows the bounce table ───────────────────────
create or replace function public.crm_email_bounces_sync_clients()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := coalesce(new.org_id, old.org_id);
  v_email text := coalesce(new.email, old.email);
begin
  update public.clients c
     set email_bounced_at = (
       select min(b.bounced_at) from public.crm_email_bounces b
        where b.org_id = c.org_id
          and b.email = lower(btrim(c.primary_email))
          and b.deleted_at is null
     )
   where c.org_id = v_org
     and lower(btrim(coalesce(c.primary_email, ''))) = v_email;
  return null;
end;
$$;
revoke execute on function public.crm_email_bounces_sync_clients() from public, anon, authenticated;

drop trigger if exists crm_email_bounces_sync_clients on public.crm_email_bounces;
create trigger crm_email_bounces_sync_clients
  after insert or update or delete on public.crm_email_bounces
  for each row execute function public.crm_email_bounces_sync_clients();

-- A primary_email change re-derives the flag for the NEW address (null unless
-- that address has bounced too). Replaces the 20261002000100 version, which
-- only ever cleared it. An update that sets email_bounced_at itself is left alone.
create or replace function public.clients_clear_email_bounce_on_email_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.email_bounced_at is not distinct from old.email_bounced_at
     and lower(btrim(coalesce(new.primary_email, ''))) is distinct from lower(btrim(coalesce(old.primary_email, '')))
  then
    new.email_bounced_at := (
      select min(b.bounced_at) from public.crm_email_bounces b
       where b.org_id = new.org_id
         and b.email = lower(btrim(new.primary_email))
         and b.deleted_at is null
    );
  end if;
  return new;
end;
$$;
revoke execute on function public.clients_clear_email_bounce_on_email_change() from public, anon, authenticated;

drop trigger if exists trg_clients_clear_email_bounce on public.clients;
create trigger trg_clients_clear_email_bounce
  before update of primary_email on public.clients
  for each row
  execute function public.clients_clear_email_bounce_on_email_change();

-- ── Clearing a bounce ────────────────────────────────────────────────────────
-- Anyone who may edit a client or lead (client_allow_edit / lead_allow_edit,
-- admins always) can say "this mailbox works again". Not crew, not portal,
-- not a read-only org.
create or replace function public.crm_clear_email_bounce(p_email text, p_client_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.my_org_id();
  v_n integer;
begin
  if auth.uid() is null or v_org is null or not public.has_crm_access() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'crew') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not (public.has_settings_permission('client_allow_edit') or public.has_settings_permission('lead_allow_edit')) then
    raise exception 'You do not have permission to edit clients' using errcode = '42501';
  end if;
  if public.my_org_is_read_only() is true then
    raise exception 'This account is read-only' using errcode = '42501';
  end if;

  update public.crm_email_bounces
     set deleted_at = now(), cleared_by = auth.uid()
   where org_id = v_org
     and email = lower(btrim(p_email))
     and deleted_at is null;
  get diagnostics v_n = row_count;

  if v_n > 0 and p_client_id is not null then
    insert into public.client_activity (org_id, client_id, activity_type, subject, created_by)
    select v_org, c.id, 'note', 'Email bounce cleared for ' || lower(btrim(p_email)), auth.uid()
      from public.clients c
     where c.id = p_client_id and c.org_id = v_org;
  end if;
  return v_n;
end;
$$;
revoke execute on function public.crm_clear_email_bounce(text, uuid) from public, anon;
grant execute on function public.crm_clear_email_bounce(text, uuid) to authenticated;

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- (a) A bounced message sent to exactly one address: that address bounced.
insert into public.crm_email_bounces (org_id, email, client_id, bounced_at, source_message_id, created_by)
select distinct on (a.org_id, lower(btrim(a.sent_to)))
       a.org_id, lower(btrim(a.sent_to)), a.client_id, a.bounced_at, a.resend_message_id, null
  from public.client_activity a
 where a.bounced_at is not null
   and a.sent_to is not null
   and btrim(a.sent_to) <> ''
   and a.sent_to !~ '[,;]'
 order by a.org_id, lower(btrim(a.sent_to)), a.bounced_at
on conflict do nothing;

-- (b) A client flagged by the old rule with no single-address evidence (no
-- bounced message on record, or only multi-recipient ones): we can't tell which
-- address it was, so keep the primary suppressed — the conservative choice.
insert into public.crm_email_bounces (org_id, email, client_id, bounced_at, created_by)
select c.org_id, lower(btrim(c.primary_email)), c.id, c.email_bounced_at, null
  from public.clients c
 where c.email_bounced_at is not null
   and c.primary_email is not null
   and btrim(c.primary_email) <> ''
   and not exists (
     select 1 from public.client_activity a
      where a.client_id = c.id
        and a.bounced_at is not null
        and a.sent_to is not null
        and a.sent_to !~ '[,;]'
   )
on conflict do nothing;

-- (c) Re-derive the flag: a client whose bounce was really on its billing email
-- or a CC is unblocked for its good primary.
update public.clients c
   set email_bounced_at = b.bounced_at
  from (
    select c2.id, (
      select min(b.bounced_at) from public.crm_email_bounces b
       where b.org_id = c2.org_id and b.email = lower(btrim(c2.primary_email)) and b.deleted_at is null
    ) as bounced_at
    from public.clients c2
    where c2.email_bounced_at is not null
       or exists (select 1 from public.crm_email_bounces b
                   where b.org_id = c2.org_id and b.email = lower(btrim(c2.primary_email)) and b.deleted_at is null)
  ) b
 where b.id = c.id
   and c.email_bounced_at is distinct from b.bounced_at;

comment on column public.clients.email_bounced_at is
  'Derived: set while this client''s CURRENT primary_email has a live hard bounce in crm_email_bounces, null otherwise. Bounces are per address — other addresses (billing, contacts) are suppressed individually there. A deliverability fact, NOT a marketing preference (that is do_not_market).';

-- Client-facing conversation on a ticket (portal "reply" thread).
--
-- The existing Comments tab on a ticket is internal staff chatter and is never
-- shown to the customer. This is the separate, customer-visible thread: the
-- customer's replies from the portal and the staff replies addressed to them.
-- Nothing here is ever readable by a portal login directly — the portal API
-- reads and writes with the service client after checking the ticket belongs to
-- the login's own accounts (same pattern as the ticket attachments route), so
-- the table carries staff-only RLS and no portal policy.

create table if not exists public.crm_ticket_messages (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null default my_org_id() references public.organizations(id),
  ticket_id        uuid not null references public.crm_tickets(id),
  author_type      text not null check (author_type in ('client', 'staff')),
  -- Display name captured at write time (a renamed contact or employee must not
  -- rewrite history).
  author_name      text not null default '',
  -- Set for staff messages (the profile that wrote it); null for client messages.
  author_user_id   uuid references auth.users(id),
  body             text not null default '' check (char_length(btrim(body)) <= 5000),
  -- Storage paths (bucket "attachments") of photos sent with the message. Each
  -- is also filed as a normal ticket attachment so staff see it on the Files tab.
  photo_paths      text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  -- A message needs words or a photo.
  constraint crm_ticket_messages_has_content check (char_length(btrim(body)) >= 1 or cardinality(photo_paths) > 0)
);

create index if not exists idx_crm_ticket_messages_ticket
  on public.crm_ticket_messages (ticket_id, created_at) where deleted_at is null;
create index if not exists idx_crm_ticket_messages_org
  on public.crm_ticket_messages (org_id) where deleted_at is null;

create trigger trg_crm_ticket_messages_updated_at
  before update on public.crm_ticket_messages
  for each row execute function public.set_updated_at();

alter table public.crm_ticket_messages enable row level security;

drop policy if exists "crm_ticket_messages_select" on public.crm_ticket_messages;
create policy "crm_ticket_messages_select" on public.crm_ticket_messages for select
  using (org_id = my_org_id() and not public.is_client_portal_user());
drop policy if exists "crm_ticket_messages_insert" on public.crm_ticket_messages;
create policy "crm_ticket_messages_insert" on public.crm_ticket_messages for insert
  -- Staff write their own replies only; a client message is only ever written by
  -- the portal API (service role, which bypasses RLS).
  with check (org_id = my_org_id() and not public.is_client_portal_user() and author_type = 'staff');
-- No UPDATE / DELETE policy: a sent message is never edited; removal is a soft
-- delete through the service role.

drop policy if exists "require_crm_access" on public.crm_ticket_messages;
create policy "require_crm_access" on public.crm_ticket_messages
  as restrictive for all using (public.has_crm_access()) with check (public.has_crm_access());
drop policy if exists "read_only_when_canceled_ins" on public.crm_ticket_messages;
create policy "read_only_when_canceled_ins" on public.crm_ticket_messages
  as restrictive for insert with check ((select public.my_org_is_read_only()) is not true);

revoke all on public.crm_ticket_messages from anon;

-- Sent-email content for the Email Activity page and client timeline.
-- client_activity only ever stored a one-line summary ("Sent to x@y.com"), so
-- nobody could open a sent email and see what the client actually received.
-- The HTML lives in its own table (1:1 with the activity row) so the timeline's
-- select("*") and the audit trigger on client_activity never carry email bodies.
create table if not exists public.client_email_content (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default public.my_org_id() references public.organizations(id),
  activity_id uuid not null unique references public.client_activity(id) on delete cascade,
  html        text not null,
  cc          text,
  created_at  timestamptz not null default now()
);

alter table public.client_email_content enable row level security;

create policy "org members can read client_email_content" on public.client_email_content
  for select
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

create policy "org members can insert client_email_content" on public.client_email_content
  for insert
  with check (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

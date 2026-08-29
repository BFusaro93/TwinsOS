-- Sales rep booking/calendar: office staff can see where sales reps have
-- meetings, book new ones, and link a meeting to an estimate or a ticket.

create table if not exists public.crm_sales_meetings (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default my_org_id() references public.organizations(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null,
  deleted_at        timestamptz,

  sales_rep_id      uuid not null references public.crm_employees(id),
  client_id         uuid references public.clients(id),
  lead_name         text,

  title             text not null,
  meeting_type      text not null default 'in_person' check (meeting_type in ('in_person', 'phone', 'video')),
  location          text,
  scheduled_at      timestamptz not null,
  duration_minutes  integer not null default 60,
  status            text not null default 'scheduled' check (status in ('scheduled', 'completed', 'canceled', 'no_show')),
  notes             text,

  estimate_id       uuid references public.estimates(id),
  ticket_id         uuid references public.crm_tickets(id)
);

create index if not exists idx_crm_sales_meetings_org_rep_time
  on public.crm_sales_meetings (org_id, sales_rep_id, scheduled_at)
  where deleted_at is null;

create index if not exists idx_crm_sales_meetings_client
  on public.crm_sales_meetings (client_id)
  where deleted_at is null;

create trigger trg_crm_sales_meetings_updated_at
  before update on public.crm_sales_meetings
  for each row execute function public.set_updated_at();

alter table public.crm_sales_meetings enable row level security;

create policy "org members manage sales meetings"
  on public.crm_sales_meetings for all
  using (org_id = my_org_id())
  with check (org_id = my_org_id());

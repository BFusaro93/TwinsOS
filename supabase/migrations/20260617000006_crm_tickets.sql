create sequence if not exists crm_ticket_number_seq;

create table crm_tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default my_org_id(),
  ticket_number integer not null default nextval('crm_ticket_number_seq'),
  type text not null default 'note' check (type in ('note','call','event')),
  status text not null default 'open' check (status in ('open','closed','pending')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  subject text,
  body text,
  category text,
  client_id uuid references clients(id),
  assigned_to text,
  due_date date,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references profiles(id)
);

alter table crm_tickets enable row level security;

create policy "org members can select tickets"
  on crm_tickets for select
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can insert tickets"
  on crm_tickets for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can update tickets"
  on crm_tickets for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

create index on crm_tickets (org_id, status, created_at desc);
create index on crm_tickets (client_id);

create trigger set_crm_tickets_updated_at
  before update on crm_tickets
  for each row execute function set_updated_at();

-- Company-level client defaults (Service Autopilot parity gap):
--   1. Starting Account Number (prefix / next number / suffix) — auto-generates client account numbers
--   2. Default Billing Terms / When to Invoice / Send Invoice By — applied to new clients

-- ─── organizations: default settings ──────────────────────────────────────────
alter table public.organizations
  add column if not exists account_number_prefix     text not null default '',
  add column if not exists account_number_next        integer not null default 1000,
  add column if not exists account_number_suffix      text not null default '',
  add column if not exists default_billing_terms      text not null default 'due_on_receipt',
  add column if not exists default_invoice_frequency  text not null default 'daily',
  add column if not exists default_invoice_delivery   text not null default 'email';

alter table public.organizations
  add constraint organizations_default_billing_terms_check
    check (default_billing_terms in ('due_on_receipt','net_10','net_15','net_30','net_45','net_60','net_90'));

alter table public.organizations
  add constraint organizations_default_invoice_frequency_check
    check (default_invoice_frequency in ('daily','weekly','monthly','upon_completion'));

alter table public.organizations
  add constraint organizations_default_invoice_delivery_check
    check (default_invoice_delivery in ('email','print','both'));

alter table public.organizations
  add constraint organizations_account_number_next_check
    check (account_number_next > 0);

-- ─── clients: account_number column ───────────────────────────────────────────
alter table public.clients
  add column if not exists account_number text;

create unique index if not exists clients_org_account_number_key
  on public.clients (org_id, account_number)
  where account_number is not null and deleted_at is null;

-- Column-level defaults are removed so a plain insert leaves these NULL,
-- letting the trigger below fall back to the org's configured defaults.
alter table public.clients alter column invoice_frequency drop default;
alter table public.clients alter column invoice_delivery drop default;
alter table public.clients alter column default_terms drop default;
alter table public.clients alter column default_terms drop not null;

-- ─── trigger: fill account number + billing defaults on insert ───────────────
create or replace function public.set_client_defaults()
returns trigger
language plpgsql
as $$
declare
  v_org record;
begin
  select account_number_prefix, account_number_suffix, account_number_next,
         default_billing_terms, default_invoice_frequency, default_invoice_delivery
    into v_org
    from public.organizations
   where id = new.org_id
   for update;

  if new.account_number is null and v_org is not null then
    new.account_number := coalesce(v_org.account_number_prefix, '')
      || v_org.account_number_next::text
      || coalesce(v_org.account_number_suffix, '');

    update public.organizations
       set account_number_next = account_number_next + 1
     where id = new.org_id;
  end if;

  if new.invoice_frequency is null then
    new.invoice_frequency := coalesce(v_org.default_invoice_frequency, 'daily');
  end if;

  if new.invoice_delivery is null then
    new.invoice_delivery := coalesce(v_org.default_invoice_delivery, 'email');
  end if;

  if new.default_terms is null then
    new.default_terms := coalesce(v_org.default_billing_terms, 'due_on_receipt');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_clients_set_defaults on public.clients;
create trigger trg_clients_set_defaults
  before insert on public.clients
  for each row execute function public.set_client_defaults();

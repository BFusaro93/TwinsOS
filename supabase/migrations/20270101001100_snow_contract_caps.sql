-- Snow contract caps and overage.
--
-- A snow contract (Monthly Flat Rate jobs linked to a crm_contracts row) can
-- include a cap: an INCH cap (inches of snowfall per period) and/or a SALT cap
-- (salt applications per period). Work inside the cap stays covered by the
-- contract price; work beyond it bills as overage in Snow Invoicing at a set
-- per-unit overage price, with the overage invoice description below.
--
--   snow_inch_cap             inches per period; NULL = no inch cap
--   snow_salt_cap             salt applications per period (per salt job);
--                             NULL = no salt cap
--   snow_cap_reset            'contract_year' (anniversaries of start_date) or
--                             'monthly' (calendar month)
--   snow_overage_description  invoice line text for overage
--   snow_overage_per_inch_cents / snow_overage_per_salt_cents
--                             what each inch / salt over the cap bills
--
-- crm_jobs.snow_cap_kind tags a linked snow job as counting toward the inch
-- cap ('inches', also the default for an untagged job) or the salt cap
-- ('salt'). Counting and pricing live in src/lib/snow-caps.ts; nothing here
-- stores usage, so voiding an overage invoice simply releases its visits.
-- Existing rows: no cap (NULL), so nothing changes until a cap is set.

alter table public.crm_contracts
  add column if not exists snow_inch_cap numeric(8,2),
  add column if not exists snow_salt_cap integer,
  add column if not exists snow_cap_reset text not null default 'contract_year',
  add column if not exists snow_overage_description text,
  add column if not exists snow_overage_per_inch_cents integer,
  add column if not exists snow_overage_per_salt_cents integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_contracts_snow_cap_reset_check' and conrelid = 'public.crm_contracts'::regclass) then
    alter table public.crm_contracts
      add constraint crm_contracts_snow_cap_reset_check check (snow_cap_reset in ('contract_year', 'monthly'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_contracts_snow_caps_positive_check' and conrelid = 'public.crm_contracts'::regclass) then
    alter table public.crm_contracts
      add constraint crm_contracts_snow_caps_positive_check check (
        (snow_inch_cap is null or snow_inch_cap > 0)
        and (snow_salt_cap is null or snow_salt_cap > 0)
        and (snow_overage_per_inch_cents is null or snow_overage_per_inch_cents >= 0)
        and (snow_overage_per_salt_cents is null or snow_overage_per_salt_cents >= 0)
      );
  end if;
end $$;

alter table public.crm_jobs
  add column if not exists snow_cap_kind text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_jobs_snow_cap_kind_check' and conrelid = 'public.crm_jobs'::regclass) then
    alter table public.crm_jobs
      add constraint crm_jobs_snow_cap_kind_check check (snow_cap_kind is null or snow_cap_kind in ('inches', 'salt'));
  end if;
end $$;

comment on column public.crm_contracts.snow_inch_cap is 'Snow: inches of snowfall covered per cap period (per storm = deepest reading); null = no inch cap.';
comment on column public.crm_contracts.snow_salt_cap is 'Snow: salt applications covered per cap period, counted per salt job; null = no salt cap.';
comment on column public.crm_jobs.snow_cap_kind is 'Snow: which contract cap this job counts toward — inches (default when null) or salt.';

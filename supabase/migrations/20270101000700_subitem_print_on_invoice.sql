-- "On invoice" for estimate sub-items (sub-services and materials), like
-- Service Autopilot's per-sub-item print toggle.
--
-- 1. estimate_line_item_subitems.print_on_invoice / estimate_template_item_subitems
--    .print_on_invoice existed but nothing ever read them, and the column default
--    was TRUE — so 100+ rows are "true" without anyone having chosen it. Now that
--    the flag will drive what an invoice prints, reset it to FALSE everywhere
--    (opt-in) so no existing invoice output changes, and default new rows to
--    FALSE. Nothing consumed the old values, so no behavior is lost.
-- 2. A job's copy of each sub-item (crm_job_service_subitems, made at estimate
--    conversion) gains a snapshot of the sub-item's rate and print flag, so the
--    invoice can list it as its own row without re-reading an estimate that may
--    have been edited since. Existing job copies keep rate_cents NULL and are
--    never itemized.
alter table public.estimate_line_item_subitems alter column print_on_invoice set default false;
update public.estimate_line_item_subitems set print_on_invoice = false where print_on_invoice;

do $$
begin
  if to_regclass('public.estimate_template_item_subitems') is not null then
    alter table public.estimate_template_item_subitems alter column print_on_invoice set default false;
    update public.estimate_template_item_subitems set print_on_invoice = false where print_on_invoice;
  end if;
end $$;

alter table public.crm_job_service_subitems
  add column if not exists rate_cents integer,
  add column if not exists print_on_invoice boolean not null default false;

-- "Flag for Review": an invoice can be held back for a second look before it is
-- emailed. It is a flag, not a status, so the invoice keeps its real status
-- (draft/printed/partial/...). The email route refuses flagged invoices; the
-- audit trigger on crm_invoices already records every column change.
alter table public.crm_invoices
  add column if not exists flagged_for_review boolean not null default false,
  add column if not exists flagged_at timestamptz,
  add column if not exists flagged_by uuid,
  add column if not exists flag_note text;

-- Setting or clearing the flag needs the same permission as editing an invoice.
create or replace function public.guard_crm_invoice_review_flag()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.flagged_for_review is distinct from old.flagged_for_review
     or new.flag_note is distinct from old.flag_note then
    if not public._acct_permitted(array['acct_add_modify_invoices']) then
      raise exception 'You do not have permission to flag invoices for review' using errcode = '42501';
    end if;
    if new.flagged_for_review then
      new.flagged_at := coalesce(new.flagged_at, now());
      new.flagged_by := coalesce(new.flagged_by, auth.uid());
    else
      new.flagged_at := null;
      new.flagged_by := null;
      new.flag_note := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_invoice_review_flag on public.crm_invoices;
create trigger trg_crm_invoice_review_flag
  before update on public.crm_invoices
  for each row execute function public.guard_crm_invoice_review_flag();

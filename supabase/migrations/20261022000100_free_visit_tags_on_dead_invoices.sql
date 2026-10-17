-- Voided / deleted invoices release the visits they billed.
--
-- crm_invoice_line_items.visit_id is globally unique (20260829070000) so a visit
-- can't be billed twice. A void or soft-deleted invoice kept its lines' visit_id,
-- so the visits it billed could never be invoiced again: the snow queue hid them
-- (and its insert hit the unique violation and was reported as a "race"). The
-- visit-completion path already frees the tag when a visit is re-completed
-- (complete-visit-side-effects); this frees it at the moment the invoice dies, so
-- every path — snow invoicing included — can rebill. A void is a correction, not
-- a decision that the work is unbillable.

create or replace function public.free_visit_tags_on_dead_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status = 'void' and old.status is distinct from 'void')
     or (new.deleted_at is not null and old.deleted_at is null) then
    update public.crm_invoice_line_items
       set visit_id = null
     where invoice_id = new.id
       and visit_id is not null;
  end if;
  return new;
end;
$$;

revoke all on function public.free_visit_tags_on_dead_invoice() from public, anon, authenticated;

drop trigger if exists crm_invoices_free_visit_tags on public.crm_invoices;
create trigger crm_invoices_free_visit_tags
  after update of status, deleted_at on public.crm_invoices
  for each row execute function public.free_visit_tags_on_dead_invoice();

-- Backfill: visits already stranded on a void/deleted invoice become billable again.
update public.crm_invoice_line_items li
   set visit_id = null
  from public.crm_invoices i
 where li.invoice_id = i.id
   and li.visit_id is not null
   and (i.status = 'void' or i.deleted_at is not null);

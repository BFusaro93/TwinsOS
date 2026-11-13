-- Bug sweep round 13 (6xx): a voided invoice's pay link stops working.
--
-- Voiding (Void Invoice, the list's bulk void, merging an invoice into another,
-- consolidating sub-account invoices — all of which void the originals) and
-- soft-deleting an invoice left its "View & Pay Online" links live. A trigger,
-- rather than each route, because there are several void paths (client hooks,
-- crm_merge_invoices, crm_consolidate_invoices) and a missed one would leave a
-- link open. SECURITY DEFINER so it works whoever voids, whatever the
-- invoice_share_tokens policies allow that user. Only sets revoked_at
-- (tokens are never hard-deleted); the public routes already refuse revoked
-- tokens.
--
-- PROD: apply any time (before or after the code deploy) — no code depends on it.

create or replace function public.revoke_invoice_share_tokens_on_void()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.invoice_share_tokens
     set revoked_at = now()
   where invoice_id = new.id
     and org_id = new.org_id
     and revoked_at is null;
  return new;
end;
$function$;

revoke all on function public.revoke_invoice_share_tokens_on_void() from public, anon, authenticated;

drop trigger if exists trg_crm_invoices_revoke_share_tokens on public.crm_invoices;
create trigger trg_crm_invoices_revoke_share_tokens
  after update of status, deleted_at on public.crm_invoices
  for each row
  when (
    (new.status = 'void' and old.status is distinct from 'void')
    or (new.deleted_at is not null and old.deleted_at is null)
  )
  execute function public.revoke_invoice_share_tokens_on_void();

-- Share tokens and estimate versions must belong to the same org as the
-- estimate / invoice they point at.
--
-- RLS on estimate_share_tokens (insert/update), estimate_versions (insert) and
-- invoice_share_tokens ("org members manage invoice share tokens", FOR ALL)
-- only checked row.org_id = my_org_id(); nothing checked that estimate_id /
-- invoice_id belonged to that org. A staff user could mint a token in their own
-- org pointing at ANOTHER org's estimate or invoice (or re-point an existing
-- one), and the public proposal / invoice routes, which load the parent by id
-- with the service role, then served that record to anyone with the link.
--
-- These BEFORE triggers make the pairing an invariant for every writer,
-- service role included: the parent's org_id must equal NEW.org_id. They are
-- SECURITY DEFINER so the parent lookup is not filtered by the caller's RLS
-- (an RLS-hidden parent in the caller's own org must not look like a
-- mismatch). Updates that don't touch the key columns (view counts, accepted_at)
-- skip the lookup.

create or replace function public.enforce_estimate_child_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if tg_op = 'UPDATE'
     and new.estimate_id is not distinct from old.estimate_id
     and new.org_id is not distinct from old.org_id then
    return new;
  end if;
  select e.org_id into v_org from public.estimates e where e.id = new.estimate_id;
  if v_org is null or v_org is distinct from new.org_id then
    raise exception 'estimate % does not belong to this organization', new.estimate_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_invoice_share_token_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if tg_op = 'UPDATE'
     and new.invoice_id is not distinct from old.invoice_id
     and new.org_id is not distinct from old.org_id then
    return new;
  end if;
  select i.org_id into v_org from public.crm_invoices i where i.id = new.invoice_id;
  if v_org is null or v_org is distinct from new.org_id then
    raise exception 'invoice % does not belong to this organization', new.invoice_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_estimate_child_org() from public, anon, authenticated;
revoke all on function public.enforce_invoice_share_token_org() from public, anon, authenticated;

drop trigger if exists trg_estimate_share_tokens_org_guard on public.estimate_share_tokens;
create trigger trg_estimate_share_tokens_org_guard
  before insert or update on public.estimate_share_tokens
  for each row execute function public.enforce_estimate_child_org();

drop trigger if exists trg_estimate_versions_org_guard on public.estimate_versions;
create trigger trg_estimate_versions_org_guard
  before insert or update on public.estimate_versions
  for each row execute function public.enforce_estimate_child_org();

drop trigger if exists trg_invoice_share_tokens_org_guard on public.invoice_share_tokens;
create trigger trg_invoice_share_tokens_org_guard
  before insert or update on public.invoice_share_tokens
  for each row execute function public.enforce_invoice_share_token_org();

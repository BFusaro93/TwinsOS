-- 1) create_invoice_from_milestone: stop trusting the caller's p_client_id and
--    refuse milestones whose own record (or parent estimate/project) is gone.
--    Body copied from 20260928100000 (the live definition); changes are the
--    deleted_at / lost / client-derivation guards only.
CREATE OR REPLACE FUNCTION public.create_invoice_from_milestone(p_milestone_id uuid, p_client_id uuid, p_sales_rep_id uuid DEFAULT NULL::uuid, p_po_number text DEFAULT NULL::text)
 RETURNS TABLE(invoice_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id      uuid;
  v_estimate_id uuid;
  v_project_id  uuid;
  v_name        text;
  v_amount      integer;
  v_status      text;
  v_type        text;
  v_value       integer;
  v_basis       integer;
  v_invoice_id  uuid;
  v_deleted_at  timestamptz;
  v_client_id   uuid;
  v_est_client  uuid;
  v_proj_client uuid;
begin
  select org_id, estimate_id, project_id, name, amount_cents, status, milestone_type, milestone_value, deleted_at
    into v_org_id, v_estimate_id, v_project_id, v_name, v_amount, v_status, v_type, v_value, v_deleted_at
    from public.estimate_milestones
    where id = p_milestone_id
    for update;

  if not found then
    raise exception 'Milestone not found';
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  if v_deleted_at is not null then
    raise exception 'Milestone has been deleted';
  end if;

  if v_status = 'invoiced' then
    raise exception 'Milestone already invoiced';
  end if;

  -- A milestone invoiced from the estimate side still belongs to the project
  -- that estimate became, so the project's Billing tab and the WIP report see
  -- it without the user having to bill from the project specifically.
  if v_project_id is null and v_estimate_id is not null then
    select j.project_id into v_project_id
    from public.crm_jobs j
    where j.estimate_id = v_estimate_id
      and j.project_id is not null
      and j.deleted_at is null
    limit 1;
  end if;

  -- Parent must be live, same org, and (for an estimate) not lost; the
  -- invoice's client comes from the parent, never from the caller.
  if v_estimate_id is not null then
    declare
      v_est_deleted timestamptz;
      v_est_stage   text;
      v_est_org     uuid;
    begin
      select deleted_at, stage, org_id, client_id
        into v_est_deleted, v_est_stage, v_est_org, v_est_client
        from public.estimates where id = v_estimate_id;
      if not found or v_est_deleted is not null then
        raise exception 'Milestone''s estimate has been deleted';
      end if;
      if v_est_org is distinct from v_org_id then
        raise exception 'Unauthorized';
      end if;
      if v_est_stage = 'lost' then
        raise exception 'Cannot invoice a milestone on a lost estimate';
      end if;
    end;
  end if;

  if v_project_id is not null then
    declare
      v_proj_deleted timestamptz;
      v_proj_org     uuid;
    begin
      select deleted_at, org_id, client_id
        into v_proj_deleted, v_proj_org, v_proj_client
        from public.projects where id = v_project_id;
      if not found or v_proj_deleted is not null then
        raise exception 'Milestone''s project has been deleted';
      end if;
      if v_proj_org is distinct from v_org_id then
        raise exception 'Unauthorized';
      end if;
    end;
  end if;

  v_client_id := coalesce(v_est_client, v_proj_client);
  if v_client_id is null then
    -- Hand-entered project with no client link: fall back to the caller's
    -- client, but only if it is a live client in the same org.
    if not exists (
      select 1 from public.clients c
      where c.id = p_client_id and c.org_id = v_org_id and c.deleted_at is null
    ) then
      raise exception 'Invalid client for this milestone';
    end if;
    v_client_id := p_client_id;
  elsif p_client_id is not null and p_client_id is distinct from v_client_id then
    raise exception 'Client does not match the milestone''s estimate/project';
  end if;

  -- Re-resolve a percentage against whatever the contract says right now.
  if v_type = 'percent' then
    if v_project_id is not null then
      select contract_price into v_basis from public.projects where id = v_project_id;
    else
      select total_cents into v_basis from public.estimates where id = v_estimate_id;
    end if;

    -- A zero/absent basis would silently bill $0. Keep the last known good
    -- snapshot instead, so a half-configured project can't erase an invoice.
    if coalesce(v_basis, 0) > 0 then
      v_amount := round(v_basis::numeric * v_value / 10000);
    end if;
  end if;

  if coalesce(v_amount, 0) <= 0 then
    raise exception 'Milestone amount must be greater than zero';
  end if;

  insert into public.crm_invoices (
    org_id, created_by, client_id, estimate_id, project_id, sales_rep_id, description,
    invoice_date, po_number, subtotal_cents, total_cents, balance_cents, status
  ) values (
    v_org_id, auth.uid(), v_client_id, v_estimate_id, v_project_id, p_sales_rep_id, v_name,
    public.org_today(v_org_id),
    p_po_number, v_amount, v_amount, v_amount, 'draft'
  )
  returning id into v_invoice_id;

  insert into public.crm_invoice_line_items (
    org_id, invoice_id, name, description, qty, rate_cents, total_cents, sort_order
  ) values (
    v_org_id, v_invoice_id, v_name, '', 1, v_amount, v_amount, 0
  );

  -- Write the resolved figure back so the schedule, the sums on it, and the
  -- invoice all report the same number afterwards.
  update public.estimate_milestones
  set status = 'invoiced', invoice_id = v_invoice_id, amount_cents = v_amount
  where id = p_milestone_id;

  return query select v_invoice_id;
end;
$function$;

revoke execute on function public.create_invoice_from_milestone(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.create_invoice_from_milestone(uuid, uuid, uuid, text) to authenticated;

-- 2) Voiding / soft-deleting a milestone's invoice must release the milestone,
--    otherwise it stays 'invoiced' pointing at a dead invoice and can never be
--    billed again.
CREATE OR REPLACE FUNCTION public.release_milestone_on_invoice_void()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (new.status = 'void' and old.status is distinct from 'void')
     or (new.deleted_at is not null and old.deleted_at is null) then
    update public.estimate_milestones
       set status = 'pending', invoice_id = null
     where invoice_id = new.id
       and status = 'invoiced';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_release_milestone_on_invoice_void on public.crm_invoices;
create trigger trg_release_milestone_on_invoice_void
  after update of status, deleted_at on public.crm_invoices
  for each row execute function public.release_milestone_on_invoice_void();

-- Repair milestones already stuck on a void / deleted invoice.
update public.estimate_milestones m
   set status = 'pending', invoice_id = null
  from public.crm_invoices i
 where m.invoice_id = i.id
   and m.status = 'invoiced'
   and (i.status = 'void' or i.deleted_at is not null);

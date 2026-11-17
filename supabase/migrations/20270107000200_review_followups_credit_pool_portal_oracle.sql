-- Review follow-ups (2026-11-16).
--
-- 1. crm_invoice_credit_available: a proposal deposit reserved for an estimate was counted in
--    full for EVERY invoice that estimate owns, so two overdue invoices could both report
--    "covered" (and both be skipped by the past-due reminders) though the deposit can pay only
--    one. Reserved deposits are now drawn down per payment, oldest invoice first, the same way
--    the general credit pool already was.
-- 2. portal_ticket_insert_allowed(p_client_id, p_org_id) is SECURITY DEFINER with caller-supplied
--    ids and was granted to every authenticated user: any login could read another org's
--    portal-tickets switch and a client's rate-limit state. It now answers only for the
--    caller's own org, the caller's own portal client, or the service role.

create or replace function public.crm_invoice_credit_available(p_invoice_ids uuid[])
returns table(invoice_id uuid, credit_available_cents integer, covered boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_inv      record;
  v_pay      record;
  v_client   uuid := null;
  v_general  integer := 0;
  v_pool     integer := 0;
  v_reserved integer;
  v_need     integer;
  v_used     jsonb := '{}'::jsonb;   -- payment id -> cents already drawn by an earlier invoice
  v_avail    integer;
  v_left     integer;
  v_take     integer;
begin
  for v_inv in
    select i.id, i.org_id, i.client_id, i.status,
           greatest(0, coalesce(i.total_cents, 0) - coalesce(i.amount_paid_cents, 0)) as balance,
           c.parent_client_id
      from public.crm_invoices i
      left join public.clients c on c.id = i.client_id
     where i.id = any(coalesce(p_invoice_ids, '{}'::uuid[]))
       and i.deleted_at is null
       and i.status <> 'void'
       and not public._org_mismatch(i.org_id)
     order by i.client_id, coalesce(i.due_date, i.invoice_date), i.invoice_number nulls last, i.id
  loop
    if v_client is distinct from v_inv.client_id then
      v_client := v_inv.client_id;
      v_used := '{}'::jsonb;
      select coalesce(sum(p.unused_amount_cents), 0)::integer into v_general
        from public.crm_payments p
       where p.org_id = v_inv.org_id
         and p.estimate_id is null
         and p.deleted_at is null
         and coalesce(p.unused_amount_cents, 0) > 0
         and (p.disputed_at is null or p.dispute_status = 'won')
         and (p.client_id = v_inv.client_id or p.client_id = v_inv.parent_client_id);
      v_pool := v_general;
    end if;

    -- Reserved deposits this invoice's estimate owns, net of what earlier invoices already drew.
    v_reserved := 0;
    for v_pay in
      select p.id, coalesce(p.unused_amount_cents, 0) as unused
        from public.crm_payments p
       where p.org_id = v_inv.org_id
         and p.estimate_id is not null
         and p.deleted_at is null
         and coalesce(p.unused_amount_cents, 0) > 0
         and (p.disputed_at is null or p.dispute_status = 'won')
         and (p.client_id = v_inv.client_id or p.client_id = v_inv.parent_client_id)
         and public.estimate_owns_invoice(p.estimate_id, v_inv.id)
       order by p.created_at, p.id
    loop
      v_avail := greatest(0, v_pay.unused - coalesce((v_used ->> v_pay.id::text)::integer, 0));
      v_reserved := v_reserved + v_avail;
    end loop;

    invoice_id := v_inv.id;
    credit_available_cents := v_general + v_reserved;
    v_need := greatest(0, v_inv.balance - v_reserved);
    if v_inv.status = 'draft' or v_inv.balance <= 0 then
      covered := false;
    elsif v_need <= v_pool then
      covered := true;
      v_pool := v_pool - v_need;
    else
      covered := false;
    end if;

    -- An issued invoice with a balance takes its share of the reserved deposits (oldest first),
    -- so the next invoice of the same estimate only sees what is left.
    if v_inv.status <> 'draft' and v_inv.balance > 0 and v_reserved > 0 then
      v_left := least(v_inv.balance, v_reserved);
      for v_pay in
        select p.id, coalesce(p.unused_amount_cents, 0) as unused
          from public.crm_payments p
         where p.org_id = v_inv.org_id
           and p.estimate_id is not null
           and p.deleted_at is null
           and coalesce(p.unused_amount_cents, 0) > 0
           and (p.disputed_at is null or p.dispute_status = 'won')
           and (p.client_id = v_inv.client_id or p.client_id = v_inv.parent_client_id)
           and public.estimate_owns_invoice(p.estimate_id, v_inv.id)
         order by p.created_at, p.id
      loop
        exit when v_left <= 0;
        v_avail := greatest(0, v_pay.unused - coalesce((v_used ->> v_pay.id::text)::integer, 0));
        v_take := least(v_avail, v_left);
        if v_take > 0 then
          v_used := jsonb_set(v_used, array[v_pay.id::text], to_jsonb(coalesce((v_used ->> v_pay.id::text)::integer, 0) + v_take));
          v_left := v_left - v_take;
        end if;
      end loop;
    end if;

    return next;
  end loop;
end;
$function$;

revoke all on function public.crm_invoice_credit_available(uuid[]) from public, anon;
grant execute on function public.crm_invoice_credit_available(uuid[]) to authenticated, service_role;

create or replace function public.portal_ticket_insert_allowed(p_client_id uuid, p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- who may ask: the service role, a member of that org, or that client's own portal login
    (
      auth.uid() is null
      or p_org_id is not distinct from public.my_org_id()
      or exists (
        select 1
          from public.client_portal_users u
         where u.user_id = auth.uid()
           and u.client_id = p_client_id
           and u.org_id = p_org_id
           and u.deleted_at is null
      )
    )
    -- portal tickets switched on (a missing settings row means allowed)
    and coalesce((
      select s.allow_tickets
      from public.client_portal_settings s
      where s.org_id = p_org_id
      limit 1
    ), true) is not false
    -- the route's rate limit: at most 10 in 10 minutes per account
    and (
      select count(*)
      from public.crm_tickets t
      where t.client_id = p_client_id
        and t.org_id = p_org_id
        and t.visible_to_client
        and t.created_at > now() - interval '10 minutes'
    ) < 10;
$$;

revoke all on function public.portal_ticket_insert_allowed(uuid, uuid) from public, anon;
grant execute on function public.portal_ticket_insert_allowed(uuid, uuid) to authenticated, service_role;

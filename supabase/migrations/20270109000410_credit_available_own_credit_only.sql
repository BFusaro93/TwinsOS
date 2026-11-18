-- crm_invoice_credit_available: count only credit checkout would actually apply.
--
-- A parent account's general (unreserved) credit was counted for EVERY child
-- account: the pool was rebuilt per client and each child's pool included the
-- parent's credit, so one $500 parent credit made every child's overdue invoice
-- report covered = true and all of them skipped their past-due reminders. Yet
-- checkout (applyCreditBeforeCharge → getClientUnappliedPayments) only ever
-- spends the invoice client's OWN unapplied credit, never the parent's.
--
-- Now:
--   - general credit = the invoice client's own unapplied, unreserved payments
--     (the parent's credit is no longer counted for a child);
--   - reserved proposal deposits = those the auto-apply
--     (_apply_reserved_deposits_to_invoice) may use: owned by the invoice's
--     estimate, paid by the client or its parent — unchanged from #530;
--   - both are drawn down PER PAYMENT across the whole call (oldest-due invoice
--     first, oldest payment first), so a payment never covers two invoices,
--     whichever clients they belong to. An invoice is "covered" only when the
--     still-undrawn credit pays its whole balance (reserved deposits first),
--     and only then is general credit drawn for it — as before.
--   - credit_available_cents keeps its meaning for display: the client's own
--     unapplied credit plus the reserved deposits still available to this invoice.
--
-- PROD: either order (read-only function; no code depends on the change).
-- PRE-CHECK: none. Re-check the PROD body matches 20270107000200 first.

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
  v_general  integer;
  v_gen_full integer;
  v_reserved integer;
  v_need     integer;
  v_used     jsonb := '{}'::jsonb;   -- payment id -> cents already drawn by an earlier invoice (whole call)
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
     order by coalesce(i.due_date, i.invoice_date), i.invoice_number nulls last, i.id
  loop
    -- The client's own unreserved credit (what checkout spends), in full and net of
    -- what earlier invoices in this call already drew.
    v_general := 0;
    v_gen_full := 0;
    for v_pay in
      select p.id, coalesce(p.unused_amount_cents, 0) as unused
        from public.crm_payments p
       where p.org_id = v_inv.org_id
         and p.client_id = v_inv.client_id
         and p.estimate_id is null
         and p.deleted_at is null
         and coalesce(p.unused_amount_cents, 0) > 0
         and (p.disputed_at is null or p.dispute_status = 'won')
    loop
      v_gen_full := v_gen_full + v_pay.unused;
      v_general := v_general + greatest(0, v_pay.unused - coalesce((v_used ->> v_pay.id::text)::integer, 0));
    end loop;

    -- Reserved deposits this invoice's estimate owns (the auto-apply's set), net of draws.
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
    loop
      v_reserved := v_reserved + greatest(0, v_pay.unused - coalesce((v_used ->> v_pay.id::text)::integer, 0));
    end loop;

    invoice_id := v_inv.id;
    credit_available_cents := v_gen_full + v_reserved;
    covered := false;

    if v_inv.status <> 'draft' and v_inv.balance > 0 then
      -- Reserved deposits first (they can't go anywhere else), oldest payment first.
      if v_reserved > 0 then
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
           order by p.payment_date, p.created_at, p.id
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

      v_need := greatest(0, v_inv.balance - v_reserved);
      if v_need <= v_general then
        covered := true;
        -- Draw the rest from the client's own credit, oldest payment first.
        v_left := v_need;
        for v_pay in
          select p.id, coalesce(p.unused_amount_cents, 0) as unused
            from public.crm_payments p
           where p.org_id = v_inv.org_id
             and p.client_id = v_inv.client_id
             and p.estimate_id is null
             and p.deleted_at is null
             and coalesce(p.unused_amount_cents, 0) > 0
             and (p.disputed_at is null or p.dispute_status = 'won')
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
    end if;

    return next;
  end loop;
end;
$function$;

revoke all on function public.crm_invoice_credit_available(uuid[]) from public, anon;
grant execute on function public.crm_invoice_credit_available(uuid[]) to authenticated, service_role;

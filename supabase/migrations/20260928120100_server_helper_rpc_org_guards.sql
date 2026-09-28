-- =============================================================================
-- Server-side SECURITY DEFINER helpers were EXECUTE-able by any signed-in
-- user for ANY org (inflate another tenant's SMS bill / exhaust its AI quota,
-- burn its rate-limit window, renumber or rebalance another org's invoices
-- and clients).
--
-- Per function (callers grepped in src/ and supabase/functions/):
--   zapier_rate_limit_hit   only caller: lib/integrations/zapier.ts (service
--                           role adminClient)        -> REVOKE from authenticated/anon
--   auth_rate_limit_hit     only caller: lib/auth/rate-limit.ts (service
--                           role)                    -> REVOKE from authenticated/anon
--   increment_sms_usage     lib/sms/send.ts, called with a session client
--                           from /api/crm/clients/[id]/send-sms -> org guard
--   try_increment_ai_chat_usage   /api/support/ask (session client)  -> org guard
--   try_increment_ai_draft_usage  /api/crm/estimates/[id]/ai-draft (session) -> org guard
--   assign_invoice_number   browser hooks (use-invoices, use-contracts,
--                           use-snow-invoicing) + server -> org guard
--   sync_client_balance     browser hooks + server   -> org guard
--
-- Org guard: when called by a signed-in user (auth.uid() is not null) the
-- target must belong to my_org_id() (honours staff impersonation). Service
-- role / cron / webhook callers have no auth.uid() and are unaffected.
-- assign_invoice_number / sync_client_balance skip the guard when invoked
-- from a trigger (pg_trigger_depth() > 0): the trg_sync_client_balance_*
-- triggers fire on writes RLS already authorized, and must keep working for
-- sessions whose my_org_id() is NULL (portal users have no profiles row).
-- Bodies are re-stated verbatim from the live PROD definitions (2026-09-28)
-- with only the guard added. CREATE OR REPLACE keeps existing grants.
-- Safe to apply before or after the code deploy. Idempotent.
-- =============================================================================

-- ── Service-role only ────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.zapier_rate_limit_hit(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auth_rate_limit_hit(text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zapier_rate_limit_hit(uuid, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_rate_limit_hit(text, timestamptz, integer) TO service_role;

-- ── increment_sms_usage ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_sms_usage(p_org_id uuid, p_period_start date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_org_id IS DISTINCT FROM public.my_org_id() THEN
    RAISE EXCEPTION 'not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  insert into organization_sms_usage (org_id, period_start, count)
  values (p_org_id, p_period_start, 1)
  on conflict (org_id, period_start)
  do update set count = organization_sms_usage.count + 1, updated_at = now();
END;
$function$;

-- ── try_increment_ai_chat_usage ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.try_increment_ai_chat_usage(p_org_id uuid, p_day date, p_limit integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_count integer;
begin
  if auth.uid() is not null and p_org_id is distinct from public.my_org_id() then
    raise exception 'not authorized for this organization' using errcode = '42501';
  end if;

  insert into organization_ai_chat_usage (org_id, usage_date, count)
  values (p_org_id, p_day, 1)
  on conflict (org_id, usage_date)
  do update set count = organization_ai_chat_usage.count + 1, updated_at = now()
    where organization_ai_chat_usage.count < p_limit
  returning count into new_count;

  return new_count is not null;
end;
$function$;

-- ── try_increment_ai_draft_usage ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.try_increment_ai_draft_usage(p_org_id uuid, p_day date, p_limit integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_count integer;
begin
  if auth.uid() is not null and p_org_id is distinct from public.my_org_id() then
    raise exception 'not authorized for this organization' using errcode = '42501';
  end if;

  insert into organization_ai_draft_usage (org_id, usage_date, count)
  values (p_org_id, p_day, 1)
  on conflict (org_id, usage_date)
  do update set count = organization_ai_draft_usage.count + 1, updated_at = now()
    where organization_ai_draft_usage.count < p_limit
  returning count into new_count;

  return new_count is not null;
end;
$function$;

-- ── assign_invoice_number ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_invoice_number(p_invoice_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_num integer;
  v_org uuid;
BEGIN
  SELECT invoice_number, org_id INTO v_num, v_org FROM crm_invoices WHERE id = p_invoice_id;
  IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 0 AND v_org IS DISTINCT FROM public.my_org_id() THEN
    RAISE EXCEPTION 'invoice not found' USING ERRCODE = '42501';
  END IF;
  -- Only assign if not already set
  IF v_num IS NOT NULL THEN
    RETURN v_num;
  END IF;
  v_num := nextval('crm_invoices_number_seq');
  UPDATE crm_invoices SET invoice_number = v_num WHERE id = p_invoice_id;
  RETURN v_num;
END;
$function$;

-- ── sync_client_balance ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_client_balance(p_client_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null
     and pg_trigger_depth() = 0
     and not exists (
       select 1 from clients c
       where c.id = p_client_id and c.org_id = public.my_org_id()
     ) then
    raise exception 'client not found' using errcode = '42501';
  end if;

  update clients
  set
    balance_outstanding_cents = coalesce(
      (select sum(balance_cents)
       from crm_invoices
       where client_id = p_client_id
         and deleted_at is null
         and status not in ('void', 'draft')),
      0
    ),
    balance_uninvoiced_cents = coalesce(
      (select sum(total_cents)
       from crm_invoices
       where client_id = p_client_id
         and deleted_at is null
         and status = 'draft'),
      0
    ),
    balance_prepay_cents = coalesce(
      (
        select sum(
          greatest(0,
            p.amount_cents - p.refunded_amount_cents -
            coalesce(alloc.total_cents, case when p.invoice_id is not null then p.amount_cents else 0 end)
          )
        )
        from crm_payments p
        left join (
          select payment_id, sum(amount_cents) as total_cents
          from crm_payment_allocations
          group by payment_id
        ) alloc on alloc.payment_id = p.id
        where p.client_id = p_client_id
          and p.is_prepayment = true
          and p.deleted_at is null
      ),
      0
    ),
    balance_credits_cents = coalesce(
      (
        select sum(
          greatest(0,
            p.amount_cents - p.refunded_amount_cents -
            coalesce(alloc.total_cents, case when p.invoice_id is not null then p.amount_cents else 0 end)
          )
        )
        from crm_payments p
        left join (
          select payment_id, sum(amount_cents) as total_cents
          from crm_payment_allocations
          group by payment_id
        ) alloc on alloc.payment_id = p.id
        where p.client_id = p_client_id
          and p.is_prepayment = false
          and p.deleted_at is null
      ),
      0
    )
  where id = p_client_id;
end;
$function$;

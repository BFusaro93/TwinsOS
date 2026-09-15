-- 63 SECURITY DEFINER functions were callable by `anon` — i.e. by anyone with
-- the publishable key, which ships in the browser bundle, with NO login at all
-- — over POST /rest/v1/rpc/<name>.
--
-- Postgres grants EXECUTE to PUBLIC by default on every function, and `anon`
-- inherits it. Nothing in this codebase ever revoked it, so every RPC added
-- over the life of the project quietly landed on the public API.
--
-- This is not theoretical. Verified against PROD as role `anon` with no JWT:
--
--   apply_payment_to_invoice(<invoice>, 100000)  -> a $1,000 invoice went to
--                                                   paid=100000, balance=0
--   refund_payment(<payment>, 100000)            -> executed
--   increment_invoice_totals(<invoice>, 50000)   -> executed
--   sync_client_balance(<client>)                -> executed
--
-- The org guard inside those functions does NOT stop it. They are written
--
--   if v_org_id != public.my_org_id() then raise exception 'Unauthorized';
--
-- and for an unauthenticated caller my_org_id() is NULL, so `v_org_id != NULL`
-- evaluates to NULL — not true — and the exception never fires. The guard
-- fails open exactly when there is no caller identity.
--
-- IMPORTANT — why the guard is NOT the thing being fixed here: that fail-open
-- is load-bearing for every service-role path. The Stripe Connect webhook, the
-- deposit recorder, the visit-completion auto-invoice and the public
-- proposal/invoice routes all call these functions through a service-role
-- client, where my_org_id() is likewise NULL. Tightening the comparison to
-- `is distinct from` (or rejecting a NULL org) would break all of them. The
-- correct control is the grant: an unauthenticated caller should never reach
-- the function at all.
--
-- `authenticated` deliberately KEEPS execute, preserving today's behaviour —
-- several of these are called straight from the browser by signed-in staff
-- (apply_payment_to_invoice via use-invoices.ts, my_org_id/my_role/
-- has_crm_access from RLS policies, and so on). Narrowing the authenticated
-- surface — e.g. that any signed-in user can call receive_part_quantity or
-- insert_audit_entry with an arbitrary p_org_id — is a separate, larger piece
-- of work; those at least have a working org guard for a caller who HAS an org.
--
-- Written generatively rather than as 63 hand-typed signatures: it is
-- idempotent, it cannot drift from the catalogue, and re-running it after new
-- RPCs are added re-closes the same hole.
do $$
declare
  r record;
  v_revoked integer := 0;
  -- Functions that MUST stay callable without a session.
  --
  -- These are the identity predicates RLS policies are written in terms of —
  -- my_org_id() appears in 133 policies, has_crm_access() in 105. A policy is
  -- evaluated as the querying role, so if anon can't execute the helper the
  -- policy ERRORS instead of evaluating to false: an anonymous select against
  -- `clients` returns "permission denied for function my_org_id" rather than
  -- zero rows. That turns a clean empty result into a hard failure on every
  -- pre-login page.
  --
  -- Leaving them executable leaks nothing. With no session they return NULL
  -- (my_org_id, my_role), false (has_crm_access, is_staff,
  -- has_settings_permission) or an empty set (my_crew_ids), which is exactly
  -- what makes the policies deny by default.
  --
  -- Every genuinely public route in this app (proposals, invoices, forms, work
  -- requests) goes through a SERVICE-ROLE client, and so does
  -- auth_rate_limit_hit — none of them need anon EXECUTE on anything else.
  v_anon_allowlist text[] := array[
    'my_org_id', 'my_role', 'my_crew_ids',
    'has_crm_access', 'has_settings_permission', 'is_staff'
  ];
begin
  for r in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           p.prorettype = 'trigger'::regtype::oid     as is_trigger
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and not (p.proname = any(v_anon_allowlist))
  loop
    execute format('revoke execute on function public.%I(%s) from public, anon', r.proname, r.args);

    -- A trigger function is invoked by the trigger as its definer and needs no
    -- EXECUTE grant on any role, so it is left with none.
    if not r.is_trigger then
      execute format('grant execute on function public.%I(%s) to authenticated, service_role',
                     r.proname, r.args);
    end if;

    v_revoked := v_revoked + 1;
  end loop;

  raise notice 'revoked anon EXECUTE on % SECURITY DEFINER function(s)', v_revoked;
end $$;

-- Re-grant the policy helpers explicitly, so this migration is correct even on
-- an environment where an earlier revoke already took them away.
-- (20260910160000 revoked my_crew_ids from anon, which had already made the
-- crew visit policy error for an anonymous reader.)
grant execute on function public.my_org_id()                              to anon;
grant execute on function public.my_role()                                to anon;
grant execute on function public.my_crew_ids()                            to anon;
grant execute on function public.has_crm_access()                         to anon;
grant execute on function public.has_settings_permission(p_key text)      to anon;
grant execute on function public.is_staff(uid uuid)                       to anon;

-- Shared helpers for the crm_roles write guards (20261207000200..000500).
--
-- has_crm_access() lets ANY active CRM seat write every CRM table; the
-- crm_roles keys (acct_add_modify_invoices, estimate_edit, contract_delete,
-- ...) were only enforced by hiding buttons. The guards that follow are
-- BEFORE triggers that check the key when a write comes straight from an
-- end-user session — the supabase-js call a browser console can make.
--
-- _crm_direct_user_write() is true only for that case. It is false for:
--   * no end-user session (auth.uid() null): service role, cron, webhooks,
--     the /api/v1 and Zapier key routes, edge functions
--   * SECURITY DEFINER RPCs: current_user is the function owner there. Those
--     RPCs carry their own checks (the money RPCs use _acct_permitted).
--   * cascades from another table's trigger (pg_trigger_depth() > 1), e.g. a
--     payment trigger re-syncing an invoice's balance, or a visit trigger
--     releasing its invoice line. The user's own write was checked by the
--     guard on the table they wrote.
-- Must stay SECURITY INVOKER: current_user is the whole point.
create or replace function public._crm_direct_user_write()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select auth.uid() is not null
     and current_user in ('authenticated', 'anon')
     and pg_trigger_depth() <= 1;
$$;

-- True when the caller holds ANY of the keys (admins always pass, see
-- has_settings_permission).
create or replace function public._crm_has_any_permission(p_keys text[])
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from unnest(coalesce(p_keys, '{}'::text[])) k
    where public.has_settings_permission(k)
  );
$$;

-- True when a row update changed any column OTHER than p_allowed (and
-- updated_at, which set_updated_at stamps on every write). An entry ending in
-- '*' matches a column prefix ('qbo_*').
create or replace function public._crm_changed_outside(
  p_old jsonb, p_new jsonb, p_allowed text[]
)
returns boolean
language sql
immutable
security invoker
set search_path = public
as $$
  with allowed as (
    select a from unnest(coalesce(p_allowed, '{}'::text[]) || array['updated_at']) a
  ),
  o as (
    select key, value from jsonb_each(p_old)
    where not exists (
      select 1 from allowed
      where key = a or (right(a, 1) = '*' and key like left(a, -1) || '%')
    )
  ),
  n as (
    select key, value from jsonb_each(p_new)
    where not exists (
      select 1 from allowed
      where key = a or (right(a, 1) = '*' and key like left(a, -1) || '%')
    )
  )
  select exists (
    select 1 from o full join n using (key)
    where o.value is distinct from n.value
  );
$$;

revoke all on function public._crm_direct_user_write() from public, anon;
revoke all on function public._crm_has_any_permission(text[]) from public, anon;
revoke all on function public._crm_changed_outside(jsonb, jsonb, text[]) from public, anon;
grant execute on function public._crm_direct_user_write() to authenticated, service_role;
grant execute on function public._crm_has_any_permission(text[]) to authenticated, service_role;
grant execute on function public._crm_changed_outside(jsonb, jsonb, text[]) to authenticated, service_role;

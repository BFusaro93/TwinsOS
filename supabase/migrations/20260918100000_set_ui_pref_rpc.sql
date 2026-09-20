-- Per-user UI preferences (profiles.ui_prefs, added in 20260918060000) were
-- being saved with a client-side read-modify-write of the WHOLE jsonb blob:
-- use-ui-prefs.ts read the current value out of the TanStack cache, spread it,
-- and wrote the result back. That loses writes three ways, all reachable:
--
--   * Toggling a column before the profiles query resolves means the cached
--     value is `undefined`, so `current` falls back to `{}` and the save wipes
--     every OTHER view's saved column list.
--   * A failed profiles read (this repo has a history of 406s there) leaves the
--     cache empty permanently, so the next save wipes everything.
--   * Two tabs each hold their own snapshot, so the second save silently
--     reverts the first tab's change.
--
-- Merging server-side makes the whole class impossible: `||` on jsonb replaces
-- only the one top-level key being written and leaves every sibling key alone,
-- atomically, inside the UPDATE.
--
-- SECURITY INVOKER is deliberate. This needs no elevated privilege — the
-- existing "users_update_own_profile" policy (USING id = auth.uid()) is what
-- authorizes the write, and prevent_profile_role_escalation still guards
-- role/org_id. Running as the caller keeps both in force, so this function
-- cannot be used to touch anyone else's row.
create or replace function public.set_ui_pref(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_prefs jsonb;
begin
  if p_key is null or btrim(p_key) = '' then
    raise exception 'set_ui_pref: p_key is required';
  end if;

  update public.profiles
     set ui_prefs   = coalesce(ui_prefs, '{}'::jsonb) || jsonb_build_object(p_key, p_value),
         updated_at = now()
   where id = auth.uid()
  returning ui_prefs into v_prefs;

  -- No row updated means no authenticated caller (or RLS refused), which the
  -- client must surface rather than treat as a successful save — the whole
  -- point of this change is that a failed write stops being invisible.
  if not found then
    raise exception 'set_ui_pref: no profile row for the current user';
  end if;

  return coalesce(v_prefs, '{}'::jsonb);
end;
$$;

revoke execute on function public.set_ui_pref(text, jsonb) from public, anon;
grant execute on function public.set_ui_pref(text, jsonb) to authenticated;

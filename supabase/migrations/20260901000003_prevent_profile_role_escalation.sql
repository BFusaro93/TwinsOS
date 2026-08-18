-- users_update_own_profile ("FOR UPDATE USING (id = auth.uid())", initial_schema.sql)
-- has no WITH CHECK, so it defaults to the USING clause — it only restricts
-- WHICH ROW can be updated (must be your own), not which columns/values.
-- Any authenticated user could run:
--   supabase.from("profiles").update({ role: "admin" }).eq("id", <own uid>)
-- and self-promote to org admin, since Postgres RLS OR's every applicable
-- policy together and this one imposes no column restriction at all.
--
-- Rather than rewrite the existing self-update policy (used for name/
-- avatar_url edits from account settings), add a trigger that rejects any
-- change to role/org_id unless the acting user is already an admin. This
-- also covers crm_employees-style privilege paths uniformly and doesn't
-- interfere with service-role writes (invite/create-crew routes already
-- verify caller.role === 'admin' server-side before using the admin
-- client, and auth.uid() is null under a service-role session — the
-- trigger only enforces the admin check when there IS an authenticated
-- caller to check).

create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_caller_role text;
begin
  if new.role is distinct from old.role or new.org_id is distinct from old.org_id then
    if v_caller_id is null then
      -- Service-role session (no JWT) — the API route calling this already
      -- verified the caller's admin status before using the admin client.
      return new;
    end if;

    select role into v_caller_role from public.profiles where id = v_caller_id;

    if v_caller_role is distinct from 'admin' then
      raise exception 'Only an admin may change role or org_id on a profile';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_profile_role_escalation on public.profiles;
create trigger trg_prevent_profile_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_role_escalation();

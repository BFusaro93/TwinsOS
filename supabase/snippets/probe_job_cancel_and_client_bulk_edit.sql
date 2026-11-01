-- Regression probe for 20261202000100 (job_cancel) and 20261202000200
-- (client_bulk_edit). Run on a DB that has both migrations (TEST only).
-- Everything runs inside one transaction and ends with a forced error so
-- nothing persists ("rollback sentinel"): read the error text for results.
--
-- Picks an existing org's non-admin CRM employee that LACKS both keys, then
-- impersonates them via request.jwt.claims. Adjust the two selects if the
-- org has no such employee.
do $$
declare
  v_uid     uuid;
  v_job     uuid;
  v_clients uuid[];
  v_results text := '';
  v_blocked boolean;
begin
  select ce.user_id into v_uid
  from crm_employees ce
  join crm_roles cr on cr.id = ce.crm_role_id
  join profiles p on p.id = ce.user_id
  where ce.user_id is not null and ce.deleted_at is null and ce.is_active
    and p.role is distinct from 'admin' and p.role is distinct from 'crew'
    and coalesce((cr.permissions ->> 'job_cancel')::boolean, false) = false
    and coalesce((cr.permissions ->> 'client_bulk_edit')::boolean, false) = false
  limit 1;
  if v_uid is null then
    -- No such employee exists (e.g. TEST has only an admin): fabricate one.
    -- Rolled back with everything else.
    declare
      v_org  uuid := (select org_id from crm_jobs where deleted_at is null and status <> 'cancelled' limit 1);
      v_role uuid;
    begin
      v_uid := gen_random_uuid();
      insert into auth.users (id, email) values (v_uid, 'probe-' || v_uid || '@example.invalid');
      insert into profiles (id, org_id, name, email, role)
        values (v_uid, v_org, 'Probe User', 'probe-' || v_uid || '@example.invalid', 'manager')
        on conflict (id) do update set org_id = excluded.org_id, role = 'manager';
      insert into crm_roles (org_id, name, permissions) values (v_org, 'probe-role', '{}'::jsonb)
        returning id into v_role;
      insert into crm_employees (org_id, first_name, last_name, user_id, crm_role_id)
        values (v_org, 'Probe', 'User', v_uid, v_role);
    end;
  end if;

  select j.id into v_job from crm_jobs j
  join profiles p on p.org_id = j.org_id and p.id = v_uid
  where j.deleted_at is null and j.status <> 'cancelled' limit 1;
  select array_agg(c.id) into v_clients from (
    select c.id from clients c join profiles p on p.org_id = c.org_id and p.id = v_uid
    where c.deleted_at is null limit 3) c;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1. job cancel without the key must fail
  v_blocked := false;
  begin
    update crm_jobs set status = 'cancelled' where id = v_job;
  exception when insufficient_privilege then v_blocked := true;
  end;
  v_results := v_results || format('job_cancel blocked w/o key: %s; ', v_blocked);

  -- 2. multi-row client bulk edit without the key must fail
  v_blocked := false;
  begin
    update clients set priority = 'high' where id = any (v_clients);
  exception when insufficient_privilege then v_blocked := true;
  end;
  v_results := v_results || format('bulk edit blocked w/o key: %s; ', v_blocked);

  -- 3. single-row edit of the same field must still succeed (client_allow_edit)
  begin
    update clients set priority = 'high' where id = v_clients[1];
    v_results := v_results || 'single-row edit allowed (or RLS no-op); ';
  exception when insufficient_privilege then
    v_results := v_results || 'single-row edit blocked by RLS (role lacks client_allow_edit); ';
  end;

  -- 4. service-role style (no uid) path is exempt
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  update crm_jobs set status = 'cancelled' where id = v_job;
  update clients set priority = 'low' where id = any (v_clients);
  v_results := v_results || 'no-session updates allowed';

  raise exception 'PROBE RESULT (rolled back): %', v_results;
end $$;

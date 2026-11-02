-- Server-side search + filtering for the Landscapt Clients list.
--
-- The Clients page used to download every client in the org (select * plus
-- tags and sales rep, paged 1000 at a time) and filter/search in the
-- browser. One org has 4,600+ clients, so the page, every client picker and
-- global search each pulled the whole table — and the "Has Scheduled /
-- Completed Job For" filters read a visit list that PostgREST silently capped
-- at 1000 rows, so they were wrong for any org with more visits than that.
--
-- crm_search_clients() evaluates the same search box and filter rows the
-- client-side src/lib/client-filters.ts does, in SQL. It returns SETOF
-- clients, so callers keep using PostgREST on the result: embeds
-- (client_tags, sales_rep), extra filters (.neq("status","lead"),
-- .is("parent_client_id", null)), .order(), .range() paging and
-- count: "exact" all still work.
--
-- SECURITY INVOKER: every table read here goes through the caller's own RLS
-- (org scoping, has_crm_access, portal exclusions), exactly as the old
-- direct `from("clients")` select did.

-- ── one filter row ────────────────────────────────────────────────────────────
-- f = { field, operator, value } — the FilterRow shape from client-filters.ts.
-- Mirrors matchesFilterRow() case by case; returns true for an empty value or
-- an unknown field/operator, never NULL.
create or replace function public.crm_client_matches_filter(c public.clients, f jsonb)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  with p as (
    select
      coalesce(f->>'field', '')    as field,
      coalesce(f->>'operator', '') as op,
      coalesce(f->>'value', '')    as val,
      lower(coalesce(f->>'value', '')) as lval,
      -- Select-type values are a comma-joined "is any of" list.
      array(
        select btrim(x) from unnest(string_to_array(coalesce(f->>'value', ''), ',')) x
        where btrim(x) <> ''
      ) as vals,
      case when btrim(coalesce(f->>'value', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
           then btrim(f->>'value')::numeric end as num
  )
  select coalesce((
    select case
      when p.val = '' then true

      when p.field in ('status', 'account_type', 'source', 'sales_rep', 'priority') then
        case p.op
          when 'eq'  then coalesce(x.v = any(p.vals), false)
          when 'neq' then not coalesce(x.v = any(p.vals), false)
          else true
        end

      when p.field = 'balance' then
        case
          when p.num is null then true
          when p.op = 'eq'  then coalesce(c.balance_outstanding_cents, 0)::numeric / 100 =  p.num
          when p.op = 'lt'  then coalesce(c.balance_outstanding_cents, 0)::numeric / 100 <  p.num
          when p.op = 'gt'  then coalesce(c.balance_outstanding_cents, 0)::numeric / 100 >  p.num
          when p.op = 'lte' then coalesce(c.balance_outstanding_cents, 0)::numeric / 100 <= p.num
          when p.op = 'gte' then coalesce(c.balance_outstanding_cents, 0)::numeric / 100 >= p.num
          else true
        end

      when p.field in ('city', 'service_city') then
        case p.op
          when 'contains'    then strpos(x.v, p.lval) > 0
          when 'starts_with' then starts_with(x.v, p.lval)
          when 'eq'          then x.v = p.lval
          else true
        end

      when p.field = 'zip' then
        case p.op
          when 'eq'       then x.v = p.val
          when 'contains' then strpos(x.v, p.val) > 0
          else true
        end

      when p.field = 'client_since' then
        case
          when c.client_since is null then false
          when p.op = 'eq'  then x.v =  p.val
          when p.op = 'lt'  then x.v <  p.val
          when p.op = 'gt'  then x.v >  p.val
          when p.op = 'lte' then x.v <= p.val
          when p.op = 'gte' then x.v >= p.val
          else true
        end

      when p.field = 'tags' then
        case p.op
          when 'eq'  then exists (select 1 from public.client_tags t where t.client_id = c.id and t.tag = any(p.vals))
          when 'neq' then not exists (select 1 from public.client_tags t where t.client_id = c.id and t.tag = any(p.vals))
          else true
        end

      -- A visit counts toward its own job service when it has one, otherwise
      -- toward every service on its job (same rule as useClientServiceHistory).
      when p.field in ('scheduled_service', 'completed_service') then
        exists (
          select 1
          from public.crm_job_visits v
          join public.crm_job_services s
            on s.id = v.job_service_id
            or (s.job_id = v.job_id
                and not exists (select 1 from public.crm_job_services s2 where s2.id = v.job_service_id))
          where v.client_id = c.id
            and v.deleted_at is null
            and s.service_name = any(p.vals)
            and case when p.field = 'completed_service'
                     then v.status = 'completed'
                     else coalesce(v.status, '') not in ('completed', 'cancelled', 'skipped') end
        )

      when p.field in ('referred_by', 'do_not_market', 'taxable', 'ok_to_email') then
        case
          when p.op = 'eq' and p.val = 'yes' then x.b
          when p.op = 'eq' and p.val = 'no'  then not x.b
          else true
        end

      when p.field like 'custom:%' then
        case
          when substr(p.field, 8) !~ '^[0-9a-fA-F-]{36}$' then false
          else exists (
            select 1
            from public.crm_client_custom_field_values cv
            cross join lateral (select coalesce(cv.value_number::text, cv.value_text) as sv) s
            where cv.client_id = c.id
              and cv.field_def_id = substr(p.field, 8)::uuid
              and s.sv is not null
              and case p.op
                    when 'contains'    then strpos(lower(s.sv), p.lval) > 0
                    when 'starts_with' then starts_with(lower(s.sv), p.lval)
                    when 'eq' then
                      case when cv.value_number is not null and p.num is not null
                           then cv.value_number = p.num
                           else lower(s.sv) = p.lval end
                    when 'lt'  then cv.value_number is null or p.num is null or cv.value_number <  p.num
                    when 'gt'  then cv.value_number is null or p.num is null or cv.value_number >  p.num
                    when 'lte' then cv.value_number is null or p.num is null or cv.value_number <= p.num
                    when 'gte' then cv.value_number is null or p.num is null or cv.value_number >= p.num
                    else true
                  end
          )
        end

      else true
    end
    from p
    cross join lateral (
      select
        case p.field
          when 'status'       then c.status
          when 'account_type' then c.account_type
          when 'source'       then nullif(c.source, '')
          when 'sales_rep'    then c.sales_rep_id::text
          when 'priority'     then coalesce(c.priority, 'normal')
          when 'city'         then lower(coalesce(c.billing_city, ''))
          when 'service_city' then lower(coalesce(c.service_city, ''))
          when 'zip'          then coalesce(c.billing_zip, c.service_zip, '')
          when 'client_since' then to_char(c.client_since, 'YYYY-MM-DD')
        end as v,
        case p.field
          when 'referred_by'   then coalesce(c.referred_by, '') <> ''
          when 'do_not_market' then coalesce(c.do_not_market, false)
          when 'taxable'       then coalesce(c.is_taxable, true)
          when 'ok_to_email'   then coalesce(c.ok_to_email, true)
        end as b
    ) x
  ), true);
$$;

-- ── the list ──────────────────────────────────────────────────────────────────
-- p_search matches name, account #, email, phone (raw, or digits-only once 3+
-- digits are typed, across every saved phone), billing/service address, city
-- and zip, and tags. p_filters is a JSON array of filter rows, all of which
-- must match.
create or replace function public.crm_search_clients(
  p_search  text  default null,
  p_filters jsonb default '[]'::jsonb
)
returns setof public.clients
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select
      lower(btrim(coalesce(p_search, ''))) as q,
      regexp_replace(coalesce(p_search, ''), '\D', '', 'g') as qd,
      case when jsonb_typeof(p_filters) = 'array' then p_filters else '[]'::jsonb end as filters
  )
  select c.*
  from public.clients c, q
  where c.deleted_at is null
    and (
      q.q = ''
      or strpos(lower(c.display_name), q.q) > 0
      or strpos(lower(coalesce(c.account_number, '')), q.q) > 0
      or strpos(lower(coalesce(c.primary_email, '')), q.q) > 0
      or strpos(coalesce(c.primary_phone, ''), q.q) > 0
      or strpos(lower(coalesce(c.billing_address, '')), q.q) > 0
      or strpos(lower(coalesce(c.billing_city, '')), q.q) > 0
      or strpos(coalesce(c.billing_zip, ''), q.q) > 0
      or strpos(lower(coalesce(c.service_address, '')), q.q) > 0
      or strpos(lower(coalesce(c.service_city, '')), q.q) > 0
      or strpos(coalesce(c.service_zip, ''), q.q) > 0
      or (length(q.qd) >= 3 and (
        strpos(regexp_replace(coalesce(c.primary_phone, ''), '\D', '', 'g'), q.qd) > 0
        or exists (
          select 1
          from jsonb_array_elements(case when jsonb_typeof(c.phones) = 'array' then c.phones else '[]'::jsonb end) ph
          where strpos(regexp_replace(coalesce(ph->>'phone', ''), '\D', '', 'g'), q.qd) > 0
        )
      ))
      or exists (
        select 1 from public.client_tags t
        where t.client_id = c.id and strpos(lower(t.tag), q.q) > 0
      )
    )
    and not exists (
      select 1 from jsonb_array_elements(q.filters) f
      where not public.crm_client_matches_filter(c, f)
    );
$$;

-- ── filter dropdown options ───────────────────────────────────────────────────
-- The Client Source / Sales Rep filter options were derived from the full
-- client list in the browser; this returns the same distinct values without
-- downloading every client.
create or replace function public.crm_client_filter_options()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'sources', coalesce((
      select jsonb_agg(s.source order by s.source)
      from (
        select distinct c.source from public.clients c
        where c.deleted_at is null and coalesce(c.source, '') <> ''
      ) s
    ), '[]'::jsonb),
    'sales_reps', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by r.name)
      from (
        select e.id, btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) as name
        from public.crm_employees e
        where e.id in (
          select c.sales_rep_id from public.clients c
          where c.deleted_at is null and c.sales_rep_id is not null
        )
      ) r
      where r.name <> ''
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.crm_client_matches_filter(public.clients, jsonb) from public, anon;
revoke all on function public.crm_search_clients(text, jsonb) from public, anon;
revoke all on function public.crm_client_filter_options() from public, anon;
grant execute on function public.crm_client_matches_filter(public.clients, jsonb) to authenticated;
grant execute on function public.crm_search_clients(text, jsonb) to authenticated;
grant execute on function public.crm_client_filter_options() to authenticated;

notify pgrst, 'reload schema';

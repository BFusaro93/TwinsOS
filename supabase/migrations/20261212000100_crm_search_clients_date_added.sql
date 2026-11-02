-- Leads "Date Added" filter + leads list paging.
--
-- The Leads table's "Date Added" filter targeted client_since, which stays
-- empty until a lead converts (0 of 1,584 leads on PROD had it), so the filter
-- never matched anything. It now targets date_added: Client Since when set,
-- otherwise the day the record was created in the org's timezone — exactly
-- what the Date Added column shows.
--
-- The Leads list moves onto crm_search_clients() (20261210000100) with a
-- status = lead filter row; this re-states the function with the new field.
-- Everything else in the body is unchanged.

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
      regexp_replace(coalesce(p_search, ''), '\D', '', 'g') as qd
  ),
  -- Each filter row parsed once (materialized, so not per client).
  f as materialized (
    select
      coalesce(e->>'field', '')    as field,
      coalesce(e->>'operator', '') as op,
      e->>'value'                  as val,
      lower(e->>'value')           as lval,
      -- Select-type values are a comma-joined "is any of" list.
      array(
        select btrim(x) from unnest(string_to_array(e->>'value', ',')) x
        where btrim(x) <> ''
      ) as vals,
      case when btrim(e->>'value') ~ '^-?[0-9]+(\.[0-9]+)?$'
           then btrim(e->>'value')::numeric end as num,
      case when e->>'field' ~ '^custom:[0-9a-fA-F-]{36}$'
           then substr(e->>'field', 8)::uuid end as custom_id
    from jsonb_array_elements(case when jsonb_typeof(p_filters) = 'array' then p_filters else '[]'::jsonb end) e
    where coalesce(e->>'value', '') <> ''
  )
  select c.*
  from public.clients c
  cross join q
  cross join lateral (
    select to_char(coalesce(
      c.client_since,
      (c.created_at at time zone coalesce(
        (select o.timezone from public.organizations o where o.id = c.org_id), 'America/New_York'))::date
    ), 'YYYY-MM-DD') as d
  ) x_added
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
    -- Every filter row must match. Mirrors matchesFilterRow() in
    -- src/lib/client-filters.ts case by case; an unknown field/operator matches.
    and not exists (
      select 1 from f
      where not coalesce((
        case
          when f.field in ('status', 'account_type', 'source', 'sales_rep', 'priority') then
            case f.op
              when 'eq'  then coalesce(
                case f.field
                  when 'status'       then c.status
                  when 'account_type' then c.account_type
                  when 'source'       then nullif(c.source, '')
                  when 'sales_rep'    then c.sales_rep_id::text
                  else coalesce(c.priority, 'normal')
                end = any(f.vals), false)
              when 'neq' then not coalesce(
                case f.field
                  when 'status'       then c.status
                  when 'account_type' then c.account_type
                  when 'source'       then nullif(c.source, '')
                  when 'sales_rep'    then c.sales_rep_id::text
                  else coalesce(c.priority, 'normal')
                end = any(f.vals), false)
              else true
            end

          when f.field = 'balance' then
            case
              when f.num is null then true
              when f.op = 'eq'  then coalesce(c.balance_outstanding_cents, 0)::numeric / 100 =  f.num
              when f.op = 'lt'  then coalesce(c.balance_outstanding_cents, 0)::numeric / 100 <  f.num
              when f.op = 'gt'  then coalesce(c.balance_outstanding_cents, 0)::numeric / 100 >  f.num
              when f.op = 'lte' then coalesce(c.balance_outstanding_cents, 0)::numeric / 100 <= f.num
              when f.op = 'gte' then coalesce(c.balance_outstanding_cents, 0)::numeric / 100 >= f.num
              else true
            end

          when f.field in ('city', 'service_city') then
            case f.op
              when 'contains'    then strpos(lower(coalesce(case f.field when 'city' then c.billing_city else c.service_city end, '')), f.lval) > 0
              when 'starts_with' then starts_with(lower(coalesce(case f.field when 'city' then c.billing_city else c.service_city end, '')), f.lval)
              when 'eq'          then lower(coalesce(case f.field when 'city' then c.billing_city else c.service_city end, '')) = f.lval
              else true
            end

          when f.field = 'zip' then
            case f.op
              when 'eq'       then coalesce(c.billing_zip, c.service_zip, '') = f.val
              when 'contains' then strpos(coalesce(c.billing_zip, c.service_zip, ''), f.val) > 0
              else true
            end

          when f.field = 'client_since' then
            case
              when c.client_since is null then false
              when f.op = 'eq'  then to_char(c.client_since, 'YYYY-MM-DD') =  f.val
              when f.op = 'lt'  then to_char(c.client_since, 'YYYY-MM-DD') <  f.val
              when f.op = 'gt'  then to_char(c.client_since, 'YYYY-MM-DD') >  f.val
              when f.op = 'lte' then to_char(c.client_since, 'YYYY-MM-DD') <= f.val
              when f.op = 'gte' then to_char(c.client_since, 'YYYY-MM-DD') >= f.val
              else true
            end

          -- Leads' "Date Added": Client Since when set, otherwise the day the
          -- record was created in the org's timezone (same as the column).
          when f.field = 'date_added' then
            case
              when f.op = 'eq'  then x_added.d =  f.val
              when f.op = 'lt'  then x_added.d <  f.val
              when f.op = 'gt'  then x_added.d >  f.val
              when f.op = 'lte' then x_added.d <= f.val
              when f.op = 'gte' then x_added.d >= f.val
              else true
            end

          when f.field = 'tags' then
            case f.op
              when 'eq'  then exists (select 1 from public.client_tags t where t.client_id = c.id and t.tag = any(f.vals))
              when 'neq' then not exists (select 1 from public.client_tags t where t.client_id = c.id and t.tag = any(f.vals))
              else true
            end

          -- A visit counts toward its own job service when it has one, otherwise
          -- toward every service on its job (same rule the old client-side
          -- service-history lookup used).
          when f.field in ('scheduled_service', 'completed_service') then
            exists (
              select 1
              from public.crm_job_visits v
              join public.crm_job_services s
                on s.id = v.job_service_id
                or (s.job_id = v.job_id
                    and not exists (select 1 from public.crm_job_services s2 where s2.id = v.job_service_id))
              where v.client_id = c.id
                and v.deleted_at is null
                and s.service_name = any(f.vals)
                and case when f.field = 'completed_service'
                         then v.status = 'completed'
                         else coalesce(v.status, '') not in ('completed', 'cancelled', 'skipped') end
            )

          when f.field in ('referred_by', 'do_not_market', 'taxable', 'ok_to_email') then
            case
              when f.op = 'eq' and f.val in ('yes', 'no') then
                (case f.field
                   when 'referred_by'   then coalesce(c.referred_by, '') <> ''
                   when 'do_not_market' then coalesce(c.do_not_market, false)
                   when 'taxable'       then coalesce(c.is_taxable, true)
                   else coalesce(c.ok_to_email, true)
                 end) = (f.val = 'yes')
              else true
            end

          when f.field like 'custom:%' then
            f.custom_id is not null and exists (
              select 1
              from public.crm_client_custom_field_values cv
              cross join lateral (select coalesce(cv.value_number::text, cv.value_text) as sv) s
              where cv.client_id = c.id
                and cv.field_def_id = f.custom_id
                and s.sv is not null
                and case f.op
                      when 'contains'    then strpos(lower(s.sv), f.lval) > 0
                      when 'starts_with' then starts_with(lower(s.sv), f.lval)
                      when 'eq' then
                        case when cv.value_number is not null and f.num is not null
                             then cv.value_number = f.num
                             else lower(s.sv) = f.lval end
                      when 'lt'  then cv.value_number is null or f.num is null or cv.value_number <  f.num
                      when 'gt'  then cv.value_number is null or f.num is null or cv.value_number >  f.num
                      when 'lte' then cv.value_number is null or f.num is null or cv.value_number <= f.num
                      when 'gte' then cv.value_number is null or f.num is null or cv.value_number >= f.num
                      else true
                    end
            )

          else true
        end
      ), true)
    );
$$;

revoke all on function public.crm_search_clients(text, jsonb) from public, anon;
grant execute on function public.crm_search_clients(text, jsonb) to authenticated;

notify pgrst, 'reload schema';

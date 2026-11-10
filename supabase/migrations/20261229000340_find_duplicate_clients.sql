-- Duplicate warning on New Client / New Lead (owner decision 2026-11): before
-- creating, the dialog asks whether an existing (non-deleted) client or lead in
-- the org already has the same email or phone, and shows the matches with a
-- "Create anyway" button.
--
-- Normalisation matches the CSV importers' dedup (loadClientDedupMaps /
-- phoneDedupeKey): email trimmed + lower-cased; phone digits only, compared on
-- the last 10 digits, ignored when it has fewer than 7. One indexed query.
-- SECURITY INVOKER — RLS on clients applies; the org filter is my_org_id().

create index if not exists clients_org_email_dedupe_idx
  on public.clients (org_id, lower(btrim(primary_email)))
  where deleted_at is null and primary_email is not null;

create index if not exists clients_org_phone_dedupe_idx
  on public.clients (org_id, right(regexp_replace(primary_phone, '\D', '', 'g'), 10))
  where deleted_at is null and primary_phone is not null;

create or replace function public.crm_find_duplicate_clients(p_email text, p_phone text)
 returns table (
   id uuid,
   display_name text,
   status text,
   primary_email text,
   primary_phone text,
   matched_on text
 )
 language sql
 stable
 set search_path to 'public'
as $function$
  with k as (
    select nullif(lower(btrim(coalesce(p_email, ''))), '') as email,
           case when length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 7
                then right(regexp_replace(p_phone, '\D', '', 'g'), 10) end as phone
  )
  select c.id, c.display_name, c.status, c.primary_email, c.primary_phone,
         case when k.email is not null and lower(btrim(c.primary_email)) = k.email then 'email' else 'phone' end
    from public.clients c, k
   where c.org_id = public.my_org_id()
     and c.deleted_at is null
     and (
       (k.email is not null and c.primary_email is not null and lower(btrim(c.primary_email)) = k.email)
       or (k.phone is not null and c.primary_phone is not null
           and right(regexp_replace(c.primary_phone, '\D', '', 'g'), 10) = k.phone
           and length(regexp_replace(c.primary_phone, '\D', '', 'g')) >= 7)
     )
   order by c.display_name
   limit 10;
$function$;

revoke all on function public.crm_find_duplicate_clients(text, text) from public, anon;
grant execute on function public.crm_find_duplicate_clients(text, text) to authenticated, service_role;

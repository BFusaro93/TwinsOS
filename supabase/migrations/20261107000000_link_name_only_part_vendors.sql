-- Parts imported from CSV carried only a free-text vendor_name (no vendor_id), so
-- the edit form showed "No vendor" and saving blanked the name. Link each such part
-- (and its catalog product) to the org's vendor with the same name. Unique,
-- case-insensitive matches only; ambiguous or unmatched names are left as text.
with matches as (
  select p.id as part_id, p.product_item_id, v.id as vendor_id, v.name as vendor_name
    from public.parts p
    join lateral (
      select (array_agg(v2.id))[1] as id, (array_agg(v2.name))[1] as name
        from public.vendors v2
       where v2.org_id = p.org_id
         and v2.deleted_at is null
         and lower(trim(v2.name)) = lower(trim(p.vendor_name))
      having count(*) = 1
    ) v on true
   where p.deleted_at is null
     and p.vendor_id is null
     and coalesce(trim(p.vendor_name), '') <> ''
),
upd_parts as (
  update public.parts p
     set vendor_id = m.vendor_id, vendor_name = m.vendor_name
    from matches m
   where p.id = m.part_id
  returning p.id
)
update public.product_items pi
   set vendor_id = m.vendor_id, vendor_name = m.vendor_name
  from matches m
 where pi.id = m.product_item_id
   and pi.vendor_id is null;

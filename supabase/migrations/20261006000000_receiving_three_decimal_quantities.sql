-- po_line_items.quantity was widened to numeric(10,3) (20260710154104) but
-- goods_receipt_lines.quantity_* stayed numeric(10,2) (20260421000000), so a
-- 2.125 ordered line could be received only as 2.13 / 2.12 and never matched
-- the ordered quantity (PO stuck partially_fulfilled, or over-receipt guard
-- tripping). Widen to match. Widening scale is a metadata-compatible change;
-- no repo views reference these columns.
alter table public.goods_receipt_lines
  alter column quantity_ordered   type numeric(10, 3),
  alter column quantity_received  type numeric(10, 3),
  alter column quantity_remaining type numeric(10, 3);

-- Receipt numbers: atomic per-org counter (same mechanism as WO/PO/REQ).
create or replace function public.next_receipt_number(p_org_id_override uuid default null)
returns text language sql security definer set search_path = public
as $$ select public.next_entity_number('goods_receipt', 'GR', p_org_id_override) $$;

revoke all on function public.next_receipt_number(uuid) from public, anon;
grant execute on function public.next_receipt_number(uuid) to authenticated, service_role;

-- Seed the counter from existing receipts so numbering continues without
-- reusing a count that legacy GR-<year>-<ms> numbers never occupied.
insert into public.entity_number_counters (org_id, entity_type, period, count)
select org_id, 'goods_receipt', to_char(created_at, 'YYYY'), count(*)
from public.goods_receipts where deleted_at is null
group by org_id, to_char(created_at, 'YYYY')
on conflict (org_id, entity_type, period) do nothing;

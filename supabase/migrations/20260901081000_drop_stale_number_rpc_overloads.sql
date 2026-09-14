-- The previous migration's next_entity_number()/next_work_order_number()/
-- next_po_number()/next_requisition_number() were applied live in two
-- passes (first without p_org_id_override, then with it) while iterating —
-- `create or replace function` does NOT replace a function when the
-- parameter list changes, it creates a second overload alongside the
-- original. PostgREST then couldn't resolve which overload a no-argument
-- RPC call meant (PGRST203: "Could not choose the best candidate
-- function"), breaking every WO/PO/requisition creation through the app.
-- 20260901080000's own file only ever defines the final 3-arg signature, so
-- this is a no-op there — this migration exists to clean up the stale
-- 0-arg overloads that got created on the live databases mid-iteration.
drop function if exists public.next_entity_number(text, text);
drop function if exists public.next_po_number();
drop function if exists public.next_requisition_number();
drop function if exists public.next_work_order_number();

-- receive_product_cost_layer (round 13, security / low).
--
-- Legacy layer-only receiving RPC. Nothing in the app, edge functions or other
-- SQL calls it any more (receive_product_receipt replaced it — see the note in
-- src/lib/hooks/use-products.ts), yet any authenticated login could call it.
-- Revoked from client roles; kept for the service role so nothing that might
-- still reach it server-side breaks.
--
-- PROD: apply BEFORE or AFTER the deploy (no code calls it).

revoke execute on function public.receive_product_cost_layer(uuid, uuid, numeric, integer, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.receive_product_cost_layer(uuid, uuid, numeric, integer, text, text, text, uuid)
  to service_role;

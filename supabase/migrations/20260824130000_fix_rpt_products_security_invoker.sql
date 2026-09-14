-- rpt_products was originally created with (security_invoker = on)
-- (20260706233504_crm_report_center.sql) so it correctly inherits RLS from
-- product_items for the querying user. 20260807170120_product_decimal_quantity.sql
-- had to DROP/CREATE the view to widen quantity_on_hand's column type and the
-- recreated view lost `security_invoker = on` — views default to
-- security_invoker = off, which evaluates RLS as the view owner (a superuser
-- role with BYPASSRLS) instead of the caller, silently bypassing product_items'
-- org-scoped RLS policies entirely. That migration's GRANT ALL also handed
-- read access to `anon`, so the view was queryable unauthenticated via
-- PostgREST on top of leaking every org's product catalog to every other org.
ALTER VIEW public.rpt_products SET (security_invoker = on);

REVOKE ALL ON public.rpt_products FROM anon;

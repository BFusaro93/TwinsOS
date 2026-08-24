-- Crew accounts (profiles.role = 'crew') are a SHARED field-tablet
-- clock-in login (src/lib/hooks/use-permissions.ts's useIsCrewOnly/
-- useCrmAccess) meant to be confined to /crm/crew — but that confinement
-- is enforced only by a CLIENT-SIDE route guard
-- (pathname.startsWith("/crm/crew")). Every RLS policy on the app's
-- financial/procurement tables is scoped by org_id only, with no role
-- check at all:
--   create policy "crm_invoices_select" on crm_invoices for select
--     using (org_id = (select org_id from profiles where id = auth.uid()));
-- GlobalSearchDialog.tsx proves the resulting gap concretely: it
-- unconditionally calls useInvoices()/useEstimates()/usePurchaseOrders()/
-- useVendors() etc. for every logged-in role and only hides the rendered
-- result groups for crew — the underlying browser-client queries (which
-- talk to Postgres directly, not through any Route Handler) already
-- fetched the data by the time that UI-only gate runs. A crew tablet login
-- (or anyone who obtains its shared credential) can call these same hooks,
-- or the Supabase client directly from devtools, to read every invoice,
-- payment, estimate, vendor contact, purchase order, and requisition in
-- the org — well beyond what a shared field-clock-in login should ever
-- see.
--
-- Fix: add a role check to RLS itself (the layer that can't be bypassed by
-- client-side code) on every table crew has no legitimate business
-- reading or writing, per use-crew-app.ts's actual query inventory (crew
-- only ever queries crm_job_visits/crm_crews/crm_crew_members/
-- crm_visit_photos — never invoices, payments, estimates, vendors,
-- purchase orders, or requisitions).
--
-- clients is intentionally NOT touched here: crew legitimately needs a
-- join to clients(display_name, primary_phone, billing_address, ...) for
-- today's assigned stops (use-crew-app.ts useMyCrewVisits). Blocking crew
-- from clients entirely would break that join. Restricting crew to only
-- clients tied to their OWN assigned visits (rather than the whole org's
-- client list, which GlobalSearchDialog's useClients() call can still
-- return today) needs a scoped, visit-linked policy — a follow-up, not
-- something to guess at here.

CREATE OR REPLACE FUNCTION public.my_role()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN (SELECT role FROM public.profiles WHERE id = auth.uid());
END;
$$;

-- crm_invoices / crm_invoice_line_items / crm_payments
DROP POLICY IF EXISTS "crm_invoices_select" ON public.crm_invoices;
CREATE POLICY "crm_invoices_select" ON public.crm_invoices FOR SELECT
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND public.my_role() IS DISTINCT FROM 'crew');
DROP POLICY IF EXISTS "crm_invoices_insert" ON public.crm_invoices;
CREATE POLICY "crm_invoices_insert" ON public.crm_invoices FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND public.my_role() IS DISTINCT FROM 'crew');
DROP POLICY IF EXISTS "crm_invoices_update" ON public.crm_invoices;
CREATE POLICY "crm_invoices_update" ON public.crm_invoices FOR UPDATE
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND public.my_role() IS DISTINCT FROM 'crew');

DROP POLICY IF EXISTS "crm_invoice_items_select" ON public.crm_invoice_line_items;
CREATE POLICY "crm_invoice_items_select" ON public.crm_invoice_line_items FOR SELECT
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND public.my_role() IS DISTINCT FROM 'crew');
DROP POLICY IF EXISTS "crm_invoice_items_insert" ON public.crm_invoice_line_items;
CREATE POLICY "crm_invoice_items_insert" ON public.crm_invoice_line_items FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND public.my_role() IS DISTINCT FROM 'crew');
DROP POLICY IF EXISTS "crm_invoice_items_update" ON public.crm_invoice_line_items;
CREATE POLICY "crm_invoice_items_update" ON public.crm_invoice_line_items FOR UPDATE
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND public.my_role() IS DISTINCT FROM 'crew');

DROP POLICY IF EXISTS "crm_payments_select" ON public.crm_payments;
CREATE POLICY "crm_payments_select" ON public.crm_payments FOR SELECT
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND public.my_role() IS DISTINCT FROM 'crew');
DROP POLICY IF EXISTS "crm_payments_insert" ON public.crm_payments;
CREATE POLICY "crm_payments_insert" ON public.crm_payments FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND public.my_role() IS DISTINCT FROM 'crew');
DROP POLICY IF EXISTS "crm_payments_update" ON public.crm_payments;
CREATE POLICY "crm_payments_update" ON public.crm_payments FOR UPDATE
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND public.my_role() IS DISTINCT FROM 'crew');

-- estimates + related
DROP POLICY IF EXISTS "org members can manage estimates" ON public.estimates;
CREATE POLICY "org members can manage estimates" ON public.estimates FOR ALL
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND public.my_role() IS DISTINCT FROM 'crew');

DROP POLICY IF EXISTS "org members can manage estimate_line_items" ON public.estimate_line_items;
CREATE POLICY "org members can manage estimate_line_items" ON public.estimate_line_items FOR ALL
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND public.my_role() IS DISTINCT FROM 'crew');

DROP POLICY IF EXISTS "org members can manage estimate_direct_costs" ON public.estimate_direct_costs;
CREATE POLICY "org members can manage estimate_direct_costs" ON public.estimate_direct_costs FOR ALL
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND public.my_role() IS DISTINCT FROM 'crew');

-- vendors / purchase_orders / requisitions (Equipt PO — shared with CMMS,
-- a crew login has no legitimate reason to touch this side at all)
DROP POLICY IF EXISTS "org_members_vendors" ON public.vendors;
CREATE POLICY "org_members_vendors" ON public.vendors FOR ALL
  USING (org_id = public.my_org_id() AND public.my_role() IS DISTINCT FROM 'crew');

DROP POLICY IF EXISTS "org_members_purchase_orders" ON public.purchase_orders;
CREATE POLICY "org_members_purchase_orders" ON public.purchase_orders FOR ALL
  USING (org_id = public.my_org_id() AND public.my_role() IS DISTINCT FROM 'crew');

DROP POLICY IF EXISTS "org_members_requisitions" ON public.requisitions;
CREATE POLICY "org_members_requisitions" ON public.requisitions FOR ALL
  USING (org_id = public.my_org_id() AND public.my_role() IS DISTINCT FROM 'crew');

DROP POLICY IF EXISTS "org_members_req_line_items" ON public.requisition_line_items;
CREATE POLICY "org_members_req_line_items" ON public.requisition_line_items FOR ALL
  USING (org_id = public.my_org_id() AND public.my_role() IS DISTINCT FROM 'crew');

DROP POLICY IF EXISTS "org_members_po_line_items" ON public.po_line_items;
CREATE POLICY "org_members_po_line_items" ON public.po_line_items FOR ALL
  USING (org_id = public.my_org_id() AND public.my_role() IS DISTINCT FROM 'crew');

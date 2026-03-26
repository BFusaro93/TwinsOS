-- ─────────────────────────────────────────────────────────────────────────────
-- Set org_id DEFAULT to my_org_id() on all tenant tables.
-- This means clients never need to pass org_id in INSERT statements —
-- the DB fills it in from the authenticated user's profile automatically.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.vendors              ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.product_items        ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.projects             ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.assets               ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.vehicles             ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.parts                ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.asset_parts          ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.pm_schedules         ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.meters               ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.meter_readings       ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.work_orders          ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.wo_parts             ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.wo_labor_entries     ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.wo_vendor_charges    ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.maintenance_requests ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.approval_flows       ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.requisitions         ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.requisition_line_items ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.purchase_orders      ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.po_line_items        ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.goods_receipts       ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.goods_receipt_lines  ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.approval_requests    ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.comments             ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.attachments          ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.audit_log            ALTER COLUMN org_id SET DEFAULT public.my_org_id();

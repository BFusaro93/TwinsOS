-- crm_jobs has no audit trigger today, unlike every other CMMS/PO/CRM
-- resource (assets, vendors, parts, product_items, projects, pm_schedules,
-- requisitions, work_orders, clients, ...). fn_audit_log() already has full
-- support for crm_jobs (record_type 'job', title 'Job #<job_number>', and
-- the generic per-field diff loop for updates) — it's only ever missing the
-- trigger to invoke it, so this just attaches one. Without this, writes to
-- crm_jobs (via the app UI or the public API's POST/PATCH /jobs) leave no
-- entry in the client activity / audit timeline.

CREATE TRIGGER trg_crm_jobs_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.crm_jobs
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

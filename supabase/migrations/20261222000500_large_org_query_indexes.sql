-- Indexes for queries that scan whole tables once an org is large.
--
-- estimates had no index on org_id or client_id, and estimate_line_items none on
-- estimate_id: every estimate list (RLS-scoped by org), every client's estimates tab
-- and every estimate detail / total recalculation scanned all orgs' rows.
create index if not exists estimates_org_client_live_idx
  on public.estimates (org_id, client_id)
  where deleted_at is null;

create index if not exists estimate_line_items_estimate_id_idx
  on public.estimate_line_items (estimate_id);

-- isEligibleForEnrollment (src/lib/automations/sequence-enrollment.ts) runs once per
-- fired event — once per overdue invoice per day, per estimate in the date-trigger cron —
-- and reads the newest enrollment of a sequence for one record. The existing partial
-- unique indexes cover only ACTIVE enrollments, so the history lookup scanned and sorted
-- the sequence's whole enrollment table each time.
create index if not exists crm_sequence_enrollments_seq_client_idx
  on public.crm_sequence_enrollments (sequence_id, client_id, enrolled_at desc)
  where deleted_at is null;
create index if not exists crm_sequence_enrollments_seq_estimate_idx
  on public.crm_sequence_enrollments (sequence_id, estimate_id, enrolled_at desc)
  where deleted_at is null and estimate_id is not null;
create index if not exists crm_sequence_enrollments_seq_invoice_idx
  on public.crm_sequence_enrollments (sequence_id, invoice_id, enrolled_at desc)
  where deleted_at is null and invoice_id is not null;
create index if not exists crm_sequence_enrollments_seq_ticket_idx
  on public.crm_sequence_enrollments (sequence_id, ticket_id, enrolled_at desc)
  where deleted_at is null and ticket_id is not null;

-- The 15-minute automation runner pulls due steps oldest-first (/api/automations/run).
create index if not exists crm_sequence_enrollments_due_idx
  on public.crm_sequence_enrollments (next_fire_at)
  where completed_at is null and stopped_at is null and deleted_at is null and awaiting_approval = false;

-- crm_search_clients' tag filters probe client_tags by client_id alone; the only index
-- led with org_id, so each probe could walk the org's whole tag list.
create index if not exists client_tags_client_id_idx
  on public.client_tags (client_id);

-- Email Activity lists an org's newest emails (activity_type = 'email' by occurred_at);
-- the existing index leads with client_id, which that list doesn't filter on.
create index if not exists client_activity_org_type_occurred_idx
  on public.client_activity (org_id, activity_type, occurred_at desc);

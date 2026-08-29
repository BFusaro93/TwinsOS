-- Wires sales meetings into the automations engine (sales_meeting_reminder
-- trigger, "minutes before" date-gap config) and into a direct rep-facing
-- reminder cron, mirroring the estimate_id/ticket_id/invoice_id pattern
-- already used for estimate/ticket/invoice-scoped automation enrollments.

alter table public.crm_sales_meetings
  add column if not exists reminder_sent_at timestamptz;

alter table public.crm_sequence_enrollments
  add column if not exists meeting_id uuid references public.crm_sales_meetings(id);

create unique index if not exists crm_sequence_enrollments_active_meeting_uidx
  on public.crm_sequence_enrollments (sequence_id, meeting_id)
  where meeting_id is not null
    and completed_at is null and stopped_at is null and deleted_at is null;

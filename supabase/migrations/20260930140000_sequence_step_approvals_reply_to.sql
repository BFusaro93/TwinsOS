-- Approval-queued sequence email steps lost the resolved reply address: the
-- processor stored the rendered subject/body (and, since 20260824110955, the
-- from address) but not reply-to, so approving a "from sales rep" step sent
-- replies to the org's general mailbox instead of the rep. Store it so the
-- approve route can pass it through to sendResolvedSequenceEmail.
--
-- Idempotent: safe to re-run.
alter table public.crm_sequence_step_approvals
  add column if not exists reply_to text;

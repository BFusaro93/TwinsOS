-- Approval-gated email steps previously lost the resolved "From" address
-- (e.g. "assigned sales rep") and always sent from the default noreply
-- address once approved, since the approval queue only ever stored the
-- recipient/subject/body — never the sender.
ALTER TABLE crm_sequence_step_approvals
  ADD COLUMN IF NOT EXISTS from_address text;

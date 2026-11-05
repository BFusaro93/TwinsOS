-- A visit could be saved with clocked_out_at BEFORE clocked_in_at: the
-- dispatch board's Start/End correction rewrote one stamp and left the other
-- (editing Start past an existing same-day End, or fixing End on a visit
-- worked on a different day than it was scheduled). Actual Hours then came
-- out as days (one PROD visit showed 71.28h). The board now re-derives the
-- clock-out when the pair isn't a 0–24h span (orderClockPair in
-- DispatchBoard.tsx); this CHECK makes any other writer that gets it wrong
-- fail loudly instead of storing it.
--
-- NOT VALID: existing rows aren't scanned (they are repaired per
-- environment), but every insert and every update of a row must satisfy it —
-- so a violating row has to be repaired before anything else on it can change.

alter table public.crm_job_visits
  drop constraint if exists crm_job_visits_clock_out_after_clock_in;

alter table public.crm_job_visits
  add constraint crm_job_visits_clock_out_after_clock_in
  check (clocked_in_at is null or clocked_out_at is null or clocked_out_at >= clocked_in_at)
  not valid;

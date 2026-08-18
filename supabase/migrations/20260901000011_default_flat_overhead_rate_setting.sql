-- Every estimate's flat "Overhead Rate %" had to be typed by hand — there
-- was no org-level default a company could set once, other than the
-- generic (and recently-fixed) column default of 0%. Add an org-wide
-- default flat overhead rate alongside the existing per-cost-type
-- percentages, so a company that wants a single flat markup applied to
-- every new estimate can configure it once instead of re-entering it every
-- time. This is only used to PRE-FILL new estimates' own overhead_rate_bps
-- at creation time — it's a starting value, still editable per estimate,
-- and (like the flat rate always has) is ignored whenever any per-type
-- percentage is active.

ALTER TABLE public.crm_overhead_settings
  ADD COLUMN IF NOT EXISTS flat_overhead_rate_bps integer NOT NULL DEFAULT 0;

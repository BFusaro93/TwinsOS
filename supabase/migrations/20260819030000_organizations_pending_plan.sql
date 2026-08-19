-- Set at signup when someone picks a paid plan instead of "start free
-- trial" (the org itself always starts on plan='trial' — email confirmation
-- happens before any Stripe checkout can run, since checkout requires an
-- authenticated session). pending_plan records what they asked for so the
-- app can prompt them straight into checkout on first login, then is
-- cleared once a checkout session is actually created for it.
alter table organizations add column if not exists pending_plan text;

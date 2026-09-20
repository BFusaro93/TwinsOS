-- client_activity.activity_type CHECK was missing 'ticket', 'job', 'crew_note',
-- which several call sites already insert. Those inserts were silently failing
-- because the CHECK violation error was never checked by the caller.
alter table client_activity drop constraint client_activity_activity_type_check;

alter table client_activity add constraint client_activity_activity_type_check
  check (activity_type in (
    'note','call','email','invoice','payment',
    'job_visit','estimate','contract','automation',
    'ticket','job','crew_note'
  ));

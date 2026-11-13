-- client_email_content stores the full HTML of every client email (invoice
-- view-and-pay links, estimates, statements). has_crm_access() is true for
-- crew logins, so without a deny a shared field-tablet login could read all of
-- it through PostgREST. Same RESTRICTIVE crew_no_access shape as 20270101000010.
drop policy if exists crew_no_access on public.client_email_content;
create policy crew_no_access on public.client_email_content as restrictive for all
  using ((select public.my_role()) is distinct from 'crew')
  with check ((select public.my_role()) is distinct from 'crew');

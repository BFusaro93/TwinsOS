-- A phone typed with an extension ("508-555-1234 x12", "(508) 555-1234 ext. 7",
-- "5085551234#3") used to key on the wrong ten digits: phone_last10 kept every
-- digit, so the extension shifted the window ("8555123412") and the inbound
-- STOP/reply match, opt-out lookups and duplicate detection all missed it.
-- A trailing extension (",", ";", "#", "x", "ext", "ext.", "extension" then
-- 1–6 digits) is now dropped first. Mirrors stripPhoneExtension() in
-- src/lib/utils/phone.ts. The expression index on clients is rebuilt because
-- the function's output changed for such rows.

create or replace function public.phone_last10(p text)
returns text
language sql
immutable parallel safe strict
set search_path to ''
as $function$
  select right(
    regexp_replace(
      regexp_replace(p, '\s*(,|;|#|extension|ext\.?|x)\s*[0-9]{1,6}\s*$', '', 'i'),
      '[^0-9]', '', 'g'
    ),
    10
  )
$function$;

reindex index public.clients_org_primary_phone_last10_idx;

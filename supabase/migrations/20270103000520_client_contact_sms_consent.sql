-- Per-contact SMS consent.
--
-- Consent to be texted lived only on the client (clients.sms_opt_in), and an
-- automation step set to "All contacts" texted every contact under it. Each
-- contact now carries its own consent, stamped the same way as the client's:
-- automations text a contact only when that contact opted in, while the
-- client's primary and billing phones keep using the client's consent.
--
-- A STOP (or a carrier block) from a contact's number clears that contact's
-- consent; a START from it grants it again. Both go through
-- crm_set_contact_sms_consent_by_number, called by the Twilio webhook with the
-- service role only.
--
-- Changing a contact's main phone number drops its consent (it was given for
-- the old number) unless the same save re-confirms it.

alter table public.client_contacts
  add column if not exists sms_opt_in boolean not null default false,
  add column if not exists sms_opt_in_at timestamptz,
  add column if not exists sms_opt_in_source text,
  add column if not exists sms_opt_out_at timestamptz,
  add column if not exists sms_opt_out_source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_contacts_sms_opt_in_source_check') then
    alter table public.client_contacts
      add constraint client_contacts_sms_opt_in_source_check
      check (sms_opt_in_source is null or sms_opt_in_source in ('form', 'verbal', 'keyword', 'manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_contacts_sms_opt_out_source_check') then
    alter table public.client_contacts
      add constraint client_contacts_sms_opt_out_source_check
      check (sms_opt_out_source is null or sms_opt_out_source in ('keyword', 'keyword_in_message', 'carrier_blocked', 'manual'));
  end if;
end $$;

create or replace function public.client_contacts_sms_consent_on_phone_change()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if old.sms_opt_in and new.sms_opt_in
     and public.phone_last10(new.phone) is distinct from public.phone_last10(old.phone)
     and new.sms_opt_in_at is not distinct from old.sms_opt_in_at then
    new.sms_opt_in := false;
    new.sms_opt_in_at := null;
    new.sms_opt_in_source := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_client_contacts_sms_consent_on_phone_change on public.client_contacts;
create trigger trg_client_contacts_sms_consent_on_phone_change
  before update of phone on public.client_contacts
  for each row execute function public.client_contacts_sms_consent_on_phone_change();

-- STOP / carrier block from a number clears the consent of every live contact
-- in the org that has that number (main phone or any number on its phone
-- list); START grants it only to contacts whose MAIN phone it is (texts go to
-- the main phone). Returns how many contacts changed.
create or replace function public.crm_set_contact_sms_consent_by_number(
  p_org_id uuid,
  p_last10 text,
  p_opt_in boolean,
  p_source text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n integer;
begin
  if p_org_id is null or p_last10 is null or p_last10 !~ '^[0-9]{10}$' then
    return 0;
  end if;

  with matched as (
    select c.id
      from public.client_contacts c
     where c.org_id = p_org_id
       and c.deleted_at is null
       and (public.phone_last10(c.phone) = p_last10
            or (not p_opt_in and exists (
              select 1
                from jsonb_array_elements(case when jsonb_typeof(c.phones) = 'array' then c.phones else '[]'::jsonb end) e
               where public.phone_last10(e ->> 'phone') = p_last10)))
  )
  update public.client_contacts c
     set sms_opt_in = p_opt_in,
         sms_opt_in_at = case when p_opt_in then now() else c.sms_opt_in_at end,
         sms_opt_in_source = case when p_opt_in then p_source else c.sms_opt_in_source end,
         sms_opt_out_at = case when p_opt_in then c.sms_opt_out_at else now() end,
         sms_opt_out_source = case when p_opt_in then c.sms_opt_out_source else p_source end
    from matched m
   where c.id = m.id
     and c.sms_opt_in is distinct from p_opt_in;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

revoke all on function public.crm_set_contact_sms_consent_by_number(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.crm_set_contact_sms_consent_by_number(uuid, text, boolean, text) to service_role;

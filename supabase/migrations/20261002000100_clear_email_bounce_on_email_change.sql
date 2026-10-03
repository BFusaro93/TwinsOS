-- clients.email_bounced_at is set by the Resend webhook on a hard bounce and
-- blocks ALL email to the client (automations, campaigns, invoices, estimates).
-- Nothing ever cleared it, so correcting a typo'd primary_email left the client
-- permanently unreachable. A different address is a new delivery target, so the
-- bounce no longer applies to it.
create or replace function public.clients_clear_email_bounce_on_email_change()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.email_bounced_at is not null
     and new.email_bounced_at is not distinct from old.email_bounced_at
     and lower(btrim(coalesce(new.primary_email, ''))) is distinct from lower(btrim(coalesce(old.primary_email, '')))
  then
    new.email_bounced_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_clear_email_bounce on public.clients;
create trigger trg_clients_clear_email_bounce
  before update of primary_email on public.clients
  for each row
  execute function public.clients_clear_email_bounce_on_email_change();

revoke execute on function public.clients_clear_email_bounce_on_email_change() from public, anon, authenticated;

-- Ticket Audit Trail: one-line events for the conversation on a ticket.
--
-- The audit trail records changes to the ticket itself. The conversation
-- (internal comments, client messages, emails) already lives on its own tabs,
-- so the trail only gets a short event line saying WHO did WHAT and WHEN. The
-- message text is deliberately never copied into audit_log.
--
-- Covered, all rolled up onto the ticket (record_type 'ticket'):
--   * comments (record_type = 'ticket')  : added / edited / deleted
--   * crm_ticket_messages                : client message received / staff message sent / deleted
--   * client_activity (email on a ticket): email sent to <recipient>
-- Existing audit_log actions are reused ('created', 'updated', 'deleted'), so
-- no CHECK constraint change and no UI change is needed.

create or replace function public.fn_ticket_conversation_audit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r_new     jsonb;
  r_old     jsonb;
  v_ticket  uuid;
  v_org     uuid;
  v_action  text;
  v_desc    text;
  v_user    uuid;
  v_name    text;
begin
  if coalesce(current_setting('app.suppress_audit', true), '') = 'true' then
    return coalesce(NEW, OLD);
  end if;

  r_new := case when TG_OP = 'DELETE' then '{}'::jsonb else to_jsonb(NEW) end;
  r_old := case when TG_OP = 'INSERT' then '{}'::jsonb else to_jsonb(OLD) end;
  v_org := coalesce((r_new ->> 'org_id')::uuid, (r_old ->> 'org_id')::uuid);

  begin
    select id, coalesce(name, email, id::text) into v_user, v_name
    from profiles where id = auth.uid();
  exception when others then
    v_user := null; v_name := null;
  end;

  if TG_TABLE_NAME = 'comments' then
    if coalesce(r_new ->> 'record_type', r_old ->> 'record_type') is distinct from 'ticket' then
      return coalesce(NEW, OLD);
    end if;
    v_ticket := coalesce((r_new ->> 'record_id')::uuid, (r_old ->> 'record_id')::uuid);
    v_name   := coalesce(v_name, nullif(r_new ->> 'author_name', ''), nullif(r_old ->> 'author_name', ''));
    if TG_OP = 'INSERT' then
      v_action := 'created';  v_desc := 'Internal comment added';
    elsif TG_OP = 'DELETE'
       or ((r_old ->> 'deleted_at') is null and (r_new ->> 'deleted_at') is not null) then
      v_action := 'deleted';  v_desc := 'Internal comment deleted';
    elsif (r_old ->> 'body') is distinct from (r_new ->> 'body') then
      v_action := 'updated';  v_desc := 'Internal comment edited';
    else
      return coalesce(NEW, OLD);
    end if;

  elsif TG_TABLE_NAME = 'crm_ticket_messages' then
    v_ticket := coalesce((r_new ->> 'ticket_id')::uuid, (r_old ->> 'ticket_id')::uuid);
    v_name   := coalesce(
      case when coalesce(r_new ->> 'author_type', r_old ->> 'author_type') = 'client'
           then nullif(coalesce(r_new ->> 'author_name', r_old ->> 'author_name'), '') end,
      v_name,
      nullif(coalesce(r_new ->> 'author_name', r_old ->> 'author_name'), ''));
    if TG_OP = 'INSERT' then
      v_action := 'created';
      v_desc := case when r_new ->> 'author_type' = 'client'
                     then 'Client message received' else 'Message sent to client' end;
    elsif TG_OP = 'DELETE'
       or ((r_old ->> 'deleted_at') is null and (r_new ->> 'deleted_at') is not null) then
      v_action := 'deleted';  v_desc := 'Client message deleted';
    else
      return coalesce(NEW, OLD);
    end if;

  else -- client_activity
    if TG_OP <> 'INSERT'
       or r_new ->> 'ref_table' is distinct from 'crm_tickets'
       or r_new ->> 'activity_type' is distinct from 'email'
       or (r_new ->> 'ref_id') is null then
      return coalesce(NEW, OLD);
    end if;
    v_ticket := (r_new ->> 'ref_id')::uuid;
    v_action := 'created';
    v_desc   := 'Email sent' || coalesce(' to ' || nullif(r_new ->> 'sent_to', ''), '');
  end if;

  if v_ticket is null or v_org is null then
    return coalesce(NEW, OLD);
  end if;

  insert into audit_log (org_id, created_by, record_type, record_id, action, changed_by_name, description)
  values (v_org, v_user, 'ticket', v_ticket, v_action, coalesce(v_name, 'system'), v_desc);

  return coalesce(NEW, OLD);
end;
$function$;

revoke all on function public.fn_ticket_conversation_audit() from public, anon, authenticated;

drop trigger if exists trg_comments_ticket_audit on public.comments;
create trigger trg_comments_ticket_audit
  after insert or update or delete on public.comments
  for each row execute function public.fn_ticket_conversation_audit();

drop trigger if exists trg_crm_ticket_messages_audit on public.crm_ticket_messages;
create trigger trg_crm_ticket_messages_audit
  after insert or update or delete on public.crm_ticket_messages
  for each row execute function public.fn_ticket_conversation_audit();

drop trigger if exists trg_client_activity_ticket_email_audit on public.client_activity;
create trigger trg_client_activity_ticket_email_audit
  after insert on public.client_activity
  for each row when (NEW.ref_table = 'crm_tickets' and NEW.activity_type = 'email')
  execute function public.fn_ticket_conversation_audit();

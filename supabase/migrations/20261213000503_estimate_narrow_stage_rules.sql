-- estimates write guard (20261207000300): the two narrow stage rules were wider
-- than the flows they exist for. Restated with everything else unchanged.
--
--  * estimate_send let a sender set ANY stage (lost, invoiced, accepted ...) as
--    long as only stage / sent_at / expiry_notified_at changed. Send and Share
--    Link only ever mark it 'sent' (send-email and share-link routes), so that
--    is all the key allows now.
--  * job_add let a converter set 'accepted' on any estimate — a lost one, a
--    draft, one with no job. Convert to Job (useCreateJobsFromEstimate) inserts
--    the job first and only flips an OPEN proposal (it skips accepted, lost,
--    draft and invoiced), so job_add now needs exactly that: an open stage and
--    a live crm_jobs row converted from this estimate.
create or replace function public.enforce_estimate_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    if public.has_settings_permission('estimate_add') then
      return new;
    end if;
    raise exception 'You do not have permission to add estimates'
      using errcode = '42501';
  end if;

  if public.has_settings_permission('estimate_edit') then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    if public.has_settings_permission('estimate_add')
       and old.created_by = auth.uid()
       and old.sent_at is null
       and old.deleted_at is null
       and new.created_by is not distinct from old.created_by then
      return new;
    end if;

    if public.has_settings_permission('estimate_send')
       and (new.stage is not distinct from old.stage or new.stage = 'sent')
       and not public._crm_changed_outside(to_jsonb(old), to_jsonb(new),
             array['stage', 'sent_at', 'expiry_notified_at']) then
      return new;
    end if;

    if public.has_settings_permission('job_add')
       and new.stage = 'accepted'
       and coalesce(old.stage, '') not in ('accepted', 'lost', 'draft', 'invoiced')
       and old.deleted_at is null
       and not public._crm_changed_outside(to_jsonb(old), to_jsonb(new),
             array['stage'])
       and exists (
         select 1 from public.crm_jobs j
         where j.estimate_id = old.id
           and j.deleted_at is null
       ) then
      return new;
    end if;
  end if;

  raise exception 'You do not have permission to edit estimates'
    using errcode = '42501';
end;
$$;

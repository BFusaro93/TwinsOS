-- Let a price run apply to a chosen subset of the preview instead of all of it.
--
-- A real price increase almost never covers every client: one account is on a
-- promised rate, another was just re-quoted, a third is being wound down. The
-- original all-or-nothing apply forced those out into separate narrower runs,
-- or a manual edit afterwards.
--
-- p_selected is the exact set of lines the user ticked, each carrying the
-- old_rate_cents they were shown:
--   [{"entity_type":"job_service","entity_id":"…","old_rate_cents":6800}, …]
--
-- The new price is still recomputed here, never taken from the client — the
-- selection says WHICH rows move, not what they move to. Passing null keeps the
-- previous behaviour of applying every candidate.
--
-- This also replaces the old blunt "the line count must still match your
-- preview" guard in the API with a per-row one: a row whose live price no
-- longer equals the old_rate_cents shown in the preview is skipped rather than
-- silently re-priced from a value the user never saw. The caller compares
-- line_count against what it sent to report the difference.

drop function if exists crm_apply_price_adjustment(text, text, numeric, text, jsonb, text[], text);

create or replace function crm_apply_price_adjustment(
  p_name     text,
  p_method   text,
  p_amount   numeric,
  p_rounding text,
  p_scope    jsonb,
  p_targets  text[],
  p_notes    text default null,
  p_selected jsonb default null
)
returns uuid
language plpgsql
as $$
declare
  v_id    uuid;
  v_org   uuid := my_org_id();
  v_count integer;
  v_delta bigint;
begin
  if v_org is null then
    raise exception 'crm_apply_price_adjustment: no org for current user';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'crm_apply_price_adjustment: name is required';
  end if;
  if p_selected is not null and jsonb_typeof(p_selected) <> 'array' then
    raise exception 'crm_apply_price_adjustment: p_selected must be a JSON array';
  end if;

  insert into crm_price_adjustments (
    org_id, name, method, amount, rounding, scope, targets, notes,
    applied_by, created_by
  )
  values (
    v_org, btrim(p_name), p_method, p_amount, p_rounding,
    coalesce(p_scope, '{}'::jsonb), p_targets, p_notes,
    auth.uid(), auth.uid()
  )
  returning id into v_id;

  insert into crm_price_adjustment_lines (
    org_id, adjustment_id, entity_type, entity_id, client_id, job_id,
    label, old_rate_cents, new_rate_cents
  )
  select v_org, v_id, c.entity_type, c.entity_id, c.client_id, c.job_id,
         c.label, c.old_rate_cents, c.new_rate_cents
  from crm_price_adjustment_candidates(p_method, p_amount, p_rounding, p_scope, p_targets) c
  where c.new_rate_cents is distinct from c.old_rate_cents
    and (
      p_selected is null
      or exists (
        select 1
        from jsonb_to_recordset(p_selected)
          as sel(entity_type text, entity_id uuid, old_rate_cents integer)
        where sel.entity_type = c.entity_type
          and sel.entity_id   = c.entity_id
          -- Price moved since the preview: skip rather than apply an increase
          -- calculated from a number the user never approved.
          and sel.old_rate_cents = c.old_rate_cents
      )
    );

  update crm_job_services js
  set rate_cents = l.new_rate_cents
  from crm_price_adjustment_lines l
  where l.adjustment_id = v_id
    and l.entity_type = 'job_service'
    and js.id = l.entity_id
    and js.org_id = v_org;

  update crm_packages p
  set monthly_amount_cents = l.new_rate_cents,
      updated_at = now()
  from crm_price_adjustment_lines l
  where l.adjustment_id = v_id
    and l.entity_type = 'package'
    and p.id = l.entity_id
    and p.org_id = v_org;

  update crm_package_services ps
  set default_rate_cents = l.new_rate_cents
  from crm_price_adjustment_lines l
  where l.adjustment_id = v_id
    and l.entity_type = 'package_service'
    and ps.id = l.entity_id
    and ps.org_id = v_org;

  select count(*), coalesce(sum(new_rate_cents - old_rate_cents), 0)
  into v_count, v_delta
  from crm_price_adjustment_lines
  where adjustment_id = v_id;

  -- A run that selected rows but matched none of them is a mistake, not an
  -- empty success: roll the header back rather than leaving a 0-line record.
  if v_count = 0 then
    raise exception 'crm_apply_price_adjustment: none of the selected lines still match the preview — re-run the preview and try again';
  end if;

  update crm_price_adjustments
  set line_count = v_count, delta_cents = v_delta, updated_at = now()
  where id = v_id;

  return v_id;
end;
$$;

grant execute on function crm_apply_price_adjustment(text, text, numeric, text, jsonb, text[], text, jsonb) to authenticated;

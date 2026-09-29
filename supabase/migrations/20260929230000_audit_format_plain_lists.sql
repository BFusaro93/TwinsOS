-- Audit entries printed JSON arrays verbatim:
--   assigned to names: ["Eric Kadziolka"] → ["Casey Kleinman", "Jose Leiva"]
-- Render a JSON array of plain values as a comma list, and an empty array as
-- "blank", for every table that goes through fn_audit_format_change.
-- Arrays containing objects/arrays are left as they were. Existing audit rows
-- are history and are not rewritten.

create or replace function public.fn_audit_plain_value(p_val text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if p_val is null or p_val !~ '^\s*\[' then
    return p_val;
  end if;
  v := p_val::jsonb;
  if jsonb_typeof(v) <> 'array' then
    return p_val;
  end if;
  if jsonb_array_length(v) = 0 then
    return null;                       -- caller prints "blank"
  end if;
  if exists (select 1 from jsonb_array_elements(v) e
             where jsonb_typeof(e) in ('object', 'array')) then
    return p_val;
  end if;
  return (select string_agg(e #>> '{}', ', ' order by ord)
          from jsonb_array_elements(v) with ordinality as t(e, ord));
exception when others then
  return p_val;
end;
$function$;

create or replace function public.fn_audit_format_change(p_key text, p_old text, p_new text)
 returns text
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  v_label text;
  v_old   text;
  v_new   text;
begin
  -- Secrets must never be copied into audit_log: every member of the org can
  -- read that table. Record only that the value changed.
  if p_key ~ '(secret|password|token|api_key|key_hash|client_secret)' then
    return replace(p_key, '_', ' ') || ' changed (value hidden)';
  end if;

  -- Large JSON blobs (permission maps, estimate snapshots, period figures)
  -- have no readable inline diff; a truncated blob is worse than useless.
  if (coalesce(p_new, p_old) ~ '^\s*[\[{]') and greatest(length(coalesce(p_old,'')), length(coalesce(p_new,''))) > 60 then
    return replace(p_key, '_', ' ') || ' changed';
  end if;

  -- Foreign keys: say what changed, not which uuid it changed to.
  if p_key ~ '_ids?$' then
    return replace(regexp_replace(p_key, '_ids?$', ''), '_', ' ') || ' changed';
  end if;

  if p_key like '%\_cents' or p_key in (
    'unit_cost', 'price', 'contract_price', 'total_cost', 'purchase_price',
    'shipping_cost', 'subtotal', 'grand_total', 'sales_tax', 'discount_cost'
  ) then
    v_label := replace(regexp_replace(p_key, '_cents$', ''), '_', ' ');
    v_old   := '$' || to_char(coalesce(p_old::numeric, 0) / 100.0, 'FM999999990.00');
    v_new   := '$' || to_char(coalesce(p_new::numeric, 0) / 100.0, 'FM999999990.00');

  elsif p_key like '%\_bps' then
    v_label := replace(regexp_replace(p_key, '_bps$', ''), '_', ' ');
    v_old   := to_char(coalesce(p_old::numeric, 0) / 100.0, 'FM999999990.00') || '%';
    v_new   := to_char(coalesce(p_new::numeric, 0) / 100.0, 'FM999999990.00') || '%';

  else
    v_label := replace(p_key, '_', ' ');
    v_old   := coalesce(fn_audit_plain_value(p_old), 'blank');
    v_new   := coalesce(fn_audit_plain_value(p_new), 'blank');
    if length(v_old) > 40 then v_old := left(v_old, 40) || '…'; end if;
    if length(v_new) > 40 then v_new := left(v_new, 40) || '…'; end if;
  end if;

  return v_label || ': ' || v_old || ' → ' || v_new;
exception when others then
  -- A bad cast must never take down the write being audited.
  return replace(p_key, '_', ' ') || ' changed';
end;
$function$;

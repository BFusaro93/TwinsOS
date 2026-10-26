-- Audit entries for a crew change said only "crew changed", with no from/to,
-- because every *_id key is narrated without its value. Resolve crew_id to the
-- crew names ("crew: DJ → Crew: DJ"). Restates the full function from
-- 20260929230000 with that one branch added; stable (not immutable) because it
-- now reads crm_crews. Existing audit rows are history and are not rewritten.

create or replace function public.fn_audit_format_change(p_key text, p_old text, p_new text)
 returns text
 language plpgsql
 stable
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

  -- A crew change reads as the crews, not just "crew changed" — which crew a
  -- visit or job moved from/to is the whole point of the entry.
  if p_key = 'crew_id' then
    return 'crew: '
      || coalesce((select name from crm_crews where id = nullif(p_old, '')::uuid), 'Unassigned')
      || ' → '
      || coalesce((select name from crm_crews where id = nullif(p_new, '')::uuid), 'Unassigned');
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

-- PO / requisition line item edits logged "Toro Mower Blades: quantity changed"
-- with the old and new values only in hidden columns. Put the values in the
-- description the Audit Trail tab actually shows:
--   Toro Mower Blades: quantity 3 → 4
--   Toro Mower Blades: unit cost $10.00 → $12.50
--   Toro Mower Blades: taxable no → yes
-- Patches the LIVE function source in place (it may have drifted from the
-- migration that created it) and fails loudly if any anchor is missing.
do $$
declare
  v_def text;
  v_new text;
  pairs constant text[][] := array[
    array[
      $a$v_name || ': quantity changed', 'quantity'$a$,
      $b$v_name || ': quantity ' || trim_scale((r_old ->> 'quantity')::numeric)::text || ' → ' || trim_scale((r_new ->> 'quantity')::numeric)::text, 'quantity'$b$
    ],
    array[
      $a$v_name || ': unit cost changed', 'unit_cost'$a$,
      $b$v_name || ': unit cost $' || to_char(((r_old ->> 'unit_cost')::numeric) / 100, 'FM999999990.00') || ' → $' || to_char(((r_new ->> 'unit_cost')::numeric) / 100, 'FM999999990.00'), 'unit_cost'$b$
    ],
    array[
      $a$v_name || ': taxable flag changed', 'taxable'$a$,
      $b$v_name || ': taxable ' || case when (r_old ->> 'taxable') = 'true' then 'yes' else 'no' end || ' → ' || case when (r_new ->> 'taxable') = 'true' then 'yes' else 'no' end, 'taxable'$b$
    ]
  ];
  i int;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  where p.proname = 'fn_audit_log_line_item' and p.pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'fn_audit_log_line_item not found';
  end if;
  if position('trim_scale' in v_def) > 0 then
    return; -- already applied
  end if;

  v_new := v_def;
  for i in 1..array_length(pairs, 1) loop
    if position(pairs[i][1] in v_new) = 0 then
      raise exception 'anchor % not found in fn_audit_log_line_item', i;
    end if;
    v_new := replace(v_new, pairs[i][1], pairs[i][2]);
  end loop;

  execute v_new;
end $$;

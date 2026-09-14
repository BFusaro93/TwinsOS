-- Migration 20260702023524_fix_ticket_audit_attribution introduced a
-- regression that broke audit-trail attribution across the ENTIRE app,
-- not just tickets:
--
-- 1. It looked up `profiles.full_name`, a column that does not exist
--    (the column is `profiles.name`). Every invocation of fn_audit_log()
--    since that migration threw inside the BEGIN/EXCEPTION block, so
--    v_user_id/v_user_name were always NULL and every audit entry — for
--    every table — was attributed to 'system' with created_by = NULL,
--    even for normal browser-authenticated actions.
-- 2. Its v_record_type CASE dropped the mappings for goods_receipts,
--    damage_cases, and photo_jobs (and renamed purchase_orders' mapping
--    from 'po' to 'purchase_order'), so those tables' audit entries were
--    written under record_type values ('goods_receipts', 'damage_cases',
--    'photo_jobs', 'purchase_order') that no longer matched what
--    ReceivingDetailPanel / DamageCaseDetailPanel / job-photo pages /
--    PODetailPanel query for — their Audit Trail tabs silently went
--    empty for anything created after the bad migration.
--
-- This migration restores the correct behavior while keeping the
-- genuinely good parts of that migration (generic per-field diff
-- descriptions instead of a curated field allowlist, and attributing
-- client-portal writes to the client when no staff user is resolvable),
-- and additionally makes the actor lookup fall back to the row's own
-- created_by before giving up — this fixes the older, separate bug where
-- service-role writes (PM-schedule auto-generated work orders, the
-- automations engine) showed "System" even though the row's created_by
-- was set correctly.
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_type   text;
  v_record_id     uuid;
  v_org_id        uuid;
  v_action        text;
  v_description   text;
  v_old_val       text;
  v_new_val       text;
  v_user_id       uuid;
  v_user_name     text;
  r_old           jsonb;
  r_new           jsonb;
  v_title         text;
  v_key           text;
  v_changed_parts text[];
  v_skip_keys     text[];
  v_old_field     text;
  v_new_field     text;
BEGIN
  r_old := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE row_to_json(OLD)::jsonb END;
  r_new := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE row_to_json(NEW)::jsonb END;

  v_org_id    := COALESCE((r_new ->> 'org_id')::uuid, (r_old ->> 'org_id')::uuid);
  v_record_id := COALESCE((r_new ->> 'id')::uuid,     (r_old ->> 'id')::uuid);

  v_record_type := CASE TG_TABLE_NAME
    WHEN 'requisitions'         THEN 'requisition'
    WHEN 'purchase_orders'      THEN 'po'
    WHEN 'work_orders'          THEN 'work_order'
    WHEN 'assets'               THEN 'asset'
    WHEN 'vehicles'             THEN 'vehicle'
    WHEN 'parts'                THEN 'part'
    WHEN 'product_items'        THEN 'product'
    WHEN 'projects'             THEN 'project'
    WHEN 'maintenance_requests' THEN 'request'
    WHEN 'vendors'              THEN 'vendor'
    WHEN 'pm_schedules'         THEN 'pm_schedule'
    WHEN 'meter_readings'       THEN 'meter_reading'
    WHEN 'goods_receipts'       THEN 'receiving'
    WHEN 'damage_cases'         THEN 'damage_case'
    WHEN 'photo_jobs'           THEN 'job_photo'
    WHEN 'clients'              THEN 'client'
    WHEN 'crm_tickets'          THEN 'ticket'
    WHEN 'crm_jobs'             THEN 'job'
    WHEN 'crm_invoices'         THEN 'invoice'
    WHEN 'crm_estimates'        THEN 'estimate'
    ELSE TG_TABLE_NAME
  END;

  v_title := CASE TG_TABLE_NAME
    WHEN 'requisitions'    THEN COALESCE(r_new ->> 'requisition_number', r_old ->> 'requisition_number', '')
    WHEN 'purchase_orders' THEN COALESCE(r_new ->> 'po_number',          r_old ->> 'po_number',          '')
    WHEN 'work_orders'     THEN COALESCE(r_new ->> 'work_order_number',  r_old ->> 'work_order_number',  '')
    WHEN 'goods_receipts'  THEN COALESCE(r_new ->> 'receipt_number',     r_old ->> 'receipt_number',     '')
    WHEN 'damage_cases'    THEN COALESCE(r_new ->> 'case_number',        r_old ->> 'case_number',        '')
    WHEN 'photo_jobs'      THEN COALESCE(r_new ->> 'name',               r_old ->> 'name',               '')
    WHEN 'crm_invoices'    THEN 'Invoice #' || COALESCE(r_new ->> 'invoice_number', r_old ->> 'invoice_number', '')
    WHEN 'crm_tickets'     THEN COALESCE(NULLIF(r_new ->> 'subject', ''), NULLIF(r_old ->> 'subject', ''), 'Ticket #' || COALESCE(r_new ->> 'ticket_number', r_old ->> 'ticket_number', ''))
    WHEN 'crm_jobs'        THEN 'Job #' || COALESCE(r_new ->> 'job_number', r_old ->> 'job_number', '')
    WHEN 'vehicles'        THEN COALESCE(
      NULLIF(TRIM(COALESCE(r_new ->> 'year','') || ' ' || COALESCE(r_new ->> 'make','') || ' ' || COALESCE(r_new ->> 'model','')), ''),
      NULLIF(TRIM(COALESCE(r_old ->> 'year','') || ' ' || COALESCE(r_old ->> 'make','') || ' ' || COALESCE(r_old ->> 'model','')), ''),
      '')
    WHEN 'meter_readings'  THEN 'Reading ' || COALESCE(r_new ->> 'value', r_old ->> 'value', '')
    ELSE COALESCE(r_new ->> 'name', r_old ->> 'name', r_new ->> 'title', r_old ->> 'title',
                  r_new ->> 'display_name', r_old ->> 'display_name', v_record_id::text)
  END;

  -- Resolve the acting user from the live session.
  BEGIN
    SELECT id, COALESCE(name, email, id::text)
    INTO v_user_id, v_user_name
    FROM profiles
    WHERE id = auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id   := NULL;
    v_user_name := NULL;
  END;

  -- Service-role writes (PM-schedule auto-generated work orders, the
  -- automations engine, etc.) have no session JWT, so auth.uid() is NULL.
  -- Fall back to whoever the row itself says created/owns it.
  IF v_user_name IS NULL THEN
    BEGIN
      SELECT id, COALESCE(name, email, id::text)
      INTO v_user_id, v_user_name
      FROM profiles
      WHERE id = COALESCE((r_new ->> 'created_by')::uuid, (r_old ->> 'created_by')::uuid);
    EXCEPTION WHEN OTHERS THEN
      v_user_id   := NULL;
      v_user_name := NULL;
    END;
  END IF;

  -- Still nothing (e.g. a client-portal write via the service role with no
  -- staff created_by). If the record is tied to a client, attribute the
  -- change to that client instead of silently defaulting to "system".
  IF v_user_name IS NULL THEN
    BEGIN
      SELECT display_name INTO v_user_name
      FROM clients
      WHERE id = COALESCE((r_new ->> 'client_id')::uuid, (r_old ->> 'client_id')::uuid);
    EXCEPTION WHEN OTHERS THEN
      v_user_name := NULL;
    END;
  END IF;

  v_user_name := COALESCE(v_user_name, 'system');

  IF TG_OP = 'INSERT' THEN
    v_action      := 'created';
    v_description := initcap(replace(v_record_type, '_', ' ')) || ' created: ' || v_title;

  ELSIF TG_OP = 'UPDATE' THEN

    IF (r_old ->> 'deleted_at') IS NULL AND (r_new ->> 'deleted_at') IS NOT NULL THEN
      v_action      := 'deleted';
      v_description := initcap(replace(v_record_type, '_', ' ')) || ' deleted: ' || v_title;

    ELSIF TG_TABLE_NAME = 'parts'
      AND (r_old ->> 'quantity_on_hand') IS DISTINCT FROM (r_new ->> 'quantity_on_hand')
    THEN
      v_action      := 'qty_adjusted';
      v_description := v_title || ': qty ' || COALESCE(r_old ->> 'quantity_on_hand', '?')
                       || ' → ' || COALESCE(r_new ->> 'quantity_on_hand', '?');

    ELSIF (r_old ->> 'status') IS DISTINCT FROM (r_new ->> 'status')
      AND (r_old ->> 'status') IS NOT NULL
    THEN
      v_action      := 'status_changed';
      v_description := v_title || ' status: '
                       || COALESCE(r_old ->> 'status', '?')
                       || ' → '
                       || COALESCE(r_new ->> 'status', '?');
      v_old_val     := r_old ->> 'status';
      v_new_val     := r_new ->> 'status';

    ELSE
      v_skip_keys := ARRAY[
        'updated_at','created_at','org_id','id','created_by',
        'balance_outstanding_cents','balance_uninvoiced_cents',
        'balance_credits_cents','balance_prepay_cents',
        'subtotal_cents','tax_cents','total_cents','balance_cents',
        'amount_paid_cents','deleted_at'
      ];
      v_changed_parts := ARRAY[]::text[];

      FOR v_key IN SELECT jsonb_object_keys(r_new) LOOP
        CONTINUE WHEN v_key = ANY(v_skip_keys);
        IF (r_old ->> v_key) IS DISTINCT FROM (r_new ->> v_key) THEN
          v_old_field := COALESCE(r_old ->> v_key, 'blank');
          v_new_field := COALESCE(r_new ->> v_key, 'blank');
          IF length(v_old_field) > 40 THEN v_old_field := left(v_old_field, 40) || '…'; END IF;
          IF length(v_new_field) > 40 THEN v_new_field := left(v_new_field, 40) || '…'; END IF;
          v_changed_parts := v_changed_parts ||
            (replace(v_key, '_', ' ') || ': ' || v_old_field || ' → ' || v_new_field);
        END IF;
      END LOOP;

      v_action := 'updated';
      IF array_length(v_changed_parts, 1) IS NULL THEN
        RETURN COALESCE(NEW, OLD);
      ELSIF array_length(v_changed_parts, 1) = 1 THEN
        v_description := initcap(replace(v_record_type, '_', ' ')) || ' updated — '
                         || v_changed_parts[1];
      ELSE
        v_description := initcap(replace(v_record_type, '_', ' ')) || ' updated — '
                         || array_to_string(v_changed_parts, '; ');
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    v_action      := 'deleted';
    v_description := initcap(replace(v_record_type, '_', ' ')) || ' deleted: ' || v_title;
  END IF;

  INSERT INTO public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, old_value, new_value
  ) VALUES (
    v_org_id, v_user_id, v_record_type, v_record_id, v_action,
    v_user_name, v_description, v_old_val, v_new_val
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Backfill: relabel audit_log rows written under the wrong record_type
-- while the buggy migration was live, so existing Audit Trail tabs (which
-- filter on an exact record_type match) can find them again.
UPDATE public.audit_log SET record_type = 'po'         WHERE record_type = 'purchase_order';
UPDATE public.audit_log SET record_type = 'receiving'  WHERE record_type = 'goods_receipts';
UPDATE public.audit_log SET record_type = 'job_photo'  WHERE record_type = 'photo_jobs';
UPDATE public.audit_log SET record_type = 'damage_case' WHERE record_type = 'damage_cases';

-- Backfill: re-attribute audit_log rows stuck as 'system' with no
-- created_by by looking up the actual created_by on the record they
-- describe. Only touches rows where the source record still exists and
-- itself has a real created_by — genuinely system-only rows (e.g. public
-- webhook maintenance requests with no owning user) are left untouched.
DO $$
DECLARE
  m record;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('requisition',  'requisitions'),
      ('po',           'purchase_orders'),
      ('work_order',   'work_orders'),
      ('asset',        'assets'),
      ('vehicle',      'vehicles'),
      ('part',         'parts'),
      ('product',      'product_items'),
      ('project',      'projects'),
      ('request',      'maintenance_requests'),
      ('vendor',       'vendors'),
      ('pm_schedule',  'pm_schedules'),
      ('meter_reading','meter_readings'),
      ('receiving',    'goods_receipts'),
      ('damage_case',  'damage_cases'),
      ('job_photo',    'photo_jobs'),
      ('client',       'clients'),
      ('ticket',       'crm_tickets'),
      ('job',          'crm_jobs')
      -- crm_invoices / crm_estimates tables don't exist yet (future
      -- sprint) — the fn_audit_log() CASE mappings for them above are
      -- forward-looking and harmless no-ops until those tables exist.
    ) AS t(rtype, tbl)
  LOOP
    EXECUTE format(
      'UPDATE public.audit_log a
         SET created_by = s.created_by,
             changed_by_name = COALESCE(p.name, p.email, s.created_by::text)
         FROM public.%I s
         LEFT JOIN public.profiles p ON p.id = s.created_by
         WHERE a.record_type = %L
           AND a.record_id = s.id
           AND lower(a.changed_by_name) = ''system''
           AND a.created_by IS NULL
           AND s.created_by IS NOT NULL',
      m.tbl, m.rtype
    );
  END LOOP;
END $$;

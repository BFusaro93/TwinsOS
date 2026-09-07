-- E-10 / E-11: Client Timeline Report showed "Invoice #37 $0.00" for Northgate
-- Bldg 200 (real total $300) and every ticket row frozen at "open".
--
-- Root cause: rpt_client_activity read client_activity.amount_cents / status
-- verbatim. Both are creation-time snapshots — the invoice activity row is
-- logged when the invoice header is created (before its line items exist, so
-- amount_cents = 0), and the ticket activity row is logged once with status
-- 'open' and never updated when the ticket is worked/closed.
--
-- Fix: resolve the live record through ref_table/ref_id:
--   invoice rows (activity_type 'invoice', ref crm_invoices) → crm_invoices.total_cents / status
--   estimate rows (activity_type 'estimate', ref estimates)  → estimates.total_cents when the
--                                                              row carries no amount; status stays
--   ticket rows (ref crm_tickets)                            → crm_tickets.status
-- Everything else (payments, notes, calls, emails) keeps the stored values.
-- Column list/order unchanged; DROP + CREATE anyway per the drifted-env rule.
--
-- Expected sandbox values: Northgate Bldg 200 "Invoice #37" → amount_cents 30000,
-- status 'paid'; Castillo "Mulch color mismatch on side bed" → whatever
-- crm_tickets.status currently is (was frozen 'open').

drop view if exists rpt_client_activity;

create view rpt_client_activity with (security_invoker = on) as
 SELECT a.id,
    a.occurred_at,
    a.activity_type,
    c.display_name AS client_name,
    c.status AS client_status,
    a.subject,
    a.body,
        CASE
            WHEN a.activity_type = 'invoice'::text AND inv.id IS NOT NULL THEN inv.total_cents
            WHEN a.activity_type = 'estimate'::text AND est.id IS NOT NULL THEN COALESCE(NULLIF(a.amount_cents, 0), est.total_cents)
            ELSE a.amount_cents
        END AS amount_cents,
        CASE
            WHEN a.activity_type = 'invoice'::text AND inv.id IS NOT NULL THEN COALESCE(inv.status, a.status)
            WHEN t.id IS NOT NULL THEN COALESCE(t.status, a.status)
            ELSE a.status
        END AS status,
    a.sent_to,
    a.created_at
   FROM client_activity a
     JOIN clients c ON c.id = a.client_id AND c.deleted_at IS NULL
     LEFT JOIN crm_invoices inv ON a.ref_table = 'crm_invoices'::text AND inv.id::text = a.ref_id::text AND inv.deleted_at IS NULL
     LEFT JOIN estimates est ON a.ref_table = 'estimates'::text AND est.id::text = a.ref_id::text AND est.deleted_at IS NULL
     LEFT JOIN crm_tickets t ON a.ref_table = 'crm_tickets'::text AND t.id::text = a.ref_id::text AND t.deleted_at IS NULL;

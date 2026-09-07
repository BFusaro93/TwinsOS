-- Extends the has_crm_access() gate (added in 20260906150000/150001) to the
-- rest of the CRM/Landscapt-only business-data tables that were still on
-- bare org_id-only RLS. Uses a RESTRICTIVE policy per table instead of
-- rewriting each existing permissive policy: a RESTRICTIVE policy ANDs
-- against the OR-combined result of every permissive policy on that table
-- for a given command, so it closes the gap without needing to reproduce
-- any existing policy's exact text (the risk that caused the crm_job_visits
-- fallback bug in the first pass) and is immune to any similar hidden
-- fallback clause on these tables.
--
-- Deliberately excluded from this pass (do not add here without separate,
-- hand-crafted review):
--   - client_portal_invites, client_portal_settings, client_portal_users,
--     portal_documents: read/written directly by actual portal customers
--     (client_portal_users-based auth), who have no crm_employees link at
--     all -- a blanket restrictive policy would lock out real customers.
--   - crm_forms, crm_form_fields, crm_form_rules, crm_form_responses:
--     have genuinely public, unauthenticated read/insert policies backing
--     published lead-capture forms embedded on public websites.
--   - crm_reports: has an intentional wide-open `qual: true` SELECT policy
--     (any authenticated user, not just CRM-linked) -- looks deliberate,
--     left for a product decision rather than assumed to be an oversight.
--   - crm_employees, crm_roles: the tables has_crm_access() itself reads;
--     gating them on their own output would be circular.

do $$
declare
  t text;
  tables text[] := array[
    'report_schedules','crm_dashboards','crm_custom_reports','client_tags','client_files',
    'crm_visit_photos','crm_sales_meetings','crm_saved_graphics','crm_automations','crm_automation_sequences',
    'crm_sequence_enrollments','crm_sequence_events','crm_sequence_execution_log','crm_sequence_step_approvals',
    'crm_sequence_stop_conditions','crm_sequence_trigger_conditions','crm_sequence_triggers','crm_campaigns',
    'crm_chemical_application_emails','crm_chemical_application_rates','crm_chemical_applications',
    'crm_chemical_lookup_items','crm_chemical_settings','crm_client_custom_field_values','crm_contract_notes',
    'crm_contract_services','crm_crew_daily_members','crm_crew_member_times','crm_crew_members','crm_crews',
    'crm_custom_field_defs','crm_discounts','crm_document_blocks','crm_document_templates','crm_email_templates',
    'crm_estimate_stages','crm_invoice_pdf_templates','crm_job_materials','crm_job_products','crm_job_services',
    'crm_kpi_scorecard_entries','crm_kpi_scorecards','crm_list_options','crm_overhead_settings',
    'crm_package_services','crm_packages','crm_payment_allocations','crm_property_custom_field_values',
    'crm_rate_matrix_field_defs','crm_schedules','crm_service_chemicals','crm_service_rate_matrix',
    'crm_services','crm_snow_rate_tiers','crm_snow_route_stops','crm_snow_routes','crm_storm_events',
    'estimate_change_requests','estimate_emails','estimate_line_item_subitems',
    'estimate_template_items','estimate_templates','estimate_versions','estimate_photos','estimate_milestones',
    'estimate_share_tokens','invoice_share_tokens',
    'ticket_contributors','crew_push_tokens'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "require_crm_access" on public.%I', t);
    execute format(
      'create policy "require_crm_access" on public.%I as restrictive for all using (public.has_crm_access()) with check (public.has_crm_access())',
      t
    );
  end loop;
end $$;

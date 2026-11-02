-- Regression probe for 20261207000100..000600 and 20261209000100..000300
-- (crm_roles write guards).
-- TEST project only: the four ids at the top are TEST rows (the Twins Lawn
-- Service org, a crew login that is temporarily turned into a 'technician'
-- with a probe crm_role, an admin, and a client). Everything runs in one DO
-- block that ends with a forced error, so no fixture or write persists
-- ("rollback sentinel"): read the error text for PASS/FAIL per case.
--   npx supabase db query --linked -f supabase/snippets/probe_crm_role_write_guards.sql
do $probe$
declare
  X uuid := 'a148081c-958f-42ad-8db7-859a38cdfdfa';
  U uuid := 'c03e37c6-3116-4276-8f6a-ae948e923e17';
  ADM uuid := '34f667ae-fe42-4ef3-9c77-a16016fe6e04';
  C uuid := '9daad6ec-a817-4604-a4ff-cadeaa3514fb';
  R uuid := gen_random_uuid();
  I0 uuid := gen_random_uuid(); I2 uuid := gen_random_uuid(); IG uuid := gen_random_uuid();
  E0 uuid := gen_random_uuid(); EO uuid := gen_random_uuid();
  K0 uuid := gen_random_uuid();
  A0 uuid := gen_random_uuid();
  D0 uuid := gen_random_uuid(); DO_ uuid := gen_random_uuid();
  P0 uuid := gen_random_uuid();
  W0 uuid := gen_random_uuid(); WM uuid := gen_random_uuid(); L0 uuid := gen_random_uuid();
  -- 20261209*: milestones (estimate-only M0/MI, project MP, convert candidate MC),
  -- converted estimates E1/E2 with projects PJ/PJ2, contract notes, photos.
  E1 uuid := gen_random_uuid(); E2 uuid := gen_random_uuid();
  PJ uuid := gen_random_uuid(); PJ2 uuid := gen_random_uuid();
  M0 uuid := gen_random_uuid(); MI uuid := gen_random_uuid();
  MP uuid := gen_random_uuid(); MC uuid := gen_random_uuid();
  KD uuid := gen_random_uuid(); N0 uuid := gen_random_uuid(); PH uuid := gen_random_uuid();
  tc record;
  v_res text;
  v_out text := '';
  v_pass int := 0; v_fail int := 0;
  v_verbose boolean := false;  -- true lists every case (the CLI may truncate long output)
begin
  -- Fixtures (as postgres, no JWT).
  update profiles set role = 'technician' where id = U;
  insert into crm_roles (id, org_id, name, is_active, permissions) values (R, X, 'Probe role', true, '{}'::jsonb);
  insert into crm_employees (org_id, first_name, last_name, user_id, crm_role_id, is_active)
    values (X, 'Probe', 'User', U, R, true);
  insert into crm_invoices (id, org_id, client_id, invoice_date, created_by) values
    (I0, X, C, current_date, ADM), (I2, X, C, current_date, ADM);
  insert into estimates (id, org_id, client_id, estimate_date, created_by) values (E0, X, C, current_date, ADM);
  insert into crm_contracts (id, org_id, client_id, title, status, created_by) values (K0, X, C, 'Probe contract', 'active', ADM);
  insert into crm_automations (id, org_id, name, created_by) values (A0, X, 'Probe automation', ADM);
  insert into crm_document_templates (id, org_id, name, doc_type, created_by) values (D0, X, 'Probe doc', 'estimate', ADM);
  insert into crm_packages (id, org_id, name, created_by) values (P0, X, 'Probe package', ADM);
  insert into crm_crews (id, org_id, name, created_by) values (W0, X, 'Probe crew', ADM);
  insert into crm_crew_members (id, org_id, crew_id, name) values (WM, X, W0, 'Probe member');
  insert into crm_invoice_line_items (id, org_id, invoice_id, description) values (L0, X, I2, 'Probe line');
  insert into estimates (id, org_id, client_id, estimate_date, created_by) values
    (E1, X, C, current_date, ADM), (E2, X, C, current_date, ADM);
  insert into projects (id, org_id, name, client_id) values (PJ, X, 'Probe project', C), (PJ2, X, 'Probe project 2', C);
  insert into estimate_milestones (id, org_id, estimate_id, name, milestone_type, milestone_value, amount_cents) values
    (M0, X, E0, 'Probe estimate milestone', 'flat', 1000, 1000);
  insert into estimate_milestones (id, org_id, estimate_id, name, milestone_type, milestone_value, amount_cents, status, invoice_id) values
    (MI, X, E0, 'Probe invoiced milestone', 'flat', 1000, 1000, 'invoiced', I0);
  insert into crm_jobs (org_id, client_id, job_type, estimate_id, project_id) values (X, C, 'project', E1, PJ);
  insert into estimate_milestones (id, org_id, estimate_id, project_id, name, milestone_type, milestone_value, amount_cents) values
    (MP, X, E1, PJ, 'Probe project milestone', 'flat', 1000, 1000);
  -- E2 is mid-conversion: its job is on PJ2 but MC has not been stamped yet
  -- (triggers off so fn_crm_jobs_adopt_milestones does not stamp it).
  set local session_replication_role = replica;
  insert into crm_jobs (org_id, client_id, job_type, estimate_id, project_id) values (X, C, 'project', E2, PJ2);
  insert into estimate_milestones (id, org_id, estimate_id, name) values (MC, X, E2, 'Probe convert milestone');
  set local session_replication_role = origin;
  insert into crm_contracts (id, org_id, client_id, title, status, created_by) values (KD, X, C, 'Probe draft', 'draft', U);
  insert into crm_contract_notes (id, org_id, contract_id, body) values (N0, X, K0, 'Probe note');
  insert into estimate_photos (id, org_id, estimate_id, storage_path) values (PH, X, E0, X::text || '/probe.jpg');
  -- A cascade: a trigger on another table that writes crm_invoices.
  create table public.probe_cascade (id int);
  grant insert on public.probe_cascade to authenticated;
  execute format($e$create or replace function public.probe_cascade_fn() returns trigger language plpgsql security invoker as $f$
  begin update public.crm_invoices set notes = 'cascade' where id = %L; return new; end $f$$e$, I2);
  create trigger probe_cascade_trg after insert on public.probe_cascade for each row execute function public.probe_cascade_fn();

  create temp table probe_cases (n serial, label text, who text, perms jsonb, sql text, expect text) on commit drop;
  insert into probe_cases (label, who, perms, sql, expect) values
  ('invoice insert, no key', 'u', '{}', format('insert into crm_invoices (org_id, client_id, invoice_date) values (%L,%L,current_date)', X, C), 'deny'),
  ('invoice insert, acct_add_modify_invoices', 'u', '{"acct_add_modify_invoices":true}', format('insert into crm_invoices (org_id, client_id, invoice_date) values (%L,%L,current_date)', X, C), 'allow'),
  ('invoice edit notes, no key', 'u', '{}', format('update crm_invoices set notes=''x'' where id=%L', I0), 'deny'),
  ('invoice edit notes, acct_add_modify_invoices', 'u', '{"acct_add_modify_invoices":true}', format('update crm_invoices set notes=''x'' where id=%L', I0), 'allow'),
  ('invoice print (lock + printed), no key', 'u', '{}', format('update crm_invoices set locked=true, locked_at=now(), status=''printed'' where id=%L', I0), 'allow'),
  ('invoice unlock, no key', 'u', '{}', format('update crm_invoices set locked=false, locked_at=null where id=%L', I0), 'deny'),
  ('invoice soft delete, no key', 'u', '{}', format('update crm_invoices set deleted_at=now() where id=%L', I2), 'deny'),
  ('invoice QBO sync columns, no key', 'u', '{}', format('update crm_invoices set qbo_sync_error=''x'', qbo_sync_attempted_at=now() where id=%L', I2), 'allow'),
  ('invoice line insert, no key', 'u', '{}', format('insert into crm_invoice_line_items (org_id, invoice_id, description) values (%L,%L,''L'')', X, I2), 'deny'),
  ('invoice line insert, acct_add_modify_invoices', 'u', '{"acct_add_modify_invoices":true}', format('insert into crm_invoice_line_items (org_id, invoice_id, description) values (%L,%L,''L'')', X, I2), 'allow'),
  ('snow generator: insert own draft', 'u', '{"snow_invoicing_generate":true}', format('insert into crm_invoices (id, org_id, client_id, invoice_date) values (%L,%L,%L,current_date)', IG, X, C), 'allow'),
  ('snow generator: line on own draft', 'u', '{"snow_invoicing_generate":true}', format('insert into crm_invoice_line_items (org_id, invoice_id, description) values (%L,%L,''L'')', X, IG), 'allow'),
  ('snow generator: totals on own draft', 'u', '{"snow_invoicing_generate":true}', format('update crm_invoices set subtotal_cents=100, total_cents=100, balance_cents=100 where id=%L', IG), 'allow'),
  ('snow generator: line on another user''s invoice', 'u', '{"snow_invoicing_generate":true}', format('insert into crm_invoice_line_items (org_id, invoice_id, description) values (%L,%L,''L'')', X, I2), 'deny'),
  ('snow generator: insert non-draft', 'u', '{"snow_invoicing_generate":true}', format('insert into crm_invoices (org_id, client_id, invoice_date, status) values (%L,%L,current_date,''sent'')', X, C), 'deny'),
  ('contract generator: edit another user''s invoice', 'u', '{"contract_create_invoices":true}', format('update crm_invoices set notes=''y'' where id=%L', I2), 'deny'),
  ('estimate insert, no key', 'u', '{}', format('insert into estimates (org_id, client_id, estimate_date) values (%L,%L,current_date)', X, C), 'deny'),
  ('estimate insert, estimate_add', 'u', '{"estimate_add":true}', format('insert into estimates (id, org_id, client_id, estimate_date) values (%L,%L,%L,current_date)', EO, X, C), 'allow'),
  ('estimate edit, no key', 'u', '{}', format('update estimates set description=''x'' where id=%L', E0), 'deny'),
  ('estimate edit, estimate_edit', 'u', '{"estimate_edit":true}', format('update estimates set description=''x'' where id=%L', E0), 'allow'),
  ('estimate edit, estimate_add (not own)', 'u', '{"estimate_add":true}', format('update estimates set description=''y'' where id=%L', E0), 'deny'),
  ('estimate edit own unsent, estimate_add', 'u', '{"estimate_add":true}', format('update estimates set description=''y'' where id=%L', EO), 'allow'),
  ('estimate line on own unsent, estimate_add', 'u', '{"estimate_add":true}', format('insert into estimate_line_items (org_id, estimate_id, service_name) values (%L,%L,''S'')', X, EO), 'allow'),
  ('estimate line, no key', 'u', '{}', format('insert into estimate_line_items (org_id, estimate_id, service_name) values (%L,%L,''S'')', X, E0), 'deny'),
  ('estimate line, estimate_add (not own)', 'u', '{"estimate_add":true}', format('insert into estimate_line_items (org_id, estimate_id, service_name) values (%L,%L,''S'')', X, E0), 'deny'),
  ('estimate line, estimate_edit', 'u', '{"estimate_edit":true}', format('insert into estimate_line_items (org_id, estimate_id, service_name) values (%L,%L,''S'')', X, E0), 'allow'),
  ('estimate send-only: other column', 'u', '{"estimate_send":true}', format('update estimates set notes=''z'' where id=%L', E0), 'deny'),
  ('estimate send-only: stage sent + sent_at', 'u', '{"estimate_send":true}', format('update estimates set stage=''sent'', sent_at=now(), expiry_notified_at=null where id=%L', E0), 'allow'),
  ('estimate convert: job_add sets accepted', 'u', '{"job_add":true}', format('update estimates set stage=''accepted'' where id=%L', E0), 'allow'),
  ('estimate soft delete, estimate_send only', 'u', '{"estimate_send":true}', format('update estimates set deleted_at=now() where id=%L', E0), 'deny'),
  ('contract insert, no key', 'u', '{}', format('insert into crm_contracts (org_id, client_id, title) values (%L,%L,''T'')', X, C), 'deny'),
  ('contract insert, contract_add', 'u', '{"contract_add":true}', format('insert into crm_contracts (org_id, client_id, title) values (%L,%L,''T'')', X, C), 'allow'),
  ('contract edit, contract_add (not own)', 'u', '{"contract_add":true}', format('update crm_contracts set title=''T2'' where id=%L', K0), 'deny'),
  ('contract edit, contract_edit', 'u', '{"contract_edit":true}', format('update crm_contracts set title=''T2'' where id=%L', K0), 'allow'),
  ('contract invoicing stamp, contract_create_invoices', 'u', '{"contract_create_invoices":true}', format('update crm_contracts set last_billed_date=current_date where id=%L', K0), 'allow'),
  ('contract title, contract_create_invoices', 'u', '{"contract_create_invoices":true}', format('update crm_contracts set title=''T3'' where id=%L', K0), 'deny'),
  ('contract service add, no key', 'u', '{}', format('insert into crm_contract_services (org_id, contract_id, service_name) values (%L,%L,''S'')', X, K0), 'deny'),
  ('contract service add, contract_edit', 'u', '{"contract_edit":true}', format('insert into crm_contract_services (org_id, contract_id, service_name) values (%L,%L,''S'')', X, K0), 'allow'),
  ('contract soft delete, contract_edit', 'u', '{"contract_edit":true}', format('update crm_contracts set deleted_at=now() where id=%L', K0), 'deny'),
  ('contract soft delete, contract_delete', 'u', '{"contract_delete":true}', format('update crm_contracts set deleted_at=now() where id=%L', K0), 'allow'),
  ('job insert, no key', 'u', '{}', format('insert into crm_jobs (org_id, client_id, job_type) values (%L,%L,''one_time'')', X, C), 'deny'),
  ('job insert, job_add', 'u', '{"job_add":true}', format('insert into crm_jobs (org_id, client_id, job_type) values (%L,%L,''one_time'')', X, C), 'allow'),
  ('automation insert, no key', 'u', '{}', format('insert into crm_automations (org_id, name) values (%L,''A'')', X), 'deny'),
  ('automation insert, automation_create_modify', 'u', '{"automation_create_modify":true}', format('insert into crm_automations (org_id, name) values (%L,''A'')', X), 'allow'),
  ('automation switch, automation_stop', 'u', '{"automation_stop":true}', format('update crm_automations set is_active = not is_active where id=%L', A0), 'allow'),
  ('automation rename, automation_stop', 'u', '{"automation_stop":true}', format('update crm_automations set name=''B'' where id=%L', A0), 'deny'),
  ('automation sequence add, no key', 'u', '{}', format('insert into crm_automation_sequences (org_id, automation_id, name) values (%L,%L,''S'')', X, A0), 'deny'),
  ('document template insert, no key', 'u', '{}', format('insert into crm_document_templates (org_id, name, doc_type) values (%L,''D'',''estimate'')', X), 'deny'),
  ('document template insert, document_template_add', 'u', '{"document_template_add":true}', format('insert into crm_document_templates (id, org_id, name, doc_type) values (%L,%L,''D'',''estimate'')', DO_, X), 'allow'),
  ('document block on own template, add only', 'u', '{"document_template_add":true}', format('insert into crm_document_blocks (org_id, template_id, block_type) values (%L,%L,''paragraph'')', X, DO_), 'allow'),
  ('document block on other template, add only', 'u', '{"document_template_add":true}', format('insert into crm_document_blocks (org_id, template_id, block_type) values (%L,%L,''paragraph'')', X, D0), 'deny'),
  ('document block, document_template_edit', 'u', '{"document_template_edit":true}', format('insert into crm_document_blocks (org_id, template_id, block_type) values (%L,%L,''paragraph'')', X, D0), 'allow'),
  ('document discard own template, add only', 'u', '{"document_template_add":true}', format('update crm_document_templates set deleted_at=now() where id=%L', DO_), 'allow'),
  ('document template delete, edit only', 'u', '{"document_template_edit":true}', format('update crm_document_templates set deleted_at=now() where id=%L', D0), 'deny'),
  ('package insert, no key', 'u', '{}', format('insert into crm_packages (org_id, name) values (%L,''P'')', X), 'deny'),
  ('package insert, package_add', 'u', '{"package_add":true}', format('insert into crm_packages (org_id, name) values (%L,''P'')', X), 'allow'),
  ('package edit, package_add', 'u', '{"package_add":true}', format('update crm_packages set name=''P2'' where id=%L', P0), 'deny'),
  ('package service, package_edit', 'u', '{"package_edit":true}', format('insert into crm_package_services (org_id, package_id, service_name) values (%L,%L,''S'')', X, P0), 'allow'),
  ('package delete, package_edit', 'u', '{"package_edit":true}', format('update crm_packages set deleted_at=now() where id=%L', P0), 'deny'),
  ('crew insert, no key', 'u', '{}', format('insert into crm_crews (org_id, name) values (%L,''W'')', X), 'deny'),
  ('crew insert, sched_teams', 'u', '{"sched_teams":true}', format('insert into crm_crews (org_id, name) values (%L,''W'')', X), 'allow'),
  ('crew member add, sched_dispatch_board', 'u', '{"sched_dispatch_board":true}', format('insert into crm_crew_members (org_id, crew_id, name) values (%L,%L,''M'')', X, W0), 'allow'),
  ('crew member edit, sched_dispatch_board', 'u', '{"sched_dispatch_board":true}', format('update crm_crew_members set name=''M2'' where id=%L', WM), 'deny'),
  ('invoice line hard delete, no key', 'u', '{}', format('delete from crm_invoice_line_items where id=%L', L0), 'deny'),
  ('crew member hard delete, no key', 'u', '{}', format('delete from crm_crew_members where id=%L', WM), 'deny'),
  ('cascade: other table''s trigger edits invoice, no key', 'u', '{}', 'insert into public.probe_cascade values (1)', 'allow'),
  ('direct: same invoice edit, no key (control)', 'u', '{}', format('update crm_invoices set notes=''direct'' where id=%L', I2), 'deny'),
  ('increment_invoice_totals RPC, no key', 'u', '{}', format('select public.increment_invoice_totals(%L, 500)', I2), 'deny'),
  ('increment_invoice_totals RPC, acct_add_modify_invoices', 'u', '{"acct_add_modify_invoices":true}', format('select public.increment_invoice_totals(%L, 500)', I2), 'allow'),
  ('increment_invoice_totals RPC, service role', 'service', '{}', format('select public.increment_invoice_totals(%L, 500)', I2), 'allow'),
  ('service role, invoice insert', 'service', '{}', format('insert into crm_invoices (org_id, client_id, invoice_date) values (%L,%L,current_date)', X, C), 'allow'),
  ('admin, invoice insert', 'admin', '{}', format('insert into crm_invoices (org_id, client_id, invoice_date) values (%L,%L,current_date)', X, C), 'allow'),
  ('admin, contract soft delete', 'admin', '{}', format('update crm_contracts set deleted_at=null, title=''T4'' where id=%L', K0), 'allow'),
  -- 20261209000100 estimate_milestones
  ('milestone (estimate) rename, no key', 'u', '{}', format('update estimate_milestones set name=''x'' where id=%L', M0), 'deny'),
  ('milestone (estimate) rename, estimate_edit', 'u', '{"estimate_edit":true}', format('update estimate_milestones set name=''x'' where id=%L', M0), 'allow'),
  ('milestone (estimate) add on own unsent, estimate_add', 'u', '{"estimate_add":true}', format('insert into estimate_milestones (org_id, estimate_id, name) values (%L,%L,''m'')', X, EO), 'allow'),
  ('milestone (estimate) add, estimate_add (not own)', 'u', '{"estimate_add":true}', format('insert into estimate_milestones (org_id, estimate_id, name) values (%L,%L,''m'')', X, E0), 'deny'),
  ('milestone (estimate) rename, acct_add_modify_invoices', 'u', '{"acct_add_modify_invoices":true}', format('update estimate_milestones set name=''y'' where id=%L', M0), 'deny'),
  ('milestone invoice repoint, acct_add_modify_invoices', 'u', '{"acct_add_modify_invoices":true}', format('update estimate_milestones set invoice_id=%L where id=%L', I2, MI), 'allow'),
  ('milestone (project) rename, estimate_edit', 'u', '{"estimate_edit":true}', format('update estimate_milestones set name=''x'' where id=%L', MP), 'deny'),
  ('milestone (project) rename, sched_add_modify_projects', 'u', '{"sched_add_modify_projects":true}', format('update estimate_milestones set name=''x'' where id=%L', MP), 'allow'),
  ('milestone (project) rename, acct_add_modify_invoices', 'u', '{"acct_add_modify_invoices":true}', format('update estimate_milestones set name=''y'' where id=%L', MP), 'allow'),
  ('milestone (project) soft delete, job_add', 'u', '{"job_add":true}', format('update estimate_milestones set deleted_at=now() where id=%L', MP), 'deny'),
  ('milestone add on converted estimate, estimate_edit', 'u', '{"estimate_edit":true}', format('insert into estimate_milestones (org_id, estimate_id, name) values (%L,%L,''m'')', X, E1), 'deny'),
  ('milestone add on project, sched_add_modify_projects', 'u', '{"sched_add_modify_projects":true}', format('insert into estimate_milestones (org_id, project_id, name) values (%L,%L,''m'')', X, PJ), 'allow'),
  ('milestone convert: stamp wrong project, job_add', 'u', '{"job_add":true}', format('update estimate_milestones set project_id=%L where id=%L', PJ, MC), 'deny'),
  ('milestone convert: stamp + rename, job_add', 'u', '{"job_add":true}', format('update estimate_milestones set project_id=%L, name=''z'' where id=%L', PJ2, MC), 'deny'),
  ('milestone convert: stamp project, job_add', 'u', '{"job_add":true}', format('update estimate_milestones set project_id=%L where id=%L', PJ2, MC), 'allow'),
  ('milestone stamped by the convert', 'u', '{}', format('do $c$ begin if not exists (select 1 from estimate_milestones where id=%L and project_id=%L) then raise exception ''not stamped''; end if; end $c$', MC, PJ2), 'allow'),
  -- (no DELETE policy on estimate_milestones: a hard delete matches 0 rows)
  ('milestone soft delete (estimate), no key', 'u', '{}', format('update estimate_milestones set deleted_at=now() where id=%L', M0), 'deny'),
  ('milestone invoice RPC (project row), acct_add_modify_invoices', 'u', '{"acct_add_modify_invoices":true}', format('select public.create_invoice_from_milestone(%L, %L)', MP, C), 'allow'),
  ('milestone invoiced by the RPC', 'u', '{}', format('do $c$ begin if not exists (select 1 from estimate_milestones where id=%L and status=''invoiced'') then raise exception ''not invoiced''; end if; end $c$', MP), 'allow'),
  -- MI was repointed to I2 above; voiding I2 releases it through a definer trigger.
  ('cascade: void releases milestone, acct_add_modify_invoices', 'u', '{"acct_add_modify_invoices":true}', format('update crm_invoices set status=''void'' where id=%L', I2), 'allow'),
  ('milestone released by the void', 'u', '{}', format('do $c$ begin if not exists (select 1 from estimate_milestones where id=%L and status=''pending'' and invoice_id is null) then raise exception ''not released''; end if; end $c$', MI), 'allow'),
  -- 20261209000200 crm_contract_notes / estimate_photos
  ('contract note add, no key', 'u', '{}', format('insert into crm_contract_notes (org_id, contract_id, body) values (%L,%L,''n'')', X, K0), 'deny'),
  ('contract note add, contract_edit', 'u', '{"contract_edit":true}', format('insert into crm_contract_notes (org_id, contract_id, body) values (%L,%L,''n'')', X, K0), 'allow'),
  ('contract note add, contract_add (not own draft)', 'u', '{"contract_add":true}', format('insert into crm_contract_notes (org_id, contract_id, body) values (%L,%L,''n'')', X, K0), 'deny'),
  ('contract note add on own draft, contract_add', 'u', '{"contract_add":true}', format('insert into crm_contract_notes (org_id, contract_id, body) values (%L,%L,''n'')', X, KD), 'allow'),
  ('contract note soft delete, contract_create_invoices', 'u', '{"contract_create_invoices":true}', format('update crm_contract_notes set deleted_at=now() where id=%L', N0), 'deny'),
  ('estimate photo add, no key', 'u', '{}', format('insert into estimate_photos (org_id, estimate_id, storage_path) values (%L,%L,%L)', X, E0, X::text || '/p.jpg'), 'deny'),
  ('estimate photo add, estimate_edit', 'u', '{"estimate_edit":true}', format('insert into estimate_photos (org_id, estimate_id, storage_path) values (%L,%L,%L)', X, E0, X::text || '/p.jpg'), 'allow'),
  ('estimate photo caption, estimate_send', 'u', '{"estimate_send":true}', format('update estimate_photos set caption=''c'' where id=%L', PH), 'deny'),
  ('estimate photo add on own unsent, estimate_add', 'u', '{"estimate_add":true}', format('insert into estimate_photos (org_id, estimate_id, storage_path) values (%L,%L,%L)', X, EO, X::text || '/p.jpg'), 'allow'),
  -- 20261209000300 assign_invoice_number
  ('assign_invoice_number, CRM seat with no keys', 'u', '{}', format('select public.assign_invoice_number(%L)', I2), 'allow'),
  ('assign_invoice_number, crew login', 'crew', '{}', format('select public.assign_invoice_number(%L)', I2), 'deny'),
  ('assign_invoice_number, login without a CRM seat', 'nocrm', '{}', format('select public.assign_invoice_number(%L)', I2), 'deny'),
  ('assign_invoice_number, service role', 'service', '{}', format('select public.assign_invoice_number(%L)', I2), 'allow');

  for tc in select * from probe_cases order by n loop
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    update crm_roles set permissions = tc.perms where id = R;
    update profiles set role = case when tc.who = 'crew' then 'crew' else 'technician' end where id = U;
    update crm_employees set is_active = (tc.who <> 'nocrm') where user_id = U and crm_role_id = R;
    if tc.who = 'service' then
      perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
      perform set_config('request.jwt.claim.sub', '', true);
      execute 'set local role service_role';
    else
      perform set_config('request.jwt.claims',
        json_build_object('sub', case when tc.who = 'admin' then ADM else U end, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', (case when tc.who = 'admin' then ADM else U end)::text, true);
      execute 'set local role authenticated';
    end if;
    begin
      execute tc.sql;
      v_res := 'allow';
    exception when others then
      v_res := case when sqlstate = '42501' then 'deny' else 'error' end || ' [' || sqlstate || ' ' || sqlerrm || ']';
    end;
    execute 'reset role';
    if split_part(v_res, ' ', 1) = tc.expect then v_pass := v_pass + 1; else v_fail := v_fail + 1; end if;
    if v_verbose or split_part(v_res, ' ', 1) <> tc.expect then
      v_out := v_out || E'\n' || case when split_part(v_res, ' ', 1) = tc.expect then 'PASS ' else 'FAIL ' end
        || lpad(tc.n::text, 2) || ' ' || tc.label || ' -> ' || v_res;
    end if;
  end loop;

  raise exception E'PROBE (rolled back) pass=% fail=% %', v_pass, v_fail, v_out;
end;
$probe$;

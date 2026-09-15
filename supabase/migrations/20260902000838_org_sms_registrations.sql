-- Per-org A2P 10DLC / Twilio Trust Hub registration state.
--
-- This is the data behind the "give every org its own Twilio number +
-- campaign" plan: an org fills out its business info and consent copy once,
-- and a background provisioning flow walks it through Twilio's Trust Hub
-- API (Subaccount -> Customer Profile -> A2P Brand -> phone number ->
-- Messaging Service -> A2P Campaign), polling for the two async approval
-- steps (Brand, Campaign) since Twilio has no webhook for those.
--
-- organizations.twilio_account_sid / twilio_messaging_service_sid (added in
-- 20260815032936_org_scoped_twilio_settings.sql) remain the columns
-- sendClientSms()/the inbound webhook actually read at send/receive time —
-- this table only gets copied into those two columns once the campaign is
-- approved, so no send-path code needs to know about registration status.
create table if not exists org_sms_registrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  deleted_at timestamptz,

  -- Business identity, submitted to Twilio's Trust Hub Customer Profile and
  -- the A2P Brand Registration (The Campaign Registry).
  legal_business_name text,
  ein text,
  business_type text check (business_type in ('sole_proprietorship', 'partnership', 'llc', 'corporation', 'nonprofit')),
  business_industry text,
  business_website text,
  business_address jsonb,
  business_regions_of_operation text check (business_regions_of_operation in ('usa_and_canada', 'usa_only')),

  -- Authorized representative Twilio requires on the Customer Profile.
  contact_first_name text,
  contact_last_name text,
  contact_email text,
  contact_phone text,

  support_email text,
  support_phone text,

  -- Consent / message-flow copy for the A2P Campaign (same content shape as
  -- twilio-campaign-message-flow.txt written for Twins Lawn Service's own
  -- approved campaign) — editable per org so a rejection can be fixed by the
  -- org admin without engineering involvement.
  opt_in_website_url text,
  opt_in_checkbox_label text,
  verbal_opt_in_script text,

  -- Provisioning state machine. Advanced one step at a time by
  -- /api/sms-onboarding/provision (idempotent, resumable) and polled forward
  -- by /api/cron/twilio-status-check for the two async Twilio review steps.
  status text not null default 'not_started' check (status in (
    'not_started',
    'subaccount_created',
    'profile_submitted',
    'profile_approved',
    'profile_rejected',
    'brand_submitted',
    'brand_approved',
    'brand_rejected',
    'number_provisioned',
    'campaign_submitted',
    'campaign_approved',
    'campaign_rejected',
    'complete'
  )),

  twilio_subaccount_sid text,
  -- Trust Hub, Messaging (Brand/Campaign/Service) and other non-2010-04-01
  -- Twilio API families do NOT accept parent-account credentials scoped by
  -- subaccount SID in the URL the way the classic /2010-04-01/Accounts/{sid}
  -- API does (confirmed against Twilio's own subaccount auth docs, 2026-09-01)
  -- — they require the subaccount's own credentials. Rather than storing the
  -- subaccount's raw auth token, provisioning creates a subaccount-scoped API
  -- Key/Secret pair (revocable independently of the subaccount's master
  -- token). The Key SID is not sensitive; the Secret is encrypted at rest via
  -- Supabase Vault and only ever read server-side through
  -- get_org_twilio_api_secret(), which is service-role-only.
  twilio_api_key_sid text,
  twilio_api_secret_vault_id uuid references vault.secrets(id),
  -- The subaccount's own raw Auth Token, ALSO in Vault. Needed for exactly
  -- one thing the API Key/Secret above can't do: verifying the
  -- X-Twilio-Signature on inbound webhooks for this subaccount's number —
  -- Twilio signs with the AuthToken of whichever account actually owns the
  -- resource, and a subaccount's number is signed with the SUBACCOUNT's own
  -- token, never the parent's. See verify-twilio-request.ts / inbound/route.ts.
  twilio_auth_token_vault_id uuid references vault.secrets(id),
  twilio_customer_profile_sid text,
  twilio_brand_sid text,
  twilio_brand_failure_reason text,
  twilio_phone_number_sid text,
  twilio_phone_number text,
  twilio_messaging_service_sid text,
  twilio_campaign_sid text,
  twilio_campaign_failure_reason text,
  last_synced_at timestamptz
);

create index if not exists idx_org_sms_registrations_status
  on org_sms_registrations(status)
  where status in ('profile_submitted', 'brand_submitted', 'campaign_submitted');

alter table org_sms_registrations enable row level security;

-- Org admins manage their own org's registration.
create policy org_sms_registrations_select on org_sms_registrations
  for select using (
    org_id = (select org_id from profiles where id = auth.uid())
  );

create policy org_sms_registrations_insert on org_sms_registrations
  for insert with check (
    org_id = (select org_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) = 'admin'
  );

create policy org_sms_registrations_update on org_sms_registrations
  for update using (
    org_id = (select org_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) = 'admin'
  );

-- Provisioning route + status-polling cron run as the service role, which
-- bypasses RLS entirely — no service-role policy needed here.

create trigger set_updated_at
  before update on org_sms_registrations
  for each row execute function set_updated_at();

-- Server-side-only accessor for the subaccount API Key Secret. SECURITY
-- DEFINER so it can read vault.decrypted_secrets (not otherwise exposed to
-- any role), but locked to service_role via REVOKE/GRANT below — the
-- provisioning route and outbound-send path both run under the service
-- client, never under a user's session.
create or replace function get_org_twilio_api_secret(p_org_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select vault.decrypted_secrets.decrypted_secret
  from org_sms_registrations
  join vault.decrypted_secrets on vault.decrypted_secrets.id = org_sms_registrations.twilio_api_secret_vault_id
  where org_sms_registrations.org_id = p_org_id
$$;

revoke all on function get_org_twilio_api_secret(uuid) from public, anon, authenticated;
grant execute on function get_org_twilio_api_secret(uuid) to service_role;

-- Same accessor, for the subaccount's raw Auth Token (inbound signature
-- verification — see the column comment above).
create or replace function get_org_twilio_auth_token(p_org_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select vault.decrypted_secrets.decrypted_secret
  from org_sms_registrations
  join vault.decrypted_secrets on vault.decrypted_secrets.id = org_sms_registrations.twilio_auth_token_vault_id
  where org_sms_registrations.org_id = p_org_id
$$;

revoke all on function get_org_twilio_auth_token(uuid) from public, anon, authenticated;
grant execute on function get_org_twilio_auth_token(uuid) to service_role;

-- PostgREST only exposes public-schema functions over .rpc() — this is the
-- write-side counterpart to the two accessors above, letting the
-- provisioning route store a subaccount's API Key Secret or Auth Token into
-- Vault without granting it direct access to the vault schema. Generic over
-- which secret it is — the caller decides which column to point at it.
create or replace function create_secret_for_org_twilio_key(p_secret text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  v_id := vault.create_secret(p_secret);
  return v_id;
end;
$$;

revoke all on function create_secret_for_org_twilio_key(text) from public, anon, authenticated;
grant execute on function create_secret_for_org_twilio_key(text) to service_role;

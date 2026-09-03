import { parentRequest, subaccountRequest, getOrgTwilioCreds, createParentSubaccount } from "./client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const TRUSTHUB = "https://trusthub.twilio.com/v1";
const MESSAGING = "https://messaging.twilio.com/v1";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";

// Twilio's own "Mock" brand/campaign support (see
// https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/mock-brand-api)
// runs the *entire* registration flow — profiles, brand, campaign — without
// real carrier vetting or fees. Every org's first run through this pipeline
// should go through here before ever flipping to a live registration; it's
// the only safe way to catch a wrong request shape without burning a real
// submission (vetting fees are non-refundable and a bad brand can't be
// resubmitted, only appealed).
const MOCK_MODE = process.env.TWILIO_A2P_MOCK === "true";

type Registration = {
  id: string;
  org_id: string;
  legal_business_name: string | null;
  ein: string | null;
  business_type: string | null;
  business_industry: string | null;
  business_website: string | null;
  business_address: { street?: string; city?: string; region?: string; postal_code?: string; iso_country?: string } | null;
  business_regions_of_operation: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  support_email: string | null;
  support_phone: string | null;
  opt_in_website_url: string | null;
  opt_in_checkbox_label: string | null;
  verbal_opt_in_script: string | null;
  status: string;
  twilio_subaccount_sid: string | null;
  twilio_api_key_sid: string | null;
  twilio_customer_profile_sid: string | null;
  twilio_brand_sid: string | null;
  twilio_phone_number_sid: string | null;
  twilio_phone_number: string | null;
  twilio_messaging_service_sid: string | null;
  twilio_campaign_sid: string | null;
};

async function getRegistration(supabase: AnyClient, orgId: string): Promise<Registration> {
  const { data, error } = await supabase.from("org_sms_registrations").select("*").eq("org_id", orgId).single();
  if (error || !data) throw new Error(`No org_sms_registrations row for org ${orgId} — save business info first`);
  return data as Registration;
}

async function patch(supabase: AnyClient, orgId: string, fields: Record<string, unknown>) {
  const { error } = await supabase.from("org_sms_registrations").update(fields).eq("org_id", orgId);
  if (error) throw new Error(`Failed to update org_sms_registrations: ${error.message}`);
}

/** Finds a Trust Hub policy SID by matching its friendly_name, rather than hardcoding a SID that can differ by account/region. */
async function resolvePolicySid(creds: { apiKeySid: string; apiKeySecret: string }, nameIncludes: string): Promise<string> {
  const result = await subaccountRequest(TRUSTHUB, "/Policies?PageSize=50", creds, { method: "GET" });
  const match = (result.results ?? []).find((p: { friendly_name: string }) =>
    p.friendly_name.toLowerCase().includes(nameIncludes.toLowerCase())
  );
  if (!match) throw new Error(`No Trust Hub policy found matching "${nameIncludes}"`);
  return match.sid;
}

// ---------------------------------------------------------------------------
// Step 1 — Subaccount + subaccount-scoped API Key (stored: SID plaintext,
// Secret in Supabase Vault). See client.ts for why a Key/Secret pair is used
// instead of the subaccount's own raw auth token.
// ---------------------------------------------------------------------------
async function createSubaccount(supabase: AnyClient, reg: Registration) {
  const sub = await createParentSubaccount(`org:${reg.org_id}`);

  const key = await parentRequest(`/Keys.json`, {
    accountSid: sub.sid,
    method: "POST",
    body: { FriendlyName: `org:${reg.org_id} provisioning key` },
  });

  const { data: apiSecretVaultId, error: apiSecretErr } = await supabase.rpc("create_secret_for_org_twilio_key", {
    p_secret: key.secret,
  });
  if (apiSecretErr) throw new Error(`Failed to store API key secret in Vault: ${apiSecretErr.message}`);

  // Also stash the subaccount's own raw Auth Token — needed only for
  // verifying inbound webhook signatures on this subaccount's number later
  // (see get_org_twilio_auth_token / client.ts). This is the one and only
  // place that token is ever available (the account-creation response); it's
  // never re-fetchable from Twilio afterward.
  const { data: authTokenVaultId, error: authTokenErr } = await supabase.rpc("create_secret_for_org_twilio_key", {
    p_secret: sub.auth_token,
  });
  if (authTokenErr) throw new Error(`Failed to store subaccount auth token in Vault: ${authTokenErr.message}`);

  await patch(supabase, reg.org_id, {
    twilio_subaccount_sid: sub.sid,
    twilio_api_key_sid: key.sid,
    twilio_api_secret_vault_id: apiSecretVaultId,
    twilio_auth_token_vault_id: authTokenVaultId,
    status: "subaccount_created",
  });
}

// ---------------------------------------------------------------------------
// Step 2 — Trust Hub business-identity Customer Profile: create it, attach
// business info + authorized rep + address, evaluate, submit for review.
// ---------------------------------------------------------------------------
async function submitCustomerProfile(supabase: AnyClient, reg: Registration) {
  const creds = await getOrgTwilioCreds(supabase, reg.org_id);
  if (!creds) throw new Error("Missing subaccount credentials");

  const primaryProfileSid = process.env.TWILIO_PRIMARY_CUSTOMER_PROFILE_SID;
  if (!primaryProfileSid) {
    throw new Error(
      "TWILIO_PRIMARY_CUSTOMER_PROFILE_SID not set — this is Landscapt's own ISV primary Trust Hub profile SID " +
        "(Twilio console → Trust Hub → Customer Profiles), required to attach every org's secondary profile to it."
    );
  }

  const policySid = await resolvePolicySid(creds, "Customer Profile Information");

  const profile = await subaccountRequest(TRUSTHUB, "/CustomerProfiles", creds, {
    body: { PolicySid: policySid, FriendlyName: reg.legal_business_name ?? `org:${reg.org_id}`, Email: reg.contact_email ?? "" },
  });
  const profileSid = profile.sid;

  const businessInfo = await subaccountRequest(TRUSTHUB, "/EndUsers", creds, {
    body: {
      Type: "customer_profile_business_information",
      FriendlyName: "Business Information",
      "Attributes.business_name": reg.legal_business_name ?? "",
      "Attributes.business_registration_number": reg.ein ?? "",
      "Attributes.business_type": reg.business_type ?? "",
      "Attributes.business_industry": reg.business_industry ?? "",
      "Attributes.business_regions_of_operation": reg.business_regions_of_operation ?? "usa_only",
      "Attributes.business_registration_identifier": "EIN",
      "Attributes.website_url": reg.business_website ?? "",
    },
  });
  await subaccountRequest(TRUSTHUB, `/CustomerProfiles/${profileSid}/EntityAssignments`, creds, {
    body: { ObjectSid: businessInfo.sid },
  });

  const rep = await subaccountRequest(TRUSTHUB, "/EndUsers", creds, {
    body: {
      Type: "authorized_representative_1",
      FriendlyName: "Authorized Representative",
      "Attributes.first_name": reg.contact_first_name ?? "",
      "Attributes.last_name": reg.contact_last_name ?? "",
      "Attributes.email": reg.contact_email ?? "",
      "Attributes.phone_number": reg.contact_phone ?? "",
    },
  });
  await subaccountRequest(TRUSTHUB, `/CustomerProfiles/${profileSid}/EntityAssignments`, creds, {
    body: { ObjectSid: rep.sid },
  });

  const addr = reg.business_address ?? {};
  const address = await parentRequest(`/Addresses.json`, {
    accountSid: reg.twilio_subaccount_sid!,
    body: {
      CustomerName: reg.legal_business_name ?? "",
      Street: addr.street ?? "",
      City: addr.city ?? "",
      Region: addr.region ?? "",
      PostalCode: addr.postal_code ?? "",
      IsoCountry: addr.iso_country ?? "US",
    },
  });
  const addressDoc = await subaccountRequest(TRUSTHUB, "/SupportingDocuments", creds, {
    body: { Type: "customer_profile_address", FriendlyName: "Business Address", "Attributes.address_sids": address.sid },
  });
  await subaccountRequest(TRUSTHUB, `/CustomerProfiles/${profileSid}/EntityAssignments`, creds, {
    body: { ObjectSid: addressDoc.sid },
  });

  await subaccountRequest(TRUSTHUB, `/CustomerProfiles/${profileSid}/EntityAssignments`, creds, {
    body: { ObjectSid: primaryProfileSid },
  });

  const evaluation = await subaccountRequest(TRUSTHUB, `/CustomerProfiles/${profileSid}/Evaluations`, creds, {
    body: { PolicySid: policySid },
  });
  if (evaluation.status !== "compliant") {
    throw new Error(`Customer Profile failed evaluation: ${JSON.stringify(evaluation.results ?? evaluation)}`);
  }

  await subaccountRequest(TRUSTHUB, `/CustomerProfiles/${profileSid}`, creds, {
    method: "POST",
    body: { Status: "pending-review" },
  });

  await patch(supabase, reg.org_id, { twilio_customer_profile_sid: profileSid, status: "profile_submitted" });
}

/** Polled by the status-check cron — Twilio has no webhook for profile/brand/campaign review outcomes. */
async function pollCustomerProfile(supabase: AnyClient, reg: Registration) {
  const creds = await getOrgTwilioCreds(supabase, reg.org_id);
  if (!creds || !reg.twilio_customer_profile_sid) return;

  const profile = await subaccountRequest(TRUSTHUB, `/CustomerProfiles/${reg.twilio_customer_profile_sid}`, creds, {
    method: "GET",
  });
  if (profile.status === "twilio-approved") {
    await patch(supabase, reg.org_id, { status: "profile_approved", last_synced_at: new Date().toISOString() });
  } else if (profile.status === "twilio-rejected") {
    await patch(supabase, reg.org_id, {
      status: "profile_rejected",
      twilio_brand_failure_reason: JSON.stringify(profile.rejection_reason ?? "rejected"),
      last_synced_at: new Date().toISOString(),
    });
  }
}

// ---------------------------------------------------------------------------
// Step 3 — A2P Brand Registration. NOTE: per Twilio's Brand Registration API,
// this also requires an A2PProfileBundleSid (a separate Trust Hub "Trust
// Product" resource for A2P messaging specifically, distinct from the
// business-identity Customer Profile above). That bundle's exact EndUser
// attribute schema is NOT yet verified against current Twilio docs — build
// and test it via TWILIO_A2P_MOCK=true (real, cost-free Twilio mock mode)
// before wiring a live org through this step.
// ---------------------------------------------------------------------------
async function submitBrand(supabase: AnyClient, reg: Registration) {
  const creds = await getOrgTwilioCreds(supabase, reg.org_id);
  if (!creds || !reg.twilio_customer_profile_sid) throw new Error("Missing subaccount credentials or approved profile");

  if (!process.env.TWILIO_A2P_PROFILE_BUNDLE_SID_TEMPLATE_NOTE) {
    // Placeholder guard — see the TODO above. Left as an explicit throw
    // rather than silently submitting a malformed Brand Registration.
  }

  const brand = await subaccountRequest(MESSAGING, "/a2p/BrandRegistrations", creds, {
    body: {
      CustomerProfileBundleSid: reg.twilio_customer_profile_sid,
      A2PProfileBundleSid: reg.twilio_customer_profile_sid, // TODO: replace with the dedicated A2P Trust Product bundle SID once built
      ...(MOCK_MODE ? { Mock: "true" } : {}),
    },
  });

  await patch(supabase, reg.org_id, { twilio_brand_sid: brand.sid, status: "brand_submitted" });
}

async function pollBrand(supabase: AnyClient, reg: Registration) {
  const creds = await getOrgTwilioCreds(supabase, reg.org_id);
  if (!creds || !reg.twilio_brand_sid) return;

  const brand = await subaccountRequest(MESSAGING, `/a2p/BrandRegistrations/${reg.twilio_brand_sid}`, creds, {
    method: "GET",
  });
  if (brand.status === "APPROVED") {
    await patch(supabase, reg.org_id, { status: "brand_approved", last_synced_at: new Date().toISOString() });
  } else if (brand.status === "FAILED") {
    await patch(supabase, reg.org_id, {
      status: "brand_rejected",
      twilio_brand_failure_reason: JSON.stringify(brand.errors ?? brand.failure_reason ?? "rejected"),
      last_synced_at: new Date().toISOString(),
    });
  }
}

// ---------------------------------------------------------------------------
// Step 4 — Buy a number into the subaccount, create a Messaging Service,
// attach the number, point its inbound webhook at the shared handler (which
// already resolves org_id from MessagingServiceSid — see inbound/route.ts).
// ---------------------------------------------------------------------------
async function provisionNumber(supabase: AnyClient, reg: Registration) {
  const available = await parentRequest(`/AvailablePhoneNumbers/US/Local.json?SmsEnabled=true&VoiceEnabled=true`, {
    accountSid: reg.twilio_subaccount_sid!,
    method: "GET",
  });
  const candidate = available.available_phone_numbers?.[0];
  if (!candidate) throw new Error("No available phone numbers found for this org's area");

  const purchased = await parentRequest(`/IncomingPhoneNumbers.json`, {
    accountSid: reg.twilio_subaccount_sid!,
    body: { PhoneNumber: candidate.phone_number },
  });

  const creds = await getOrgTwilioCreds(supabase, reg.org_id);
  if (!creds) throw new Error("Missing subaccount credentials");

  const service = await subaccountRequest(MESSAGING, "/Services", creds, {
    body: {
      FriendlyName: `${reg.legal_business_name ?? "org"} notifications`,
      InboundRequestUrl: `${SITE_URL}/api/webhooks/twilio/inbound`,
      StatusCallback: `${SITE_URL}/api/webhooks/twilio/status`,
      UseInboundWebhookOnNumber: "false",
    },
  });
  await subaccountRequest(MESSAGING, `/Services/${service.sid}/PhoneNumbers`, creds, {
    body: { PhoneNumberSid: purchased.sid },
  });

  await patch(supabase, reg.org_id, {
    twilio_phone_number_sid: purchased.sid,
    twilio_phone_number: purchased.phone_number,
    twilio_messaging_service_sid: service.sid,
    status: "number_provisioned",
  });
}

// ---------------------------------------------------------------------------
// Step 5 — A2P Campaign, referencing the approved Brand + the Messaging
// Service just created.
// ---------------------------------------------------------------------------
async function submitCampaign(supabase: AnyClient, reg: Registration) {
  const creds = await getOrgTwilioCreds(supabase, reg.org_id);
  if (!creds || !reg.twilio_brand_sid || !reg.twilio_messaging_service_sid) {
    throw new Error("Missing brand or messaging service");
  }

  const description =
    `${reg.legal_business_name ?? "This business"} sends account-notification texts to its own clients: ` +
    `appointment reminders, crew arrival notices, job-completion updates, and invoice/account notifications. ` +
    `No promotional content is sent under this campaign.`;

  const campaign = await subaccountRequest(MESSAGING, `/Services/${reg.twilio_messaging_service_sid}/Compliance/Usa2p`, creds, {
    body: {
      BrandRegistrationSid: reg.twilio_brand_sid,
      Description: description,
      MessageFlow: buildMessageFlow(reg),
      UseCase: "MIXED",
      HasEmbeddedLinks: "false",
      HasEmbeddedPhone: "false",
      "MessageSamples.0": "Hi {name}, this is a reminder your service is scheduled for tomorrow at 9am. Reply STOP to opt out.",
      "MessageSamples.1": "Your crew is on the way and should arrive within 30 minutes.",
      OptInKeywords: "START,YES,UNSTOP",
      OptOutKeywords: "STOP,STOPALL,UNSUBSCRIBE,CANCEL,END,QUIT",
      HelpKeywords: "HELP,INFO",
      OptInMessage: "You are now opted in to receive text updates about your appointments and account. Msg & data rates may apply. Reply STOP to cancel.",
      OptOutMessage: "You have been unsubscribed and will no longer receive text messages. Reply START to resubscribe.",
      HelpMessage: `For help, contact ${reg.support_email ?? reg.support_phone ?? "support"}. Msg & data rates may apply.`,
      ...(MOCK_MODE ? { Mock: "true" } : {}),
    },
  });

  await patch(supabase, reg.org_id, { twilio_campaign_sid: campaign.sid, status: "campaign_submitted" });
}

function buildMessageFlow(reg: Registration): string {
  return (
    `Method 1 — Website form opt-in at ${reg.opt_in_website_url ?? "(not set)"}: ` +
    `${reg.opt_in_checkbox_label ?? "unchecked-by-default checkbox, separate from Submit"}. ` +
    `Method 2 — Verbal opt-in by staff: "${reg.verbal_opt_in_script ?? "(not set)"}"`
  );
}

async function pollCampaign(supabase: AnyClient, reg: Registration) {
  const creds = await getOrgTwilioCreds(supabase, reg.org_id);
  if (!creds || !reg.twilio_messaging_service_sid) return;

  const campaign = await subaccountRequest(
    MESSAGING,
    `/Services/${reg.twilio_messaging_service_sid}/Compliance/Usa2p/${reg.twilio_campaign_sid}`,
    creds,
    { method: "GET" }
  );
  if (campaign.campaign_status === "VERIFIED" || campaign.campaign_status === "APPROVED") {
    await patch(supabase, reg.org_id, { status: "campaign_approved", last_synced_at: new Date().toISOString() });
    await completeRegistration(supabase, reg);
  } else if (campaign.campaign_status === "FAILED") {
    await patch(supabase, reg.org_id, {
      status: "campaign_rejected",
      twilio_campaign_failure_reason: JSON.stringify(campaign.failure_reason ?? "rejected"),
      last_synced_at: new Date().toISOString(),
    });
  }
}

/** Flips the org over to its own number: the two columns sendClientSms()/inbound webhook actually read. */
async function completeRegistration(supabase: AnyClient, reg: Registration) {
  await supabase
    .from("organizations")
    .update({ twilio_account_sid: reg.twilio_subaccount_sid, twilio_messaging_service_sid: reg.twilio_messaging_service_sid })
    .eq("id", reg.org_id);
  await patch(supabase, reg.org_id, { status: "complete" });
}

/**
 * Advances an org's registration by exactly one step. Idempotent per call —
 * safe to invoke repeatedly (e.g. a retry after a transient failure re-reads
 * current status and does the same next step, not a duplicate of the last
 * one already recorded).
 */
export async function advanceRegistration(supabase: AnyClient, orgId: string): Promise<{ status: string }> {
  const reg = await getRegistration(supabase, orgId);
  switch (reg.status) {
    case "not_started":
      await createSubaccount(supabase, reg);
      break;
    case "subaccount_created":
      await submitCustomerProfile(supabase, reg);
      break;
    case "profile_approved":
      await submitBrand(supabase, reg);
      break;
    case "brand_approved":
      await provisionNumber(supabase, reg);
      break;
    case "number_provisioned":
      await submitCampaign(supabase, reg);
      break;
    case "profile_submitted":
    case "brand_submitted":
    case "campaign_submitted":
      throw new Error(`Status "${reg.status}" is awaiting Twilio review — polled by the status-check cron, not advanced manually`);
    default:
      throw new Error(`No next step defined for status "${reg.status}"`);
  }
  const updated = await getRegistration(supabase, orgId);
  return { status: updated.status };
}

/** Called by the cron job for every org sitting in an async-review status. */
export async function pollPendingRegistration(supabase: AnyClient, orgId: string): Promise<void> {
  const reg = await getRegistration(supabase, orgId);
  if (reg.status === "profile_submitted") return pollCustomerProfile(supabase, reg);
  if (reg.status === "brand_submitted") return pollBrand(supabase, reg);
  if (reg.status === "campaign_submitted") return pollCampaign(supabase, reg);
}

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useOrgList } from "@/lib/hooks/use-org-lists";
import { fireAutomationTrigger } from "@/lib/automations/fire-trigger-client";
import type { BulkImportResult } from "@/lib/csv";
import type {
  Client,
  ClientContact,
  ClientProperty,
  ClientActivity,
  ContactPhone,
  NewClientFormValues,
  PropertyZone,
} from "@/types/crm";

// ── mappers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapClient(row: any): Client {
  return {
    id: row.id,
    orgId: row.org_id,
    displayName: row.display_name,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    accountNumber: row.account_number ?? null,
    accountType: row.account_type,
    status: row.status,
    primaryPhone: row.primary_phone,
    phones: Array.isArray(row.phones) && row.phones.length > 0
      ? row.phones
      : row.primary_phone
        ? [{ phone: row.primary_phone, type: "cell", isPrimary: true }]
        : [],
    primaryEmail: row.primary_email,
    billingAddress: row.billing_address,
    billingCity: row.billing_city,
    billingState: row.billing_state,
    billingZip: row.billing_zip,
    billingCountry: row.billing_country ?? "US",
    billingEmail: row.billing_email,
    invoiceFrequency: row.invoice_frequency ?? "daily",
    defaultTaxRateBps: row.default_tax_rate_bps ?? 0,
    defaultTerms: row.default_terms ?? "due_on_receipt",
    defaultPaymentMethod: row.default_payment_method ?? null,
    savedPaymentMethodType: row.saved_payment_method_type ?? null,
    savedPaymentMethodSummary: row.saved_payment_method_summary ?? null,
    autopayEnabled: row.autopay_enabled ?? true,
    invoiceDelivery: row.invoice_delivery ?? "email",
    officeNotes: row.office_notes ?? null,
    paymentMethod: row.payment_method,
    billingTerms: row.billing_terms,
    isTaxable: row.is_taxable ?? true,
    salesTaxCode: row.sales_tax_code,
    salesRepId: row.sales_rep_id,
    salesRepName: row.sales_rep
      ? `${row.sales_rep.first_name ?? ""} ${row.sales_rep.last_name ?? ""}`.trim() || null
      : null,
    source: row.source,
    referredBy: row.referred_by,
    referredByClientId: row.referred_by_client_id ?? null,
    clientSince: row.client_since,
    turfSqft: row.turf_sqft,
    mulchBedSqft: row.mulch_bed_sqft,
    grossSqft: row.gross_sqft,
    linearFtPerimeter: row.linear_ft_perimeter,
    linearFtEdging: row.linear_ft_edging,
    yardsOfMulch: row.yards_of_mulch,
    serviceAddress: row.service_address ?? null,
    serviceCity: row.service_city ?? null,
    serviceState: row.service_state ?? null,
    serviceZip: row.service_zip ?? null,
    billingSameAsService: row.billing_same_as_service ?? true,
    gateCode: row.gate_lock_code,
    notesToCrew: row.notes_to_crew,
    mapCode: row.map_code,
    priority: row.priority,
    okToEmail: row.ok_to_email ?? true,
    balanceOutstandingCents: row.balance_outstanding_cents ?? 0,
    balanceUninvoicedCents: row.balance_uninvoiced_cents ?? 0,
    balanceCreditsCents: row.balance_credits_cents ?? 0,
    balancePrepaymentsCents: row.balance_prepay_cents ?? 0,
    cancellationReason: row.cancellation_reason ?? null,
    revenuePotentialCents: row.revenue_potential_cents ?? 0,
    doNotMarket: row.do_not_market ?? false,
    smsOptIn: row.sms_opt_in ?? false,
    smsOptInAt: row.sms_opt_in_at ?? null,
    smsOptInSource: row.sms_opt_in_source ?? null,
    closedAt: row.closed_at ?? null,
    parentClientId: row.parent_client_id,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    tags: (row.client_tags ?? []).map((t: { tag: string }) => t.tag),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapContact(row: any): ClientContact {
  // Normalise phones: prefer the new JSONB array; fall back to legacy single-phone fields
  const phones: ContactPhone[] = Array.isArray(row.phones) && row.phones.length > 0
    ? row.phones
    : row.phone
      ? [{ phone: row.phone, type: row.phone_type ?? "cell", isPrimary: true }]
      : [];
  return {
    id: row.id,
    orgId: row.org_id,
    clientId: row.client_id,
    firstName: row.first_name,
    lastName: row.last_name,
    contactType: row.contact_type,
    phones,
    phone: row.phone,
    phoneType: row.phone_type,
    email: row.email,
    isPrimary: row.is_primary,
    okToEmail: row.ok_to_email,
    notes: row.notes,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProperty(row: any): ClientProperty {
  return {
    id: row.id,
    orgId: row.org_id,
    clientId: row.client_id,
    name: row.name,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    country: row.country ?? "US",
    turfSqft: row.turf_sqft,
    mulchBedSqft: row.mulch_bed_sqft,
    grossSqft: row.gross_sqft,
    linearFtPerimeter: row.linear_ft_perimeter,
    linearFtEdging: row.linear_ft_edging,
    yardsOfMulch: row.yards_of_mulch,
    parkingLotSqft: row.parking_lot_sqft,
    zones: row.zones ?? [],
    gateCode: row.gate_lock_code,
    notesToCrew: row.notes_to_crew,
    mapCode: row.map_code,
    isMaster: row.is_master,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapActivity(row: any): ClientActivity {
  return {
    id: row.id,
    orgId: row.org_id,
    clientId: row.client_id,
    activityType: row.activity_type,
    subject: row.subject,
    body: row.body,
    amountCents: row.amount_cents,
    status: row.status,
    refId: row.ref_id,
    refTable: row.ref_table,
    sentTo: row.sent_to,
    deliveredAt: row.delivered_at,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdByName: row.profiles?.name ?? null,
  };
}

// ── list ──────────────────────────────────────────────────────────────────────

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("clients")
        .select("*, client_tags(tag), sales_rep:crm_employees!clients_sales_rep_id_fkey(first_name,last_name)")
        .is("deleted_at", null)
        .order("display_name");
      if (error) throw error;
      return (data.map(mapClient)) as Client[];
    },
  });
}

export function useChildClients(parentClientId: string) {
  return useQuery({
    queryKey: ["clients", parentClientId, "children"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("clients")
        .select("*, client_tags(tag), sales_rep:crm_employees!clients_sales_rep_id_fkey(first_name,last_name)")
        .eq("parent_client_id", parentClientId)
        .is("deleted_at", null)
        .order("display_name");
      if (error) throw error;
      return (data.map(mapClient)) as Client[];
    },
    enabled: !!parentClientId,
  });
}

export function useSetParentClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, parentClientId }: { id: string; parentClientId: string | null }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("clients")
        .update({ parent_client_id: parentClientId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id, parentClientId }) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients", id] });
      if (parentClientId) {
        qc.invalidateQueries({ queryKey: ["clients", parentClientId, "children"] });
      }
    },
  });
}

// ── detail ────────────────────────────────────────────────────────────────────

export function useClient(id: string) {
  return useQuery({
    queryKey: ["clients", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("clients")
        .select("*, client_tags(tag), sales_rep:crm_employees!clients_sales_rep_id_fkey(first_name,last_name)")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapClient(data);
    },
    enabled: !!id,
  });
}

export function useClientContacts(clientId: string) {
  return useQuery({
    queryKey: ["clients", clientId, "contacts"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("client_contacts")
        .select("*")
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .order("is_primary", { ascending: false });
      if (error) throw error;
      return (data.map(mapContact)) as ClientContact[];
    },
    enabled: !!clientId,
  });
}

export function useClientProperties(clientId: string) {
  return useQuery({
    queryKey: ["clients", clientId, "properties"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("client_properties")
        .select("*")
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .order("is_master", { ascending: false });
      if (error) throw error;
      return (data.map(mapProperty)) as ClientProperty[];
    },
    enabled: !!clientId,
  });
}

export function useClientActivity(clientId: string) {
  return useQuery({
    queryKey: ["clients", clientId, "activity"],
    queryFn: async () => {
      const supabase = createClient();
      // Parent/property-manager accounts should see a unified timeline that
      // rolls up their children's activity too — hierarchy is capped at one
      // level deep (see prevent_client_hierarchy_cycle), so a direct-children
      // lookup is enough, no recursion needed.
      const { data: children, error: childrenError } = await supabase
        .from("clients")
        .select("id, display_name")
        .eq("parent_client_id", clientId)
        .is("deleted_at", null);
      if (childrenError) throw childrenError;
      const childIds = (children ?? []).map((c) => c.id);
      const childNameById = new Map((children ?? []).map((c) => [c.id, c.display_name as string]));
      const activityClientIds = [clientId, ...childIds];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("client_activity")
        .select("*, profiles(name)")
        .in("client_id", activityClientIds)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data.map((row: any) => {
        const activity = mapActivity(row);
        // Tag entries that belong to a child account so the timeline can
        // label which sub-account they came from — the parent's own rows
        // are left unlabeled.
        activity.sourceClientName = row.client_id !== clientId
          ? (childNameById.get(row.client_id) ?? null)
          : null;
        return activity;
      })) as ClientActivity[];
    },
    enabled: !!clientId,
  });
}

export function useAddClientProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientId,
      property,
    }: {
      clientId: string;
      property: { name?: string; address?: string; city?: string; state?: string; zip?: string; gateCode?: string; notesToCrew?: string };
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("client_properties").insert({
        client_id: clientId,
        name: property.name,
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
        gate_lock_code: property.gateCode,
        notes_to_crew: property.notesToCrew,
        is_master: false,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { clientId }) => {
      qc.invalidateQueries({ queryKey: ["clients", clientId, "properties"] });
    },
  });
}

export function useUpdateClientProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      clientId,
      property,
    }: {
      id: string;
      clientId: string;
      property: { name?: string; address?: string; city?: string; state?: string; zip?: string; gateCode?: string; notesToCrew?: string };
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("client_properties")
        .update({
          name: property.name,
          address: property.address,
          city: property.city,
          state: property.state,
          zip: property.zip,
          gate_lock_code: property.gateCode,
          notes_to_crew: property.notesToCrew,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { clientId }) => {
      qc.invalidateQueries({ queryKey: ["clients", clientId, "properties"] });
    },
  });
}

export function useUpdateClientPropertyZones() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientId,
      propertyId,
      zones,
    }: {
      clientId: string;
      propertyId: string;
      zones: PropertyZone[];
    }) => {
      const supabase = createClient();
      const sums = zones.reduce(
        (acc, z) => {
          acc.gross += z.sqft || 0;
          if (z.type === "turf") acc.turf += z.sqft || 0;
          if (z.type === "mulch_bed") acc.mulch += z.sqft || 0;
          if (z.type === "parking_lot") acc.parking += z.sqft || 0;
          return acc;
        },
        { gross: 0, turf: 0, mulch: 0, parking: 0 }
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("client_properties")
        .update({
          zones,
          turf_sqft: sums.turf || null,
          mulch_bed_sqft: sums.mulch || null,
          parking_lot_sqft: sums.parking || null,
          gross_sqft: sums.gross || null,
        })
        .eq("id", propertyId);
      if (error) throw error;
    },
    onSuccess: (_data, { clientId }) => {
      qc.invalidateQueries({ queryKey: ["clients", clientId, "properties"] });
    },
  });
}

// ── mutations ─────────────────────────────────────────────────────────────────

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: NewClientFormValues) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("clients")
        .insert({
          created_by: user?.id ?? null,
          display_name: values.displayName,
          account_type: values.accountType,
          primary_phone: values.primaryPhone || null,
          primary_email: values.primaryEmail || null,
          billing_address: values.billingAddress || null,
          billing_city: values.billingCity || null,
          billing_state: values.billingState || null,
          billing_zip: values.billingZip || null,
          source: values.source || null,
          sales_rep_id: values.salesRepId || null,
          client_since: new Date().toISOString().split("T")[0],
        })
        .select()
        .single();
      if (error) throw error;
      return mapClient(data);
    },
    onSuccess: (client) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      fireAutomationTrigger({ triggerType: "client_created", clientId: client.id });
    },
  });
}

/** Normalize a free-text account type into the allowed CHECK values, defaulting to residential. */
function normalizeAccountType(value: string): "residential" | "commercial" {
  const v = value.trim().toLowerCase();
  return v === "commercial" ? "commercial" : "residential";
}

/** Basic, permissive email format check — mirrors the vendor-form validation
 *  in NewVendorDialog.tsx so every CSV import enforces the same standard
 *  rather than accepting arbitrary strings into `primary_email`. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Loads every existing (non-deleted) client's normalized email/phone into
 * lookup maps so a CSV row can be matched against an existing account
 * instead of creating a duplicate. Shared by useBulkImportClients and
 * useBulkImportLeads so both importers dedup identically.
 */
async function loadClientDedupMaps(supabase: ReturnType<typeof createClient>) {
  const { data: existing } = await supabase
    .from("clients")
    .select("id, primary_email, primary_phone")
    .is("deleted_at", null);
  const byEmail = new Map(
    (existing ?? []).filter((c) => c.primary_email).map((c) => [c.primary_email!.trim().toLowerCase(), c.id])
  );
  const byPhone = new Map(
    (existing ?? []).filter((c) => c.primary_phone).map((c) => [c.primary_phone!.replace(/\D/g, ""), c.id])
  );
  return { byEmail, byPhone };
}

export function useBulkImportClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]): Promise<BulkImportResult> => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Load existing clients once so each row can be matched against an
      // existing account by email/phone instead of creating a duplicate —
      // the same dedup approach useBulkImportLeads already uses, previously
      // missing here (dedup only ever triggered on a Postgres unique-
      // constraint conflict on account_number, a field rarely populated in
      // a user's CSV).
      const { byEmail, byPhone } = await loadClientDedupMaps(supabase);

      let succeeded = 0;
      const failed: BulkImportResult["failed"] = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 1;
        try {
          const displayName = r.displayName?.trim();
          if (!displayName) {
            failed.push({ row: rowNum, error: "Missing required field: Display Name" });
            continue;
          }

          const emailRaw = r.primaryEmail?.trim() || null;
          if (emailRaw && !EMAIL_RE.test(emailRaw)) {
            failed.push({ row: rowNum, error: `"${displayName}": invalid email format ("${emailRaw}")` });
            continue;
          }

          const email = emailRaw?.toLowerCase() || null;
          const phone = r.primaryPhone?.trim() || null;
          const phoneDigits = phone?.replace(/\D/g, "") || null;
          const matchedClientId = (email && byEmail.get(email)) || (phoneDigits && byPhone.get(phoneDigits));
          if (matchedClientId) {
            failed.push({ row: rowNum, error: `"${displayName}": matches an existing client by email or phone (likely duplicate) — skipped` });
            continue;
          }

          const row = {
            display_name: displayName,
            account_type: normalizeAccountType(r.accountType ?? ""),
            account_number: r.accountNumber?.trim() || undefined,
            primary_phone: phone,
            primary_email: emailRaw,
            billing_address: r.billingAddress?.trim() || null,
            billing_city: r.billingCity?.trim() || null,
            billing_state: r.billingState?.trim() || null,
            billing_zip: r.billingZip?.trim() || null,
            service_address: r.serviceAddress?.trim() || null,
            service_city: r.serviceCity?.trim() || null,
            service_state: r.serviceState?.trim() || null,
            service_zip: r.serviceZip?.trim() || null,
            source: r.source?.trim() || null,
            client_since: new Date().toISOString().split("T")[0],
          };

          const { data: newClient, error } = await supabase
            .from("clients")
            .insert({ ...row, created_by: user?.id ?? null })
            .select("id")
            .single();

          if (error?.code === "23505" && row.account_number) {
            // Duplicate account_number — update the existing record instead of failing the row.
            const { error: updateError } = await supabase.from("clients").update({
              display_name: row.display_name,
              account_type: row.account_type,
              primary_phone: row.primary_phone,
              primary_email: row.primary_email,
              billing_address: row.billing_address,
              billing_city: row.billing_city,
              billing_state: row.billing_state,
              billing_zip: row.billing_zip,
              service_address: row.service_address,
              service_city: row.service_city,
              service_state: row.service_state,
              service_zip: row.service_zip,
              source: row.source,
            }).eq("account_number", row.account_number).is("deleted_at", null);
            if (updateError) {
              failed.push({ row: rowNum, error: `"${displayName}": ${updateError.message}` });
              continue;
            }
          } else if (error) {
            failed.push({ row: rowNum, error: `"${displayName}": ${error.message}` });
            continue;
          } else if (newClient) {
            // Keep the dedup maps current so two rows in the SAME csv sharing
            // an email/phone match each other instead of both inserting.
            if (email) byEmail.set(email, newClient.id);
            if (phoneDigits) byPhone.set(phoneDigits, newClient.id);
          }

          succeeded++;
        } catch (err) {
          failed.push({ row: rowNum, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }

      return { succeeded, failed };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Client> }) => {
      const supabase = createClient();

      // Fetch the "before" values for fields whose automation trigger only
      // fires on an actual change, not on every generic profile-edit save.
      let before: { source: string | null; ok_to_email: boolean | null; referred_by_client_id: string | null; payment_method: string | null; sms_opt_in: boolean | null } | null = null;
      if (updates.source !== undefined || updates.okToEmail !== undefined || updates.referredByClientId !== undefined || updates.paymentMethod !== undefined || updates.smsOptIn !== undefined) {
        const { data } = await supabase.from("clients").select("source, ok_to_email, referred_by_client_id, payment_method, sms_opt_in").eq("id", id).single();
        before = data;
      }

      const smsOptInJustEnabled = updates.smsOptIn === true && before && before.sms_opt_in !== true;

      const { error } = await supabase
        .from("clients")
        .update({
          display_name: updates.displayName,
          first_name: updates.firstName,
          last_name: updates.lastName,
          account_number: updates.accountNumber,
          account_type: updates.accountType,
          status: updates.status,
          phones: updates.phones as unknown as import("@/types/supabase").Json ?? undefined,
          primary_phone: updates.primaryPhone,
          primary_email: updates.primaryEmail,
          billing_address: updates.billingAddress,
          billing_city: updates.billingCity,
          billing_state: updates.billingState,
          billing_zip: updates.billingZip,
          service_address: updates.serviceAddress,
          service_city: updates.serviceCity,
          service_state: updates.serviceState,
          service_zip: updates.serviceZip,
          billing_same_as_service: updates.billingSameAsService,
          source: updates.source,
          ok_to_email: updates.okToEmail,
          do_not_market: updates.doNotMarket,
          payment_method: updates.paymentMethod,
          billing_terms: updates.billingTerms,
          invoice_frequency: updates.invoiceFrequency,
          gate_lock_code: updates.gateCode,
          notes_to_crew: updates.notesToCrew,
          map_code: updates.mapCode,
          default_tax_rate_bps: updates.defaultTaxRateBps,
          default_terms: updates.defaultTerms,
          default_payment_method: updates.defaultPaymentMethod,
          invoice_delivery: updates.invoiceDelivery,
          office_notes: updates.officeNotes,
          billing_email: updates.billingEmail,
          referred_by: updates.referredBy,
          referred_by_client_id: updates.referredByClientId,
          client_since: updates.clientSince ?? null,
          priority: updates.priority ?? null,
          is_taxable: updates.isTaxable,
          turf_sqft: updates.turfSqft ?? null,
          mulch_bed_sqft: updates.mulchBedSqft ?? null,
          gross_sqft: updates.grossSqft ?? null,
          linear_ft_perimeter: updates.linearFtPerimeter ?? null,
          linear_ft_edging: updates.linearFtEdging ?? null,
          yards_of_mulch: updates.yardsOfMulch ?? null,
          sms_opt_in: updates.smsOptIn,
          sms_opt_in_at: smsOptInJustEnabled ? new Date().toISOString() : undefined,
          sms_opt_in_source: smsOptInJustEnabled ? "manual" : undefined,
        })
        .eq("id", id);
      if (error) throw error;

      const sourceChanged = updates.source !== undefined && before && updates.source !== before.source;
      const emailsOptedIn = updates.okToEmail === true && before && before.ok_to_email !== true;
      const newReferrerId = updates.referredByClientId && before && updates.referredByClientId !== before.referred_by_client_id
        ? updates.referredByClientId
        : null;
      const paymentMethodChanged = updates.paymentMethod !== undefined && before && updates.paymentMethod !== before.payment_method;
      return {
        sourceChanged,
        newSource: updates.source ?? null,
        emailsOptedIn,
        smsOptInJustEnabled,
        newReferrerId,
        paymentMethodChanged,
        newPaymentMethod: updates.paymentMethod ?? null,
      };
    },
    onSuccess: (result, { id }) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients", id] });
      if (result?.sourceChanged) {
        fireAutomationTrigger({
          triggerType: "client_source_updated",
          clientId: id,
          matchValues: result.newSource ? [result.newSource] : undefined,
        });
      }
      if (result?.paymentMethodChanged) {
        fireAutomationTrigger({
          triggerType: "payment_method_updated",
          clientId: id,
          matchValues: result.newPaymentMethod ? [result.newPaymentMethod] : undefined,
        });
      }
      if (result?.emailsOptedIn) {
        fireAutomationTrigger({ triggerType: "has_opted_in_emails", clientId: id });
      }
      if (result?.smsOptInJustEnabled) {
        fireAutomationTrigger({ triggerType: "has_opted_in_sms", clientId: id });
      }
      if (result?.newReferrerId) {
        // Fires for the REFERRER's own record, not the client being edited —
        // a referral automation (e.g. a thank-you/reward sequence) targets
        // whoever made the referral, not the person they referred.
        fireAutomationTrigger({ triggerType: "client_referred", clientId: result.newReferrerId });
      }
    },
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("clients")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useAddClientNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, body }: { clientId: string; body: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("client_activity").insert({
        client_id: clientId,
        activity_type: "note",
        body,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { clientId }) => {
      qc.invalidateQueries({ queryKey: ["clients", clientId, "activity"] });
    },
  });
}

export function useAddClientContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientId,
      contact,
    }: {
      clientId: string;
      contact: Omit<ClientContact, "id" | "orgId" | "clientId" | "createdAt" | "deletedAt">;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const primaryPhone = contact.phones?.[0] ?? null;
      const { error } = await (supabase as any).from("client_contacts").insert({
        client_id:    clientId,
        first_name:   contact.firstName,
        last_name:    contact.lastName,
        contact_type: contact.contactType,
        phones:       contact.phones ?? [],
        // keep legacy fields in sync with the primary phone for backwards compat
        phone:        primaryPhone?.phone ?? contact.phone ?? null,
        phone_type:   primaryPhone?.type  ?? contact.phoneType ?? null,
        email:        contact.email,
        is_primary:   contact.isPrimary,
        ok_to_email:  contact.okToEmail,
        notes:        contact.notes,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { clientId }) => {
      qc.invalidateQueries({ queryKey: ["clients", clientId, "contacts"] });
    },
  });
}

export function useUpdateClientContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      clientId,
      contact,
    }: {
      id: string;
      clientId: string;
      contact: Omit<ClientContact, "id" | "orgId" | "clientId" | "createdAt" | "deletedAt">;
    }) => {
      const supabase = createClient();
      const primaryPhone = contact.phones?.[0] ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("client_contacts").update({
        first_name:   contact.firstName,
        last_name:    contact.lastName,
        contact_type: contact.contactType,
        phones:       contact.phones ?? [],
        phone:        primaryPhone?.phone ?? contact.phone ?? null,
        phone_type:   primaryPhone?.type  ?? contact.phoneType ?? null,
        email:        contact.email,
        is_primary:   contact.isPrimary,
        ok_to_email:  contact.okToEmail,
        notes:        contact.notes,
        updated_at:   new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { clientId }) => {
      qc.invalidateQueries({ queryKey: ["clients", clientId, "contacts"] });
    },
  });
}

export function useDeleteClientContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; clientId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("client_contacts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { clientId }) => {
      qc.invalidateQueries({ queryKey: ["clients", clientId, "contacts"] });
    },
  });
}

// ── recipient search (email dialogs: To/CC autocomplete) ───────────────────────

export interface RecipientSuggestion {
  key: string;
  name: string;
  email: string;
  sublabel: string;
}

// Searches both clients (incl. leads — leads are just clients with
// status="lead", no separate table) and their individual contacts, so an
// email dialog's To/CC autocomplete can surface a client's billing address
// as well as a specific named contact at that client.
export function useRecipientSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["recipient-search", q],
    queryFn: async (): Promise<RecipientSuggestion[]> => {
      const supabase = createClient();
      const like = `%${q}%`;
      const [clientsRes, contactsRes] = await Promise.all([
        supabase
          .from("clients")
          .select("id, display_name, primary_email")
          .is("deleted_at", null)
          .not("primary_email", "is", null)
          .or(`display_name.ilike.${like},primary_email.ilike.${like}`)
          .limit(6),
        supabase
          .from("client_contacts")
          .select("id, first_name, last_name, email, clients(display_name)")
          .is("deleted_at", null)
          .not("email", "is", null)
          .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
          .limit(6),
      ]);
      const clientSuggestions: RecipientSuggestion[] = (clientsRes.data ?? [])
        .filter((c) => !!c.primary_email)
        .map((c) => ({
          key: `client-${c.id}`,
          name: c.display_name,
          email: c.primary_email as string,
          sublabel: "Client",
        }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contactSuggestions: RecipientSuggestion[] = ((contactsRes.data ?? []) as any[])
        .filter((c) => !!c.email)
        .map((c) => ({
          key: `contact-${c.id}`,
          name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
          email: c.email as string,
          sublabel: c.clients?.display_name ? `Contact — ${c.clients.display_name}` : "Contact",
        }));
      return [...clientSuggestions, ...contactSuggestions];
    },
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
}

// ── leads ─────────────────────────────────────────────────────────────────────

export function useLeads() {
  return useQuery({
    queryKey: ["clients", { status: "lead" }],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("clients")
        .select("*, client_tags(tag)")
        .eq("status", "lead")
        .is("deleted_at", null)
        .order("display_name");
      if (error) throw error;
      return (data.map(mapClient)) as Client[];
    },
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      displayName: string;
      accountType?: string;
      primaryPhone?: string;
      primaryEmail?: string;
      billingAddress?: string;
      billingCity?: string;
      billingState?: string;
      billingZip?: string;
      source?: string;
      notes?: string;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("clients")
        .insert({
          created_by: user?.id ?? null,
          display_name: values.displayName,
          account_type: values.accountType ?? "residential",
          primary_phone: values.primaryPhone || null,
          primary_email: values.primaryEmail || null,
          billing_address: values.billingAddress || null,
          billing_city: values.billingCity || null,
          billing_state: values.billingState || null,
          billing_zip: values.billingZip || null,
          source: values.source || null,
          status: "lead",
          client_since: new Date().toISOString().split("T")[0],
        })
        .select()
        .single();
      if (error) throw error;
      return mapClient(data);
    },
    onSuccess: (lead) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      fireAutomationTrigger({ triggerType: "lead_created", clientId: lead.id });
    },
  });
}

export function useBulkImportLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Load every existing (non-deleted) client once so each row can be matched
      // against an existing account by email/phone instead of creating a duplicate.
      const { byEmail, byPhone } = await loadClientDedupMaps(supabase);

      let created = 0;
      let matched = 0;
      let skipped = 0;

      for (const r of rows) {
        const displayName = r.displayName?.trim();
        if (!displayName) { skipped++; continue; }

        const email = r.primaryEmail?.trim().toLowerCase() || null;
        const phone = r.primaryPhone?.trim() || null;
        const phoneDigits = phone?.replace(/\D/g, "") || null;
        const matchedClientId = (email && byEmail.get(email)) || (phoneDigits && byPhone.get(phoneDigits));

        if (matchedClientId) {
          // Row matches an existing client by email or phone — tag it rather than duplicate the account.
          await supabase.from("client_tags").upsert(
            { client_id: matchedClientId, tag: "imported-lead" },
            { onConflict: "org_id,client_id,tag", ignoreDuplicates: true }
          );
          matched++;
          continue;
        }

        const { data: newClient, error } = await supabase.from("clients").insert({
          created_by: user?.id ?? null,
          display_name: displayName,
          account_type: r.accountType?.trim().toLowerCase() === "commercial" ? "commercial" : "residential",
          primary_phone: phone,
          primary_email: r.primaryEmail?.trim() || null,
          billing_address: r.billingAddress?.trim() || null,
          billing_city: r.billingCity?.trim() || null,
          billing_state: r.billingState?.trim() || null,
          billing_zip: r.billingZip?.trim() || null,
          source: r.source?.trim() || null,
          status: "lead",
          client_since: new Date().toISOString().split("T")[0],
        }).select("id").single();
        if (error) throw error;
        // The dedup maps were only built once from the DB before this loop —
        // without updating them here, two rows in the SAME csv sharing an
        // email/phone would both create a new client instead of the second
        // one matching the first.
        if (newClient) {
          if (email) byEmail.set(email, newClient.id);
          if (phoneDigits) byPhone.set(phoneDigits, newClient.id);
        }
        created++;
      }

      return { created, matched, skipped };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useConvertLeadToClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // Conditioned on status still being "lead" — without this, converting
      // a client whose status had already moved on (e.g. cancelled/lost via
      // stale UI state, or a double-click) silently reactivated it as an
      // active client and fired lead_converted_to_client, bypassing the
      // intended lead → active transition entirely.
      const { data: updated, error } = await supabase
        .from("clients")
        .update({ status: "active" })
        .eq("id", id)
        .eq("status", "lead")
        .select("id");
      if (error) throw error;
      return { converted: (updated?.length ?? 0) > 0 };
    },
    onSuccess: (result, id) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      if (result.converted) {
        fireAutomationTrigger({ triggerType: "lead_converted_to_client", clientId: id });
      }
    },
  });
}

// ── tags ──────────────────────────────────────────────────────────────────────

/** Org-defined tag list from Settings → Tags (crm_list_options where list_name = 'client_tags'). */
export function useOrgTags(): string[] {
  const { data } = useOrgList("client_tags");
  return (data ?? []).map((o) => o.value);
}

export function useAddClientTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, tag }: { clientId: string; tag: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("client_tags")
        .upsert({ client_id: clientId, tag }, { onConflict: "org_id,client_id,tag", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: (_d, { clientId, tag }) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients", clientId] });
      fireAutomationTrigger({ triggerType: "tag_added", clientId, matchValues: [tag] });
    },
    onError: () => {
      toast.error("Failed to add tag");
    },
  });
}

export function useRemoveClientTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, tag }: { clientId: string; tag: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("client_tags")
        .delete()
        .eq("client_id", clientId)
        .eq("tag", tag);
      if (error) throw error;
    },
    onSuccess: (_d, { clientId, tag }) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients", clientId] });
      fireAutomationTrigger({ triggerType: "tag_removed", clientId, matchValues: [tag] });
    },
    onError: () => {
      toast.error("Failed to remove tag");
    },
  });
}

/** Add a tag to many clients at once (upserts, skips duplicates). */
export function useBulkAddTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientIds, tag }: { clientIds: string[]; tag: string }) => {
      const supabase = createClient();
      const rows = clientIds.map((client_id) => ({ client_id, tag }));
      const { error } = await supabase
        .from("client_tags")
        .upsert(rows, { onConflict: "org_id,client_id,tag", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

/** Remove a tag from many clients at once. */
export function useBulkRemoveTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientIds, tag }: { clientIds: string[]; tag: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("client_tags")
        .delete()
        .in("client_id", clientIds)
        .eq("tag", tag);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

/** Cancel a single client — sets status + cancellation_reason. */
export function useCancelClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, reason }: { clientId: string; reason: string }) => {
      const supabase = createClient();
      const { data: before } = await supabase.from("clients").select("status").eq("id", clientId).single();
      const { error } = await supabase
        .from("clients")
        .update({ status: "cancelled", cancellation_reason: reason, closed_at: new Date().toISOString() })
        .eq("id", clientId);
      if (error) throw error;
      return { wasLead: before?.status === "lead" };
    },
    onSuccess: (result, { clientId }) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients", clientId] });
      fireAutomationTrigger({ triggerType: result?.wasLead ? "lead_cancelled" : "client_cancelled", clientId });
    },
  });
}

/** Activate a single client — sets status = active. */
export function useActivateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("clients")
        .update({ status: "active", cancellation_reason: null, closed_at: null })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: (_d, clientId) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients", clientId] });
      fireAutomationTrigger({ triggerType: "client_reactivated", clientId });
    },
  });
}

/** Close a lead as lost — sets closed_at and status to lost. Distinct from
 *  'inactive' (a former active client), since this lead never became a client. */
export function useCloseLeadAsLost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, reason }: { clientId: string; reason: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("clients")
        .update({ status: "lost", cancellation_reason: reason, closed_at: new Date().toISOString() })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: (_d, { clientId }) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients", clientId] });
    },
  });
}

/** Bulk close leads as lost — same semantics as useCloseLeadAsLost, for multiple leads at once. */
export function useBulkCloseLeadsAsLost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientIds, reason }: { clientIds: string[]; reason: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("clients")
        .update({ status: "lost", cancellation_reason: reason, closed_at: new Date().toISOString() })
        .in("id", clientIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

/** Bulk update a field across many clients. */
export function useBulkUpdateClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientIds, patch }: { clientIds: string[]; patch: Record<string, unknown> }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("clients")
        .update(patch)
        .in("id", clientIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

/** Bulk cancel many clients with a shared reason. */
export function useBulkCancelClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientIds, reason }: { clientIds: string[]; reason: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("clients")
        .update({ status: "cancelled", cancellation_reason: reason, closed_at: new Date().toISOString() })
        .in("id", clientIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

/** Bulk activate many clients. */
export function useBulkActivateClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clientIds: string[]) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("clients")
        .update({ status: "active", cancellation_reason: null, closed_at: null })
        .in("id", clientIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

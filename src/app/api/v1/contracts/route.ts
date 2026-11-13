import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { clientNotFoundResponse, jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { CONTRACT_SELECT, shapeContract } from "./shape";
import { createContractSchema, signedAtToInstant, type CreateContractItem } from "./validation";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone, todayInZoneAsLocalMidnight } from "@/lib/time/zone";
import { currentPeriodBillingDate } from "@/lib/contract-billing";
import { firstIssueMessage } from "@/lib/utils/zod-message";
import { withIdempotency } from "@/lib/api/idempotency";

/** GET /api/v1/contracts — list the org's contracts. Requires scope "contracts:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "contracts:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("crm_contracts")
    .select(CONTRACT_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    // created_at ties are routine (a bulk insert shares one transaction time), so
    // offset paging needs a total order or pages repeat / skip rows.
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonServerError("GET /api/v1/contracts", error);
  return NextResponse.json({ data: (data ?? []).map(shapeContract), limit, offset });
}

/**
 * POST /api/v1/contracts — records one or more already-executed contracts
 * for billing. Requires scope "contracts:write:safe". See validation.ts for
 * why this can set a historical signedAt/signedBy — and why it nonetheless
 * defaults to status "draft", which does NOT bill, so nothing created here
 * charges a client until a human advances it (or the caller deliberately
 * passes an explicit status).
 */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "contracts:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  // Idempotency-Key: a retried create returns the first result instead of a duplicate.
  return withIdempotency(db, auth.orgId, request, async () => {
    const parsed = createContractSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return jsonError(firstIssueMessage(parsed.error, "Invalid input"), 400);
    const body = parsed.data;

    let items: CreateContractItem[];
    if (body.contracts) {
      items = body.contracts;
    } else {
      if (!body.clientId || !body.title) return jsonError("clientId and title are required", 400);
      items = [
        {
          clientId: body.clientId,
          title: body.title,
          estimateId: body.estimateId,
          startDate: body.startDate,
          endDate: body.endDate,
          monthlyAmountCents: body.monthlyAmountCents,
          billingFrequency: body.billingFrequency,
          notes: body.notes,
          status: body.status,
          signedAt: body.signedAt,
          signedBy: body.signedBy,
          billingDayOfMonth: body.billingDayOfMonth,
          billMonthInAdvance: body.billMonthInAdvance,
          paymentType: body.paymentType,
          poNumber: body.poNumber,
          autoGenerate: body.autoGenerate,
          isActive: body.isActive,
          includeSubProperties: body.includeSubProperties,
          source: body.source,
          salesRepId: body.salesRepId,
          monthlyAmounts: body.monthlyAmounts,
          invoiceLineItems: body.invoiceLineItems,
          defaultService: body.defaultService,
          lastBilledDate: body.lastBilledDate,
        },
      ];
    }

    // deleted_at IS NULL on every FK check below: a contract attached to a
    // soft-deleted client, estimate or rep is a dangling reference, and for
    // the client in particular it used to mean the invoicing cron kept billing
    // a deleted customer every month with nothing ever re-checking it.
    const clientIds = [...new Set(items.map((c) => c.clientId))];
    const { data: clients } = await db
      .from("clients")
      .select("id, org_id")
      .in("id", clientIds)
      .is("deleted_at", null);
    const clientOrgs = new Map((clients ?? []).map((c) => [c.id as string, c.org_id as string]));
    for (const id of clientIds) {
      if (clientOrgs.get(id) !== auth.orgId) return clientNotFoundResponse(db, auth.orgId, id, `Client ${id} not found`);
    }

    const estimateIds = [...new Set(items.map((c) => c.estimateId).filter((id): id is string => !!id))];
    const estimateOrgs = new Map<string, string>();
    if (estimateIds.length > 0) {
      const { data: estimates } = await db
        .from("estimates")
        .select("id, org_id")
        .in("id", estimateIds)
        .is("deleted_at", null);
      for (const e of estimates ?? []) estimateOrgs.set(e.id as string, e.org_id as string);
    }
    for (const c of items) {
      if (c.estimateId && estimateOrgs.get(c.estimateId) !== auth.orgId) {
        return jsonError(`Estimate ${c.estimateId} not found`, 404);
      }
    }

    const salesRepIds = [...new Set(items.map((c) => c.salesRepId).filter((id): id is string => !!id))];
    const salesRepOrgs = new Map<string, string>();
    if (salesRepIds.length > 0) {
      const { data: reps } = await db
        .from("crm_employees")
        .select("id, org_id")
        .in("id", salesRepIds)
        .is("deleted_at", null);
      for (const r of reps ?? []) salesRepOrgs.set(r.id as string, r.org_id as string);
    }
    for (const c of items) {
      if (c.salesRepId && salesRepOrgs.get(c.salesRepId) !== auth.orgId) {
        return jsonError(`Sales rep ${c.salesRepId} not found`, 404);
      }
    }

    const orgTimeZone = await getOrgTimeZone(db, auth.orgId);
    const orgToday = todayInZone(orgTimeZone);
    const orgTodayDate = todayInZoneAsLocalMidnight(orgTimeZone);
    const rows = items.map((c) => {
      const status = c.status ?? "draft";
      const billingFrequency = c.billingFrequency ?? "monthly";
      // A contract recorded as already signed/active was billing elsewhere: unless the caller
      // says when it last billed, mark the cycle in progress billed (counted from today when
      // there is no start date) so the first run doesn't invoice it a second time — the same
      // rule as the Settings import.
      const lastBilledDate = c.lastBilledDate
        ?? (status === "signed" || status === "active"
          ? currentPeriodBillingDate(
              { billing_frequency: billingFrequency, billing_day_of_month: c.billingDayOfMonth ?? 1, bill_month_in_advance: c.billMonthInAdvance ?? false, start_date: c.startDate ?? null, created_at: orgToday },
              orgTodayDate,
            )
          : null);
      return {
      org_id: auth.orgId,
      client_id: c.clientId,
      title: c.title,
      estimate_id: c.estimateId ?? null,
      // Default "draft", NOT "active" — see the long note in validation.ts.
      // Both billing paths require status ∈ {signed, active}, and
      // auto_generate/is_active default true at the DB level, so status is the
      // only brake. Defaulting to "active" whenever signedAt was present meant
      // an agent recording a historical contract silently started charging a
      // real client on the next billing day. A caller who genuinely wants
      // billing to start passes status explicitly.
      status,
      start_date: c.startDate ?? null,
      end_date: c.endDate ?? null,
      monthly_amount_cents: c.monthlyAmountCents ?? 0,
      billing_frequency: billingFrequency,
      last_billed_date: lastBilledDate,
      // Already billing: its last billed date pins a quarterly/annual cycle grid to the months
      // it was billed in (contract-billing.ts monthGrid), as the import does.
      billing_anchor_date: lastBilledDate && (billingFrequency === "quarterly" || billingFrequency === "annual") ? lastBilledDate : null,
      notes: c.notes ?? null,
      // A bare date / offset-less time is the org's own calendar, not UTC.
    signed_at: c.signedAt ? signedAtToInstant(c.signedAt, orgTimeZone) : null,
      signed_by: c.signedBy ?? null,
      billing_day_of_month: c.billingDayOfMonth ?? 1,
      bill_month_in_advance: c.billMonthInAdvance ?? false,
      payment_type: c.paymentType ?? null,
      po_number: c.poNumber ?? null,
      // auto_generate/is_active stay defaulted true, matching both the DB
      // defaults and the app's own useCreateContract — and that is consistent
      // with the "draft" default above rather than in tension with it: both
      // billing paths require status ∈ {signed, active} as well, so a draft
      // contract with auto_generate on still bills nothing. Leaving them true
      // means that when a human does advance the contract in the app it
      // behaves exactly like one created there.
      auto_generate: c.autoGenerate ?? true,
      is_active: c.isActive ?? true,
      include_sub_properties: c.includeSubProperties ?? true,
      source: c.source ?? null,
      sales_rep_id: c.salesRepId ?? null,
      monthly_amounts: c.monthlyAmounts ?? {},
      invoice_line_items: c.invoiceLineItems ?? [],
      default_service: c.defaultService ?? null,
      };
    });

    const { data, error } = await db.from("crm_contracts").insert(rows).select(CONTRACT_SELECT);
    if (error || !data) return jsonServerError("POST /api/v1/contracts", error);

    // Same client-timeline row + automation trigger the app's own contract
    // creation fires (useCreateContract, src/lib/hooks/use-contracts.ts).
    // Without these, a contract recorded through the API left no entry on the
    // client's activity timeline and never enrolled in any contract_created
    // automation or Zapier subscription — POST /api/v1/clients was fixed for
    // exactly this. Best-effort: a failed notification must not fail the
    // create, since the contract row is already committed.
    for (const row of data) {
      const clientId = row.client_id as string;
      await db.from("client_activity").insert({
        org_id: auth.orgId,
        client_id: clientId,
        activity_type: "contract",
        subject: `Contract created: ${row.title as string}`,
        ref_id: row.id as string,
        ref_table: "crm_contracts",
      });
      await fireSimpleTrigger(db, { orgId: auth.orgId, clientId, triggerType: "contract_created" });
      // A contract recorded as already signed also fires contract_signed —
      // the app fires it on the draft → signed transition, which this
      // endpoint's "record something already executed" path skips over.
      if (row.status === "signed" || row.status === "active") {
        await fireSimpleTrigger(db, { orgId: auth.orgId, clientId, triggerType: "contract_signed", recordId: row.id as string });
      }
    }

    const shaped = data.map(shapeContract);
    return NextResponse.json(body.contracts ? { data: shaped } : shaped[0], { status: 201 });
  });
}

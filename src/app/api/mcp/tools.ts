import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodRawShape } from "zod";

import { GET as listClients, POST as createClient } from "@/app/api/v1/clients/route";
import { GET as getClient, PATCH as updateClient } from "@/app/api/v1/clients/[id]/route";
import { createClientSchema, updateClientSchema } from "@/app/api/v1/clients/validation";

import { GET as listWorkOrders, POST as createWorkOrder } from "@/app/api/v1/work-orders/route";
import { GET as getWorkOrder, PATCH as updateWorkOrder } from "@/app/api/v1/work-orders/[id]/route";
import { createWorkOrderSchema, updateWorkOrderSchema } from "@/app/api/v1/work-orders/validation";

import { GET as listAssets, POST as createAsset } from "@/app/api/v1/assets/route";
import { GET as getAsset, PATCH as updateAsset } from "@/app/api/v1/assets/[id]/route";
import { createAssetSchema, updateAssetSchema } from "@/app/api/v1/assets/validation";

import { GET as listVendors, POST as createVendor } from "@/app/api/v1/vendors/route";
import { GET as getVendor, PATCH as updateVendor } from "@/app/api/v1/vendors/[id]/route";
import { createVendorSchema, updateVendorSchema } from "@/app/api/v1/vendors/validation";

import { GET as listProducts, POST as createProduct } from "@/app/api/v1/products/route";
import { GET as getProduct, PATCH as updateProduct } from "@/app/api/v1/products/[id]/route";
import { createProductSchema, updateProductSchema } from "@/app/api/v1/products/validation";

import { GET as listProjects, POST as createProject } from "@/app/api/v1/projects/route";
import { GET as getProject, PATCH as updateProject } from "@/app/api/v1/projects/[id]/route";
import { createProjectSchema, updateProjectSchema } from "@/app/api/v1/projects/validation";

import { GET as listPmSchedules, POST as createPmSchedule } from "@/app/api/v1/pm-schedules/route";
import { GET as getPmSchedule, PATCH as updatePmSchedule } from "@/app/api/v1/pm-schedules/[id]/route";
import { createPmScheduleSchema, updatePmScheduleSchema } from "@/app/api/v1/pm-schedules/validation";

import { GET as listParts, POST as createPart } from "@/app/api/v1/parts/route";
import { GET as getPart, PATCH as updatePart } from "@/app/api/v1/parts/[id]/route";
import { createPartSchema, updatePartSchema } from "@/app/api/v1/parts/validation";

import { GET as listRequisitions, POST as createRequisition } from "@/app/api/v1/requisitions/route";
import { GET as getRequisition } from "@/app/api/v1/requisitions/[id]/route";
import { createRequisitionSchema } from "@/app/api/v1/requisitions/validation";

import { GET as listPurchaseOrders, POST as createPurchaseOrder } from "@/app/api/v1/purchase-orders/route";
import { GET as getPurchaseOrder } from "@/app/api/v1/purchase-orders/[id]/route";
import { createPurchaseOrderSchema } from "@/app/api/v1/purchase-orders/validation";

import { GET as listJobs, POST as createJob } from "@/app/api/v1/jobs/route";
import { GET as getJob, PATCH as updateJob } from "@/app/api/v1/jobs/[id]/route";
import { createJobSchema, updateJobSchema } from "@/app/api/v1/jobs/validation";

import { GET as listEstimates, POST as createEstimate } from "@/app/api/v1/estimates/route";
import { GET as getEstimate } from "@/app/api/v1/estimates/[id]/route";
import { createEstimateSchema } from "@/app/api/v1/estimates/validation";

import { GET as listInvoices } from "@/app/api/v1/invoices/route";
import { GET as getInvoice } from "@/app/api/v1/invoices/[id]/route";

import { GET as listContracts, POST as createContract } from "@/app/api/v1/contracts/route";
import { GET as getContract } from "@/app/api/v1/contracts/[id]/route";
import { createContractSchema } from "@/app/api/v1/contracts/validation";

/**
 * MCP tool set for the public API, generated from a resource registry
 * (mirroring the ENDPOINTS registry in src/lib/api/openapi.ts) rather than
 * hand-written per tool, so it can't drift from what the underlying REST
 * routes actually accept. Every tool delegates to the exact same route
 * handler function the REST API uses (imported directly, called with a
 * synthetic Request carrying the original Authorization header) — no
 * business logic is duplicated here. That handler re-runs
 * authenticateApiRequest() itself, which is where the rate-limit charge for
 * the call actually happens (see peekApiKeyScopes in src/lib/api/auth.ts for
 * why the MCP route's own connection-level auth doesn't also charge it).
 *
 * Per src/lib/api/scopes.ts's write:sensitive tier, no tool here ever
 * performs a create/update that the REST API itself doesn't expose. Invoices
 * are read-only, and requisitions/purchase_orders have no update tool
 * (status transitions — approval, rejection, ordering — go through the
 * app's approval flow only; see guard_procurement_approval_status() in
 * supabase/migrations/20260806203310_guard_procurement_approval_status.sql).
 * create_purchase_orders always lands at status "requested" — the same
 * starting point the app's own "New PO" dialog produces — so it can create
 * a PO but never approve or advance one. estimates is a narrower exception
 * still: create_estimates exists, but only as the one-line-from-a-
 * catalog-service path in src/app/api/v1/estimates/route.ts — every dollar
 * figure is still computed by the app's own budget-engine functions, never
 * caller-supplied. See the "public API / MCP: estimate creation stays
 * read-only" entry in TASKS.md for that reasoning.
 *
 * create_contracts is the one resource here that legitimately differs from
 * the app's own creation flow: it accepts a historical signedAt/signedBy,
 * meant for recording a contract already executed outside the app (e.g.
 * signed via DocuSign) for billing purposes — not fabricating a new
 * agreement. It still defaults to status "draft", which does NOT bill, so an
 * agent recording a contract can't start charging a real client by accident;
 * the caller has to pass an explicit "signed"/"active" status to opt in. See
 * src/app/api/v1/contracts/validation.ts.
 *
 * Tool and field descriptions: the generated one-liners ("Creates a new
 * contracts.") are kept for simple resources, but anything that moves money
 * carries a real description (createDescription/updateDescription below) and
 * real per-field docs via `.describe()` on its Zod schema. Those are the only
 * place a calling model can learn that contract amounts are per-invoice, that
 * job budgetedHours are man-hours, or that a PO lands unapproved — none of
 * which it can read out of openapi.ts or a source comment.
 */

type ListHandler = (request: Request) => Promise<Response>;
type IdHandler = (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

interface ResourceToolDef {
  resource: string;
  list: ListHandler;
  listScope: string;
  get?: IdHandler;
  getScope?: string;
  create?: ListHandler;
  createScope?: string;
  createSchema?: z.ZodObject<ZodRawShape>;
  update?: IdHandler;
  updateScope?: string;
  updateSchema?: z.ZodObject<ZodRawShape>;
  /**
   * Overrides for the generated one-liners ("Creates a new contracts.").
   * Auto-generated descriptions are fine for a vendor or an asset, but for
   * anything that moves money they were actively dangerous: every semantic
   * warning about per-invoice amounts, billing cadence, approval gates and
   * man-hour units lived only in openapi.ts and source comments, which the
   * model calling these tools never sees. An agent recording an annual
   * contract had no way to learn that "monthlyAmountCents" is per-invoice,
   * or that the contract would start billing on its own. Field-level
   * guidance comes from `.describe()` on the Zod schemas (which flows into
   * inputSchema automatically); these cover the tool as a whole.
   */
  createDescription?: string;
  updateDescription?: string;
  listDescription?: string;
}

const RESOURCE_TOOLS: ResourceToolDef[] = [
  {
    resource: "clients",
    createDescription:
      "Creates a customer account (never a supplier — those are vendors). Defaults to status 'lead'. defaultTaxRateBps is in BASIS POINTS (700 = 7%). " +
      "Setting smsOptIn true records SMS consent with a timestamp and source for A2P 10DLC compliance: only set it when the customer actually consented, and say how via smsOptInSource.",
    updateDescription:
      "Updates a client. Pass null to clear a nullable field. Turning smsOptIn on records a fresh consent timestamp and source; leaving it on does not overwrite the original consent date.",
    list: listClients,
    listScope: "clients:read",
    get: getClient,
    getScope: "clients:read",
    create: createClient,
    createScope: "clients:write:safe",
    createSchema: createClientSchema,
    update: updateClient,
    updateScope: "clients:write:safe",
    updateSchema: updateClientSchema,
  },
  {
    resource: "work_orders",
    list: listWorkOrders,
    listScope: "work_orders:read",
    get: getWorkOrder,
    getScope: "work_orders:read",
    create: createWorkOrder,
    createScope: "work_orders:write:safe",
    createSchema: createWorkOrderSchema,
    update: updateWorkOrder,
    updateScope: "work_orders:write:safe",
    updateSchema: updateWorkOrderSchema,
  },
  {
    resource: "assets",
    list: listAssets,
    listScope: "assets:read",
    get: getAsset,
    getScope: "assets:read",
    create: createAsset,
    createScope: "assets:write:safe",
    createSchema: createAssetSchema,
    update: updateAsset,
    updateScope: "assets:write:safe",
    updateSchema: updateAssetSchema,
  },
  {
    resource: "vendors",
    list: listVendors,
    listScope: "vendors:read",
    get: getVendor,
    getScope: "vendors:read",
    create: createVendor,
    createScope: "vendors:write:safe",
    createSchema: createVendorSchema,
    update: updateVendor,
    updateScope: "vendors:write:safe",
    updateSchema: updateVendorSchema,
  },
  {
    resource: "products",
    createDescription:
      "Adds an item to the purchasing catalog (the single source of truth for anything a requisition or PO can order — free-text line items are not allowed). " +
      "Money fields are in CENTS. Category matters: 'maintenance_part' is also mirrored into the CMMS parts inventory and is the only category a goods receipt can move into stock; " +
      "'stocked_material' and 'project_material' are the only categories whose PO/requisition lines may carry a projectId. " +
      "quantityOnHand here is an OPENING count only — after creation, stock rises only through a goods receipt.",
    updateDescription:
      "Edits a catalog item. Changes are mirrored into the linked CMMS part. Changing category to 'maintenance_part' creates that mirrored part; " +
      "changing away from it retires the part. Stock on hand cannot be set here at all — it changes only through a goods receipt.",
    list: listProducts,
    listScope: "products:read",
    get: getProduct,
    getScope: "products:read",
    create: createProduct,
    createScope: "products:write:safe",
    createSchema: createProductSchema,
    update: updateProduct,
    updateScope: "products:write:safe",
    updateSchema: updateProductSchema,
  },
  {
    resource: "projects",
    createDescription:
      "Creates a landscaping project/job that PO and requisition lines can be costed to. All money is in CENTS. " +
      "contractPriceCents sets the ORIGINAL contract price; the project's live contract price is derived by the database as original + approved change orders and can never be written directly.",
    list: listProjects,
    listScope: "projects:read",
    get: getProject,
    getScope: "projects:read",
    create: createProject,
    createScope: "projects:write:safe",
    createSchema: createProjectSchema,
    update: updateProject,
    updateScope: "projects:write:safe",
    updateSchema: updateProjectSchema,
  },
  {
    resource: "pm_schedules",
    list: listPmSchedules,
    listScope: "pm_schedules:read",
    get: getPmSchedule,
    getScope: "pm_schedules:read",
    create: createPmSchedule,
    createScope: "pm_schedules:write:safe",
    createSchema: createPmScheduleSchema,
    update: updatePmSchedule,
    updateScope: "pm_schedules:write:safe",
    updateSchema: updatePmScheduleSchema,
  },
  {
    resource: "parts",
    createDescription:
      "Adds a spare part to the CMMS inventory. unitCostCents is in CENTS. Part numbers must be unique within the organization — including the blank one, which only one part may hold. " +
      "Stock on hand cannot be set here: it rises only through a goods receipt against a purchase order.",
    updateDescription: "Edits a part's catalog fields. Stock on hand is not settable — it changes only through a goods receipt.",
    list: listParts,
    listScope: "parts:read",
    get: getPart,
    getScope: "parts:read",
    create: createPart,
    createScope: "parts:write:safe",
    createSchema: createPartSchema,
    update: updatePart,
    updateScope: "parts:write:safe",
    updateSchema: updatePartSchema,
  },
  {
    resource: "requisitions",
    createDescription:
      "Creates an internal purchase REQUEST (pre-PO) in 'draft'. It does not order anything and does not commit any spend: someone in the app has to review it and submit it into the org's approval chain. " +
      "Every line must reference a products-catalog item. Money fields are in CENTS; taxRatePercent is a percent, not basis points.",
    list: listRequisitions,
    listScope: "requisitions:read",
    get: getRequisition,
    getScope: "requisitions:read",
    create: createRequisition,
    createScope: "requisitions:write:safe",
    createSchema: createRequisitionSchema,
  },
  {
    resource: "purchase_orders",
    createDescription:
      "Creates a purchase order against a vendor, always at status 'requested' — it is NOT approved and NOT sent. Approving or advancing a PO is only possible through the app's approval chain, never through this API. " +
      "Every line must reference a products-catalog item, and a 'maintenance_part' line must have a whole-number quantity. " +
      "All money is in CENTS (integers); taxRatePercent is a percent, not basis points; the discount is clamped to the subtotal so a total can never go negative.",
    list: listPurchaseOrders,
    listScope: "purchase_orders:read",
    get: getPurchaseOrder,
    getScope: "purchase_orders:read",
    create: createPurchaseOrder,
    createScope: "purchase_orders:write:safe",
    createSchema: createPurchaseOrderSchema,
  },
  {
    resource: "jobs",
    createDescription:
      "Schedules a Landscapt service job for a client. With a serviceId it also creates the job's service line and — for a dated job type — the dispatch-board visit. " +
      "budgetedHours is TOTAL MAN-HOURS (hours on site x crew size), not hours per person. Dates are YYYY-MM-DD: passing a timestamp risks landing on the previous day. " +
      "A 'waiting_list' job deliberately gets NO dispatch-board visit — its date becomes an availability window instead. rateCents is in CENTS.",
    updateDescription:
      "Updates a job's status, schedule, crew, rate or notes. Dates are YYYY-MM-DD and rateCents is in CENTS. Pass null to clear a nullable field.",
    list: listJobs,
    listScope: "jobs:read",
    get: getJob,
    getScope: "jobs:read",
    create: createJob,
    createScope: "jobs:write:safe",
    createSchema: createJobSchema,
    update: updateJob,
    updateScope: "jobs:write:safe",
    updateSchema: updateJobSchema,
  },
  {
    resource: "estimates",
    createDescription:
      "Creates a single-line estimate for a client and a catalog service. Deliberately narrow: you choose WHAT to quote (client, service, quantity) and the app computes every dollar figure " +
      "from the org's own service catalog, production rates, labor burden and overhead settings. No price, cost or margin can be supplied. Multi-line estimates, discounts and milestones need the app.",
    list: listEstimates,
    listScope: "estimates:read",
    get: getEstimate,
    getScope: "estimates:read",
    create: createEstimate,
    createScope: "estimates:write:safe",
    createSchema: createEstimateSchema,
  },
  {
    resource: "invoices",
    list: listInvoices,
    listScope: "invoices:read",
    get: getInvoice,
    getScope: "invoices:read",
  },
  {
    resource: "contracts",
    createDescription:
      "Records a recurring-billing contract for a client — including one already signed outside the app, via signedAt/signedBy. " +
      "IT GENERATES REAL INVOICES: once status is 'signed' or 'active', a nightly job bills the client on this contract's own cadence with no further human step. " +
      "That is why it defaults to status 'draft', which does not bill; pass an explicit status only when billing really should start. " +
      "monthlyAmountCents is the amount charged on EACH invoice, in CENTS — not an annualised figure. An annual $12,000 contract is billingFrequency 'annual' with monthlyAmountCents 1200000, and bills $12,000 once a year. " +
      "billingFrequency genuinely controls the cadence (weekly, biweekly, monthly, quarterly, annual, one_time), anchored on startDate. " +
      "Supports a bulk batch via `contracts`.",
    list: listContracts,
    listScope: "contracts:read",
    get: getContract,
    getScope: "contracts:read",
    create: createContract,
    createScope: "contracts:write:safe",
    createSchema: createContractSchema,
  },
];

function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes("*") || scopes.includes(required);
}

async function toToolResult(response: Response): Promise<CallToolResult> {
  const text = await response.text();
  return { content: [{ type: "text", text }], isError: !response.ok };
}

/** Builds a synthetic Request carrying the original Authorization header, for calling a REST route handler directly. */
function buildRequest(
  authHeader: string,
  method: string,
  path: string,
  opts: { query?: Record<string, unknown>; body?: unknown } = {}
): Request {
  const url = new URL(`http://internal${path}`);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return new Request(url, {
    method,
    headers: {
      Authorization: authHeader,
      ...(opts.body !== undefined && { "Content-Type": "application/json" }),
    },
    ...(opts.body !== undefined && { body: JSON.stringify(opts.body) }),
  });
}

const PAGINATION_SHAPE = {
  limit: z.number().int().positive().max(200).optional().describe("Max results to return (default 50, max 200)."),
  offset: z.number().int().nonnegative().optional().describe("Number of results to skip, for pagination."),
};

/** Registers every resource tool the connecting key's scopes allow. Called once per MCP request, after auth. */
export function registerResourceTools(server: McpServer, request: Request, scopes: string[]): void {
  const authHeader = request.headers.get("Authorization") ?? "";

  for (const def of RESOURCE_TOOLS) {
    const path = `/api/v1/${def.resource.replace(/_/g, "-")}`;

    if (hasScope(scopes, def.listScope)) {
      server.registerTool(
        `list_${def.resource}`,
        {
          title: `List ${def.resource}`,
          description: def.listDescription ?? `Lists the organization's ${def.resource.replace(/_/g, " ")}.`,
          inputSchema: PAGINATION_SHAPE,
        },
        async (args) => toToolResult(await def.list(buildRequest(authHeader, "GET", path, { query: args })))
      );
    }

    if (def.get && def.getScope && hasScope(scopes, def.getScope)) {
      server.registerTool(
        `get_${def.resource}`,
        {
          title: `Get a ${def.resource.replace(/_/g, " ")}`,
          description: `Fetches one ${def.resource.replace(/_/g, " ")} by id.`,
          inputSchema: { id: z.string().uuid() },
        },
        async ({ id }) =>
          toToolResult(await def.get!(buildRequest(authHeader, "GET", `${path}/${id}`), { params: Promise.resolve({ id }) }))
      );
    }

    if (def.create && def.createScope && def.createSchema && hasScope(scopes, def.createScope)) {
      server.registerTool(
        `create_${def.resource}`,
        {
          title: `Create a ${def.resource.replace(/_/g, " ")}`,
          description: def.createDescription ?? `Creates a new ${def.resource.replace(/_/g, " ")}.`,
          inputSchema: def.createSchema.shape,
        },
        async (args) => toToolResult(await def.create!(buildRequest(authHeader, "POST", path, { body: args })))
      );
    }

    if (def.update && def.updateScope && def.updateSchema && hasScope(scopes, def.updateScope)) {
      const updateShape = { id: z.string().uuid(), ...def.updateSchema.shape };
      server.registerTool(
        `update_${def.resource}`,
        {
          title: `Update a ${def.resource.replace(/_/g, " ")}`,
          description: def.updateDescription ?? `Updates fields on an existing ${def.resource.replace(/_/g, " ")}.`,
          inputSchema: updateShape,
        },
        async ({ id, ...body }) =>
          toToolResult(
            await def.update!(buildRequest(authHeader, "PATCH", `${path}/${id}`, { body }), {
              params: Promise.resolve({ id }),
            })
          )
      );
    }
  }
}

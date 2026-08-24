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

import { GET as listPurchaseOrders } from "@/app/api/v1/purchase-orders/route";
import { GET as getPurchaseOrder } from "@/app/api/v1/purchase-orders/[id]/route";

import { GET as listJobs, POST as createJob } from "@/app/api/v1/jobs/route";
import { GET as getJob, PATCH as updateJob } from "@/app/api/v1/jobs/[id]/route";
import { createJobSchema, updateJobSchema } from "@/app/api/v1/jobs/validation";

import { GET as listEstimates } from "@/app/api/v1/estimates/route";
import { GET as getEstimate } from "@/app/api/v1/estimates/[id]/route";

import { GET as listInvoices } from "@/app/api/v1/invoices/route";
import { GET as getInvoice } from "@/app/api/v1/invoices/[id]/route";

import { GET as listContracts } from "@/app/api/v1/contracts/route";
import { GET as getContract } from "@/app/api/v1/contracts/[id]/route";

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
 * Per src/lib/api/scopes.ts's write:sensitive tier and the estimates-write
 * decision in TASKS.md, no tool here ever performs a create/update that the
 * REST API itself doesn't expose — estimates, invoices, contracts, and
 * purchase orders are read-only, and requisitions have no update tool
 * (status transitions go through the app's approval flow only).
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
}

const RESOURCE_TOOLS: ResourceToolDef[] = [
  {
    resource: "clients",
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
    list: listPurchaseOrders,
    listScope: "purchase_orders:read",
    get: getPurchaseOrder,
    getScope: "purchase_orders:read",
  },
  {
    resource: "jobs",
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
    list: listEstimates,
    listScope: "estimates:read",
    get: getEstimate,
    getScope: "estimates:read",
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
    list: listContracts,
    listScope: "contracts:read",
    get: getContract,
    getScope: "contracts:read",
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
          description: `Lists the organization's ${def.resource.replace(/_/g, " ")}.`,
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
          description: `Creates a new ${def.resource.replace(/_/g, " ")}.`,
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
          description: `Updates fields on an existing ${def.resource.replace(/_/g, " ")}.`,
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

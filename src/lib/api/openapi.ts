import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import { createClientSchema, updateClientSchema } from "@/app/api/v1/clients/validation";
import { createWorkOrderSchema, updateWorkOrderSchema } from "@/app/api/v1/work-orders/validation";
import { createAssetSchema, updateAssetSchema } from "@/app/api/v1/assets/validation";
import { createVendorSchema, updateVendorSchema } from "@/app/api/v1/vendors/validation";
import { createProductSchema, updateProductSchema } from "@/app/api/v1/products/validation";
import { createProjectSchema, updateProjectSchema } from "@/app/api/v1/projects/validation";
import { createPmScheduleSchema, updatePmScheduleSchema } from "@/app/api/v1/pm-schedules/validation";
import { createPartSchema, updatePartSchema } from "@/app/api/v1/parts/validation";
import { createRequisitionSchema } from "@/app/api/v1/requisitions/validation";
import { createJobSchema, updateJobSchema } from "@/app/api/v1/jobs/validation";
import { createEstimateSchema } from "@/app/api/v1/estimates/validation";
import type { ApiScopeTier } from "@/lib/api/scopes";

/**
 * Builds the OpenAPI 3.1 document for the public API from the same Zod
 * schemas the /api/v1 routes validate against, so the spec can never drift
 * from what a route actually accepts. Each operation carries an
 * "x-required-scope" (the scope authenticateApiRequest() checks) and an
 * "x-agent-tier" vendor extension — read / write:safe / write:sensitive,
 * per the scope taxonomy in src/lib/api/scopes.ts — for a future MCP
 * connector to decide which operations are safe to expose to an agent
 * without human confirmation.
 */

interface EndpointDef {
  method: "get" | "post" | "patch";
  path: string;
  summary: string;
  scope: string;
  agentTier: ApiScopeTier;
  requestSchema?: ZodTypeAny;
  hasIdParam?: boolean;
}

const ENDPOINTS: EndpointDef[] = [
  { method: "get", path: "/clients", summary: "List clients", scope: "clients:read", agentTier: "read" },
  {
    method: "post",
    path: "/clients",
    summary: "Create a client",
    scope: "clients:write:safe",
    agentTier: "write:safe",
    requestSchema: createClientSchema,
  },
  {
    method: "get",
    path: "/clients/{id}",
    summary: "Get a client",
    scope: "clients:read",
    agentTier: "read",
    hasIdParam: true,
  },
  {
    method: "patch",
    path: "/clients/{id}",
    summary: "Update a client",
    scope: "clients:write:safe",
    agentTier: "write:safe",
    requestSchema: updateClientSchema,
    hasIdParam: true,
  },

  { method: "get", path: "/work-orders", summary: "List work orders", scope: "work_orders:read", agentTier: "read" },
  {
    method: "post",
    path: "/work-orders",
    summary: "Create a work order",
    scope: "work_orders:write:safe",
    agentTier: "write:safe",
    requestSchema: createWorkOrderSchema,
  },
  {
    method: "get",
    path: "/work-orders/{id}",
    summary: "Get a work order",
    scope: "work_orders:read",
    agentTier: "read",
    hasIdParam: true,
  },
  {
    method: "patch",
    path: "/work-orders/{id}",
    summary: "Update a work order",
    scope: "work_orders:write:safe",
    agentTier: "write:safe",
    requestSchema: updateWorkOrderSchema,
    hasIdParam: true,
  },

  { method: "get", path: "/assets", summary: "List assets", scope: "assets:read", agentTier: "read" },
  {
    method: "post",
    path: "/assets",
    summary: "Create an asset",
    scope: "assets:write:safe",
    agentTier: "write:safe",
    requestSchema: createAssetSchema,
  },
  {
    method: "get",
    path: "/assets/{id}",
    summary: "Get an asset",
    scope: "assets:read",
    agentTier: "read",
    hasIdParam: true,
  },
  {
    method: "patch",
    path: "/assets/{id}",
    summary: "Update an asset",
    scope: "assets:write:safe",
    agentTier: "write:safe",
    requestSchema: updateAssetSchema,
    hasIdParam: true,
  },

  { method: "get", path: "/vendors", summary: "List vendors", scope: "vendors:read", agentTier: "read" },
  {
    method: "post",
    path: "/vendors",
    summary: "Create a vendor",
    scope: "vendors:write:safe",
    agentTier: "write:safe",
    requestSchema: createVendorSchema,
  },
  {
    method: "get",
    path: "/vendors/{id}",
    summary: "Get a vendor",
    scope: "vendors:read",
    agentTier: "read",
    hasIdParam: true,
  },
  {
    method: "patch",
    path: "/vendors/{id}",
    summary: "Update a vendor",
    scope: "vendors:write:safe",
    agentTier: "write:safe",
    requestSchema: updateVendorSchema,
    hasIdParam: true,
  },

  { method: "get", path: "/products", summary: "List products", scope: "products:read", agentTier: "read" },
  {
    method: "post",
    path: "/products",
    summary: "Create a product catalog entry",
    scope: "products:write:safe",
    agentTier: "write:safe",
    requestSchema: createProductSchema,
  },
  {
    method: "get",
    path: "/products/{id}",
    summary: "Get a product catalog entry",
    scope: "products:read",
    agentTier: "read",
    hasIdParam: true,
  },
  {
    method: "patch",
    path: "/products/{id}",
    summary: "Update a product catalog entry",
    scope: "products:write:safe",
    agentTier: "write:safe",
    requestSchema: updateProductSchema,
    hasIdParam: true,
  },

  { method: "get", path: "/projects", summary: "List projects", scope: "projects:read", agentTier: "read" },
  {
    method: "post",
    path: "/projects",
    summary: "Create a project",
    scope: "projects:write:safe",
    agentTier: "write:safe",
    requestSchema: createProjectSchema,
  },
  {
    method: "get",
    path: "/projects/{id}",
    summary: "Get a project",
    scope: "projects:read",
    agentTier: "read",
    hasIdParam: true,
  },
  {
    method: "patch",
    path: "/projects/{id}",
    summary: "Update a project",
    scope: "projects:write:safe",
    agentTier: "write:safe",
    requestSchema: updateProjectSchema,
    hasIdParam: true,
  },

  {
    method: "get",
    path: "/pm-schedules",
    summary: "List PM schedules",
    scope: "pm_schedules:read",
    agentTier: "read",
  },
  {
    method: "post",
    path: "/pm-schedules",
    summary: "Create a PM schedule",
    scope: "pm_schedules:write:safe",
    agentTier: "write:safe",
    requestSchema: createPmScheduleSchema,
  },
  {
    method: "get",
    path: "/pm-schedules/{id}",
    summary: "Get a PM schedule",
    scope: "pm_schedules:read",
    agentTier: "read",
    hasIdParam: true,
  },
  {
    method: "patch",
    path: "/pm-schedules/{id}",
    summary: "Update a PM schedule",
    scope: "pm_schedules:write:safe",
    agentTier: "write:safe",
    requestSchema: updatePmScheduleSchema,
    hasIdParam: true,
  },

  { method: "get", path: "/parts", summary: "List parts", scope: "parts:read", agentTier: "read" },
  {
    method: "post",
    path: "/parts",
    summary: "Create a part",
    scope: "parts:write:safe",
    agentTier: "write:safe",
    requestSchema: createPartSchema,
  },
  {
    method: "get",
    path: "/parts/{id}",
    summary: "Get a part",
    scope: "parts:read",
    agentTier: "read",
    hasIdParam: true,
  },
  {
    method: "patch",
    path: "/parts/{id}",
    summary: "Update a part (excludes quantityOnHand — only goods receipt changes stock)",
    scope: "parts:write:safe",
    agentTier: "write:safe",
    requestSchema: updatePartSchema,
    hasIdParam: true,
  },

  {
    method: "get",
    path: "/requisitions",
    summary: "List requisitions",
    scope: "requisitions:read",
    agentTier: "read",
  },
  {
    method: "post",
    path: "/requisitions",
    summary: "Create a draft requisition with line items",
    scope: "requisitions:write:safe",
    agentTier: "write:safe",
    requestSchema: createRequisitionSchema,
  },
  {
    method: "get",
    path: "/requisitions/{id}",
    summary: "Get a requisition with its line items",
    scope: "requisitions:read",
    agentTier: "read",
    hasIdParam: true,
  },

  {
    method: "get",
    path: "/purchase-orders",
    summary: "List purchase orders",
    scope: "purchase_orders:read",
    agentTier: "read",
  },
  {
    method: "get",
    path: "/purchase-orders/{id}",
    summary: "Get a purchase order with its line items",
    scope: "purchase_orders:read",
    agentTier: "read",
    hasIdParam: true,
  },

  { method: "get", path: "/jobs", summary: "List Landscapt jobs", scope: "jobs:read", agentTier: "read" },
  {
    method: "post",
    path: "/jobs",
    summary: "Create a job",
    scope: "jobs:write:safe",
    agentTier: "write:safe",
    requestSchema: createJobSchema,
  },
  {
    method: "get",
    path: "/jobs/{id}",
    summary: "Get a job",
    scope: "jobs:read",
    agentTier: "read",
    hasIdParam: true,
  },
  {
    method: "patch",
    path: "/jobs/{id}",
    summary: "Update a job",
    scope: "jobs:write:safe",
    agentTier: "write:safe",
    requestSchema: updateJobSchema,
    hasIdParam: true,
  },

  {
    method: "get",
    path: "/estimates",
    summary: "List estimates",
    scope: "estimates:read",
    agentTier: "read",
  },
  {
    method: "get",
    path: "/estimates/{id}",
    summary: "Get an estimate with its line items",
    scope: "estimates:read",
    agentTier: "read",
    hasIdParam: true,
  },
  {
    method: "post",
    path: "/estimates",
    summary: "Create a one-line estimate for a client + catalog service (rate/totals always app-computed, never caller-supplied)",
    scope: "estimates:write:safe",
    agentTier: "write:safe",
    requestSchema: createEstimateSchema,
  },

  { method: "get", path: "/invoices", summary: "List invoices", scope: "invoices:read", agentTier: "read" },
  {
    method: "get",
    path: "/invoices/{id}",
    summary: "Get an invoice with its line items",
    scope: "invoices:read",
    agentTier: "read",
    hasIdParam: true,
  },

  { method: "get", path: "/contracts", summary: "List contracts", scope: "contracts:read", agentTier: "read" },
  {
    method: "get",
    path: "/contracts/{id}",
    summary: "Get a contract",
    scope: "contracts:read",
    agentTier: "read",
    hasIdParam: true,
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildOpenApiDocument(): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paths: Record<string, any> = {};

  for (const endpoint of ENDPOINTS) {
    paths[endpoint.path] ??= {};
    paths[endpoint.path][endpoint.method] = {
      summary: endpoint.summary,
      security: [{ apiKey: [] }],
      "x-required-scope": endpoint.scope,
      "x-agent-tier": endpoint.agentTier,
      ...(endpoint.hasIdParam && {
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      }),
      ...(endpoint.requestSchema && {
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: zodToJsonSchema(endpoint.requestSchema, { target: "openApi3" }) },
          },
        },
      }),
      responses: {
        "200": { description: "OK" },
        ...(endpoint.method === "post" && { "201": { description: "Created" } }),
        "400": { description: "Invalid request body" },
        "401": { description: "Missing or invalid API key" },
        "403": { description: "Missing required scope" },
        "404": { description: "Not found" },
        "429": { description: "Rate limit exceeded" },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Equipt / Landscapt Public API",
      version: "0.1.0",
      description:
        "Scoped, API-key-authenticated access to Equipt (CMMS/PO) and Landscapt (CRM) resources. " +
        "Create keys under Settings > Integrations. Every response is scoped to the calling key's organization.",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          description: "API key issued from Settings > Integrations > Public API Keys",
        },
      },
    },
    paths,
  };
}

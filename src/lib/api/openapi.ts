import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import { createClientSchema, updateClientSchema } from "@/app/api/v1/clients/validation";
import { createWorkOrderSchema, updateWorkOrderSchema } from "@/app/api/v1/work-orders/validation";
import { createAssetSchema, updateAssetSchema } from "@/app/api/v1/assets/validation";
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

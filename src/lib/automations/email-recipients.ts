// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** "To" choices that address the CLIENT (subject to the client's opt-out / bounce rules). */
const CLIENT_TO_TOKENS = new Set(["client_primary", "billing_email", "all_contacts"]);

/**
 * Splits an email step's "To" selection into the client-facing choices and the
 * staff choices ("client_sales_rep", "estimate_sales_rep", "employee:<id>"). An
 * empty selection means the client's primary email, as it always has.
 */
export function splitEmailToSelection(selection: string[] | undefined | null): {
  client: string[];
  staffTokens: string[];
  employeeIds: string[];
} {
  const sel = (selection ?? []).filter((v) => typeof v === "string" && v);
  const client = sel.filter((v) => CLIENT_TO_TOKENS.has(v));
  const staffTokens = sel.filter((v) => v === "client_sales_rep" || v === "estimate_sales_rep");
  const employeeIds = sel.filter((v) => v.startsWith("employee:")).map((v) => v.slice("employee:".length)).filter(Boolean);
  const hasStaff = staffTokens.length > 0 || employeeIds.length > 0;
  return { client: client.length === 0 && !hasStaff ? ["client_primary"] : client, staffTokens, employeeIds };
}

/**
 * Email addresses for the staff choices in a "To" selection: the client's sales
 * rep, the estimate's sales rep, and named employees. Only current employees of
 * this org with an address on file (the caller runs on the service client, so
 * org scoping is done here). Staff are internal recipients: the client's
 * opt-outs and marketing suppression do not apply to them.
 */
export async function resolveStaffRecipientEmails(
  supabase: AnyClient,
  params: { orgId: string; clientSalesRepId: string | null; estimateId: string | null; staffTokens: string[]; employeeIds: string[] },
): Promise<string[]> {
  const ids = new Set<string>(params.employeeIds);
  if (params.staffTokens.includes("client_sales_rep") && params.clientSalesRepId) ids.add(params.clientSalesRepId);
  if (params.staffTokens.includes("estimate_sales_rep") && params.estimateId) {
    const { data: est } = await supabase
      .from("estimates")
      .select("sales_rep_id")
      .eq("id", params.estimateId)
      .eq("org_id", params.orgId)
      .maybeSingle();
    if (est?.sales_rep_id) ids.add(est.sales_rep_id as string);
  }
  if (ids.size === 0) return [];
  const { data: employees } = await supabase
    .from("crm_employees")
    .select("email")
    .in("id", [...ids])
    .eq("org_id", params.orgId)
    .is("deleted_at", null)
    .neq("employment_status", "terminated");
  const byKey = new Map<string, string>();
  for (const e of (employees ?? []) as { email: string | null }[]) {
    const email = (e.email ?? "").trim();
    if (email && /^[^\s@]+@[^\s@]+$/.test(email) && !byKey.has(email.toLowerCase())) byKey.set(email.toLowerCase(), email);
  }
  return [...byKey.values()];
}


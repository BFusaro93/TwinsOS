const { loadFix, saveFix, asUser, anon, admin, record } = require("./lib");
(async () => {
  const fix = loadFix(); const sb = admin(); const A = fix.orgs[0], B = fix.orgs[1];
  if (!fix.seed.B.prod) { const { data, error } = await sb.from("product_items").insert({ org_id: B.id, name: "stress prod B", category: "stocked_material", quantity_on_hand: 50, unit_cost: 100 }).select("id").single(); if (error) throw new Error(error.message); fix.seed.B.prod = data.id; saveFix(fix); }
  const S = fix.seed.B, today = new Date().toISOString().slice(0, 10), U = "00000000-0000-0000-0000-000000000001";
  const calls = [
    ["adjust_part_quantity(org,part,-5)", { p_org_id: B.id, p_part_id: S.partA, p_delta: -5, p_po_number: "x" }],
    ["adjust_part_quantity(part,-5) [no org arg]", { p_part_id: S.partA, p_delta: -5 }],
    ["adjust_product_item_quantity", { p_org_id: B.id, p_product_id: S.prod, p_delta: -5, p_reason: "x" }],
    ["correct_part_receipt", { p_org_id: B.id, p_part_id: S.partA, p_delta: -5, p_unit_cost: 100, p_po_number: "x" }],
    ["correct_product_receipt", { p_org_id: B.id, p_product_id: S.prod, p_delta: -5, p_unit_cost: 100, p_po_number: "x" }],
    ["receive_part_quantity", { p_org_id: B.id, p_part_id: S.partA, p_quantity: 5, p_layer_unit_cost: 100, p_received_at: new Date().toISOString(), p_po_number: "x", p_cost_method: "fifo", p_po_line_item_id: S.lineId }],
    ["receive_product_cost_layer", { p_org_id: B.id, p_product_id: S.prod, p_layer_quantity: 5, p_layer_unit_cost: 100, p_received_at: new Date().toISOString(), p_po_number: "x", p_cost_method: "fifo", p_po_line_item_id: S.lineId }],
    ["receive_product_receipt", { p_org_id: B.id, p_product_id: S.prod, p_layer_quantity: 5, p_layer_unit_cost: 100, p_received_at: new Date().toISOString(), p_po_number: "x", p_cost_method: "fifo", p_po_line_item_id: S.lineId }],
    ["log_receipt_without_stock", { p_org_id: B.id, p_product_id: S.prod, p_project_id: null, p_po_number: "x", p_quantity: 5, p_reason: "HACK" }],
    ["increment_sms_usage", { p_org_id: B.id, p_period_start: today }],
    ["try_increment_ai_chat_usage", { p_org_id: B.id, p_day: today, p_limit: 1000 }],
    ["try_increment_ai_draft_usage", { p_org_id: B.id, p_day: today, p_limit: 1000 }],
    ["insert_audit_entry", { p_org_id: B.id, p_record_type: "part", p_record_id: S.partA, p_action: "HACK", p_description: "HACK" }],
    ["server_insert_audit", { p_org_id: B.id, p_record_type: "part", p_record_id: S.partA, p_action: "HACK", p_description: "HACK", p_created_by: null, p_user_name: "HACK" }],
    ["next_po_number(override=B)", { p_org_id_override: B.id }],
    ["next_receipt_number(override=B)", { p_org_id_override: B.id }],
    ["org_timezone(B)", { p_org_id: B.id }],
    ["org_today(B)", { p_org_id: B.id }],
    ["portal_documents_allowed(B)", { p_org_id: B.id }],
    ["crm_marketing_suppressed_emails(B)", { p_org_id: B.id, p_emails: ["x@y.z"] }],
  ];
  const fn = (label) => label.split("(")[0].split(" ")[0];
  const snap = async () => ({ partA: (await sb.from("parts").select("quantity_on_hand").eq("id", S.partA).single()).data.quantity_on_hand, prod: (await sb.from("product_items").select("quantity_on_hand").eq("id", S.prod).single()).data.quantity_on_hand,
    hackAudit: (await sb.from("audit_log").select("id", { count: "exact", head: true }).eq("org_id", B.id).ilike("description", "%HACK%")).count,
    sms: (await sb.from("organization_sms_usage").select("count").eq("org_id", B.id)).data?.length, ai: (await sb.from("organization_ai_chat_usage").select("count").eq("org_id", B.id)).data?.length,
    counters: JSON.stringify((await sb.from("entity_number_counters").select("entity_type,count").eq("org_id", B.id).order("entity_type")).data) });
  const before = await snap();
  const att = asUser(A.users.find((u) => u.role === "admin").access_token);
  const out = await Promise.all(calls.map(async ([label, args]) => { const r = await att.rpc(fn(label), args); return { label, error: r.error?.message?.slice(0, 80) || null, data: r.data }; }));
  const after = await snap();
  const succeeded = out.filter((o) => !o.error);
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  const info = ["org_timezone(B)", "org_today(B)", "portal_documents_allowed(B)", "crm_marketing_suppressed_emails(B)"];
  record({ name: "S3c org-A user calls 19 org-parameterized RPCs with org B's ids", pass: !changed, detail: `calls that did NOT error=${succeeded.length}/${out.length}, org-B state changed=${changed}`,
    extra: { notErrored: succeeded.map((o) => `${o.label} -> ${JSON.stringify(o.data)?.slice(0, 60)}`), before, after, rejected: out.filter((o) => o.error).map((o) => o.label + ": " + o.error).slice(0, 25) } });

  // ---- anonymous (public anon key, no login) ----
  const an = anon();
  const anonOut = await Promise.all(calls.map(async ([label, args]) => { const r = await an.rpc(fn(label), args); return { label, error: r.error?.message?.slice(0, 60) || null }; }));
  const anonOk = anonOut.filter((o) => !o.error);
  const after2 = await snap();
  record({ name: "S3d anonymous (no login) calls the same 19 RPCs", pass: anonOk.length === 0 && JSON.stringify(after) === JSON.stringify(after2), detail: `anon calls that did not error=${anonOk.length}/${anonOut.length}`, extra: { notErrored: anonOk.map((o) => o.label) } });
})().catch((e) => { console.error("S3c CRASH", e.message); process.exit(1); });

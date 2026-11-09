const { loadFix, saveFix, asUser, admin, pool, record, summarize } = require("./lib");
(async () => {
  const fix = loadFix(); const sb = admin(); fix.seed = fix.seed || {}; const SFX = Date.now().toString(36);
  // ---- seed (service role, one set per org) ----
  for (const o of fix.orgs) {
    const mk = async (name, qty) => { const { data, error } = await sb.from("parts").insert({ org_id: o.id, name: `${name} ${o.tag}`, part_number: `${name}-${o.tag}-${fix.run}-${SFX}`, quantity_on_hand: qty, unit_cost: 100, is_inventory: true }).select("id").single(); if (error) throw new Error("part: " + error.message); return data.id; };
    const partA = await mk("SP-DEC", 300), partB = await mk("SP-OVER", 20), partC = await mk("SP-RECV", 0), partD = await mk("SP-CLAMP", 20);
    const poNum = `STRESS-PO-${o.tag}-${fix.run}-${SFX}`;
    const { data: po, error: pe } = await sb.from("purchase_orders").insert({ org_id: o.id, po_number: poNum, status: "ordered", vendor_name: "stress vendor" }).select("id").single(); if (pe) throw new Error("po: " + pe.message);
    const { data: li, error: le } = await sb.from("po_line_items").insert({ org_id: o.id, po_id: po.id, product_item_name: "stress recv", part_number: `SP-RECV-${o.tag}-${fix.run}-${SFX}`, quantity: 10, unit_cost: 500, total_cost: 5000, part_id: partC }).select("id").single(); if (le) throw new Error("line: " + le.message);
    const { data: gr, error: ge } = await sb.from("goods_receipts").insert({ org_id: o.id, receipt_number: `R-${o.tag}-${fix.run}-${SFX}`, purchase_order_id: po.id, po_number: poNum, vendor_name: "stress vendor", received_by_name: "stress" }).select("id").single(); if (ge) throw new Error("gr: " + ge.message);
    const { error: gle } = await sb.from("goods_receipt_lines").insert({ org_id: o.id, receipt_id: gr.id, po_line_item_id: li.id, product_item_name: "stress recv", part_number: `SP-RECV-${o.tag}-${fix.run}-${SFX}`, quantity_ordered: 10, quantity_received: 10, quantity_remaining: 0, unit_cost: 500, is_maint_part: true }); if (gle) throw new Error("grl: " + gle.message);
    fix.seed[o.tag] = { partA, partB, partC, partD, poNum, lineId: li.id };
  }
  saveFix(fix);
  const admins = (o) => o.users.filter((u) => u.role === "admin").map((u) => asUser(u.access_token));
  const qty = async (id) => (await sb.from("parts").select("quantity_on_hand, cost_layers").eq("id", id).single()).data;

  // ---- S2a: concurrent clamped decrements (the WO "add part" path) ----
  let jobs = [], meta = [];
  for (const o of fix.orgs) for (const c of admins(o)) for (let i = 0; i < 30; i++) { meta.push(o.tag); jobs.push(async () => { const t = performance.now(); const r = await c.rpc("adjust_part_quantity", { p_part_id: fix.seed[o.tag].partA, p_delta: -1 }); return { ...r, ms: performance.now() - t }; }); }
  let res = await pool(jobs, 120); let errs = res.filter((r) => r.error);
  let bad = []; for (const o of fix.orgs) { const q = await qty(fix.seed[o.tag].partA); if (q.quantity_on_hand !== 210) bad.push(`${o.tag}=${q.quantity_on_hand}`); }
  record({ name: "S2a 90 concurrent stock decrements per org (clamped RPC)", pass: !errs.length && !bad.length, detail: `270 calls, errors=${errs.length}, orgs with wrong final qty (want 210)=${bad.join(",") || "none"}, ${summarize(res.map((r) => r.ms))}`, extra: { firstErr: errs[0]?.error?.message } });

  // ---- S2b: overdraw with the STRICT RPC: exactly `stock` succeed, never negative ----
  jobs = []; meta = [];
  for (const o of fix.orgs) for (const c of admins(o)) for (let i = 0; i < 20; i++) { meta.push(o.tag); jobs.push(async () => c.rpc("adjust_part_quantity", { p_org_id: o.id, p_part_id: fix.seed[o.tag].partB, p_delta: -1, p_po_number: "stress" })); }
  res = await pool(jobs, 120);
  let okBy = {}, errBy = {}; res.forEach((r, i) => { (r.error ? errBy : okBy)[meta[i]] = ((r.error ? errBy : okBy)[meta[i]] || 0) + 1; });
  let bad2 = []; for (const o of fix.orgs) { const q = await qty(fix.seed[o.tag].partB); if (q.quantity_on_hand !== 0 || (okBy[o.tag] || 0) !== 20) bad2.push(`${o.tag}: final=${q.quantity_on_hand} ok=${okBy[o.tag]}`); }
  record({ name: "S2b overdraw 60 concurrent -1 vs 20 on hand (strict RPC)", pass: !bad2.length, detail: `successes per org=${JSON.stringify(okBy)}, rejected=${JSON.stringify(errBy)}, anomalies=${bad2.join(" | ") || "none"}` });

  // ---- S2c: overdraw with the CLAMPING RPC: stock floors at 0, applied deltas sum to exactly -stock ----
  jobs = []; meta = [];
  for (const o of fix.orgs) for (const c of admins(o)) for (let i = 0; i < 20; i++) { meta.push(o.tag); jobs.push(async () => c.rpc("adjust_part_quantity", { p_part_id: fix.seed[o.tag].partD, p_delta: -1 })); }
  res = await pool(jobs, 120);
  let applied = {}; res.forEach((r, i) => { const d = Array.isArray(r.data) ? r.data[0]?.applied_delta : r.data?.applied_delta; applied[meta[i]] = (applied[meta[i]] || 0) + (d || 0); });
  let bad3 = []; for (const o of fix.orgs) { const q = await qty(fix.seed[o.tag].partD); if (q.quantity_on_hand !== 0 || applied[o.tag] !== -20) bad3.push(`${o.tag}: final=${q.quantity_on_hand} appliedSum=${applied[o.tag]}`); }
  record({ name: "S2c overdraw 60 concurrent -1 vs 20 on hand (clamping RPC)", pass: !bad3.length, detail: `applied sums=${JSON.stringify(applied)}, anomalies=${bad3.join(" | ") || "none"}` });

  // ---- S2d: double/quad-click "Receive" on one PO line: stock must rise ONCE ----
  jobs = []; meta = [];
  for (const o of fix.orgs) { const cs = admins(o); for (let i = 0; i < 24; i++) { meta.push(o.tag); const c = cs[i % cs.length]; jobs.push(async () => c.rpc("receive_part_quantity", { p_org_id: o.id, p_part_id: fix.seed[o.tag].partC, p_quantity: 10, p_layer_unit_cost: 500, p_received_at: new Date().toISOString(), p_po_number: fix.seed[o.tag].poNum, p_cost_method: "fifo", p_po_line_item_id: fix.seed[o.tag].lineId })); } }
  res = await pool(jobs, 72);
  okBy = {}; errBy = {}; res.forEach((r, i) => { (r.error ? errBy : okBy)[meta[i]] = ((r.error ? errBy : okBy)[meta[i]] || 0) + 1; });
  let bad4 = []; for (const o of fix.orgs) { const q = await qty(fix.seed[o.tag].partC); const layers = (q.cost_layers || []).reduce((n, l) => n + Number(l.quantity), 0); if (q.quantity_on_hand !== 10 || (okBy[o.tag] || 0) !== 1 || layers !== 10) bad4.push(`${o.tag}: qty=${q.quantity_on_hand} ok=${okBy[o.tag] || 0} layerSum=${layers}`); }
  const sampleErr = res.find((r) => r.error)?.error?.message;
  record({ name: "S2d 24 concurrent receives of the same PO line (10 ordered)", pass: !bad4.length, detail: `successes=${JSON.stringify(okBy)}, rejected=${JSON.stringify(errBy)}, anomalies=${bad4.join(" | ") || "none"}`, extra: { sampleRejection: sampleErr } });
})().catch((e) => { console.error("S2 CRASH", e.message); process.exit(1); });

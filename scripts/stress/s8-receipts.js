const { loadFix, admin, asUser, record } = require("./lib");
(async () => {
  const fix = loadFix(); const sb = admin(); const o = fix.orgs[0]; const [u1, u2] = o.users.filter((u) => u.role === "admin").map((u) => ({ ...u, c: asUser(u.access_token) }));
  const TR = 12; const outcome = { oneWins: 0, bothFail: 0, bothSucceed: 0 }; let stockErr = 0; const msgs = new Set();
  for (let t = 0; t < TR; t++) {
    const tag = `${fix.run}-${t}`;
    const { data: part } = await sb.from("parts").insert({ org_id: o.id, name: `SP-RCV2 ${tag}`, part_number: `SPR2-${tag}`, quantity_on_hand: 0, unit_cost: 100, is_inventory: true }).select("id").single();
    const poNum = `STRESS-PO2-${tag}`; const { data: po } = await sb.from("purchase_orders").insert({ org_id: o.id, po_number: poNum, status: "ordered", vendor_name: "v" }).select("id").single();
    const { data: li } = await sb.from("po_line_items").insert({ org_id: o.id, po_id: po.id, product_item_name: "p", part_number: `SPR2-${tag}`, quantity: 10, unit_cost: 500, total_cost: 5000, part_id: part.id }).select("id").single();
    // the browser flow, per user: insert receipt header + line, THEN call the receive RPC; on RPC failure delete the receipt
    const flow = async (u, who) => {
      const { data: gr, error: ge } = await u.c.from("goods_receipts").insert({ receipt_number: `R2-${tag}-${who}`, purchase_order_id: po.id, po_number: poNum, vendor_name: "v", received_by_name: u.name }).select("id").single(); if (ge) return { ok: false, why: "hdr: " + ge.message };
      const { error: le } = await u.c.from("goods_receipt_lines").insert({ receipt_id: gr.id, po_line_item_id: li.id, product_item_name: "p", part_number: `SPR2-${tag}`, quantity_ordered: 10, quantity_received: 10, quantity_remaining: 0, unit_cost: 500, is_maint_part: true }); if (le) return { ok: false, why: "line: " + le.message };
      const r = await u.c.rpc("receive_part_quantity", { p_org_id: o.id, p_part_id: part.id, p_quantity: 10, p_layer_unit_cost: 500, p_received_at: new Date().toISOString(), p_po_number: poNum, p_cost_method: "fifo", p_po_line_item_id: li.id });
      if (r.error) { await u.c.from("goods_receipts").update({ deleted_at: new Date().toISOString() }).eq("id", gr.id); return { ok: false, why: r.error.message.slice(0, 90) }; }
      return { ok: true };
    };
    const [a, b] = await Promise.all([flow(u1, "a"), flow(u2, "b")]);
    [a, b].forEach((x) => !x.ok && msgs.add(x.why));
    const wins = [a, b].filter((x) => x.ok).length; if (wins === 1) outcome.oneWins++; else if (wins === 0) outcome.bothFail++; else outcome.bothSucceed++;
    const q = (await sb.from("parts").select("quantity_on_hand").eq("id", part.id).single()).data.quantity_on_hand; const live = (await sb.from("goods_receipts").select("id").eq("purchase_order_id", po.id).is("deleted_at", null)).data.length;
    if (wins === 1 && (q !== 10 || live !== 1)) stockErr++; if (wins === 2) stockErr++; if (wins === 0 && q !== 0) stockErr++;
  }
  record({ name: "R1 two users receive the same remaining qty of one PO line simultaneously (12 trials)", pass: outcome.bothSucceed === 0 && stockErr === 0 && outcome.bothFail === 0, detail: `exactly-one-wins=${outcome.oneWins}, BOTH FAIL (nobody's receipt lands)=${outcome.bothFail}, both succeed (double stock)=${outcome.bothSucceed}, stock/receipt inconsistencies=${stockErr}`, extra: { rejectionMessages: [...msgs] } });
})().catch((e) => { console.error("R CRASH", e.message); process.exit(1); });

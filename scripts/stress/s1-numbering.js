const { loadFix, asUser, admin, pool, record, summarize } = require("./lib");
(async () => {
  const fix = loadFix();
  const PER_USER = 30, CONC = 200;
  // --- A: every user, every org, at once: WO/PO/REQ numbers via the same RPCs the browser calls ---
  const jobs = []; const meta = [];
  for (const o of fix.orgs) for (const u of o.users) {
    if (u.role === "viewer") continue; // limited roles can't create in Equipt; covered separately
    const c = asUser(u.access_token);
    for (const [fn] of [["next_work_order_number"], ["next_po_number"], ["next_requisition_number"]])
      for (let i = 0; i < PER_USER; i++) { meta.push({ org: o.tag, fn, user: u.role }); jobs.push(async () => { const t = performance.now(); const r = await c.rpc(fn); return { ...r, ms: performance.now() - t }; }); }
  }
  const t0 = performance.now(); const res = await pool(jobs, CONC); const wall = (performance.now() - t0) / 1000;
  const errs = res.filter((r) => r.error); const lat = res.map((r) => r.ms);
  const byKey = {};
  res.forEach((r, i) => { if (r.error) return; const k = meta[i].org + "|" + meta[i].fn; (byKey[k] ||= []).push(r.data); });
  let dup = 0, gaps = 0, details = [];
  for (const [k, arr] of Object.entries(byKey)) {
    const set = new Set(arr); dup += arr.length - set.size;
    const nums = arr.map((s) => parseInt(s.split("-").pop(), 10)).sort((a, b) => a - b);
    const g = nums[nums.length - 1] - nums[0] + 1 - set.size; gaps += g; details.push(`${k}: n=${arr.length} range ${nums[0]}..${nums[nums.length - 1]}`);
  }
  record({ name: "S1a numbering RPCs under mixed-org load", pass: errs.length === 0 && dup === 0 && gaps === 0,
    detail: `${res.length} calls in ${wall.toFixed(1)}s (${(res.length / wall).toFixed(0)}/s), errors=${errs.length}, duplicates=${dup}, gaps=${gaps}, ${summarize(lat)}`, extra: { sample: details.slice(0, 9), firstErr: errs[0]?.error?.message } });

  // --- B: concurrent work-order INSERTs through RLS (browser path) ---
  const ins = []; const insMeta = [];
  for (const o of fix.orgs) for (const u of o.users.filter((x) => ["admin", "manager", "technician"].includes(x.role))) {
    const c = asUser(u.access_token);
    for (let i = 0; i < 25; i++) { insMeta.push(o.tag); ins.push(async () => {
      const t = performance.now(); const n = await c.rpc("next_work_order_number");
      if (n.error) return { error: n.error, ms: performance.now() - t };
      const r = await c.from("work_orders").insert({ work_order_number: n.data, title: `stress ${o.tag}/${u.role}/${i}` }).select("id, org_id, work_order_number").single();
      return { ...r, ms: performance.now() - t }; }); }
  }
  const r2 = await pool(ins, CONC); const e2 = r2.filter((r) => r.error);
  const perOrg = {}; r2.forEach((r, i) => { if (!r.error) (perOrg[insMeta[i]] ||= []).push(r.data); });
  const wrongOrg = fix.orgs.reduce((n, o) => n + (perOrg[o.tag] || []).filter((r) => r.org_id !== o.id).length, 0);
  const dupN = Object.values(perOrg).reduce((n, a) => n + (a.length - new Set(a.map((x) => x.work_order_number)).size), 0);
  record({ name: "S1b work-order inserts under mixed-org load", pass: e2.length === 0 && wrongOrg === 0 && dupN === 0,
    detail: `${r2.length} inserts, errors=${e2.length}, rows landing in wrong org=${wrongOrg}, duplicate WO numbers=${dupN}, ${summarize(r2.map((r) => r.ms))}`, extra: { firstErr: e2[0]?.error?.message } });
})().catch((e) => { console.error("S1 CRASH", e); process.exit(1); });

const { loadFix, asUser, admin, pool, record, summarize } = require("./lib");
const fs = require("fs"); const path = require("path");
(async () => {
  const fix = loadFix(); const tables = JSON.parse(fs.readFileSync(path.join(__dirname, "orgtables.json"), "utf8"));
  const orgIds = new Set(fix.orgs.map((o) => o.id));
  // ---- S3a: every user (admin + viewer per org) reads EVERY org-scoped table/view at once ----
  const readers = []; for (const o of fix.orgs) for (const role of ["admin", "viewer"]) { const u = o.users.find((x) => x.role === role); readers.push({ org: o, role, c: asUser(u.access_token) }); }
  const jobs = []; const meta = [];
  for (const rd of readers) for (const t of tables) { meta.push({ rd, t: t.n }); jobs.push(async () => { const s = performance.now(); const r = await rd.c.from(t.n).select("org_id").limit(500); return { ...r, ms: performance.now() - s }; }); }
  const t0 = performance.now(); const res = await pool(jobs, 150); const wall = (performance.now() - t0) / 1000;
  const leaks = {}; let foreignRows = 0, denied = 0, other = 0, okReads = 0;
  res.forEach((r, i) => {
    if (r.error) { if (/permission denied|row-level security|42501/i.test(r.error.message + (r.error.code || ""))) denied++; else { other++; (leaks.__errors ||= {})[meta[i].t] = r.error.message; } return; }
    okReads++;
    const bad = (r.data || []).filter((x) => x.org_id && x.org_id !== meta[i].rd.org.id);
    if (bad.length) { foreignRows += bad.length; const k = `${meta[i].t} (as ${meta[i].rd.org.tag}/${meta[i].rd.role})`; leaks[k] = [...new Set(bad.map((b) => b.org_id))].map((id) => (fix.orgs.find((o) => o.id === id)?.tag || "REAL:" + id.slice(0, 8))).join(","); }
  });
  const leakKeys = Object.keys(leaks).filter((k) => k !== "__errors");
  record({ name: "S3a cross-tenant read sweep: all org-scoped tables+views x 6 users", pass: foreignRows === 0, detail: `${res.length} reads in ${wall.toFixed(1)}s, ok=${okReads} denied=${denied} otherErrors=${other}, FOREIGN ROWS SEEN=${foreignRows}`, extra: { leaks: leakKeys.map((k) => `${k} -> ${leaks[k]}`), sampleErrors: Object.entries(leaks.__errors || {}).slice(0, 6) } });

  // ---- baseline of victim (org B) data via service role, then S3b: org A attacks B ----
  const sb = admin(); const A = fix.orgs[0], B = fix.orgs[1];
  const snap = async () => ({ parts: (await sb.from("parts").select("id, quantity_on_hand, name").eq("org_id", B.id).order("id")).data, wos: (await sb.from("work_orders").select("id, title, status").eq("org_id", B.id).order("id")).data, auditN: (await sb.from("audit_log").select("id", { count: "exact", head: true }).eq("org_id", B.id)).count });
  const before = await snap();
  const att = asUser(A.users.find((u) => u.role === "admin").access_token);
  const victimWo = before.wos[0].id, victimPart = B && fix.seed.B.partA;
  const attempts = [];
  const tryIt = async (label, fn) => { const r = await fn(); attempts.push({ label, error: r.error?.message || null, count: r.count ?? (Array.isArray(r.data) ? r.data.length : r.data ? 1 : 0), data: r.data }); };
  const burst = [];
  for (let rep = 0; rep < 10; rep++) burst.push(
    tryIt("update B work_order title", () => att.from("work_orders").update({ title: "HACKED" }).eq("id", victimWo).select("id")),
    tryIt("delete B work_order", () => att.from("work_orders").delete().eq("id", victimWo).select("id")),
    tryIt("update B part qty", () => att.from("parts").update({ quantity_on_hand: 999999 }).eq("id", victimPart).select("id")),
    tryIt("insert WO into org B", () => att.from("work_orders").insert({ org_id: B.id, work_order_number: "HACK-" + rep + Math.random(), title: "planted" }).select("id")),
    tryIt("move own WO to org B", () => att.from("work_orders").update({ org_id: B.id }).eq("org_id", A.id).limit(1).select("id")),
  );
  await Promise.all(burst);
  const after = await snap();
  const wrote = attempts.filter((a) => !a.error && a.count > 0);
  const changed = JSON.stringify(before.parts) !== JSON.stringify(after.parts) || JSON.stringify(before.wos) !== JSON.stringify(after.wos);
  const planted = (await sb.from("work_orders").select("id").eq("org_id", B.id).like("work_order_number", "HACK-%")).data?.length || 0;
  const movedIn = (await sb.from("work_orders").select("id").eq("org_id", B.id).like("title", "stress A/%")).data?.length || 0;
  record({ name: "S3b org-A admin tries to modify org-B rows (50 concurrent attempts)", pass: !wrote.length && !changed && !planted && !movedIn, detail: `attempts that reported a row touched=${wrote.length}, B data changed=${changed}, rows planted in B=${planted}, A rows moved into B=${movedIn}`, extra: { outcomes: [...new Set(attempts.map((a) => a.label + " => " + (a.error ? "ERR: " + a.error.slice(0, 70) : "0 rows")))] } });
})().catch((e) => { console.error("S3 CRASH", e.message); process.exit(1); });

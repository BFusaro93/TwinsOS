const { loadFix, admin, asUser, record } = require("./lib");
(async () => {
  const fix = loadFix(); const sb = admin(); const o = fix.orgs[2]; const u = asUser(o.users.find((x) => x.role === "admin").access_token);
  const rows = Array.from({ length: 1200 }, (_, i) => ({ org_id: o.id, name: `STRESS vendor ${String(i).padStart(4, "0")} ${fix.run}` }));
  for (let i = 0; i < rows.length; i += 300) { const { error } = await sb.from("vendors").insert(rows.slice(i, i + 300)); if (error) throw new Error(error.message); }
  const raw = await u.from("vendors").select("id").is("deleted_at", null).order("name");
  // the same algorithm as src/lib/reports/fetch-all-rows.ts
  const out = []; for (let off = 0; ; off += 1000) { const r = await u.from("vendors").select("id").is("deleted_at", null).order("name").order("id").range(off, off + 999); out.push(...r.data); if (r.data.length < 1000) break; }
  record({ name: "C1 org with 1200 vendors: unpaged read vs paged read", pass: raw.data.length === 1000 && out.length >= 1200, detail: `unpaged select returned ${raw.data.length} rows (silently capped), paged read returned ${out.length}` });
})().catch((e) => { console.error("C CRASH", e.message); process.exit(1); });

const { loadFix, asUser, pool, pct, summarize } = require("./lib");
const { execSync } = require("child_process");
(async () => {
  const fix = loadFix(); const users = fix.orgs.flatMap((o) => o.users.map((u) => ({ o, c: asUser(u.access_token) })));
  console.log("PostgREST ONLY (no Next in the path): select 50 work_orders, 10s per level");
  for (const conc of [30, 60]) {
    const end = Date.now() + 10000; const ms = []; let bad = 0; const t0 = Date.now();
    await Promise.all(Array.from({ length: conc }, async () => { while (Date.now() < end) { const x = users[Math.floor(Math.random() * users.length)]; const t = performance.now(); const r = await x.c.from("work_orders").select("id, org_id, title").limit(50); ms.push(performance.now() - t); if (r.error) bad++; } }));
    const wall = (Date.now() - t0) / 1000; console.log(`  conc=${String(conc).padStart(3)}  ${(ms.length / wall).toFixed(0).padStart(4)} req/s  errors=${bad}  ${summarize(ms)}`);
  }
  // Raw round-trip floor: a trivial RPC with no table access
  const x = users[0]; const lat = []; for (let i = 0; i < 25; i++) { const t = performance.now(); await x.c.rpc("my_org_id"); lat.push(performance.now() - t); }
  console.log(`single-request floor (my_org_id RPC, serial): p50=${Math.round(pct(lat, 50))}ms p95=${Math.round(pct(lat, 95))}ms`);
})();

const { admin, asUser, pool, pct, record } = require("./lib");
const { ensureFreshSessions, cookieFor, req } = require("./http");
const { execSync } = require("child_process");
const rss = () => { try { const pid = execSync("lsof -ti tcp:3100 -sTCP:LISTEN").toString().trim().split("\n")[0]; return Math.round(parseInt(execSync(`ps -o rss= -p ${pid}`).toString(), 10) / 1024); } catch { return null; } };
const LEVELS = (process.env.LEVELS || "20,60,120").split(",").map(Number), SECS = Number(process.env.SECS || 20);
(async () => {
  const { fix } = await ensureFreshSessions(2400);
  const users = []; for (const o of fix.orgs) for (const u of o.users) users.push({ o, u, cookie: await cookieFor(u.session), rest: asUser(u.access_token), canWrite: ["admin", "manager", "technician"].includes(u.role), isAdmin: u.role === "admin" });
  const PAGES = ["/home", "/crm/home", "/equipt/home", "/po/orders", "/settings"];
  const ACTIONS = [
    [30, "page", async (x) => { const r = await req(PAGES[Math.floor(Math.random() * PAGES.length)], { cookie: x.cookie }); return { ok: r.status === 200, status: r.status, ms: r.ms }; }],
    [18, "api:forms", async (x) => { if (!x.isAdmin) return null; const r = await req("/api/crm/forms", { cookie: x.cookie }); const leak = fix.orgs.some((o) => o.tag !== x.o.tag && r.text.includes(`MARK-${o.tag}-${fix.run}`)); return { ok: r.status === 200 && !leak, status: leak ? "LEAK" : r.status, ms: r.ms, leak }; }],
    [8, "api:schedules", async (x) => { if (!x.isAdmin) return null; const r = await req("/api/crm/report-schedules", { cookie: x.cookie }); return { ok: r.status === 200, status: r.status, ms: r.ms }; }],
    [8, "api:dashboards", async (x) => { if (!x.isAdmin) return null; const r = await req("/api/crm/dashboards", { cookie: x.cookie }); return { ok: r.status === 200, status: r.status, ms: r.ms }; }],
    [5, "api:graphics", async (x) => { if (!x.isAdmin) return null; const r = await req("/api/crm/graphics", { cookie: x.cookie }); return { ok: r.status === 200, status: r.status, ms: r.ms }; }],
    [21, "rest:read", async (x) => { const t = performance.now(); const r = await x.rest.from("work_orders").select("id, org_id, title").order("created_at", { ascending: false }).limit(50); const leak = (r.data || []).some((w) => w.org_id !== x.o.id); return { ok: !r.error && !leak, status: r.error ? r.error.code || "ERR" : leak ? "LEAK" : 200, ms: performance.now() - t, leak }; }],
    [10, "rest:write", async (x) => { if (!x.canWrite) return null; const t = performance.now(); const n = await x.rest.rpc("next_work_order_number"); const r = n.error ? n : await x.rest.from("work_orders").insert({ work_order_number: n.data, title: "load " + x.o.tag }).select("id"); return { ok: !r.error, status: r.error ? r.error.code || "ERR" : 201, ms: performance.now() - t }; }],
  ];
  const total = ACTIONS.reduce((n, a) => n + a[0], 0);
  const pick = () => { let k = Math.random() * total; for (const a of ACTIONS) { if ((k -= a[0]) < 0) return a; } return ACTIONS[0]; };
  for (const conc of LEVELS) {
    const stats = {}; let leaks = 0; const errs = {}; const rss0 = rss(); const end = Date.now() + SECS * 1000; const t0 = Date.now(); let n = 0;
    await Promise.all(Array.from({ length: conc }, async () => { while (Date.now() < end) { const x = users[Math.floor(Math.random() * users.length)]; const a = pick(); let r; try { r = await a[2](x); } catch (e) { r = { ok: false, status: "EXC", ms: 0 }; (errs["EXC " + e.message.slice(0, 50)] ||= 0); errs["EXC " + e.message.slice(0, 50)]++; } if (!r) continue; n++; const s = (stats[a[1]] ||= { ms: [], bad: 0, n: 0 }); s.n++; s.ms.push(r.ms); if (!r.ok) { s.bad++; errs[`${a[1]} ${r.status}`] = (errs[`${a[1]} ${r.status}`] || 0) + 1; } if (r.leak) leaks++; } }));
    const wall = (Date.now() - t0) / 1000; const all = Object.values(stats).flatMap((s) => s.ms); const bad = Object.values(stats).reduce((m, s) => m + s.bad, 0);
    const line = Object.entries(stats).map(([k, s]) => `${k}: n=${s.n} p50=${Math.round(pct(s.ms, 50))} p95=${Math.round(pct(s.ms, 95))} bad=${s.bad}`).join(" | ");
    record({ name: `L ${conc} concurrent sessions x ${SECS}s mixed load`, pass: leaks === 0 && bad / n < 0.01, detail: `${n} req, ${(n / wall).toFixed(0)}/s, errors=${bad} (${(100 * bad / n).toFixed(2)}%), CROSS-ORG LEAKS=${leaks}, overall p50=${Math.round(pct(all, 50))}ms p95=${Math.round(pct(all, 95))}ms p99=${Math.round(pct(all, 99))}ms, server RSS ${rss0}->${rss()}MB`, extra: { perClass: line, errors: errs } });
  }
})().catch((e) => { console.error("LOAD CRASH", e); process.exit(1); });

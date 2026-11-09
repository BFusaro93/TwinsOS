const { admin, pool, record, summarize } = require("./lib");
const { ensureFreshSessions, cookieFor, req } = require("./http");
(async () => {
  const { fix } = await ensureFreshSessions(); const sb = admin();
  const cookies = {}; for (const o of fix.orgs) for (const u of o.users) cookies[u.id] = await cookieFor(u.session);
  const adminsOf = (o) => o.users.filter((u) => u.role === "admin");

  // seed one marker form per org (idempotent by name)
  for (const o of fix.orgs) { const name = `MARK-${o.tag}-${fix.run}`; const { data } = await sb.from("crm_forms").select("id").eq("org_id", o.id).eq("name", name).maybeSingle(); if (!data) { const { error } = await sb.from("crm_forms").insert({ org_id: o.id, name, slug: name.toLowerCase(), status: "draft" }); if (error) throw new Error(error.message); } }

  // ---- H0: marker isolation across 18 concurrent sessions, 20 rounds each (cookie auth -> Next route -> RLS) ----
  const jobs = []; const meta = [];
  for (const o of fix.orgs) for (const u of adminsOf(o)) for (let i = 0; i < 20; i++) { meta.push({ o, u }); jobs.push(() => req("/api/crm/forms", { cookie: cookies[u.id] })); }
  const res = await pool(jobs, 60);
  let bad = 0, non200 = 0, missing = 0;
  res.forEach((r, i) => { if (r.status !== 200) { non200++; return; } const mine = `MARK-${meta[i].o.tag}-${fix.run}`; if (!r.text.includes(mine)) missing++; for (const x of fix.orgs) if (x.tag !== meta[i].o.tag && r.text.includes(`MARK-${x.tag}-${fix.run}`)) bad++; });
  record({ name: "H0 per-org marker isolation via Next route, 9 admins x 20 concurrent GETs", pass: bad === 0 && non200 === 0 && missing === 0, detail: `${res.length} requests, non-200=${non200}, own marker missing=${missing}, FOREIGN MARKERS SEEN=${bad}, ${summarize(res.map((r) => r.ms))}` });

  // ---- H1: concurrent create of the SAME form name inside one org (double-click / two admins) ----
  const nm = `Concurrent Form ${fix.run}`; const c1 = [];
  for (const o of fix.orgs) { const us = adminsOf(o); for (let i = 0; i < 8; i++) c1.push(async () => { const u = us[i % us.length]; const r = await req("/api/crm/forms", { cookie: cookies[u.id], method: "POST", body: { name: nm } }); return { o: o.tag, ...r }; }); }
  const r1 = await pool(c1, 24); const byO = {}; r1.forEach((r) => { (byO[r.o] ||= { ok: 0, err: [] }); r.status === 201 ? byO[r.o].ok++ : byO[r.o].err.push(r.status + " " + r.text.slice(0, 110)); });
  const fails = Object.values(byO).reduce((n, v) => n + v.err.length, 0);
  record({ name: "H1 8 concurrent creates of a same-named form per org (3 orgs)", pass: fails === 0, detail: `201s=${Object.values(byO).map((v) => v.ok).join("/")} of 8 each, failures=${fails}`, extra: { sampleFailures: [...new Set(Object.values(byO).flatMap((v) => v.err))].slice(0, 3) } });

  // ---- H2: all 3 orgs publish a same-named form at the SAME instant (global published-slug index) ----
  const pub = []; const created = [];
  for (const o of fix.orgs) { const u = adminsOf(o)[0]; const r = await req("/api/crm/forms", { cookie: cookies[u.id], method: "POST", body: { name: `Contact Us Race ${fix.run}` } }); created.push({ o, u, id: JSON.parse(r.text).id }); }
  const r2 = await Promise.all(created.map(({ u, id }) => req(`/api/crm/forms/${id}`, { cookie: cookies[u.id], method: "PATCH", body: { status: "published" } })));
  record({ name: "H2 three orgs publish a same-named form simultaneously", pass: r2.every((r) => r.status === 200), detail: `statuses=${r2.map((r) => r.status).join(",")}`, extra: { bodies: r2.filter((r) => r.status !== 200).map((r) => r.text.slice(0, 160)) } });

  // ---- H3: expired access token + 30 parallel requests (multiple tabs after the token lapsed) ----
  const u3 = adminsOf(fix.orgs[0])[0]; const stale = await cookieFor(u3.session, { expired: true });
  const r3 = await Promise.all(Array.from({ length: 30 }, () => req("/api/crm/forms", { cookie: stale })));
  const codes = {}; r3.forEach((r) => (codes[r.status] = (codes[r.status] || 0) + 1));
  const newCookies = r3.map((r) => r.headers.get("set-cookie")).filter(Boolean).length;
  record({ name: "H3 expired token, 30 parallel requests (server-side refresh storm)", pass: codes[200] === 30, detail: `status counts=${JSON.stringify(codes)}, responses carrying a refreshed cookie=${newCookies}` });

  // ---- H4: login rate limiter exactness: 40 concurrent wrong-password attempts for ONE email (limit 8/15min) ----
  const email = `nobody-${fix.run}@stress.invalid`;
  const r4 = await Promise.all(Array.from({ length: 40 }, () => req("/api/auth/login", { method: "POST", body: { email, password: "wrong-password-123" } })));
  const c4 = {}; r4.forEach((r) => (c4[r.status] = (c4[r.status] || 0) + 1));
  record({ name: "H4 login limiter: 40 concurrent attempts, limit 8 per email", pass: (c4[429] || 0) === 32 && (c4[401] || 0) === 8, detail: `status counts=${JSON.stringify(c4)} (exact would be 401x8 + 429x32)` });
})().catch((e) => { console.error("H CRASH", e); process.exit(1); });

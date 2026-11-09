const { loadFix, saveFix, admin, anon, record, pool } = require("./lib");
const { ensureFreshSessions, cookieFor, req } = require("./http");
(async () => {
  const { fix } = await ensureFreshSessions(); const sb = admin(); const o = fix.orgs[0];
  const ny = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // the fixture orgs' timezone (not UTC: UTC is already tomorrow after 8pm ET)
  const today = ny(Date.now()), tomorrow = ny(Date.now() + 864e5);
  // crew login (per-crew account, as in production)
  if (!fix.crew) {
    const email = `stress-crew-${fix.run}@stress.invalid`;
    const { data: u, error: ue } = await sb.auth.admin.createUser({ email, password: fix.password, email_confirm: true, user_metadata: { name: "Stress Crew" } }); if (ue) throw new Error(ue.message);
    const { error: pe } = await sb.from("profiles").insert({ id: u.user.id, org_id: o.id, name: "Stress Crew", email, role: "crew", status: "active" }); if (pe) throw new Error("crew profile: " + pe.message);
    const { data: crew, error: ce } = await sb.from("crm_crews").insert({ org_id: o.id, name: `STRESS crew ${fix.run}`, user_id: u.user.id }).select("id").single(); if (ce) throw new Error("crew: " + ce.message);
    fix.crew = { userId: u.user.id, email, crewId: crew.id }; saveFix(fix);
  }
  const { data: s } = await anon().auth.signInWithPassword({ email: fix.crew.email, password: fix.password });
  const crewCookie = await cookieFor(s.session); const adminCookie = await cookieFor(o.users.find((x) => x.role === "admin").session);
  const mk = async (i) => {
    const { data: cl } = await sb.from("clients").insert({ org_id: o.id, display_name: `STRESS toctou ${i}`, status: "active" }).select("id").single();
    const { data: job } = await sb.from("crm_jobs").insert({ org_id: o.id, client_id: cl.id, job_type: "one_time", crew_id: fix.crew.crewId }).select("id").single();
    const { data: v, error } = await sb.from("crm_job_visits").insert({ org_id: o.id, job_id: job.id, client_id: cl.id, crew_id: fix.crew.crewId, scheduled_date: today }).select("id").single(); if (error) throw new Error(error.message);
    return v.id;
  };
  // sanity: a lone clock-in works for this crew login
  const probe = await mk("probe"); const pr = await req(`/api/crm/crew/stops/${probe}/clock-in`, { cookie: crewCookie, method: "POST", body: {} });
  if (pr.status !== 200) { record({ name: "T0 crew clock-in sanity", pass: false, detail: `status=${pr.status} ${pr.text.slice(0, 160)}` }); return; }
  const TR = 25;
  for (const [label, patch] of [["status -> dispatched", { status: "dispatched" }], ["move to tomorrow", { scheduled_date: tomorrow }]]) {
    const ids = []; for (let i = 0; i < TR; i++) ids.push(await mk(`${label}-${i}`));
    const res = await pool(ids.flatMap((id) => [() => req(`/api/crm/crew/stops/${id}/clock-in`, { cookie: crewCookie, method: "POST", body: {} }), () => req(`/api/crm/visits/${id}`, { cookie: adminCookie, method: "PATCH", body: patch })]), 50);
    const { data: rows } = await sb.from("crm_job_visits").select("id, status, clocked_in_at, clocked_out_at, scheduled_date").in("id", ids);
    const corrupt = rows.filter((r) => r.clocked_in_at && !r.clocked_out_at && (["scheduled", "dispatched"].includes(r.status) || r.scheduled_date !== today));
    const codes = {}; res.forEach((r) => (codes[r.status] = (codes[r.status] || 0) + 1));
    record({ name: `T1 dispatcher "${label}" vs crew clock-in at the same instant (${TR} visits)`, pass: corrupt.length === 0, detail: `http=${JSON.stringify(codes)}, visits left clocked-in but not in progress / on another day=${corrupt.length}/${TR}`, extra: { sample: corrupt.slice(0, 2) } });
  }
})().catch((e) => { console.error("T CRASH", e.message); process.exit(1); });

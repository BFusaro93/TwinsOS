const { admin, pool, record } = require("./lib");
const { ensureFreshSessions, cookieFor, req } = require("./http");
(async () => {
  const { fix } = await ensureFreshSessions(); const sb = admin();
  const today = new Date().toISOString().slice(0, 10);
  const N_CONC = 12, N_SEQ = 3; const trials = [];
  for (const o of fix.orgs) {
    const u = o.users.find((x) => x.role === "admin"); const cookie = await cookieFor(u.session);
    for (let i = 0; i < N_CONC + N_SEQ; i++) {
      const mode = i < N_SEQ ? "seq" : "conc";
      const { data: cl, error: ce } = await sb.from("clients").insert({ org_id: o.id, display_name: `STRESS inv ${o.tag}${i}`, invoice_frequency: "weekly", status: "active" }).select("id").single(); if (ce) throw new Error("client: " + ce.message);
      const { data: job, error: je } = await sb.from("crm_jobs").insert({ org_id: o.id, client_id: cl.id, job_type: "recurring", rate_cents: 5000 }).select("id").single(); if (je) throw new Error("job: " + je.message);
      const v = []; for (let k = 0; k < 2; k++) { const { data: vi, error: ve } = await sb.from("crm_job_visits").insert({ org_id: o.id, job_id: job.id, client_id: cl.id, scheduled_date: today }).select("id").single(); if (ve) throw new Error("visit: " + ve.message); v.push(vi.id); }
      trials.push({ o, cookie, clientId: cl.id, visits: v, mode });
    }
  }
  const post = (t, id) => req(`/api/crm/visits/${id}/complete`, { cookie: t.cookie, method: "POST" });
  // control: sequential
  const seqRes = []; for (const t of trials.filter((x) => x.mode === "seq")) { seqRes.push(await post(t, t.visits[0]), await post(t, t.visits[1])); }
  // concurrent: both visits of a client at the same instant; all clients in parallel
  const concTrials = trials.filter((x) => x.mode === "conc");
  const concRes = await pool(concTrials.flatMap((t) => [() => post(t, t.visits[0]), () => post(t, t.visits[1])]), 36);
  const codes = {}; [...seqRes, ...concRes].forEach((r) => (codes[r.status] = (codes[r.status] || 0) + 1));
  const sample = [...seqRes, ...concRes].find((r) => r.status !== 200); 
  const drafts = async (t) => { const { data } = await sb.from("crm_invoices").select("id, status, total_cents").eq("client_id", t.clientId).is("deleted_at", null); const lines = await sb.from("crm_invoice_line_items").select("id", { count: "exact", head: true }).in("invoice_id", (data || []).map((d) => d.id).concat(["00000000-0000-0000-0000-000000000000"])); return { n: (data || []).length, lines: lines.count, total: (data || []).reduce((s, d) => s + d.total_cents, 0) }; };
  const seqOut = await Promise.all(trials.filter((x) => x.mode === "seq").map(drafts)); const concOut = await Promise.all(concTrials.map(drafts));
  const seqBad = seqOut.filter((d) => d.n !== 1 || d.lines !== 2).length, concDup = concOut.filter((d) => d.n > 1).length, concLost = concOut.filter((d) => d.n === 0 || d.lines !== 2).length;
  record({ name: "I1 control: 9 weekly clients, 2 visits each completed sequentially", pass: seqBad === 0 && !seqRes.some((r) => r.status !== 200), detail: `clients with exactly 1 invoice + 2 lines=${seqOut.length - seqBad}/${seqOut.length}; http=${JSON.stringify(codes)}`, extra: { sample: sample && sample.text.slice(0, 200) } });
  record({ name: "I2 36 weekly clients, both visits completed at the same instant", pass: concDup === 0 && concLost === 0, detail: `clients with DUPLICATE draft invoices=${concDup}/${concOut.length}, clients with missing/short billing=${concLost}, invoice-count histogram=${JSON.stringify(concOut.reduce((h, d) => ((h[d.n] = (h[d.n] || 0) + 1), h), {}))}` });
})().catch((e) => { console.error("I CRASH", e.message); process.exit(1); });

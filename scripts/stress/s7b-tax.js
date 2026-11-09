const { admin, pool, record } = require("./lib");
const { ensureFreshSessions, cookieFor, req } = require("./http");
(async () => {
  const { fix } = await ensureFreshSessions(); const sb = admin(); const today = new Date().toISOString().slice(0, 10);
  // totals on every invoice the previous concurrent run produced
  const { data: inv } = await sb.from("crm_invoices").select("subtotal_cents, tax_cents, total_cents, balance_cents").not("auto_bill_period_start", "is", null).is("deleted_at", null);
  // Every period-key invoice is one of the two fixtures: untaxed 10000, or taxable 10000 + 800 tax = 10800.
  const bad = inv.filter((i) => !((i.subtotal_cents === 10000 && i.tax_cents === 0 && i.total_cents === 10000 && i.balance_cents === 10000) || (i.subtotal_cents === 10000 && i.tax_cents === 800 && i.total_cents === 10800 && i.balance_cents === 10800)));
  record({ name: "I3 totals on every period draft created by the zero-header path", pass: inv.length > 0 && bad.length === 0, detail: `${inv.length} invoices with the period key, unexpected totals=${bad.length}`, extra: { sample: bad.slice(0, 2) } });
  // taxable variant: tax must be 8% of the TAXABLE lines whichever visit's lines land first
  const trials = [];
  for (const o of fix.orgs) {
    const cookie = await cookieFor(o.users.find((x) => x.role === "admin").session);
    for (let i = 0; i < 10; i++) {
      const mode = i < 2 ? "seq" : "conc";
      const { data: cl } = await sb.from("clients").insert({ org_id: o.id, display_name: `STRESS tax ${o.tag}${i}`, invoice_frequency: "weekly", status: "active", is_taxable: true, default_tax_rate_bps: 800 }).select("id").single();
      const { data: job } = await sb.from("crm_jobs").insert({ org_id: o.id, client_id: cl.id, job_type: "recurring" }).select("id").single();
      await sb.from("crm_job_services").insert({ org_id: o.id, job_id: job.id, service_name: "Taxable svc", qty: 1, rate_cents: 5000, is_taxable: true });
      const vs = []; for (let k = 0; k < 2; k++) vs.push((await sb.from("crm_job_visits").insert({ org_id: o.id, job_id: job.id, client_id: cl.id, scheduled_date: today }).select("id").single()).data.id);
      trials.push({ cookie, clientId: cl.id, vs, mode });
    }
  }
  const post = (t, id) => req(`/api/crm/visits/${id}/complete`, { cookie: t.cookie, method: "POST" });
  for (const t of trials.filter((x) => x.mode === "seq")) { await post(t, t.vs[0]); await post(t, t.vs[1]); }
  await pool(trials.filter((x) => x.mode === "conc").flatMap((t) => [() => post(t, t.vs[0]), () => post(t, t.vs[1])]), 24);
  const out = await Promise.all(trials.map(async (t) => { const { data } = await sb.from("crm_invoices").select("subtotal_cents, tax_cents, total_cents").eq("client_id", t.clientId).is("deleted_at", null); return { mode: t.mode, n: data.length, d: data[0] }; }));
  const ok = (x) => x.n === 1 && x.d.subtotal_cents === 10000 && x.d.tax_cents === 800 && x.d.total_cents === 10800;
  const seqOk = out.filter((x) => x.mode === "seq" && ok(x)).length, concOk = out.filter((x) => x.mode === "conc" && ok(x)).length;
  const concBad = out.filter((x) => x.mode === "conc" && !ok(x)).slice(0, 3);
  record({ name: "I4 taxable weekly clients: 2 visits completed together (want 1 invoice, 10000 + 800 tax = 10800)", pass: seqOk === 6 && concOk === 24, detail: `sequential correct=${seqOk}/6, concurrent correct=${concOk}/24`, extra: { concBad } });
})().catch((e) => { console.error("I3/4 CRASH", e.message); process.exit(1); });

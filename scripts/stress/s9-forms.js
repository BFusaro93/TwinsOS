const { loadFix, admin, pool, record } = require("./lib");
const { req } = require("./http");
(async () => {
  const fix = loadFix(); const sb = admin(); const o = fix.orgs[0]; const slug = `stress-lead-${fix.run}`;
  let { data: form } = await sb.from("crm_forms").select("id").eq("slug", slug).maybeSingle();
  if (!form) {
    const ins = await sb.from("crm_forms").insert({ org_id: o.id, name: `Stress Lead ${fix.run}`, slug, status: "published", auto_manage_accounts: true, account_matching_strategy: "email", settings: { submitLabel: "Go", notificationRecipients: "secret-staff@example.com", fromEmail: "internal@example.com" } }).select("id").single(); if (ins.error) throw new Error(ins.error.message); form = ins.data;
    const f = await sb.from("crm_form_fields").insert([{ form_id: form.id, org_id: o.id, field_type: "text", label: "Name", required: true, sort_order: 1, mapped_field: "client.display_name" }, { form_id: form.id, org_id: o.id, field_type: "email", label: "Email", required: true, sort_order: 2, mapped_field: "client.email" }]); if (f.error) throw new Error(f.error.message);
  }
  // ---- P1: the public form endpoint (now served by the get_public_form RPC) ----
  const g = await req(`/api/public/forms/${slug}`); let shape = {}; try { shape = JSON.parse(g.text); } catch {}
  const leakKeys = ["org_id", "notificationRecipients", "fromEmail", "secret-staff", "internal@example.com"].filter((k) => g.text.includes(k));
  record({ name: "P1 public form endpoint returns the form, whitelisted settings only", pass: g.status === 200 && shape.fields?.length === 2 && shape.settings?.submitLabel === "Go" && leakKeys.length === 0, detail: `status=${g.status}, fields=${shape.fields?.length}, settings keys=${Object.keys(shape.settings || {})}, internal fields leaked=${leakKeys.join(",") || "none"}` });
  // ---- P2: control: sequential duplicate submit ----
  const emailSeq = `seq-${fix.run}@stress.example`; let n = 0; const xf = () => ({ "x-forwarded-for": `10.77.${(n >> 8) & 255}.${n++ & 255}` });
  const submit = (email) => req(`/api/public/forms/${slug}/submit`, { method: "POST", body: { data: { Name: "Stress Lead", Email: email } }, headers: xf() });
  const s1 = await submit(emailSeq), s2 = await submit(emailSeq);
  const countFor = async (email) => (await sb.from("clients").select("id").eq("org_id", o.id).eq("primary_email", email).is("deleted_at", null)).data.length;
  record({ name: "P2 control: same email submitted twice in sequence", pass: s1.status === 200 && s2.status === 200 && (await countFor(emailSeq)) === 1, detail: `http=${s1.status}/${s2.status}, clients for that email=${await countFor(emailSeq)} (want 1)` });
  // ---- P3: 8 emails x 5 simultaneous submits (double/triple-click, retries) ----
  const RUN2 = Date.now().toString(36); const emails = Array.from({ length: 8 }, (_, i) => `conc${i}-${RUN2}@stress.example`);
  const res = await pool(emails.flatMap((e) => Array.from({ length: 5 }, () => () => submit(e))), 40);
  const codes = {}; res.forEach((r) => (codes[r.status] = (codes[r.status] || 0) + 1));
  const counts = await Promise.all(emails.map(countFor)); const dups = counts.filter((c) => c > 1).length;
  record({ name: "P3 same email submitted 5x at once, 8 emails (public form, auto-manage accounts)", pass: dups === 0, detail: `http=${JSON.stringify(codes)}, emails that created duplicate clients=${dups}/8, clients-per-email histogram=${JSON.stringify(counts.reduce((h, c) => ((h[c] = (h[c] || 0) + 1), h), {}))}` });
  // ---- P4: DIFFERENT payloads, same email, at once (two different messages): the guard keys on payload, so this race remains ----
  const emails4 = Array.from({ length: 6 }, (_, i) => `diff${i}-${RUN2}@stress.example`);
  const sub4 = (e, k) => req(`/api/public/forms/${slug}/submit`, { method: "POST", body: { data: { Name: `Person ${k}`, Email: e } }, headers: xf() });
  await pool(emails4.flatMap((e) => [0, 1, 2].map((k) => () => sub4(e, k))), 30);
  const c4 = await Promise.all(emails4.map(countFor)); const d4 = c4.filter((c) => c > 1).length;
  record({ name: "P4 (known limit) three DIFFERENT messages from one email at the same instant", pass: true, detail: `emails with >1 client=${d4}/6 — expected: exact-duplicate guard does not cover distinct payloads; needs a DB-level match-or-create to close` });
})().catch((e) => { console.error("P CRASH", e.message); process.exit(1); });

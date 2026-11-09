const crypto = require("crypto");
const { admin, anon, saveFix, sleep } = require("./lib");
const ORGS = [
  { tag: "A", name: "STRESS Org A", per_org_numbering: true },
  { tag: "B", name: "STRESS Org B", per_org_numbering: true },
  { tag: "C", name: "STRESS Org C (global counters)", per_org_numbering: false },
];
const ROLES = ["admin", "admin", "admin", "manager", "technician", "purchaser", "viewer"];
(async () => {
  const sb = admin();
  const password = crypto.randomBytes(18).toString("base64url");
  const run = Date.now().toString(36);
  const fix = { run, password, orgs: [] };
  for (const o of ORGS) {
    const slug = `stress-${o.tag.toLowerCase()}-${run}`;
    const trial = new Date(Date.now() + 30 * 864e5).toISOString();
    const { data: org, error } = await sb.from("organizations").insert({ name: o.name, slug, plan: "trial", trial_ends_at: trial, is_demo: true, per_org_numbering: o.per_org_numbering }).select("id").single();
    if (error) throw new Error("org insert: " + error.message);
    const users = [];
    for (let i = 0; i < ROLES.length; i++) {
      const email = `stress-${o.tag.toLowerCase()}${i + 1}-${run}@stress.invalid`;
      const name = `Stress ${o.tag}${i + 1} ${ROLES[i]}`;
      const { data: u, error: ue } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
      if (ue) throw new Error("createUser: " + ue.message);
      const { error: pe } = await sb.from("profiles").insert({ id: u.user.id, org_id: org.id, name, email, role: ROLES[i], status: "active" });
      if (pe) throw new Error("profile insert: " + pe.message);
      users.push({ id: u.user.id, email, name, role: ROLES[i] });
    }
    fix.orgs.push({ ...o, id: org.id, slug, users });
    console.log(`org ${o.tag} ${org.id} users=${users.length}`);
  }
  // Sign everyone in once (reuse tokens; Supabase rate-limits password sign-ins per IP).
  for (const o of fix.orgs) for (const u of o.users) {
    const c = anon();
    const { data, error } = await c.auth.signInWithPassword({ email: u.email, password });
    if (error) throw new Error(`signIn ${u.email}: ${error.message}`);
    u.access_token = data.session.access_token; u.refresh_token = data.session.refresh_token; u.session = data.session;
    await sleep(150);
  }
  saveFix(fix);
  console.log("fixtures saved; signed in", fix.orgs.reduce((n, o) => n + o.users.length, 0), "users");
})().catch((e) => { console.error("SETUP FAILED:", e.message); process.exit(1); });

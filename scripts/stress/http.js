// HTTP client + cookie-session helpers for hitting the real Next server as logged-in users.
const { createServerClient } = require("@supabase/ssr");
const { URL_, ANON, loadFix, saveFix, anon, sleep } = require("./lib");
const BASE = process.env.STRESS_BASE || "http://localhost:3100";

// Build the exact cookie(s) @supabase/ssr would set for a session, by letting it do the encoding/chunking.
async function cookieFor(session, { expired = false } = {}) {
  const jar = {};
  const sb = createServerClient(URL_, ANON, { cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => { jar[name] = value; }) } });
  const s = { ...session }; if (expired) s.expires_at = 1; // client sees it as expired -> forces a server-side refresh
  const { error } = await sb.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
  if (error) throw new Error("setSession: " + error.message);
  if (expired) { const key = Object.keys(jar).find((k) => /auth-token(\.0)?$/.test(k)); /* re-encode with stale expires_at */
    const raw = jar[key]; const json = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString()); json.expires_at = 1; json.expires_in = 0;
    const enc = "base64-" + Buffer.from(JSON.stringify(json)).toString("base64url"); for (const k of Object.keys(jar)) delete jar[k]; jar[key.replace(/\.\d+$/, "")] = enc; }
  return Object.entries(jar).map(([n, v]) => `${n}=${v}`).join("; ");
}
async function ensureFreshSessions(minLeftSec = 1500) {
  const fix = loadFix(); let n = 0;
  for (const o of fix.orgs) for (const u of o.users) {
    const left = (u.session?.expires_at || 0) - Date.now() / 1000;
    if (left < minLeftSec) { const { data, error } = await anon().auth.signInWithPassword({ email: u.email, password: fix.password }); if (error) throw new Error(`re-signin ${u.email}: ${error.message}`); u.session = data.session; u.access_token = data.session.access_token; u.refresh_token = data.session.refresh_token; n++; await sleep(120); }
  }
  if (n) saveFix(fix); return { fix, refreshed: n };
}
async function req(path, { cookie, method = "GET", body, headers = {}, redirect = "manual" } = {}) {
  const t = performance.now();
  try {
    const r = await fetch(BASE + path, { method, redirect, headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    return { status: r.status, ms: performance.now() - t, text, headers: r.headers, location: r.headers.get("location") };
  } catch (e) { return { status: 0, ms: performance.now() - t, text: "", err: e.message }; }
}
module.exports = { BASE, cookieFor, ensureFreshSessions, req };

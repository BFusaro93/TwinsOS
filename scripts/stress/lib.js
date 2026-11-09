// Shared helpers for the stress sweep. Run under `. env.sh` so env points at TEST (see README.md).
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !/gxtmqxdxlvyfswcoxyvm/.test(URL_)) throw new Error("Refusing to run: env is not the TEST project");
const FIX = path.join(__dirname, "fixtures.json");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = () => createClient(URL_, SERVICE, opts);
const anon = () => createClient(URL_, ANON, opts);
const asUser = (accessToken) => createClient(URL_, ANON, { ...opts, global: { headers: { Authorization: `Bearer ${accessToken}` } } });
const loadFix = () => JSON.parse(fs.readFileSync(FIX, "utf8"));
const saveFix = (f) => fs.writeFileSync(FIX, JSON.stringify(f, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function pct(arr, p) { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; }
async function timed(fn) { const t = performance.now(); try { const v = await fn(); return { ok: true, v, ms: performance.now() - t }; } catch (e) { return { ok: false, e, ms: performance.now() - t }; } }
module.exports = { URL_, ANON, SERVICE, admin, anon, asUser, loadFix, saveFix, sleep, pct, timed, FIX };

// Run async tasks with bounded concurrency; returns results in order.
async function pool(tasks, concurrency) {
  const out = new Array(tasks.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (true) { const k = i++; if (k >= tasks.length) return; out[k] = await tasks[k](); }
  }));
  return out;
}
const RESULTS = path.join(__dirname, "results.json");
function record(r) {
  const all = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, "utf8")) : [];
  all.push({ at: new Date().toISOString(), ...r }); fs.writeFileSync(RESULTS, JSON.stringify(all, null, 2));
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  — " + r.detail : ""}`);
}
const summarize = (ms) => `p50=${Math.round(pct(ms, 50))}ms p95=${Math.round(pct(ms, 95))}ms max=${Math.round(Math.max(...ms))}ms`;
module.exports.pool = pool; module.exports.record = record; module.exports.summarize = summarize;

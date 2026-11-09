// Realtime fan-out sweep (TEST only). Each virtual TAB = one websocket carrying the app's 12 RealtimeSync channels
// (src/components/shared/RealtimeSync.tsx). A share of tabs "view" the work-order list and refetch it on every event,
// exactly as useTableRealtime -> invalidateQueries does. Measures: join scale, idle DB polling cost, delivery
// latency / loss / duplicates / cross-org leaks, refetch-storm impact on normal request traffic, reconnect storm.
const { createClient } = require("@supabase/supabase-js");
const { exec } = require("child_process");
const { URL_, ANON, admin, asUser, pct, record } = require("./lib");
const { ensureFreshSessions } = require("./http");

const TABLES = ["requisitions", "purchase_orders", "work_orders", "assets", "vehicles", "parts", "product_items", "projects", "maintenance_requests", "vendors", "pm_schedules", "meter_readings"];
const LEVELS = (process.env.TABS || "60,120,180").split(",").map(Number);
const VIEW_SHARE = Number(process.env.VIEW_SHARE || 0.3);
// Variants of the app's behaviour to compare against what it does today:
//   FILTER=1    subscribe with filter org_id=eq.<org> so Realtime skips the access check for other orgs' subscribers
//   THROTTLE=ms refetch the open list at most once per ms per tab (instead of on every event)
const WAVE = Number(process.env.WAVE || 10); // tabs connecting per second
const FILTER = process.env.FILTER === "1", THROTTLE = Number(process.env.THROTTLE || 0);
const LABEL = `${WAVE !== 10 ? WAVE + " tabs/s arrival, " : ""}${VIEW_SHARE === 0 ? "nobody viewing the list, " : ""}${FILTER ? "org filter" : "no filter (today)"}${THROTTLE ? ", refetch throttled " + THROTTLE + "ms" : ", refetch on every event (today)"}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ms = (a) => (a.length ? `p50=${Math.round(pct(a, 50))} p95=${Math.round(pct(a, 95))} max=${Math.round(Math.max(...a))}ms` : "n/a");

let eventLoopLag = 0; { let last = Date.now(); setInterval(() => { const n = Date.now(); eventLoopLag = Math.max(eventLoopLag, n - last - 50); last = n; }, 50).unref(); }

// Non-blocking: a synchronous shell-out would freeze the event loop (and every websocket) for seconds.
function walStats() {
  return new Promise((resolve) => {
    exec(`npx supabase db query --linked "select coalesce(sum(calls),0)::bigint calls, round(coalesce(sum(total_exec_time),0)::numeric/1000,2) secs from pg_stat_statements where query like 'SELECT wal->>%'" -o json`, { timeout: 60000 }, (err, out) => {
      if (err) return resolve(null);
      try { const r = JSON.parse(out).rows[0]; resolve({ calls: Number(r.calls), secs: Number(r.secs), at: Date.now() }); } catch { resolve(null); }
    });
  });
}
const walDelta = (a, b) => (a && b ? { callsPerSec: ((b.calls - a.calls) / ((b.at - a.at) / 1000)).toFixed(1), dbMsPerSec: (((b.secs - a.secs) * 1000) / ((b.at - a.at) / 1000)).toFixed(0) } : null);

// Normal request traffic running at the same time (what a Realtime burst would squeeze).
async function probe(users, conc, secs) {
  const end = Date.now() + secs * 1000, lat = []; let bad = 0;
  await Promise.all(Array.from({ length: conc }, async () => { while (Date.now() < end) { const x = users[Math.floor(Math.random() * users.length)]; const t = performance.now(); const r = await x.rest.from("work_orders").select("id, org_id, title").order("created_at", { ascending: false }).limit(50); lat.push(performance.now() - t); if (r.error) bad++; } }));
  return { rps: lat.length / secs, lat, bad };
}

function makeTab(i, o, u, token, opts) {
  const tab = { i, orgId: o.id, tag: o.tag, rest: asUser(token), viewing: Math.random() < VIEW_SHARE, joined: 0, errors: [], seen: new Set(), dups: 0, leaks: 0, lat: [], refetch: [], refetching: false, dirty: false, t0: 0, joinMs: null };
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 40 } } });
  c.realtime.setAuth(token); tab.client = c;
  let nextAllowed = 0, timer = null;
  const doRefetch = async () => {
    if (THROTTLE) { const now = Date.now(); if (now < nextAllowed) { if (!timer) timer = setTimeout(() => { timer = null; nextAllowed = Date.now() + THROTTLE; doRefetchNow(); }, nextAllowed - now); return; } nextAllowed = now + THROTTLE; }
    return doRefetchNow();
  };
  const doRefetchNow = async () => {
    if (tab.refetching) { tab.dirty = true; return; }
    tab.refetching = true; do { tab.dirty = false; const t = performance.now(); const r = await tab.rest.from("work_orders").select("*").is("deleted_at", null).order("created_at", { ascending: false }).range(0, 999); tab.refetch.push(performance.now() - t); if (r.error) tab.errors.push("refetch:" + r.error.message); } while (tab.dirty); tab.refetching = false;
  };
  tab.connect = () => {
    tab.t0 = Date.now(); tab.joined = 0; tab.joinMs = null;
    for (const table of TABLES) {
      c.channel(`rt-${i}-${table}-${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", { event: "*", schema: "public", table, ...(FILTER ? { filter: `org_id=eq.${tab.orgId}` } : {}) }, (p) => {
          if (table !== "work_orders") return;
          const n = p.new || {}; if (n.org_id && n.org_id !== tab.orgId) { tab.leaks++; return; }
          const m = /^RT\|(\d+)\|(\d+)/.exec(n.title || ""); if (!m) return;
          if (tab.seen.has(m[1])) tab.dups++; else { tab.seen.add(m[1]); tab.lat.push(Date.now() - Number(m[2])); }
          if (tab.viewing) doRefetch();
        })
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") { if (++tab.joined === TABLES.length) tab.joinMs = Date.now() - tab.t0; }
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") tab.errors.push(`${table}:${status}${err ? ":" + (err.message || err) : ""}`);
        });
    }
  };
  tab.close = async () => { try { await c.removeAllChannels(); c.realtime.disconnect(); } catch {} };
  return tab;
}

(async () => {
  const { fix } = await ensureFreshSessions(2400);
  const sb = admin(), A = fix.orgs[0];
  const probeUsers = fix.orgs.flatMap((o) => o.users.filter((u) => u.role === "admin").map((u) => ({ rest: asUser(u.access_token) })));
  const run = Date.now().toString(36); const tabs = []; let seq = 0;
  const mkTab = (k) => { const o = fix.orgs[k % 3], us = o.users; const u = us[Math.floor(k / 3) % us.length]; return makeTab(k, o, u, u.access_token); };

  // P0 baseline + idle DB polling with NO websockets
  const base = await probe(probeUsers, 60, 10); const w0 = await walStats(); await sleep(20000); const w1 = await walStats();
  const idle0 = walDelta(w0, w1);
  record({ name: "RT0 baseline (0 tabs): normal request traffic + Realtime idle DB cost", pass: true, detail: `${base.rps.toFixed(0)} req/s, ${ms(base.lat)}; Realtime polling with no listeners: ${idle0 ? idle0.callsPerSec + " polls/s, " + idle0.dbMsPerSec + " db-ms/s" : "pg_stat_statements unavailable"}` });

  
  for (const target of LEVELS) {
    // P1: connect up to `target` tabs, gradually (~10 tabs/s, like users arriving)
    const t0 = Date.now(); while (tabs.length < target) { const wave = Math.min(WAVE, target - tabs.length); for (let k = 0; k < wave; k++) { const t = mkTab(tabs.length); tabs.push(t); t.connect(); } await sleep(1000); }
    const deadline = Date.now() + 60000; while (Date.now() < deadline && tabs.some((t) => t.joinMs === null)) await sleep(500);
    const unjoined = tabs.filter((t) => t.joinMs === null).length, errs = tabs.reduce((n, t) => n + t.errors.length, 0);
    record({ name: `[${LABEL}] RT1 ${target} tabs x 12 channels (${target * 12} subscriptions)`, pass: unjoined === 0 && errs === 0, detail: `all subscribed in ${((Date.now() - t0) / 1000).toFixed(1)}s; tabs not fully subscribed=${unjoined}; channel errors=${errs}; per-tab time to 12/12 joined: ${ms(tabs.map((t) => t.joinMs).filter(Boolean))}`, extra: { sampleErrors: [...new Set(tabs.flatMap((t) => t.errors))].slice(0, 4) } });
    // P2: idle polling cost with this many listeners
    const a = await walStats(); await sleep(20000); const b = await walStats(); const idle = walDelta(a, b);
    record({ name: `RT2 idle cost with ${target} tabs connected, no writes`, pass: true, detail: idle ? `${idle.callsPerSec} polls/s, ${idle.dbMsPerSec} db-ms/s of database time (0 tabs was ${idle0 ? idle0.callsPerSec + " polls/s, " + idle0.dbMsPerSec + " db-ms/s" : "n/a"})` : "pg_stat_statements unavailable" });
  }

  const liveness = async (tabList, title) => {
    const aTabs = tabList.filter((t) => t.orgId === A.id); let dead = aTabs, deadFirst = 0;
    for (let attempt = 1; attempt <= 3 && dead.length; attempt++) {
      const n = ++seq; for (const t of aTabs) t.seen.delete(String(n));
      await sb.from("work_orders").insert({ org_id: A.id, work_order_number: `RTL-${run}-${n}`, title: `RT|${n}|${Date.now()}` });
      await sleep(10000); dead = aTabs.filter((t) => !t.seen.has(String(n)));
      if (attempt === 1) deadFirst = dead.length;
    }
    record({ name: `[${LABEL}] ${title}: do all ${aTabs.length} same-org tabs receive a change?`, pass: dead.length === 0 && deadFirst === 0, detail: `tabs that got nothing within 10s on the first probe=${deadFirst}; still dead after 3 probes=${dead.length}`, extra: { deadTabs: dead.slice(0, 5).map((t) => ({ tab: t.i, joined: t.joined, errors: t.errors.slice(0, 2) })) } });
    return dead.length;
  };
  await liveness(tabs, "RT1b liveness right after connecting");
  // P3/P4: change fan-out at two write rates, with normal traffic probing alongside
  for (const W of (process.env.RATES || "5,20").split(",").map(Number)) {
    const D = 20; for (const t of tabs) { t.seen.clear(); t.lat = []; t.refetch = []; t.dups = 0; t.leaks = 0; }
    const sent = []; const writers = []; const wa = await walStats(); eventLoopLag = 0; const end = Date.now() + D * 1000;
    const pr = probe(probeUsers, 60, D);
    await new Promise((resolve) => { const iv = setInterval(() => { if (Date.now() >= end) { clearInterval(iv); resolve(); return; } const n = ++seq; sent.push(n); writers.push(sb.from("work_orders").insert({ org_id: A.id, work_order_number: `RTW-${run}-${n}`, title: `RT|${n}|${Date.now()}` }).then((r) => r.error && console.error("write err", r.error.message))); }, 1000 / W); });
    await Promise.all(writers); const loaded = await pr; const lagDuring = eventLoopLag; await sleep(8000); const wb = await walStats();
    const aTabs = tabs.filter((t) => t.orgId === A.id), others = tabs.filter((t) => t.orgId !== A.id);
    const expected = sent.length * aTabs.length, got = aTabs.reduce((n, t) => n + t.seen.size, 0), dups = tabs.reduce((n, t) => n + t.dups, 0), leaks = tabs.reduce((n, t) => n + t.leaks, 0), foreignGot = others.reduce((n, t) => n + t.seen.size, 0);
    const lat = aTabs.flatMap((t) => t.lat), refs = tabs.flatMap((t) => t.refetch), viewing = aTabs.filter((t) => t.viewing).length, wdelta = walDelta(wa, wb);
    record({ name: `[${LABEL}] RT3 ${W} work-order changes/s for ${D}s -> ${aTabs.length} same-org tabs (${tabs.length} tabs total, ${Math.round(VIEW_SHARE * 100)}% viewing the list)`,
      pass: got === expected && dups === 0 && leaks === 0 && foreignGot === 0 && loaded.bad === 0,
      detail: `delivered ${got}/${expected} (${expected ? (100 * got / expected).toFixed(1) : 0}%), duplicates=${dups}, CROSS-ORG events received=${leaks + foreignGot}; delivery latency (incl. the insert round trip) ${ms(lat)}; list refetches triggered=${refs.length} (${viewing} tabs viewing) ${ms(refs)}; normal traffic during the burst: ${loaded.rps.toFixed(0)} req/s ${ms(loaded.lat)} vs baseline ${base.rps.toFixed(0)} req/s ${ms(base.lat)}; harness event-loop lag max ${lagDuring}ms during the burst${wdelta ? "; Realtime db cost " + wdelta.dbMsPerSec + " db-ms/s" : ""}`,
      extra: { socketErrors: [...new Set(tabs.flatMap((t) => t.errors))].slice(0, 5) } });
  }

  if (process.env.SKIP_STORM === "1") { await Promise.all(tabs.map((t) => t.close())); process.exit(0); }
  // P5: reconnect storm: every tab drops and rejoins at the same instant (deploy, wifi blip, laptop wake)
  const n = tabs.length; await Promise.all(tabs.map((t) => t.close())); await sleep(1500);
  const rebuilt = tabs.map((t, k) => { const x = mkTab(k); x.errors = []; return x; }); const t1 = Date.now(); rebuilt.forEach((t) => t.connect());
  const dl = Date.now() + 90000; while (Date.now() < dl && rebuilt.some((t) => t.joinMs === null)) await sleep(500);
  const stuck = rebuilt.filter((t) => t.joinMs === null).length;
  record({ name: `RT4 reconnect storm: ${n} tabs (${n * 12} subscriptions) rejoin at once`, pass: stuck === 0, detail: `all rejoined in ${((Date.now() - t1) / 1000).toFixed(1)}s; tabs still not fully subscribed after 90s=${stuck}; per-tab join ${ms(rebuilt.map((t) => t.joinMs).filter(Boolean))}; channel errors=${rebuilt.reduce((m, t) => m + t.errors.length, 0)}`, extra: { sampleErrors: [...new Set(rebuilt.flatMap((t) => t.errors))].slice(0, 4) } });
  await sleep(5000); await liveness(rebuilt, "RT4b liveness after the reconnect storm");
  await Promise.all(rebuilt.map((t) => t.close())); process.exit(0);
})().catch((e) => { console.error("RT CRASH", e); process.exit(1); });

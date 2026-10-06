// Dark-mode audit harness — dev tool, not shipped.
//
// Checks a page in dark mode without screenshots (useful when the Browser pane
// is hidden): contrast of every visible text node against its effective
// background, opaque bright "light islands", bright borders, small form
// controls with a light background.
//
// Usage: copy this file to public/__dm_audit.js (do NOT commit it there), then
// in the page console / javascript_tool:
//   await fetch('/__dm_audit.js').then(r => r.text()).then(t => (0, eval)(t));
//   await window.__dmGo('/crm/clients');      // client-side nav (see below)
//   await window.__dmC();                     // page + first New dialog + first row
//   await window.__dmTabs();                  // click every [role=tab] and audit
//   await window.__dmSweep(routes);           // resumable, time-boxed route sweep
//
// Notes:
// - __dmGo uses window.next.router.push after patching requestAnimationFrame:
//   a hidden pane never fires rAF, which stalls streamed Suspense on hard loads.
// - Radix tabs activate on mousedown, not click (__dmTabs dispatches both).
// - After heavy HMR, client navigation can leave the base CSS layer stale:
//   white 2px "outset" button borders are that artifact — hard-reload to confirm.
// - Light mode needs no audit: the codemod is additive (see scripts/dark-mode-codemod.mjs).
window.__dmAudit = function (opts) {
  opts = opts || {};
  var BASE = { r: 18, g: 18, b: 18 };
  function parse(s) {
    var m = s && s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  }
  function lum(c) {
    function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function over(top, bottom) {
    var a = top.a;
    return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
  }
  function effBg(el) {
    var layers = [];
    for (var e = el; e; e = e.parentElement) {
      var cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== "none" && /gradient|url/.test(cs.backgroundImage)) return null;
      var c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
    }
    var acc = BASE;
    for (var i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return acc;
  }
  function contrast(a, b) {
    var l1 = lum(a), l2 = lum(b);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function desc(el) {
    var cls = (el.getAttribute("class") || "").split(/\s+/).filter(function (c) { return /^(text|bg|border)-|^dark:/.test(c); }).slice(0, 5).join(" ");
    return el.tagName.toLowerCase() + (cls ? "." + cls : "");
  }
  var root = opts.root ? document.querySelector(opts.root) : document.body;
  var low = {}, islands = {}, nText = 0;
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  var el;
  while ((el = walker.nextNode())) {
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    var cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue;
    if (/^(SCRIPT|STYLE|SVG|PATH|IMG|CANVAS|IFRAME|NEXTJS-PORTAL)$/i.test(el.tagName)) continue;
    // light islands: big, opaque, bright background
    var bg = parse(cs.backgroundColor);
    if (bg && bg.a >= 0.95 && (rect.width * rect.height > 3000 || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName)) && lum(bg) > 0.55 && !el.closest("[data-dm-ignore]") && !(el.tagName === "INPUT" && /^(checkbox|radio|range|color)$/.test(el.type))) {
      var k = desc(el) + " bg=" + [bg.r, bg.g, bg.b].join(",");
      if (!islands[k]) islands[k] = { n: 0, ex: (el.innerText || "").trim().slice(0, 40) };
      islands[k].n++;
    }
    var bc = parse(cs.borderTopColor);
    if (bc && bc.a > 0.5 && parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none" && lum(bc) > 0.45 && rect.width * rect.height > 400) {
      var kb = "border " + desc(el) + " c=" + [bc.r, bc.g, bc.b].join(",");
      if (!islands[kb]) islands[kb] = { n: 0, ex: (el.innerText || "").trim().slice(0, 30) };
      islands[kb].n++;
    }
    // direct text
    var hasText = false;
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.textContent.trim().length > 0) { hasText = true; break; }
    }
    if (!hasText) continue;
    if (el.closest("[data-dm-ignore]")) continue;
    var fg = parse(cs.color);
    if (!fg) continue;
    var b = effBg(el);
    if (!b) continue;
    if (Math.round(b.r) === 96 && Math.round(b.g) === 171 && Math.round(b.b) === 69 && fg.r > 250) continue;
    if (fg.r > 245 && fg.g > 245 && fg.b > 245 && Math.max(b.r, b.g, b.b) - Math.min(b.r, b.g, b.b) > 60) continue;
    nText++;
    var fgc = fg.a < 1 ? over(fg, b) : fg;
    var cr = contrast(fgc, b);
    var thresh = parseFloat(cs.fontSize) >= 18 ? 2.5 : 3;
    if (cr < thresh) {
      var key = desc(el) + " fg=" + [Math.round(fgc.r), Math.round(fgc.g), Math.round(fgc.b)].join(",") + " bg=" + [Math.round(b.r), Math.round(b.g), Math.round(b.b)].join(",");
      if (!low[key]) low[key] = { n: 0, cr: Math.round(cr * 10) / 10, ex: el.textContent.trim().slice(0, 40) };
      low[key].n++;
    }
  }
  function top(o, n) {
    return Object.keys(o).map(function (k) { return [k, o[k]]; }).sort(function (a, b) { return b[1].n - a[1].n; }).slice(0, n)
      .map(function (e) { return e[1].n + "x " + e[0] + " | cr=" + (e[1].cr || "-") + " | \"" + e[1].ex + "\""; });
  }
  return { path: location.pathname, theme: document.documentElement.className, texts: nText, lowContrast: top(low, opts.n || 14), lightIslands: top(islands, opts.n || 10) };
};
window.__dmRun = async function (opts) {
  opts = opts || {};
  var t0 = Date.now(), same = 0, last = -1;
  while (Date.now() - t0 < (opts.timeout || 24000)) {
    await new Promise(function (r) { setTimeout(r, 1000); });
    var len = document.body.innerText.length + document.querySelectorAll("tbody tr, [role=row], li").length;
    var busy = document.querySelectorAll(".animate-pulse").length > 0 || /Loading\.\.\./.test(document.body.innerText);
    if (len === last && !busy) same++; else same = 0;
    last = len;
    if (same >= 4 && Date.now() - t0 >= 6000) break;
  }
  var out = window.__dmAudit(opts);
  out.waitedMs = Date.now() - t0; out.chars = document.body.innerText.length; out.skeletons = document.querySelectorAll(".animate-pulse").length;
  return out;
};
window.__dmFull = async function (opts) {
  opts = opts || {};
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var esc = function () { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true })); };
  var res = { page: await window.__dmRun({ timeout: opts.timeout || 24000, n: 10 }) };
  var main = document.querySelector("main") || document.body;
  var btn = Array.prototype.slice.call(document.querySelectorAll("button")).find(function (b) {
    return /^\+?\s*(New|Add|Create)\b/i.test(b.innerText.trim()) && !b.closest("header") && !b.closest("nav") && !b.closest("aside") && !b.disabled;
  });
  if (btn) {
    btn.click(); await sleep(2200);
    var a = window.__dmAudit({ n: 8 });
    res.dialog = { opened: (document.querySelector("[role=dialog]") ? "dialog" : "none"), lowContrast: a.lowContrast, lightIslands: a.lightIslands };
    esc(); await sleep(600); esc(); await sleep(400);
  } else res.dialog = "no New/Add button";
  var cell = Array.prototype.slice.call(document.querySelectorAll("tbody tr")).filter(function (r) { return r.innerText.trim().length > 12; })[0];
  if (cell) {
    var tds = cell.querySelectorAll("td"); (tds[Math.min(2, tds.length - 1)] || cell).click(); await sleep(2800);
    var b = window.__dmAudit({ n: 8 });
    res.row = { dialogOpen: !!document.querySelector("[role=dialog]"), path: location.pathname, lowContrast: b.lowContrast, lightIslands: b.lightIslands };
  } else res.row = "no table rows";
  return res;
};
window.__dmGo = async function (path) {
  // The hidden Browser pane never fires rAF, which stalls streamed Suspense
  // reveals on hard loads. Client-side navigation avoids that path.
  window.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(performance.now()); }, 16); };
  var t0 = Date.now();
  if (location.pathname !== path) window.next.router.push(path);
  while (location.pathname !== path && Date.now() - t0 < 36000) await new Promise(function (r) { setTimeout(r, 500); });
  return { path: location.pathname, ms: Date.now() - t0 };
};
window.__dmTabs = async function (opts) {
  opts = opts || {};
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[role=tab]")).filter(function (t) { return t.offsetParent !== null; });
  var out = {};
  for (var i = 0; i < tabs.length && i < (opts.max || 12); i++) {
    var label = tabs[i].innerText.trim().slice(0, 24) || ("tab" + i);
    try { tabs[i].dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); tabs[i].click(); } catch (e) {}
    await sleep(opts.wait || 1800);
    var a = window.__dmAudit({ n: 6 });
    if (a.lowContrast.length || a.lightIslands.length) out[label] = { low: a.lowContrast, islands: a.lightIslands };
    else out[label] = "ok(" + a.texts + ")";
  }
  return out;
};
window.__dmC = async function (opts) {
  var r = await window.__dmFull(opts);
  function flat(x) {
    if (!x || typeof x === "string") return x || "-";
    var low = (x.lowContrast || []).slice(0, 5), isl = (x.lightIslands || []).slice(0, 4);
    if (!low.length && !isl.length) return "ok";
    return { low: low, islands: isl };
  }
  return { path: r.page.path, texts: r.page.texts, sk: r.page.skeletons, page: flat(r.page), dialog: flat(r.dialog), row: flat(r.row) };
};
window.__dmItem = async function (opts) {
  opts = opts || {};
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var main = document.querySelector("main") || document.body;
  var cands = Array.prototype.slice.call(main.querySelectorAll("[class*=cursor-pointer], li, [role=button]")).filter(function (e) {
    return e.offsetParent !== null && e.innerText && e.innerText.trim().length > 6 && e.innerText.trim().length < 400 && !e.closest("thead") && !e.closest("header") && !e.closest("nav") && e.getBoundingClientRect().width > 120;
  });
  if (!cands.length) return "no list items";
  cands[0].click(); await sleep(opts.wait || 3500);
  var a = window.__dmAudit({ n: 10 });
  var out = { clicked: cands[0].innerText.trim().slice(0, 30).replace(/\n/g, " "), texts: a.texts, low: a.lowContrast, islands: a.lightIslands };
  if (opts.tabs !== false) out.tabs = await window.__dmTabs({ wait: 1700, max: 9 });
  return out;
};
window.__dmSweep = async function (routes) {
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  window.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(performance.now()); }, 16); };
  window.__sw = window.__sw || { i: 0, out: {}, ok: 0 };
  var t0 = Date.now();
  while (window.__sw.i < routes.length && Date.now() - t0 < 30000) {
    var r = routes[window.__sw.i];
    if (location.pathname !== r) window.next.router.push(r);
    for (var k = 0; k < 24 && location.pathname !== r; k++) await sleep(500);
    await sleep(3200);
    var a = window.__dmAudit({ n: 4 });
    var bad = location.pathname !== r ? "NAV-FAILED(" + location.pathname + ")" : null;
    if (bad || a.lowContrast.length || a.lightIslands.length) window.__sw.out[r] = bad || { low: a.lowContrast, isl: a.lightIslands, texts: a.texts };
    else window.__sw.ok++;
    window.__sw.i++;
  }
  return { done: window.__sw.i, of: routes.length, ok: window.__sw.ok, issues: window.__sw.out };
};
'__dm_audit loaded';

// ==UserScript==
// @name         Universal Price Converter to PLN
// @namespace    https://github.com/theVersu/hmm
// @version      1.2.2
// @description  Shows prices converted to Polish zloty (PLN) next to the original price. Any currency (symbol or code), enabled per website, live exchange rates.
// @author       Claude
// @license      MIT
// @homepageURL  https://github.com/theVersu/hmm
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Universal-Price-Converter-PLN.user.js
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Universal-Price-Converter-PLN.user.js
// @match        *://*/*
// @noframes
// @run-at       document-idle
// @connect      open.er-api.com
// @connect      api.nbp.pl
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

/*
 * Rates: open.er-api.com (free, ~160 currencies, daily) with the National Bank of Poland (api.nbp.pl) as fallback.
 * Rates are cached for a few hours and only fetched on websites where the script is switched on.
 */
(() => {
  'use strict';

  /* ─────────────────────────── Config ─────────────────────────── */

  // Websites enabled on the very first run (afterwards the list lives in storage and is edited via the menu).
  const DEFAULT_SITES = ['jaststore.com', 'denpasoft.com', 'mangagamer.com', 'dlsite.com', 'asmr.one'];
  const RATES_TTL = 6 * 3600e3;
  const ATTR = 'data-pln';

  // Websites that already show their own PLN price: the converted prices go on their own line UNDER the price row.
  const LINE_SITES = ['denpasoft.com'];

  // Extra CSS for specific websites (only injected there).
  const SITE_CSS = {
    // Fixed-width price tags on the list pages: let them grow so the converted price fits at the same size as the price.
    'mangagamer.com':
      'html body main a.product>p{width:auto!important;min-width:4rem;white-space:nowrap}' +
      'html body main a.product>p>span[data-pln]{display:block;width:max-content;margin:.1em auto 0;font-size:1em}',
    // Search dropdown: converted price right under the price, right-aligned (fits inside the thumbnail-high entry).
    'denpasoft.com':
      '#dp-search-listbox span[data-pln]{display:block;width:max-content;margin:.15em 0 0 auto}',
  };

  // Symbol / text marker -> ISO code. "$" and "¥" are ambiguous, change them here if you need (e.g. '¥': 'CNY').
  const SYMBOLS = {
    '$': 'USD', 'US$': 'USD', 'CA$': 'CAD', 'C$': 'CAD', 'AU$': 'AUD', 'A$': 'AUD', 'NZ$': 'NZD', 'HK$': 'HKD',
    'S$': 'SGD', 'NT$': 'TWD', 'R$': 'BRL', 'MX$': 'MXN',
    '€': 'EUR', '£': 'GBP', '¥': 'JPY', '￥': 'JPY', 'JP¥': 'JPY', '円': 'JPY', 'CN¥': 'CNY', '元': 'CNY', 'RMB': 'CNY',
    '₩': 'KRW', '₹': 'INR', '₽': 'RUB', '₺': 'TRY', '₴': 'UAH', '₪': 'ILS', '฿': 'THB', '₫': 'VND', '₱': 'PHP',
    'Rp': 'IDR', 'Kč': 'CZK', 'zł': 'PLN',
  };
  // ISO codes that are also normal words / abbreviations -> never matched as text codes.
  const NOT_CODES = new Set(['ALL', 'TOP', 'TRY', 'MAD', 'GEL', 'PEN', 'SOS', 'BTN', 'CUP']);
  const SKIP = ['script', 'style', 'noscript', 'textarea', 'select', 'option', 'svg', 'math', 'canvas',
    'iframe', 'template', 'head', 'title', 'code', 'pre', 'input'];
  const SKIP_SEL = SKIP.join(',') + `,[${ATTR}]`;

  // Badge look (same everywhere). The attribute holds tokens: old (crossed-out price), dark/light (page theme).
  const CSS =
    `span[${ATTR}]{display:inline-block;margin-left:.4em;padding:0 .4em;border-radius:4px;font:inherit;font-size:clamp(12px,.85em,15px);` +
    `font-weight:600;font-style:normal;line-height:1.4;letter-spacing:0;white-space:nowrap;text-decoration:none;cursor:help}` +
    `span[${ATTR}~=dark]{color:#7ef0ad;background:rgba(80,220,140,.14)}` +
    `span[${ATTR}~=light]{color:#0b6b36;background:rgba(20,140,70,.12)}` +
    `span[${ATTR}~=old]{text-decoration:line-through;opacity:.65}` +
    `div[${ATTR}]{display:flex;flex-wrap:wrap;gap:.2em .4em;margin-top:.2em}` +
    `div[${ATTR}] span[${ATTR}]{margin-left:0}`;

  /* ─────────────────────────── State ─────────────────────────── */

  const host = location.hostname.replace(/^www\./, '').toLowerCase();
  let sites = [...GM_getValue('sites', DEFAULT_SITES)];
  const covers = s => host === s || host.endsWith('.' + s);
  const isOn = () => sites.some(covers);
  const saveSites = () => { sites = [...new Set(sites)].sort(); GM_setValue('sites', sites); };
  const lineSite = LINE_SITES.some(covers);

  let rates = null;                    // { src, date, r: { CODE: PLN per 1 unit } }
  let RE, RE1, ONLY;                   // compiled once rates are known
  let active = false, gen = 0, mo = null, timer = 0, styleEl = null;
  const badges = new Set();            // every badge we placed; cleaned up when the price it belongs to disappears
  let lines = new WeakMap();           // price row -> line with converted prices below it
  const lineRows = new Set();
  const stacked = new Map();           // price groups we switched to a vertical layout (restored on switch-off)
  const srcOf = new WeakMap();         // badge -> the price text node / element it belongs to
  const isBadge = n => !!n && n.nodeType === 1 && n.localName === 'span' && n.hasAttribute(ATTR);
  const queue = new Set();
  const fmt = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });

  /* ─────────────────────────── Exchange rates ─────────────────────────── */

  const getJSON = url => new Promise((ok, fail) => GM_xmlhttpRequest({
    url, timeout: 10000,
    onload: r => { try { ok(JSON.parse(r.responseText)); } catch (e) { fail(e); } },
    onerror: fail, ontimeout: fail,
  }));

  async function fetchRates() {
    try {
      const d = await getJSON('https://open.er-api.com/v6/latest/PLN');
      if (d.result === 'success') {
        const r = {};
        for (const c in d.rates) if (d.rates[c] > 0) r[c] = 1 / d.rates[c];   // PLN per 1 unit
        return { src: 'open.er-api.com', date: new Date(d.time_last_update_unix * 1000).toISOString().slice(0, 10), r };
      }
    } catch (e) { /* fall through to NBP */ }
    const t = (await getJSON('https://api.nbp.pl/api/exchangerates/tables/A/?format=json'))[0];
    const r = { PLN: 1 };
    for (const x of t.rates) r[x.code] = x.mid;
    return { src: 'NBP', date: t.effectiveDate, r };
  }

  async function loadRates() {
    let c = GM_getValue('rates');
    if (!c || Date.now() - c.t > RATES_TTL) {
      try { c = { ...(await fetchRates()), t: Date.now() }; GM_setValue('rates', c); } catch (e) { /* keep stale cache */ }
    }
    return c;
  }

  /* ─────────────────────────── Price detection ─────────────────────────── */

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function compile(r) {
    const syms = Object.keys(SYMBOLS).sort((a, b) => b.length - a.length).map(esc).join('|');
    const codes = Object.keys(r).filter(c => !NOT_CODES.has(c)).join('|');
    const CUR = `${syms}|${codes}`;
    const NUM = '\\d{1,3}(?:[,.\\u00A0\\u202F\\u2009]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?';
    // 1) currency before number  ($12.99, USD 12.99, $12.99 USD)   2) number before currency (12.99 USD, 1,980円)
    const src =
      `(?<![A-Za-z])(?<c1>${CUR})[ \\u00A0]?(?<n1>${NUM})(?:[ \\u00A0]?(?<c3>${codes})(?![A-Za-z]))?` +
      `|(?<![\\d.,])(?<!\\$[^\\s$]*)(?<n2>${NUM})[ \\u00A0]?(?<c2>${CUR})(?![A-Za-z\\d])`;   // not inside $tag:15$ style tokens
    RE = new RegExp(src, 'g');
    RE1 = new RegExp(src);
    ONLY = new RegExp(`^\\s*(?:${CUR})\\s*$`);
  }

  // "1,234.56" / "1.234,56" / "1 234,56" / "1,980" / "12,5" -> number
  function num(s) {
    s = s.replace(/[\u00A0\u202F\u2009]/g, '');
    const i = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    if (i < 0) return +s;
    // exactly 3 digits after the last separator = thousands separator, otherwise decimals
    return s.length - i - 1 === 3
      ? +s.replace(/[.,]/g, '')
      : +(s.slice(0, i).replace(/[.,]/g, '') + '.' + s.slice(i + 1));
  }

  function convert(g) {
    const tok = g.c1 || g.c2;
    const code = g.c3 || SYMBOLS[tok] || tok;
    const rate = rates.r[code];
    if (!rate || code === 'PLN') return null;
    const pln = num(g.n1 || g.n2) * rate;
    return pln > 0 && isFinite(pln) ? { code, rate, pln } : null;
  }

  /* ─────────────────────────── Badge look ─────────────────────────── */

  // Is the text inside `el` really drawn with a line through it? Decorations propagate down the tree,
  // but not into inline-blocks, floats or absolutely positioned boxes, so the walk stops at those.
  function crossed(el) {
    for (let i = 0; el && i < 10; i++, el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.textDecorationLine.includes('line-through')) return true;
      if (cs.display.startsWith('inline-') || cs.cssFloat !== 'none' || /^(absolute|fixed)$/.test(cs.position)) return false;
    }
    return false;
  }

  const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

  // Is the area behind this text dark? First visible background up the tree, otherwise guess from the text colour.
  function darkBehind(el) {
    for (let a = el, i = 0; a && i < 15; a = a.parentElement, i++) {
      const m = getComputedStyle(a).backgroundColor.match(/[\d.]+/g);
      if (m && (m[3] === undefined || +m[3] > 0.5)) return lum(m.map(Number)) < 140;
    }
    const t = (getComputedStyle(el).color.match(/[\d.]+/g) || []).map(Number);
    return !(lum(t) < 140);                                 // light text => dark page; unknown => assume dark page
  }

  const tokens = el => `${crossed(el) ? 'old ' : ''}${darkBehind(el) ? 'dark' : 'light'}`;

  function badge(c, tok, src) {
    const b = document.createElement('span');
    b.setAttribute(ATTR, tok);
    b.textContent = '≈ ' + fmt.format(c.pln);
    b.title = `1 ${c.code} = ${c.rate.toPrecision(5)} PLN (${rates.src}, ${rates.date})`;
    srcOf.set(b, src);
    badges.add(b);
    return b;
  }

  // Remove badges whose price was re-rendered / replaced (page translators, SPA updates) and empty lines.
  function cleanup() {
    for (const b of badges) {
      const s = srcOf.get(b);
      if (!b.isConnected) badges.delete(b);
      else if (s && !s.isConnected) { b.remove(); badges.delete(b); }
    }
    for (const r of lineRows) {
      const l = lines.get(r);
      if (!r.isConnected || !l || !l.firstChild) { if (l) l.remove(); lines.delete(r); lineRows.delete(r); }
    }
  }

  // Element a price text belongs to, looking through <font> wrappers that page translators add.
  function priceEl(node) {
    let el = node.parentElement;
    while (el && el.localName === 'font') el = el.parentElement;
    return el;
  }

  /* ─────────────────────────── Placement ─────────────────────────── */

  // LINE_SITES only: the flex row holding the prices (old / current / the site's own PLN price) of `el`.
  // Its converted prices get their own line under the row. If the row sits beside other content in a horizontal flex box
  // (e.g. bundle list), the old/current prices are stacked vertically instead and the badges stay beside each price.
  function lineRow(el) {
    if (!lineSite || el.closest('#dp-search-listbox')) return null;   // search dropdown: badge goes beside the price instead
    const row = el.parentElement;
    if (!row || !/flex/.test(getComputedStyle(row).display)) return null;
    const p = row.parentElement && getComputedStyle(row.parentElement);
    if (p && /flex/.test(p.display) && p.flexDirection.startsWith('row')) {
      if (!stacked.has(row)) {
        stacked.set(row, [row.style.flexDirection, row.style.alignItems]);
        row.style.flexDirection = 'column';
        row.style.alignItems = 'flex-end';
      }
      return null;
    }
    return row;
  }

  // Drop badges of this price from an earlier pass (the site re-rendered it) and of prices that no longer exist.
  function purge(row, src) {
    const line = lines.get(row);
    if (line) for (const x of [...line.children]) {
      const s = srcOf.get(x);
      if (!s || s === src || !s.isConnected) { x.remove(); badges.delete(x); }
    }
  }

  function addToLine(row, b, src) {
    let line = lines.get(row);
    if (!line || !line.isConnected) {
      line = document.createElement('div');
      line.setAttribute(ATTR, 'line');
      row.after(line);
      lines.set(row, line);
      lineRows.add(row);
    }
    srcOf.set(b, src);
    // keep document order: old price before current price
    const next = [...line.children].find(x => src.compareDocumentPosition(srcOf.get(x)) & 4);
    line.insertBefore(b, next || null);
  }

  // Price fully inside one text node (possibly several prices).
  function inject(node, hits) {
    const el = priceEl(node);
    if (!el) return;
    const row = lineRow(el);
    if (row) {                                                // line mode: re-adding replaces this price's badges
      const tok = tokens(el);
      purge(row, el);
      for (const { c } of hits) addToLine(row, badge(c, tok, el), el);
      return;
    }
    const nx = node.nextSibling;
    if (isBadge(nx)) {
      if (srcOf.get(nx) === node) return;                     // this price already has its badge
      nx.remove(); badges.delete(nx);                         // leftover badge of an older version of this text
    }
    const tok = tokens(el), made = [];
    for (let i = hits.length - 1; i >= 0; i--) {              // back to front so indexes stay valid
      const { m, c } = hits[i], end = m.index + m[0].length;
      const ref = end < node.length ? node.splitText(end) : node.nextSibling;
      const b = badge(c, tok, node);
      node.parentNode.insertBefore(b, ref);
      made.push(b);
    }
    for (const b of made) srcOf.set(b, b.previousSibling);    // the text piece that ends right before each badge
  }

  // Price split over several elements, e.g. <span>1,980</span><span>JPY</span> or <b>$</b><i>12.99</i>.
  function injectSplit(node) {
    let el = priceEl(node);
    for (let i = 0; el && i < 3; i++, el = el.parentElement) {
      const t = el.textContent.trim();
      if (t.length > 40) return;
      const m = RE1.exec(t);
      if (m && m[0].length === t.length) {
        const c = convert(m.groups);
        if (!c) return;
        const row = lineRow(el);
        if (row) { purge(row, el); addToLine(row, badge(c, tokens(el), el), el); return; }
        const had = isBadge(el.nextSibling) ? el.nextSibling : isBadge(el.lastChild) ? el.lastChild : null;
        if (had) {
          if (srcOf.get(had) === el) return;                    // already has its badge
          had.remove(); badges.delete(had);
        }
        const b = badge(c, tokens(el), el);
        /^inline/.test(getComputedStyle(el).display) ? el.after(b) : el.append(b);
        return;
      }
    }
  }

  function handleText(node) {
    const t = node.nodeValue;
    if (t.length > 600 || /^[\d\s.,:/-]*$/.test(t)) return;    // nothing to see (empty, whitespace, plain numbers)
    if (/\d/.test(t)) {
      const hits = [];
      for (const m of t.matchAll(RE)) { const c = convert(m.groups); if (c) hits.push({ m, c }); }
      if (hits.length) inject(node, hits);
    } else if (t.length < 20 && ONLY.test(t)) {
      injectSplit(node);
    }
  }

  function scan(root) {
    if (root.nodeType === 3) {
      const p = root.parentElement;
      if (p && !p.closest(SKIP_SEL)) handleText(root);
      return;
    }
    if (root.nodeType !== 1 || root.closest(SKIP_SEL)) return;
    const w = document.createTreeWalker(root, 5, {              // 5 = elements + text
      acceptNode: n => n.nodeType === 3 ? 1 : n.matches(SKIP_SEL) ? 2 : 3,
    });
    const nodes = [];
    for (let n; (n = w.nextNode());) nodes.push(n);             // collect first, DOM is modified while handling
    nodes.forEach(handleText);
  }

  /* ─────────────────────────── Live updates ─────────────────────────── */

  // Our stylesheet lives in <head>. Sites that navigate without a reload (denpasoft) replace the head contents and
  // throw it away, which left the badges unstyled until a refresh -> put it back whenever it disappears.
  function ensureStyle() {
    if (styleEl && styleEl.isConnected) return;
    const css = CSS + Object.entries(SITE_CSS).filter(([h]) => covers(h)).map(([, c]) => c).join('');
    styleEl = GM_addStyle(css) || { isConnected: true, remove() {} };
  }

  function onMut(recs) {
    ensureStyle();
    for (const r of recs) {
      if (r.type === 'characterData') {                         // site rewrote a text node -> drop its stale badge, rescan
        const n = r.target, nx = n.nextSibling;
        if (isBadge(nx) && srcOf.get(nx) === n) { nx.remove(); badges.delete(nx); }
        queue.add(n);
      } else {
        for (const a of r.addedNodes) if (a.nodeType === 3 || (a.nodeType === 1 && !a.hasAttribute(ATTR))) queue.add(a);
      }
    }
    if (queue.size && !timer) timer = setTimeout(flush, 200);
  }

  function flush() {
    timer = 0;
    if (!mo) return;
    cleanup();                                                  // drop badges of prices the page replaced, before re-adding
    const items = [...queue];
    queue.clear();
    for (const n of items) if (n.isConnected) scan(n);
    mo.takeRecords();                                           // ignore the changes we just made ourselves
  }

  async function start() {
    if (active) return;
    active = true;
    const g = ++gen;
    const c = await loadRates();
    if (g !== gen) return;                                      // switched off while loading
    if (!c) { active = false; console.warn('[Price Converter] exchange rates unavailable'); return; }
    rates = c;
    compile(c.r);
    ensureStyle();
    scan(document.body);
    mo = new MutationObserver(onMut);
    // Observe the whole document, not just <body>: some sites (e.g. denpasoft) swap the <body> when you
    // navigate without a full reload, which would leave an observer on the old body watching nothing.
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  function stop() {
    if (!active) return;
    active = false; gen++;
    if (mo) mo.disconnect();
    mo = null;
    clearTimeout(timer); timer = 0; queue.clear();
    document.querySelectorAll(`[${ATTR}]`).forEach(e => e.remove());
    stacked.forEach(([d, a], row) => { row.style.flexDirection = d; row.style.alignItems = a; });
    stacked.clear(); lineRows.clear();
    if (styleEl) styleEl.remove();
    styleEl = null;
    badges.clear();
    lines = new WeakMap();
  }

  /* ─────────────────────────── Menu + website manager ─────────────────────────── */

  let menuIds = [], renderPanel = null;

  function sync() {
    menu();
    isOn() ? start() : stop();
    if (renderPanel) renderPanel();
  }

  function toggle() {
    sites = isOn() ? sites.filter(s => !covers(s)) : [...sites, host];
    saveSites();
    sync();
  }

  function menu() {
    menuIds.forEach(id => GM_unregisterMenuCommand(id));
    const on = isOn();
    menuIds = [
      GM_registerMenuCommand(`${on ? '🟢 ON' : '🔴 OFF'} for ${host} – click to turn ${on ? 'off' : 'on'}`, toggle),
      GM_registerMenuCommand('⚙️ Price converter: manage websites', openPanel),
    ];
  }

  function normalize(s) {
    s = s.trim();
    try {
      const h = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(s) ? s : 'http://' + s).hostname.toLowerCase().replace(/^www\./, '');
      return h.includes('.') ? h : '';
    } catch (e) { return ''; }
  }

  const h = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };

  const PANEL_CSS = `
    *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    .bg{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px}
    .card{width:min(100%,440px);max-height:90vh;overflow:auto;background:#fff;color:#1b1b1f;border-radius:14px;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.4)}
    @media(prefers-color-scheme:dark){.card{background:#1f2024;color:#eee}}
    h2{margin:0 0 12px;font-size:18px}
    h3{margin:16px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;opacity:.7}
    button{font-size:15px;border:0;border-radius:10px;padding:10px 14px;min-height:44px;cursor:pointer;color:#fff}
    .tog{width:100%;font-weight:600;text-align:left}.tog.on{background:#1f9d55}.tog.off{background:#d64545}
    ul{list-style:none;margin:0;padding:0}
    li{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid rgba(128,128,128,.25);word-break:break-all}
    li.empty{opacity:.6;border:0}
    .rm{background:transparent;color:#d64545;min-height:36px;padding:4px 12px;font-size:16px}
    .row{display:flex;gap:8px;margin-top:10px}
    input{flex:1;min-width:0;font-size:16px;padding:10px;border-radius:10px;border:1px solid rgba(128,128,128,.5);background:transparent;color:inherit}
    input.bad{border-color:#d64545}
    .add{background:#2563eb}
    .meta{font-size:12px;opacity:.65;margin:12px 0 8px}
    .close{width:100%;background:rgba(128,128,128,.35);color:inherit}`;

  function openPanel() {
    if (renderPanel) return;
    const box = h('div');
    box.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647';
    const root = box.attachShadow({ mode: 'closed' });

    const tog = h('button', { onclick: toggle });
    const list = h('ul');
    const inp = h('input', { type: 'text', placeholder: 'example.com or paste a link', autocapitalize: 'off', spellcheck: false });
    const close = () => { box.remove(); renderPanel = null; document.removeEventListener('keydown', onKey, true); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    const add = () => {
      const s = normalize(inp.value);
      inp.classList.toggle('bad', !s);
      if (!s) return;
      if (!sites.includes(s)) { sites.push(s); saveSites(); sync(); }
      inp.value = '';
    };
    inp.oninput = () => inp.classList.remove('bad');
    inp.onkeydown = e => { if (e.key === 'Enter') add(); };

    const c = GM_getValue('rates');
    const bg = h('div', { className: 'bg', onclick: e => { if (e.target === bg) close(); } },
      h('div', { className: 'card' },
        h('h2', { textContent: 'Price converter → PLN' }),
        tog,
        h('h3', { textContent: 'Enabled websites' }),
        list,
        h('div', { className: 'row' }, inp, h('button', { className: 'add', textContent: 'Add', onclick: add })),
        h('p', { className: 'meta', textContent: c ? `Rates: ${c.src}, ${c.date}` : 'Rates load on the first enabled website.' }),
        h('button', { className: 'close', textContent: 'Close', onclick: close })));
    root.append(h('style', { textContent: PANEL_CSS }), bg);

    renderPanel = () => {
      const on = isOn();
      tog.className = 'tog ' + (on ? 'on' : 'off');
      tog.textContent = `${on ? '🟢 ON' : '🔴 OFF'} for ${host} – tap to turn ${on ? 'off' : 'on'}`;
      list.replaceChildren(...(sites.length
        ? sites.map(s => h('li', {}, h('span', { textContent: s }),
            h('button', { className: 'rm', textContent: '✕', title: 'Remove', onclick: () => { sites = sites.filter(x => x !== s); saveSites(); sync(); } })))
        : [h('li', { className: 'empty', textContent: 'No websites yet' })]));
    };
    renderPanel();
    document.addEventListener('keydown', onKey, true);
    document.documentElement.append(box);
  }

  /* ─────────────────────────── Init ─────────────────────────── */

  GM_addValueChangeListener('sites', (_k, _old, val, remote) => {   // keep other open tabs in sync
    if (remote) { sites = [...val]; sync(); }
  });
  sync();
})();

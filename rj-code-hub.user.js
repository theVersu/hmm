// ==UserScript==
// @name         RJ Code Hub – asmr.one / DLsite / JapaneseASMR
// @namespace    Violentmonkey Scripts
// @version      1.4.2
// @description  Jump (same tab) between asmr.one, dlsite.com and japaneseasmr.com using the RJ code of the current work, with a live check whether the work exists on the target site, plus a www/non-www toggle on asmr.one. Desktop and mobile (touch) layouts are switched automatically.
// @author       Claude
// @match        *://asmr.one/*
// @match        *://*.asmr.one/*
// @match        https://japaneseasmr.com/*
// @match        https://www.japaneseasmr.com/*
// @match        https://www.dlsite.com/*
// @match        https://dlsite.com/*
// @match        https://hentaiasmr.moe/*
// @match        https://www.hentaiasmr.moe/*
// @run-at       document-end
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @connect      asmr.one
// @connect      asmr-200.com
// @connect      asmr-100.com
// @connect      asmr-300.com
// @connect      dlsite.com
// @connect      japaneseasmr.com
// @connect      hentaiasmr.moe
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/rj-code-hub.user.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/rj-code-hub.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  CONFIG
   * ------------------------------------------------------------------ */
  const CONFIG = {
    // Product code prefixes to recognise (RJ = doujin, BJ = books, VJ = pro, ...)
    prefixes: ['RJ', 'BJ', 'VJ', 'AJ', 'RE'],
    // Show a greyed-out "code not found" button on pages without a code
    // (the old scripts always did this; it is noisy, so it is off by default)
    showNotFound: false,
    // How often (ms) to check for SPA-style URL changes (asmr.one is an SPA)
    urlPollMs: 500,
    // 'auto' = mobile UI on touch devices, desktop UI otherwise.
    // Force one with 'desktop' or 'mobile'.
    uiMode: 'auto',
    // Check whether the current work exists on the other sites and show a
    // green check / red cross in front of each button.
    checkAvailability: true,
    // How long to remember a result (minutes) before checking again
    cacheMinutes: { yes: 360, no: 30, unknown: 2 },
    // asmr.one API hosts to try, in order (used only for the availability check)
    asmrApiHosts: ['api.asmr-200.com', 'api.asmr.one', 'api.asmr-100.com', 'api.asmr-300.com'],
    // --- Being gentle with the sites (Cloudflare blocks bot-like traffic) ---
    // Wait this long (ms) after a page opens before checking; skipped if you already moved on
    checkDelayMs: 1200,
    // Minimum gap (ms) between two requests to the same site
    minGapMs: 4000,
    // After a site answers a check with "blocked" (403/429/503), send it NOTHING for this many minutes
    cooldownMinutes: 180,
    // japaneseasmr.com refuses scripted requests (Cloudflare, HTTP 403), so it is never asked directly.
    // It is checked in a real background tab instead (a normal visit that Cloudflare accepts); the
    // tab reads the search result, then closes. Entries already seen while browsing need no tab.
    jasmrBackgroundTab: true,
    // Pace of those tabs: strictly one at a time, at least this many ms apart ...
    tabGapMs: 25000,
    // ... and at most this many per hour (across all your tabs)
    maxTabsPerHour: 20,
    // If a tab got no answer (e.g. an interactive Cloudflare check), leave that site alone for this many minutes
    tabFailCooldownMinutes: 30,
    // hentaiasmr.moe only: if a scripted check is blocked, also fall back to a background tab (off by default)
    backgroundTab: false,
    // Log every availability decision to the browser console
    debug: false,
  };

  /* ------------------------------------------------------------------ *
   *  SITE DETECTION
   * ------------------------------------------------------------------ */
  const SITE = {
    'asmr.one': 'asmr',
    'dlsite.com': 'dlsite',
    'japaneseasmr.com': 'jasmr',
    'hentaiasmr.moe': 'hasmr',
  }[location.hostname.replace(/^www\./, '').toLowerCase()];

  if (!SITE || window.top !== window.self) return;

  const HOST_ID = 'rj-code-hub-host';
  const CODE = '(?:' + CONFIG.prefixes.join('|') + ')\\d{5,}';

  /* ------------------------------------------------------------------ *
   *  TARGETS (where the buttons lead)
   * ------------------------------------------------------------------ */
  const DLSITE_SECTION = { BJ: 'books', VJ: 'pro' }; // everything else -> maniax

  // Site logos (embedded so nothing external is loaded). If a page's CSP blocks them
  // the button falls back to a plain text name automatically.
  const LOGO_DLSITE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFkAAAAZCAMAAABtjXLxAAAAAXNSR0IB2cksfwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAJxQTFRFBSqDBSqDBSqDBSqDBSqDAAAABSqD/MgA/MgA/MgA/MgABSqDBSqDBSqD/MgABSqDBSqD/MgABSqDBSqD/MgA/MgABSqDBSqDBSqDBSqD/MgA/MgA/MgABSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDBSqDhRFJ5wAAADR0Uk5T/+zBgykAMEmvtmTg8Tz/mQjGxQ/QgyIX5kPnmgpYoMzZtXwCG7ywa6hgkNH8eIn2pDRO1A+MtTIAAAK3SURBVHicldR7V9owFADwW6DgaAuzCofNWUSnE63Dyff/CHs46LaDiqicyc5BGQgehkCXm6SYYOojf9y+kl8evYkGtGhYgBdthFGHsBIhde/INU5a+KOwWprQwBg+S44kSBgTOtEHMP89QwZIa4NnyNE4hv6LZLC13tNyDL/Euy+TwZ4OnpT1GAmJv1xOgnb9iBw1X7XYc/r2EXn5Njoh31/r5I//YTIpkSj7alia1s5oWr8jyHHfGV3TNQZrGCbntSOArVNYWCQPfmtOdmJdPjjYHp8JMkAqdYq3m40QeTGCLYn8/ie57hzJspGtCQuRa4syGGnsCrIdpWyseBAuG5kjsbJ71RZlWLjB+KGulLcroJRNyDQBit9ZrdKkSq9msiPKsNIgYd9TyU4dq7gX69U5mVbztxEsVZc6TurqHN8UmpK8+41OTiW7XzEe4MAVcrKLq6szhX6HT5K8+QP5mkqm1fe92W0g053CJnRQ4XVpPzuS/OY8dMyrdRKKx2rZH5NQ/m3zug3M37Ikb3mh60ynw0Y1k5daXF6+JCG98UVaPlGmXYfkBp2OIONejQ+4vIfmx5gkS1m38QtjTFPJa5iv1nAmO5eCTBtsWpJs3stOY4K39o1qD6beHdJO1bKRJ19d3RNbTGfyokE3N874oexYmI9ucyDJNP1pbwXc2uwIJmtT9e9XYw+GfHcWmsFZV+TqMbgT/TOfjiTT9C93z/gvhDW7ew52u+hlOvDgfM7514EcFJ3lBSmrLVmmPw5Kla0TNmiyNvmBSXZjbtqZl9k2CpFxOpLs0NOSLPMIUlZDGuBdT5bLh/RRLe+2enMy+BOfy5BPiP9v/UIac6lqscNfKRd6HBZkyEdqXAbDmVaDEb/FvA9kIxtvB00fyrmUWZm9EGSSL/Vx4ZTVt7Nesu+2rQiD/gMV1CpNv7aqOAAAAABJRU5ErkJggg==';
  const LOGO_JASMR = 'data:image/png;base64,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';
  const LOGO_HASMR = 'data:image/png;base64,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';

  const TARGETS = {
    asmr: {
      name: 'ASMR.one',
      textColor: '#ff6ad5', // no logo supplied: styled wordmark
      color: '#c2188b',
      url: (c) => `https://asmr.one/work/${c}`,
    },
    dlsite: {
      name: 'DLsite',
      logo: LOGO_DLSITE,
      plate: true, // dark-blue logo needs a light plate on the dark buttons
      color: '#043c95',
      url: (c) =>
        `https://www.dlsite.com/${DLSITE_SECTION[c.slice(0, 2)] || 'maniax'}/work/=/product_id/${c}.html`,
    },
    jasmr: {
      name: 'japaneseasmr.com',
      logo: LOGO_JASMR,
      color: '#111111',
      url: (c) => `https://japaneseasmr.com/?s=${c}`,
    },
    hasmr: {
      name: 'hentaiasmr.moe',
      logo: LOGO_HASMR,
      color: '#d32f2f',
      url: (c) => `https://hentaiasmr.moe/${c.toLowerCase()}.html`, // e.g. /rj01727485.html
    },
  };

  // Which targets to offer on each site (first = most prominent)
  const OFFER = {
    asmr: ['jasmr', 'hasmr', 'dlsite'],
    dlsite: ['asmr', 'jasmr', 'hasmr'],
    jasmr: ['asmr', 'dlsite', 'hasmr'],
    hasmr: ['asmr', 'dlsite', 'jasmr'],
  };

  /* ------------------------------------------------------------------ *
   *  RJ CODE DETECTION
   * ------------------------------------------------------------------ */
  function findCode() {
    let m = null;
    if (SITE === 'asmr') {
      m = location.href.match(new RegExp(`/work/(${CODE})`, 'i'));
    } else if (SITE === 'dlsite') {
      m = location.href.match(new RegExp(`/product_id/(${CODE})`, 'i'));
    } else if (SITE === 'hasmr') {
      m = location.pathname.match(new RegExp(`/(${CODE})\\.html`, 'i')); // /rj01727485.html
    } else if (SITE === 'jasmr') {
      return findCodeJasmr();
    }
    return m ? m[1].toUpperCase() : null;
  }

  function findCodeJasmr() {
    const any = new RegExp(`(${CODE})`, 'i');
    const up = (m) => (m ? m[1].toUpperCase() : null);

    // Search results page (?s=...): use the searched code, or the one code all results share
    const params = new URLSearchParams(location.search);
    if (params.has('s')) {
      const fromQuery = up((params.get('s') || '').match(any));
      if (fromQuery) return fromQuery;
      const codes = new Set();
      document.querySelectorAll('.site-archive-post').forEach((li) => {
        const c = up(li.innerHTML.match(any));
        if (c) codes.add(c);
      });
      return codes.size === 1 ? [...codes][0] : null;
    }

    // Listing pages (home, categories, tags...) show many works -> no single code
    if (location.pathname === '/' || /^\/(page|category|tag|author|search)(\/|$)/i.test(location.pathname)) return null;

    // Single entry page: most reliable places first
    const text = (document.body && document.body.innerText) || '';
    let c = up(text.match(new RegExp(`RJ Code:\\s*(${CODE})`, 'i'))); // the "RJ Code: RJ0111..." line
    if (c) return c;
    const spots = [
      () => document.title,
      () => [...document.querySelectorAll('h1, .entry-title')].map((e) => e.textContent).join(' '),
      () => { const a = document.querySelector('article, .entry-content, main'); return a ? a.innerText : ''; },
      () => { const i = document.querySelector('article img[src*="_img_"], main img[src*="_img_"], .entry-content img[src*="_img_"]'); return i ? i.src : ''; },
      () => (document.querySelector('meta[property="og:image"]') || {}).content || '',
      () => (document.querySelector('link[rel="canonical"]') || {}).href || '',
    ];
    for (const get of spots) {
      c = up((get() || '').match(any));
      if (c) return c;
    }
    return null;
  }

  function toggleWwwUrl() {
    const u = new URL(location.href);
    u.protocol = 'https:';
    u.hostname = u.hostname.startsWith('www.') ? u.hostname.slice(4) : 'www.' + u.hostname;
    return u.href;
  }

  /* ------------------------------------------------------------------ *
   *  AVAILABILITY CHECKS  (is this work on the target site?)
   *  state: 'checking' | 'yes' | 'no' | 'unknown'
   *  Requests go through GM_xmlhttpRequest (needed for cross-site reads).
   * ------------------------------------------------------------------ */
  const gmXhr =
    typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest
    : typeof GM !== 'undefined' && GM.xmlHttpRequest ? GM.xmlHttpRequest.bind(GM)
    : null;

  function log() { if (CONFIG.debug) console.log('[RJ Code Hub]', ...arguments); }

  const HTML_HEADERS = { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.8' };

  const hostChain = {};  // host -> promise chain, so requests to one site are strictly one at a time
  const hostLastDone = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function rawRequest(url, headers, timeout) {
    return new Promise((resolve, reject) => {
      if (!gmXhr) return reject(new Error('GM_xmlhttpRequest unavailable'));
      gmXhr({
        method: 'GET', url, headers: headers || {}, timeout: timeout || 15000,
        onload: (r) => resolve(r),
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
        onabort: () => reject(new Error('aborted')),
      });
    });
  }

  function request(url, headers, timeout) {
    const host = new URL(url).hostname;
    const p = (hostChain[host] || Promise.resolve()).then(async () => {
      const wait = (hostLastDone[host] || 0) + CONFIG.minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      try { return await rawRequest(url, headers, timeout); }
      finally { hostLastDone[host] = Date.now(); }
    });
    hostChain[host] = p.catch(() => {});
    return p;
  }

  // Script-wide storage (shared across all three sites), with localStorage as a fallback
  const kv = {
    get(k) {
      try { if (typeof GM_getValue === 'function') return GM_getValue(k, null); } catch (e) {}
      try { return localStorage.getItem(k); } catch (e) { return null; }
    },
    set(k, v) {
      try { if (typeof GM_setValue === 'function') return GM_setValue(k, v); } catch (e) {}
      try { localStorage.setItem(k, v); } catch (e) {}
    },
  };

  // Index of japaneseasmr.com entries (code -> entry URL), filled in passively whenever you browse
  // that site, so other sites can show a green check + direct link even when the site blocks checks.
  const JA_INDEX_KEY = 'rjhub:jasmr-index';
  const JA_INDEX_MAX = 8000;
  function jaIndexLoad() {
    try { return JSON.parse(kv.get(JA_INDEX_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function harvestJasmr() {
    if (SITE !== 'jasmr') return;
    const idx = jaIndexLoad();
    let changed = false;
    const put = (code, url) => {
      if (idx[code] === url) return;
      delete idx[code]; // re-insert so the newest entries stay at the end
      idx[code] = url;
      changed = true;
    };
    const entryLink = /^https?:\/\/(www\.)?japaneseasmr\.com\/\d+\/?$/i;
    const bracketed = new RegExp(`\\[(${CODE})\\]`, 'i');
    const thumb = new RegExp(`(${CODE})_img_`, 'i');

    // Listing / search results: every entry card carries its code and its link
    document.querySelectorAll('.site-archive-post').forEach((li) => {
      const m = li.innerHTML.match(bracketed) || li.innerHTML.match(thumb);
      const a = [...li.querySelectorAll('a[href]')].find((x) => entryLink.test(x.href));
      if (m && a) put(m[1].toUpperCase(), a.href);
    });
    // Single entry page: this very URL is the entry for its code
    if (/^\/\d+\/?$/.test(location.pathname)) {
      const c = findCodeJasmr();
      if (c) put(c, location.origin + location.pathname);
    }
    if (!changed) return;
    const keys = Object.keys(idx);
    for (const k of keys.slice(0, Math.max(0, keys.length - JA_INDEX_MAX))) delete idx[k];
    kv.set(JA_INDEX_KEY, JSON.stringify(idx));
  }

  // --- Real-browser fallback for sites that block scripted requests (japaneseasmr.com, hentaiasmr.moe) -------------------------------------------
  // Opener side: open the search in a background tab (marked with #rjhub-bg), wait for the helper
  // running inside that tab to store its verdict in the shared script storage, then close the tab.
  let bgChain = Promise.resolve(); // one background tab at a time
  let lastTabAt = 0;
  // Spacing + hourly budget are kept in the shared storage, so they hold across pages and tabs
  function tabBudgetLeft() {
    let stamps = [];
    try { stamps = JSON.parse(kv.get('rjhub:tab-stamps') || '[]'); } catch (e) {}
    const cutoff = Date.now() - 3600000;
    stamps = stamps.filter((x) => x > cutoff);
    const ok = stamps.length < CONFIG.maxTabsPerHour;
    if (ok) stamps.push(Date.now());
    kv.set('rjhub:tab-stamps', JSON.stringify(stamps));
    return ok;
  }

  // Resolves with the helper's verdict, null if there was no answer, or 'skip' if you moved on first
  function viaTab(target, code, stillWanted) {
    const run = async () => {
      const last = Math.max(lastTabAt, Number(kv.get('rjhub:last-tab')) || 0);
      const wait = last + CONFIG.tabGapMs - Date.now(); // spacing between tabs
      if (wait > 0) await sleep(wait);
      if (stillWanted && !stillWanted()) return 'skip'; // you moved on while this was queued
      if (!tabBudgetLeft()) return null;                // hourly cap reached
      lastTabAt = Date.now();
      kv.set('rjhub:last-tab', String(lastTabAt));
      return new Promise((resolve) => {
      const allowed = target === 'jasmr' ? CONFIG.jasmrBackgroundTab : CONFIG.backgroundTab;
      if (!allowed || typeof GM_openInTab !== 'function') return resolve(null);
      const key = `rjhub:tab:${target}:${code}`;
      const started = Date.now();
      let tab = null, finished = false, poll = null, to = null, lid = null;
      const finish = (res) => {
        if (finished) return;
        finished = true;
        clearInterval(poll);
        clearTimeout(to);
        try { if (lid != null && typeof GM_removeValueChangeListener === 'function') GM_removeValueChangeListener(lid); } catch (e) {}
        try { if (tab && tab.close) tab.close(); } catch (e) {}
        resolve(res);
      };
      const check = () => {
        try {
          const r = JSON.parse(kv.get(key) || 'null');
          if (r && r.state && r.t >= started) finish(r);
        } catch (e) {}
      };
      kv.set(key, '');
      try { if (typeof GM_addValueChangeListener === 'function') lid = GM_addValueChangeListener(key, check); } catch (e) {}
      poll = setInterval(check, 700);
      to = setTimeout(() => finish(null), 30000);
      try {
        tab = GM_openInTab(TARGETS[target].url(code) + '#rjhub-bg', { active: false, insert: true, setParent: true });
      } catch (e) { finish(null); }
      });
    };
    const p = bgChain.then(run, run);
    bgChain = p.catch(() => {});
    return p;
  }

  // Helper side: runs inside that background tab (a normal visit, so Cloudflare lets it through).
  // Reads the results, remembers the entries, reports the verdict, and does nothing else.
  function runBgHelperJasmr() {
    const q = new URLSearchParams(location.search).get('s') || '';
    const m = q.match(new RegExp(`(${CODE})`, 'i'));
    if (!m) return;
    const C = m[1].toUpperCase();
    const key = `rjhub:tab:jasmr:${C}`;
    let n = 0;
    const tick = () => {
      if (++n > 60) return; // ~30 s, then give up (the opener times out as well)
      harvestJasmr();
      const url = jaIndexLoad()[C];
      let res = null;
      if (url) res = { state: 'yes', url };
      else if (document.body && (document.body.classList.contains('search-no-results') || /Nothing Found/i.test(document.body.innerText || ''))) res = { state: 'no' };
      else if (document.querySelector('.site-archive-post') && document.readyState === 'complete') res = { state: 'no' };
      if (res) { res.t = Date.now(); kv.set(key, JSON.stringify(res)); return; }
      setTimeout(tick, 500);
    };
    tick();
  }

  // hentaiasmr.moe helper: the id is in the URL, so "the page loaded and we were not redirected
  // away or shown a 404" is the verdict.
  function runBgHelperHasmr() {
    const m = location.pathname.match(new RegExp(`/(${CODE})\\.html`, 'i'));
    if (!m) return;
    const C = m[1].toUpperCase();
    const key = `rjhub:tab:hasmr:${C}`;
    const notFound = /\b404\b|not found|doesn.?t exist|no longer available/i;
    const challenge = /just a moment|attention required|checking your browser/i;
    let n = 0;
    const tick = () => {
      if (++n > 60) return; // ~30 s
      const title = document.title || '';
      if (document.readyState === 'complete' && !challenge.test(title)) {
        const h1 = (document.querySelector('h1') || {}).textContent || '';
        const head = ((document.body && document.body.innerText) || '').slice(0, 600);
        let res;
        if (notFound.test(title + ' ' + h1 + ' ' + head)) res = { state: 'no' };
        else if (location.pathname.toUpperCase().includes(C)) res = { state: 'yes' };
        else res = { state: 'no' }; // redirected away
        res.t = Date.now();
        kv.set(key, JSON.stringify(res));
        return;
      }
      setTimeout(tick, 500);
    };
    tick();
  }

  function runBgHelper() {
    if (SITE === 'hasmr') runBgHelperHasmr();
    else runBgHelperJasmr();
  }

  // Circuit breaker: once a site answers "blocked", stop sending it anything for a while
  const BLOCK_STATUS = [403, 429, 503];
  function coolingDown(t) {
    const until = Number(kv.get('rjhub:cooldown:' + t)) || 0;
    return until > Date.now() ? until : 0;
  }
  function startCooldown(t, minutes) {
    kv.set('rjhub:cooldown:' + t, String(Date.now() + (minutes || CONFIG.cooldownMinutes) * 60000));
  }
  const blockedWhy = (status) => `HTTP ${status}: the site blocked a check, so checks are paused for ${CONFIG.cooldownMinutes} min`;

  const CHECKERS = {
    // asmr.one has no per-work HTML (it is an SPA), so ask its API.
    // RJ01722913 -> id 1722913 (leading zeros dropped). BJ/VJ use special ids -> can't check.
    async asmr(code) {
      const m = code.match(/^([A-Z]+)(\d+)$/);
      if (!m || m[1] !== 'RJ') return { state: 'unknown', why: 'only RJ codes can be checked' };
      const id = String(parseInt(m[2], 10));
      let why = 'no response';
      for (const host of CONFIG.asmrApiHosts) {
        let verdict = null;
        for (const path of ['workInfo', 'work']) {
          try {
            const r = await request(`https://${host}/api/${path}/${id}`, undefined, 8000);
            log('asmr', host, path, r.status);
            if (r.status === 200) {
              try {
                const j = JSON.parse(r.responseText);
                if (j && !j.error && (j.id || j.source_id || j.title)) return { state: 'yes' };
              } catch (e) { /* not JSON */ }
              verdict = verdict || 'err'; why = 'unexpected API reply';
            } else if (r.status === 404 || r.status === 400) verdict = 'no';
            else if (BLOCK_STATUS.includes(r.status)) { startCooldown('asmr'); return { state: 'unknown', why: blockedWhy(r.status) }; }
            else { verdict = verdict || 'err'; why = 'HTTP ' + r.status; }
          } catch (e) { verdict = verdict || 'err'; why = e.message; break; } // host unreachable: next host
        }
        if (verdict === 'no') return { state: 'no' };
      }
      return { state: 'unknown', why };
    },

    // DLsite: the product page itself (404 / redirected away = not there)
    async dlsite(code) {
      const url = TARGETS.dlsite.url(code);
      const r = await request(url, HTML_HEADERS);
      log('dlsite', r.status, r.finalUrl);
      if (r.status === 404 || r.status === 410) return { state: 'no' };
      if (r.status === 200) {
        return (r.finalUrl || url).toUpperCase().includes(code) ? { state: 'yes' } : { state: 'no' };
      }
      if (BLOCK_STATUS.includes(r.status)) { startCooldown('dlsite'); return { state: 'unknown', why: blockedWhy(r.status) }; }
      return { state: 'unknown', why: 'HTTP ' + r.status };
    },

    // hentaiasmr.moe: the work page itself (the id is in the URL)
    async hasmr(code) {
      const url = TARGETS.hasmr.url(code);
      let r;
      try { r = await request(url, HTML_HEADERS); } catch (e) { r = { status: 0, responseText: '' }; }
      log('hasmr', r.status, r.finalUrl);
      if (r.status === 404 || r.status === 410) return { state: 'no' };
      const title = ((r.responseText || '').match(/<title[^>]*>([^<]*)/i) || [])[1] || '';
      const challenged = /just a moment|attention required|checking your browser/i.test(title);
      if (r.status === 200 && !challenged) {
        if (/\b404\b|not found/i.test(title)) return { state: 'no' };
        return (r.finalUrl || url).toUpperCase().includes(code) ? { state: 'yes' } : { state: 'no' };
      }
      if (challenged || BLOCK_STATUS.includes(r.status)) {
        if (CONFIG.backgroundTab) {
          const viaT = await viaTab('hasmr', code);
          if (viaT) return { state: viaT.state };
        }
        startCooldown('hasmr');
        return { state: 'unknown', why: blockedWhy(r.status || 'challenge') };
      }
      return { state: 'unknown', why: 'HTTP ' + (r.status || 'error') };
    },

    // japaneseasmr.com is behind Cloudflare, which refuses scripted requests, so it is never asked
    // directly: (1) entries learned while browsing, (2) one real background tab, slowly.
    async jasmr(code) {
      const learned = jaIndexLoad()[code];
      if (learned) return { state: 'yes', url: learned };
      if (!CONFIG.jasmrBackgroundTab) {
        return { state: 'unknown', why: 'not seen yet: open it on japaneseasmr.com once and the script remembers it' };
      }
      const res = await viaTab('jasmr', code, () => findCode() === code);
      if (res === 'skip') return { state: 'unknown', why: 'skipped (you moved to another page)' };
      if (res) return { state: res.state, url: res.url };
      startCooldown('jasmr', CONFIG.tabFailCooldownMinutes);
      return {
        state: 'unknown',
        why: `the background tab gave no answer (Cloudflare check or tab limit); trying again in ${CONFIG.tabFailCooldownMinutes} min`,
      };
    },
  };

  const avail = new Map(); // "target:CODE" -> { state, url, t }

  function storageKey(t, code) { return `rjhub:av:${t}:${code}`; }

  function cachedResult(t, code) {
    const key = t + ':' + code;
    let e = avail.get(key);
    if (!e) {
      try {
        const raw = JSON.parse(localStorage.getItem(storageKey(t, code)) || 'null');
        if (raw && raw.s) e = { state: raw.s, url: raw.u, t: raw.t };
      } catch (err) { /* storage blocked */ }
    }
    if (!e) return null;
    if (e.state === 'checking') return e;
    const ttl = (CONFIG.cacheMinutes[e.state] || 0) * 60000;
    if (Date.now() - e.t > ttl) return null;
    avail.set(key, e);
    return e;
  }

  function ensureChecks(code) {
    for (const t of OFFER[SITE]) {
      if (cachedResult(t, code)) continue;
      const key = t + ':' + code;
      if (!CONFIG.checkAvailability) { avail.set(key, { state: 'unknown', t: Date.now() }); continue; }

      const pausedWhy = () => {
        const until = coolingDown(t);
        if (!until) return null;
        if (t === 'jasmr' && jaIndexLoad()[code]) return null; // learned entries need no request
        return `checks on ${TARGETS[t].name} are paused for ${Math.ceil((until - Date.now()) / 60000)} more min (it blocked one earlier)`;
      };
      const paused = pausedWhy();
      if (paused) { avail.set(key, { state: 'unknown', why: paused, t: Date.now() }); continue; }

      avail.set(key, { state: 'checking', t: Date.now() });
      const learnedNow = t === 'jasmr' && !!jaIndexLoad()[code];
      setTimeout(() => {
        if (findCode() !== code) { avail.delete(key); return; } // you already moved on: send nothing
        const p2 = pausedWhy();
        if (p2) { avail.set(key, { state: 'unknown', why: p2, t: Date.now() }); refresh(); return; }
        CHECKERS[t](code)
          .catch((err) => { log(t, 'check failed:', err.message); return { state: 'unknown', why: err.message }; })
          .then((res) => {
            const e = { state: res.state, url: res.url, why: res.why, t: Date.now() };
            avail.set(key, e);
            if (e.state === 'yes' || e.state === 'no') {
              try { localStorage.setItem(storageKey(t, code), JSON.stringify({ s: e.state, u: e.url, t: e.t })); } catch (err) {}
            }
            log(t, code, '->', e.state, e.url || '');
            refresh();
          });
      }, learnedNow ? 0 : t === 'jasmr' ? Math.max(CONFIG.checkDelayMs, 2500) : CONFIG.checkDelayMs);
    }
  }

  /* ------------------------------------------------------------------ *
   *  BUTTON LOOK (shared by both UIs): dark card, coloured left accent,
   *  status icon, "on" + logo/wordmark. All buttons share one height and
   *  (inside a list) one width, with everything vertically centred.
   * ------------------------------------------------------------------ */
  const svg = (inner) => `<svg viewBox="0 0 18 18" aria-hidden="true">${inner}</svg>`;
  const ICONS = {
    yes: svg('<circle cx="9" cy="9" r="9" fill="#1faa59"/><path d="M5 9.3l2.7 2.7L13 6.6" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'),
    no: svg('<circle cx="9" cy="9" r="9" fill="#e5322d"/><path d="M6.1 6.1l5.8 5.8M11.9 6.1l-5.8 5.8" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>'),
    checking: svg('<circle cx="9" cy="9" r="9" fill="#8a8f98"/><circle cx="5.2" cy="9" r="1.25" fill="#fff"/><circle cx="9" cy="9" r="1.25" fill="#fff"/><circle cx="12.8" cy="9" r="1.25" fill="#fff"/>'),
    unknown: svg('<circle cx="9" cy="9" r="9" fill="#8a8f98"/><path d="M7.1 7.3a1.9 1.9 0 1 1 2.9 1.6c-.7.4-1.1.9-1.1 1.7" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="8.9" cy="13" r="1.05" fill="#fff"/>'),
    swap: svg('<circle cx="9" cy="9" r="9" fill="#2b7bff"/><path d="M5 7h7.6M10.4 4.8L12.6 7l-2.2 2.2M13 11H5.4M7.6 8.8L5.4 11l2.2 2.2" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
  };

  const ICON_CSS = `
    .btn{
      display:flex; align-items:center; gap:9px; box-sizing:border-box;
      height:var(--h,38px); padding:0 14px 0 10px;
      font:600 var(--fs,14px)/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; white-space:nowrap;
      color:#eceef2; background:rgba(20,22,28,.95);
      border:1px solid rgba(255,255,255,.14); border-left:3px solid var(--c);
      border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,.4);
      text-decoration:none; cursor:pointer;
      transition:background .15s ease, transform .15s ease;
    }
    .btn:hover{background:rgba(40,43,52,.98); transform:translateX(-2px)}
    .off{cursor:default}
    .off:hover{background:rgba(20,22,28,.95); transform:none}
    .ico{display:flex; flex:none; width:18px; height:18px}
    .ico svg{display:block; width:18px; height:18px}
    .on{font-weight:500; opacity:.6}
    .brand{display:flex; align-items:center}
    .logo{display:block; height:20px; width:auto}
    .plate{background:#fff; border-radius:5px; padding:4px 8px}
    .plate .logo{height:15px}
    .word{font-weight:700; color:var(--t,#eceef2)}`;

  function fillButton(el, it) {
    el.style.setProperty('--c', it.color);
    if (it.textColor) el.style.setProperty('--t', it.textColor);

    const ic = document.createElement('span');
    ic.className = 'ico';
    ic.innerHTML = ICONS[it.icon] || '';
    el.appendChild(ic);

    if (it.name) {
      const on = document.createElement('span');
      on.className = 'on';
      on.textContent = 'on';
      el.appendChild(on);

      const brand = document.createElement('span');
      brand.className = 'brand' + (it.plate ? ' plate' : '');
      const wordmark = () => {
        const w = document.createElement('span');
        w.className = 'word';
        w.textContent = it.name;
        return w;
      };
      if (it.logo) {
        const img = new Image();
        img.className = 'logo';
        img.alt = it.name;
        img.onerror = () => { brand.className = 'brand'; brand.textContent = ''; brand.appendChild(wordmark()); };
        img.src = it.logo;
        brand.appendChild(img);
      } else {
        brand.appendChild(wordmark());
      }
      el.appendChild(brand);
    } else {
      const t = document.createElement('span');
      t.textContent = it.label;
      el.appendChild(t);
    }
    if (it.title) el.title = it.title;
  }

  function stateTitle(T, a) {
    if (a.state === 'checking') return 'Checking…';
    if (a.state === 'yes') return `Found on ${T.name}`;
    if (a.state === 'no') return `Not found on ${T.name}`;
    return `Couldn't verify on ${T.name}` + (a.why ? ` (${a.why})` : '');
  }

  /* Build the list of buttons. Order = most prominent first. */
  function buildItems(code) {
    const items = [];
    if (SITE === 'asmr') {
      const www = location.hostname.startsWith('www.');
      items.push({
        id: 'toggle',
        label: www ? 'Go to asmr.one' : 'Go to www.asmr.one',
        icon: 'swap',
        href: toggleWwwUrl(),
        color: '#2b7bff',
      });
    }
    if (code) {
      for (const id of OFFER[SITE]) {
        const T = TARGETS[id];
        const a = cachedResult(id, code) || { state: 'checking' };
        items.push({
          id,
          name: T.name,
          logo: T.logo,
          plate: T.plate,
          textColor: T.textColor,
          icon: a.state,
          state: a.state,
          href: a.url || T.url(code), // japaneseasmr: direct entry link once found
          color: T.color,
          title: stateTitle(T, a),
        });
      }
    } else if (CONFIG.showNotFound && SITE !== 'asmr') {
      items.push({ id: 'none', label: 'RJ code not found', icon: 'unknown', href: null, color: '#555555' });
    }
    return items;
  }

  /* ================= DESKTOP UI ================= */
  const DesktopUI = (() => {
    /* ------------------------------------------------------------------ *
     *  DESKTOP UI – vertical list of buttons, placed per site so it clears the
     *  site's own header / widgets (same spots the old scripts used).
     *    asmr.one          : top 60px  / right 20px  (below the top bar)
     *    dlsite.com        : bottom 60px / right 20px
     *    japaneseasmr.com  : top 20px  / right 20px
     * ------------------------------------------------------------------ */
    let hostEl, barEl;
  
    function mount() {
      const old = document.getElementById(HOST_ID);
      if (old) old.remove();
  
      hostEl = document.createElement('div');
      hostEl.id = HOST_ID;
      hostEl.style.cssText = 'all:initial;';
      const root = hostEl.attachShadow({ mode: 'closed' }); // isolate from site CSS
      root.innerHTML = `
        <style>
          ${ICON_CSS}
          .bar{
            position:fixed; z-index:2147483646;
            display:flex; flex-direction:column; align-items:stretch; gap:8px; /* stretch = equal widths */
            max-width:calc(100vw - 40px);
          }
          .asmr{top:60px; right:20px}                                 /* list grows down */
          .jasmr{top:20px; right:20px}                                /* list grows down */
          .hasmr{top:70px; right:20px}                               /* list grows down (placement is a guess: adjust) */
          .dlsite{bottom:60px; right:20px; flex-direction:column-reverse} /* grows up, first button on the line */
          @media print{.bar{display:none}}
        </style>
        <div class="bar ${SITE}"></div>`;
      barEl = root.querySelector('.bar');
      document.documentElement.appendChild(hostEl);
    }
  
    function unmount() { if (hostEl) hostEl.remove(); }
  
    function ensureMounted() {
      if (hostEl && !hostEl.isConnected) document.documentElement.appendChild(hostEl);
    }
  
    function render(items) {
      barEl.textContent = '';
      for (const it of items) {
        const el = document.createElement(it.href ? 'a' : 'span');
        el.className = 'btn' + (it.href ? '' : ' off');
        fillButton(el, it);
        if (it.href) {
          el.href = it.href;
        }
        barEl.appendChild(el);
      }
    }
  
    return { mount, unmount, render, ensureMounted };
  })();

  /* ================= MOBILE UI ================= */
  const MobileUI = (() => {
    /* ------------------------------------------------------------------ *
     *  MOBILE UI – one small round "RJ" button. Tap = open/close the menu.
     *  Drag it anywhere (it snaps to the left/right edge and remembers its
     *  height per site), so it never has to cover the site's player bar.
     * ------------------------------------------------------------------ */
    const DEFAULT_Y = { asmr: 0.62, dlsite: 0.75, jasmr: 0.75, hasmr: 0.75 }; // fraction of screen height
    const SIZE = 44, MARGIN = 10;
    const POS_KEY = 'rjhub:pos:' + SITE;
  
    let hostEl, dockEl, fabEl, menuEl;
    let side = 'right', yFrac = DEFAULT_Y[SITE], isOpen = false;
  
    function loadPos() {
      try {
        const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
        if (p) {
          side = p.side === 'left' ? 'left' : 'right';
          if (isFinite(p.y)) yFrac = Math.min(0.95, Math.max(0.05, +p.y));
        }
      } catch (e) { /* storage blocked: use defaults */ }
    }
    function savePos() {
      try { localStorage.setItem(POS_KEY, JSON.stringify({ side, y: yFrac })); } catch (e) {}
    }
  
    function placeDock() {
      const y = Math.round(Math.min(innerHeight - SIZE - MARGIN, Math.max(MARGIN, yFrac * innerHeight)));
      dockEl.style.top = y + 'px';
      dockEl.style.left = side === 'left' ? MARGIN + 'px' : 'auto';
      dockEl.style.right = side === 'right' ? MARGIN + 'px' : 'auto';
      menuEl.className = 'menu ' + (y > innerHeight / 2 ? 'up' : 'down') + ' ' + side + (isOpen ? ' open' : '');
    }
  
    function setOpen(v) {
      isOpen = v;
      menuEl.classList.toggle('open', v);
      fabEl.setAttribute('aria-expanded', String(v));
    }
  
    function mount() {
      const old = document.getElementById(HOST_ID);
      if (old) old.remove();
      loadPos();
  
      hostEl = document.createElement('div');
      hostEl.id = HOST_ID;
      hostEl.style.cssText = 'all:initial;';
      const root = hostEl.attachShadow({ mode: 'closed' });
      root.innerHTML = `
        <style>
          ${ICON_CSS}
          *{box-sizing:border-box}
          .dock{
            position:fixed; z-index:2147483646; width:${SIZE}px; height:${SIZE}px; display:none;
            font-family:system-ui,-apple-system,Roboto,sans-serif;
            -webkit-tap-highlight-color:transparent;
          }
          .dock.show{display:block}
          .fab{
            width:${SIZE}px; height:${SIZE}px; border-radius:50%; border:none; padding:0;
            background:#c2188b; color:#fff; font-size:14px; font-weight:700; letter-spacing:.5px;
            opacity:.8; box-shadow:0 2px 8px rgba(0,0,0,.35);
            touch-action:none; user-select:none; -webkit-user-select:none;
          }
          .fab:active{opacity:1}
          .menu{
            position:absolute; display:none; flex-direction:column; align-items:stretch; gap:8px;
            max-width:calc(100vw - ${SIZE + MARGIN * 3}px);
            --h:46px; --fs:15px;
          }
          .menu.open{display:flex}
          .menu.up{bottom:${SIZE + 8}px; flex-direction:column-reverse} /* most prominent item nearest the thumb */
          .menu.down{top:${SIZE + 8}px}
          .menu.right{right:0}
          .menu.left{left:0}
          @media print{.dock{display:none}}
        </style>
        <div class="dock">
          <button class="fab" type="button" aria-label="RJ code links" aria-expanded="false">RJ</button>
          <div class="menu"></div>
        </div>`;
      dockEl = root.querySelector('.dock');
      fabEl = root.querySelector('.fab');
      menuEl = root.querySelector('.menu');
  
      // --- tap to toggle / drag to move ---
      let sx = 0, sy = 0, dragging = false, down = false;
      fabEl.addEventListener('pointerdown', (e) => {
        down = true; dragging = false; sx = e.clientX; sy = e.clientY;
        try { fabEl.setPointerCapture(e.pointerId); } catch (_) {}
      });
      fabEl.addEventListener('pointermove', (e) => {
        if (!down) return;
        if (!dragging && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) { dragging = true; setOpen(false); }
        if (dragging) {
          dockEl.style.left = e.clientX - SIZE / 2 + 'px';
          dockEl.style.right = 'auto';
          dockEl.style.top = e.clientY - SIZE / 2 + 'px';
        }
      });
      fabEl.addEventListener('pointerup', (e) => {
        if (!down) return;
        down = false;
        if (dragging) {
          side = e.clientX < innerWidth / 2 ? 'left' : 'right';
          yFrac = Math.min(0.95, Math.max(0.05, e.clientY / innerHeight));
          savePos();
          placeDock();
        } else {
          setOpen(!isOpen);
        }
        dragging = false;
      });
      fabEl.addEventListener('pointercancel', () => { down = false; dragging = false; placeDock(); });
  
      // tap anywhere else closes the menu
      document.addEventListener('pointerdown', onDocDown, true);
      window.addEventListener('resize', placeDock);
  
      placeDock();
      document.documentElement.appendChild(hostEl);
    }
  
    function onDocDown(e) { if (isOpen && e.target !== hostEl) setOpen(false); }
  
    function unmount() {
      document.removeEventListener('pointerdown', onDocDown, true);
      window.removeEventListener('resize', placeDock);
      if (hostEl) hostEl.remove();
      isOpen = false;
    }
  
    function ensureMounted() {
      if (hostEl && !hostEl.isConnected) document.documentElement.appendChild(hostEl);
    }
  
    function render(items) {
      menuEl.textContent = '';
      dockEl.classList.toggle('show', items.length > 0);
      if (!items.length) setOpen(false);
      // when the menu opens upward, keep the most prominent item closest to the thumb
      for (const it of items) {
        const el = document.createElement(it.href ? 'a' : 'span');
        el.className = 'btn' + (it.href ? '' : ' off');
        fillButton(el, it);
        if (it.href) {
          el.href = it.href;
          el.addEventListener('click', () => setOpen(false));
        }
        menuEl.appendChild(el);
      }
      placeDock();
    }
  
    return { mount, unmount, render, ensureMounted };
  })();

  /* ------------------------------------------------------------------ *
   *  CONTROLLER: keeps the buttons in sync with the page
   * ------------------------------------------------------------------ */
  let lastSig = '';
  let lastItems = [];
  let lastHref = location.href;
  let ui = null;

  // Pick the UI: touch-first devices (phones/tablets) get the mobile one.
  const coarse = window.matchMedia('(pointer: coarse)');
  function wantedUI() {
    if (CONFIG.uiMode === 'desktop') return DesktopUI;
    if (CONFIG.uiMode === 'mobile') return MobileUI;
    return coarse.matches ? MobileUI : DesktopUI;
  }
  function applyUI() {
    const next = wantedUI();
    if (next === ui) return;
    if (ui) ui.unmount();
    ui = next;
    ui.mount();
    ui.render(lastItems);
  }
  if (coarse.addEventListener) coarse.addEventListener('change', applyUI);
  else if (coarse.addListener) coarse.addListener(applyUI);

  // Background-tab helper mode (see runBgHelper): no UI, no checks, just report back
  const BG_HELPER = (SITE === 'jasmr' || SITE === 'hasmr') && /rjhub-bg/.test(location.hash);

  function refresh() {
    if (BG_HELPER) return false;
    if (SITE === 'jasmr') harvestJasmr();
    const code = findCode();
    if (code) ensureChecks(code);
    const items = buildItems(code);
    const sig = JSON.stringify(items.map((i) => [i.id, i.label, i.href, i.state, i.title]));
    if (sig !== lastSig) {
      lastSig = sig;
      lastItems = items;
      if (ui) ui.render(items);
    }
    return !!code;
  }

  // Re-check a few times: japaneseasmr.com content / SPA routes can appear late
  function settle() {
    let tries = 0;
    (function tick() {
      const found = refresh();
      if (!found && SITE === 'jasmr' && ++tries < 10) setTimeout(tick, 500);
    })();
  }

  function onUrlMaybeChanged() {
    if (ui) ui.ensureMounted();
    if (location.href !== lastHref) {
      lastHref = location.href;
      settle();
    }
  }

  ['popstate', 'hashchange'].forEach((ev) => window.addEventListener(ev, onUrlMaybeChanged));
  // SPA navigation (asmr.one): deliberately NOT patching history.pushState/replaceState. With a
  // sandboxed script that breaks the site's router state and made asmr.one fall over. Polling
  // the URL (below) plus popstate/hashchange catches every page change without touching the page.
  setInterval(onUrlMaybeChanged, CONFIG.urlPollMs); // fallback for anything missed

  if (BG_HELPER) {
    runBgHelper();
  } else {
    applyUI();
    settle();
    window.addEventListener('load', settle);
  }
})();

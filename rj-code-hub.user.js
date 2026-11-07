// ==UserScript==
// @name         RJ Code Hub – asmr.one / DLsite / JapaneseASMR
// @namespace    Violentmonkey Scripts
// @version      1.2.1
// @description  Jump (same tab) between asmr.one, dlsite.com and japaneseasmr.com using the RJ code of the current work, with a live check whether the work exists on the target site, plus a www/non-www toggle on asmr.one. Desktop and mobile (touch) layouts are switched automatically.
// @author       Claude
// @match        *://asmr.one/*
// @match        *://*.asmr.one/*
// @match        https://japaneseasmr.com/*
// @match        https://www.japaneseasmr.com/*
// @match        https://www.dlsite.com/*
// @match        https://dlsite.com/*
// @run-at       document-end
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      asmr.one
// @connect      asmr-200.com
// @connect      dlsite.com
// @connect      japaneseasmr.com
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
    asmrApiHosts: ['api.asmr-200.com', 'api.asmr.one'],
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
  };

  // Which targets to offer on each site (first = most prominent)
  const OFFER = {
    asmr: ['jasmr', 'dlsite'],
    dlsite: ['asmr', 'jasmr'],
    jasmr: ['asmr', 'dlsite'],
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

  function request(url, headers) {
    return new Promise((resolve, reject) => {
      if (!gmXhr) return reject(new Error('GM_xmlhttpRequest unavailable'));
      gmXhr({
        method: 'GET', url, headers: headers || {}, timeout: 15000,
        onload: (r) => resolve(r),
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
        onabort: () => reject(new Error('aborted')),
      });
    });
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
            const r = await request(`https://${host}/api/${path}/${id}`);
            log('asmr', host, path, r.status);
            if (r.status === 200) {
              try {
                const j = JSON.parse(r.responseText);
                if (j && !j.error && (j.id || j.source_id || j.title)) return { state: 'yes' };
              } catch (e) { /* not JSON */ }
              verdict = verdict || 'err'; why = 'unexpected API reply';
            } else if (r.status === 404 || r.status === 400) verdict = 'no';
            else { verdict = verdict || 'err'; why = 'HTTP ' + r.status; }
          } catch (e) { verdict = verdict || 'err'; why = e.message; }
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
      return { state: 'unknown', why: 'HTTP ' + r.status };
    },

    // japaneseasmr.com is behind Cloudflare, which often answers scripted requests with HTTP 403.
    // So: (1) use what the script learned while you browsed the site, (2) try the search page,
    // (3) try the WordPress REST search, (4) otherwise report "can't verify".
    async jasmr(code) {
      const learned = jaIndexLoad()[code];
      if (learned) return { state: 'yes', url: learned };

      const searchUrl = TARGETS.jasmr.url(code);
      let r;
      try { r = await request(searchUrl, HTML_HEADERS); } catch (e) { r = { status: 0, responseText: '' }; }
      const html = r.responseText || '';
      log('jasmr search', r.status, html.length + ' bytes');

      if (r.status === 200) {
        // The search box / page title echo the code too, so only count real result markup:
        // "[RJ01380529]" in the entry text or the thumbnail name "RJ01380529_img_main.jpg"
        const evidence = new RegExp(`\\[${code}\\]|${code}_img_|/${code}[._]`, 'i');
        const entryLink = /^https?:\/\/(www\.)?japaneseasmr\.com\/\d+\/?$/i;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        for (const sel of ['.site-archive-post', 'article']) {
          for (const el of doc.querySelectorAll(sel)) {
            if (!evidence.test(el.innerHTML)) continue;
            const links = [...el.querySelectorAll('a[href]')].map((a) => new URL(a.getAttribute('href'), searchUrl).href);
            const entry = links.find((h) => entryLink.test(h));
            if (entry) return { state: 'yes', url: entry };
          }
        }
        const at = html.search(evidence);
        if (at >= 0) {
          const before = html.slice(Math.max(0, at - 4000), at);
          const links = [...before.matchAll(/https?:\/\/(?:www\.)?japaneseasmr\.com\/\d+\/?/gi)];
          return { state: 'yes', url: links.length ? links[links.length - 1][0] : undefined };
        }
        if (/Search Results for|site-archive-post|Nothing Found/i.test(html)) return { state: 'no' };
      }

      // Search page blocked or unreadable: try the WordPress REST search
      try {
        const rr = await request(
          `https://japaneseasmr.com/wp-json/wp/v2/posts?search=${code}&per_page=5&_fields=link,title,content`,
          { Accept: 'application/json' });
        log('jasmr rest', rr.status);
        if (rr.status === 200) {
          const posts = JSON.parse(rr.responseText);
          if (Array.isArray(posts)) {
            const hit = posts.find((p) => JSON.stringify(p).toUpperCase().includes(code));
            if (hit && hit.link) return { state: 'yes', url: hit.link };
            return { state: 'no' };
          }
        }
      } catch (e) { log('jasmr rest failed', e.message); }

      return {
        state: 'unknown',
        why: `HTTP ${r.status || 'error'}: the site blocks scripted checks. Open it once and the script will remember the entry`,
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
      avail.set(key, { state: 'checking', t: Date.now() });
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
    const DEFAULT_Y = { asmr: 0.62, dlsite: 0.75, jasmr: 0.75 }; // fraction of screen height
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

  function refresh() {
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

  applyUI();
  settle();
  window.addEventListener('load', settle);
})();

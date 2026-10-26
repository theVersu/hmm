// ==UserScript==
// @name         RJ Code Hub – asmr.one / DLsite / JapaneseASMR
// @namespace    Violentmonkey Scripts
// @version      1.0.0
// @description  Jump between asmr.one, dlsite.com and japaneseasmr.com using the RJ code of the current work, plus a www/non-www toggle on asmr.one. Desktop and mobile (touch) layouts are switched automatically.
// @match        *://asmr.one/*
// @match        *://*.asmr.one/*
// @match        https://japaneseasmr.com/*
// @match        https://www.japaneseasmr.com/*
// @match        https://www.dlsite.com/*
// @match        https://dlsite.com/*
// @run-at       document-end
// @noframes
// @grant        none
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

  const TARGETS = {
    asmr: {
      label: 'Find it on ASMR.one',
      color: '#c2188b',
      url: (c) => `https://asmr.one/work/${c}`,
    },
    dlsite: {
      label: 'Find it on DLsite',
      color: '#043c95',
      url: (c) =>
        `https://www.dlsite.com/${DLSITE_SECTION[c.slice(0, 2)] || 'maniax'}/work/=/product_id/${c}.html`,
    },
    jasmr: {
      label: 'Find it on japaneseasmr.com',
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
      // Skip home / search / archive pages: they list many works, not one
      const p = location.pathname;
      if (p === '/' || /[?&]s=/.test(location.search) ||
          /^\/(page|category|tag|author|search)(\/|$)/i.test(p)) return null;
      const text = (document.body && document.body.innerText) || '';
      m = text.match(new RegExp(`RJ Code:\\s*(${CODE})`, 'i'));
    }
    return m ? m[1].toUpperCase() : null;
  }

  function toggleWwwUrl() {
    const u = new URL(location.href);
    u.protocol = 'https:';
    u.hostname = u.hostname.startsWith('www.') ? u.hostname.slice(4) : 'www.' + u.hostname;
    return u.href;
  }

  /* Build the list of buttons. Order = most prominent first. */
  function buildItems(code) {
    const items = [];
    if (SITE === 'asmr') {
      const www = location.hostname.startsWith('www.');
      items.push({
        id: 'toggle',
        label: www ? 'Go to asmr.one' : 'Go to www.asmr.one',
        href: toggleWwwUrl(),
        newTab: false,
        color: '#007bff',
      });
    }
    if (code) {
      for (const id of OFFER[SITE]) {
        items.push({ id, label: TARGETS[id].label, href: TARGETS[id].url(code), newTab: true, color: TARGETS[id].color });
      }
    } else if (CONFIG.showNotFound && SITE !== 'asmr') {
      items.push({ id: 'none', label: 'RJ code not found', href: null, newTab: false, color: '#555555' });
    }
    return items;
  }

  /* ================= DESKTOP UI ================= */
  const DesktopUI = (() => {
    /* ------------------------------------------------------------------ *
     *  DESKTOP UI – row of buttons, placed per site so it clears the
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
          .bar{
            position:fixed; z-index:2147483646;
            display:flex; flex-direction:row-reverse; flex-wrap:wrap; gap:8px;
            max-width:calc(100vw - 40px);
            font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
          }
          .asmr{top:60px; right:20px}
          .dlsite{bottom:60px; right:20px}
          .jasmr{top:20px; right:20px}
          .btn{
            display:inline-block; box-sizing:border-box;
            padding:10px 20px; font-size:14px; line-height:1.2; white-space:nowrap;
            color:#fff; background:var(--c); text-decoration:none;
            border:none; border-radius:5px; cursor:pointer; opacity:.9;
            transition:opacity .2s ease, transform .2s ease;
          }
          .btn:hover{opacity:1; transform:scale(1.05)}
          .off{cursor:default; opacity:.6}
          .off:hover{opacity:.6; transform:none}
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
        el.style.setProperty('--c', it.color);
        el.textContent = it.label;
        if (it.href) {
          el.href = it.href;
          if (it.newTab) { el.target = '_blank'; el.rel = 'noopener noreferrer'; }
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
            position:absolute; display:none; flex-direction:column; gap:8px;
            max-width:calc(100vw - ${SIZE + MARGIN * 3}px);
          }
          .menu.open{display:flex}
          .menu.up{bottom:${SIZE + 8}px}
          .menu.down{top:${SIZE + 8}px}
          .menu.right{right:0; align-items:flex-end}
          .menu.left{left:0; align-items:flex-start}
          .btn{
            display:inline-flex; align-items:center; min-height:44px;
            padding:0 18px; font-size:15px; white-space:nowrap;
            color:#fff; background:var(--c); text-decoration:none;
            border-radius:22px; box-shadow:0 2px 8px rgba(0,0,0,.35);
          }
          .off{opacity:.6}
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
        el.style.setProperty('--c', it.color);
        el.textContent = it.label;
        if (it.href) {
          el.href = it.href;
          if (it.newTab) { el.target = '_blank'; el.rel = 'noopener noreferrer'; }
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
    const code = findCode();
    const items = buildItems(code);
    const sig = JSON.stringify(items.map((i) => [i.id, i.label, i.href]));
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
  ['pushState', 'replaceState'].forEach((fn) => {
    const orig = history[fn];
    history[fn] = function () {
      const r = orig.apply(this, arguments);
      setTimeout(onUrlMaybeChanged, 0);
      return r;
    };
  });
  setInterval(onUrlMaybeChanged, CONFIG.urlPollMs); // fallback for anything missed

  applyUI();
  settle();
  window.addEventListener('load', settle);
})();

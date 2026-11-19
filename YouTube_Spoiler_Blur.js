// ==UserScript==
// @name         YouTube Spoiler Blur
// @namespace    spoiler-blur
// @version      2.0
// @author       Claude
// @match        https://www.youtube.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/YouTube_Spoiler_Blur.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/YouTube_Spoiler_Blur.js
// ==/UserScript==

(function () {
  'use strict';

  // ================= defaults (editable later in the settings panel) =================
  const DEFAULT_KEYWORDS = String.raw`# One per line.  word = partial match   "word" = whole word only   /regex/i = regex   "# " = comment
/\bgta[\s\-_.]*(6|vi\b|six\b)/i
/grand\s+theft\s+auto[\s\-_.:]*(6|vi\b|six\b)/i
gta6
gtavi
grand theft auto
"gta"
rockstar
leonida
vice city
port gellhorn
grassrivers
kalaga
ambrosia
allied crystal
only raw records
jack of hearts
"lucia"
"jason"
cal hampton
boobie
/dre'?\s?quan/i
real dimez
bae-luxe
"roxy"
raul bautista
brian heder
"heder"
stephen root
dylan rourke
manni perez
manni l. perez
spoiler`;

  const DEFAULTS = {
    enabled: true,      // master switch
    match: true,        // blur items whose text matches the keywords
    matchVideos: true,
    matchNotifs: true,
    matchPosts: true,
    vall: false,        // blur ALL video thumbnails
    nall: false,        // blur ALL images in notifications
    pall: false,        // blur ALL images in posts
    skipSafe: true,     // "blur all" options skip Subscriptions + channel pages
    blur: 18,           // blur strength (px)
  };

  const load = () => { try { return JSON.parse(GM_getValue('settings', '{}')) || {}; } catch (e) { return {}; } };
  const S = Object.assign({}, DEFAULTS, load());
  let KW_TEXT = GM_getValue('keywords', DEFAULT_KEYWORDS);
  const save = () => GM_setValue('settings', JSON.stringify(S));

  // ================= keywords =================
  const norm = (s) => s.replace(/[’‘]/g, "'");

  function compile(text) {
    const out = [];
    for (let line of text.split('\n')) {
      line = line.trim();
      if (!line || /^(#\s|\/\/)/.test(line)) continue;
      try {
        const rx = line.match(/^\/(.+)\/([a-z]*)$/i);
        if (rx) {
          const flags = [...new Set((rx[2] + 'i').replace(/[gy]/g, ''))].join('');
          out.push(new RegExp(rx[1], flags));
          continue;
        }
        const q = line.match(/^"(.+)"$/);
        const esc = norm(q ? q[1] : line).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out.push(q
          ? new RegExp('(?<![\\p{L}\\p{N}_])' + esc + '(?![\\p{L}\\p{N}_])', 'iu')
          : new RegExp(esc, 'i'));
      } catch (e) {
        console.warn('[Spoiler Blur] bad keyword line:', line, e);
      }
    }
    return out;
  }
  let KW = compile(KW_TEXT);

  // ================= selectors =================
  const NOTIF = 'ytd-notification-renderer';
  const POST = 'ytd-post-renderer, ytd-backstage-post-renderer, ytd-backstage-post-thread-renderer';
  const VIDEO = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model';
  const ALL_CARDS = [NOTIF, POST, VIDEO].join(',');
  const AVATAR = 'yt-avatar-shape, #avatar, #avatar-container, #author-thumbnail, #author-thumbnail-button, .yt-spec-avatar-shape';

  // parts blurred inside a matching card (thumbnail + title / message / post text)
  const THUMB_IMG = ['ytd-thumbnail img', 'yt-thumbnail-view-model img', '.sf-nm', '.sf-pm'];
  const TITLE_SEL = [
    '#video-title', 'a#video-title-link',
    '.yt-lockup-metadata-view-model__title', '.yt-lockup-metadata-view-model__heading-reset',
    '.message', '#home-content-text', '#content-text', '#post-text', '#attachment',
  ];
  const BLOCK_CLICK = [...THUMB_IMG, ...TITLE_SEL, 'ytd-thumbnail', 'yt-thumbnail-view-model', 'a#thumbnail'].join(',');

  const SAFE = /^\/(feed\/subscriptions|@[^/]+|channel\/|c\/|user\/)/;

  // ================= styles =================
  const flagged = (list) => list.map((s) => `html.sf-on [data-sf-flag="1"]:not(.sf-reveal) ${s}`).join(',');

  GM_addStyle(`
    ${flagged(THUMB_IMG)} { filter: blur(var(--sf-blur, 18px)) !important; }
    ${flagged(TITLE_SEL)} { filter: blur(calc(var(--sf-blur, 18px) * 0.4)) !important; user-select: none; }

    html.sf-on.sf-vall:not(.sf-skip) :is(ytd-thumbnail, yt-thumbnail-view-model) img,
    html.sf-on.sf-vall:not(.sf-skip) .ytp-videowall-still-image,
    html.sf-on.sf-vall:not(.sf-skip) .ytp-ce-covering-image { filter: blur(var(--sf-blur, 18px)) !important; }
    html.sf-on.sf-nall .sf-nm { filter: blur(var(--sf-blur, 18px)) !important; }
    html.sf-on.sf-pall:not(.sf-skip) .sf-pm { filter: blur(var(--sf-blur, 18px)) !important; }

    #sf-panel { position: fixed; top: 56px; right: 16px; width: 380px; max-height: calc(100vh - 80px); overflow: auto;
      z-index: 2147483647; background: #1f1f1f; color: #f1f1f1; border: 1px solid #444; border-radius: 12px;
      padding: 14px 16px; font: 13px/1.4 system-ui, sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.6); }
    #sf-panel h3 { margin: 0; font-size: 15px; }
    #sf-panel .sf-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    #sf-panel .sf-x { cursor: pointer; background: none; border: 0; color: inherit; font-size: 18px; }
    #sf-panel .sf-grp { margin: 12px 0 4px; font-weight: 600; color: #9cc; }
    #sf-panel .sf-row { display: flex; gap: 8px; align-items: center; padding: 2px 0; cursor: pointer; }
    #sf-panel .sf-sub { padding-left: 22px; }
    #sf-panel textarea { width: 100%; box-sizing: border-box; background: #121212; color: #eee; border: 1px solid #555;
      border-radius: 6px; padding: 6px; font: 12px/1.35 ui-monospace, Consolas, monospace; }
    #sf-panel .sf-help { color: #aaa; font-size: 11.5px; margin: 4px 0; }
    #sf-panel button.sf-btn { margin-top: 6px; background: #333; color: #eee; border: 1px solid #555; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
    #sf-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
      background: #222; color: #fff; padding: 8px 16px; border-radius: 8px; font: 14px system-ui; opacity: 0; transition: opacity .2s; pointer-events: none; }
    #sf-toast.show { opacity: 1; }
  `);

  // ================= core logic =================
  const decided = new WeakSet();
  const waiting = new WeakSet();

  function tagMedia(root, cls) {
    root.querySelectorAll('img, video').forEach((m) => {
      if (decided.has(m) || m.closest(AVATAR)) return;
      const apply = () => {
        const w = m.getBoundingClientRect().width;
        if (w === 0) return;           // not laid out yet: retried on a later scan
        decided.add(m);
        if (w >= 64) m.classList.add(cls);
      };
      if (m.tagName === 'IMG' && !m.complete) {
        if (!waiting.has(m)) { waiting.add(m); m.addEventListener('load', apply, { once: true }); }
      } else apply();
    });
  }

  const kindOf = (c) =>
    c.matches(NOTIF) ? 'matchNotifs'
      : (c.matches(POST) || c.querySelector(POST)) ? 'matchPosts'
        : 'matchVideos';

  function scan() {
    if (!S.enabled) return;
    document.querySelectorAll(NOTIF).forEach((n) => tagMedia(n, 'sf-nm'));
    document.querySelectorAll(POST).forEach((p) => tagMedia(p, 'sf-pm'));
    document.querySelectorAll(ALL_CARDS).forEach((c) => {
      const on = S.match && S[kindOf(c)] && KW.some((re) => re.test(norm(c.textContent || '')));
      if (on) c.setAttribute('data-sf-flag', '1');
      else { c.removeAttribute('data-sf-flag'); c.classList.remove('sf-reveal'); }
    });
  }

  let timer = null;
  function scheduleScan(now) {
    if (timer) return;
    timer = setTimeout(() => { timer = null; scan(); }, now ? 0 : 250);
  }

  function updateSkip() {
    document.documentElement.classList.toggle('sf-skip', S.skipSafe && SAFE.test(location.pathname));
  }

  function apply() {
    const h = document.documentElement;
    h.classList.toggle('sf-on', S.enabled);
    h.classList.toggle('sf-vall', S.vall);
    h.classList.toggle('sf-nall', S.nall);
    h.classList.toggle('sf-pall', S.pall);
    h.style.setProperty('--sf-blur', S.blur + 'px');
    updateSkip();
    scheduleScan(true);
  }

  // Normal clicks on blurred parts do nothing; Alt+click reveals/hides the item.
  function onClick(e) {
    if (!S.enabled || !e.target.closest) return;
    const card = e.target.closest('[data-sf-flag="1"]');
    if (!card) return;
    const isNotif = card.matches(NOTIF);
    const hitBlurred = e.target.closest(BLOCK_CLICK);
    const hitButton = e.target.closest('button, yt-icon-button, #menu');
    if (isNotif ? hitButton : !hitBlurred) return;
    if (card.classList.contains('sf-reveal') && !e.altKey) return;
    if (e.altKey) card.classList.toggle('sf-reveal');
    e.preventDefault();
    e.stopPropagation();
  }

  // ================= settings changes =================
  const boxes = {};
  function syncUI() {
    for (const [k, input] of Object.entries(boxes)) if (input.isConnected) input.checked = !!S[k];
  }
  function setS(key, val) {
    S[key] = val;
    save();
    apply();
    rebuildMenu();
    syncUI();
  }

  function toast(msg) {
    const b = document.body;
    if (!b) return;
    let t = document.getElementById('sf-toast');
    if (!t) { t = document.createElement('div'); t.id = 'sf-toast'; b.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 1500);
  }

  function toggleMaster() {
    setS('enabled', !S.enabled);
    toast('Spoiler blur: ' + (S.enabled ? 'ON' : 'OFF'));
  }

  // ================= Violentmonkey menu =================
  const menuCaps = {};
  function addCmd(key, caption, fn) {
    try { GM_unregisterMenuCommand(key); } catch (e) { /* ignore */ }
    if (menuCaps[key]) { try { GM_unregisterMenuCommand(menuCaps[key]); } catch (e) { /* ignore */ } }
    menuCaps[key] = caption;
    try { GM_registerMenuCommand(caption, fn, { id: key, autoClose: false }); }
    catch (e) { GM_registerMenuCommand(caption, fn); }
  }
  const mark = (v) => (v ? '☑' : '☐');
  function rebuildMenu() {
    addCmd('master', (S.enabled ? '🟢 Script ON' : '🔴 Script OFF') + ' (click to toggle)', toggleMaster);
    addCmd('match', mark(S.match) + ' Blur keyword matches', () => setS('match', !S.match));
    addCmd('vall', mark(S.vall) + ' Blur ALL video thumbnails', () => setS('vall', !S.vall));
    addCmd('nall', mark(S.nall) + ' Blur ALL notification images', () => setS('nall', !S.nall));
    addCmd('pall', mark(S.pall) + ' Blur ALL post images', () => setS('pall', !S.pall));
    addCmd('panel', '⚙ Open settings panel / edit keywords', openPanel);
  }

  // ================= settings panel =================
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n[k] = v;
    }
    kids.forEach((c) => n.append(c));
    return n;
  }

  function checkbox(key, label, sub) {
    const input = el('input', { type: 'checkbox', checked: !!S[key], onchange: () => setS(key, input.checked) });
    boxes[key] = input;
    return el('label', { class: 'sf-row' + (sub ? ' sf-sub' : '') }, input, el('span', {}, label));
  }

  function openPanel() {
    const old = document.getElementById('sf-panel');
    if (old) { old.remove(); return; }

    const slider = el('input', {
      type: 'range', min: 4, max: 40, value: S.blur,
      oninput: () => setS('blur', +slider.value),
    });

    let kwTimer;
    const ta = el('textarea', {
      rows: 12, spellcheck: false, value: KW_TEXT,
      oninput: () => {
        clearTimeout(kwTimer);
        kwTimer = setTimeout(() => {
          KW_TEXT = ta.value;
          GM_setValue('keywords', KW_TEXT);
          KW = compile(KW_TEXT);
          scheduleScan(true);
        }, 400);
      },
    });

    const panel = el('div', { id: 'sf-panel' },
      el('div', { class: 'sf-head' },
        el('h3', {}, 'YouTube Spoiler Blur'),
        el('button', { class: 'sf-x', textContent: '×', onclick: () => panel.remove() })),
      checkbox('enabled', 'Script enabled (Alt+Shift+B)'),

      el('div', { class: 'sf-grp' }, 'Blur when keywords match (thumbnail + title only)'),
      checkbox('match', 'Keyword blur on'),
      checkbox('matchVideos', 'Video cards', true),
      checkbox('matchNotifs', 'Notifications', true),
      checkbox('matchPosts', 'Posts', true),

      el('div', { class: 'sf-grp' }, 'Blur without keywords'),
      checkbox('vall', 'All video thumbnails'),
      checkbox('nall', 'All images in notifications'),
      checkbox('pall', 'All images in posts'),
      checkbox('skipSafe', 'Skip Subscriptions and channel pages', true),

      el('div', { class: 'sf-grp' }, 'Blur strength'),
      slider,

      el('div', { class: 'sf-grp' }, 'Keywords'),
      el('div', { class: 'sf-help' },
        'One per line, not case-sensitive. word = partial match · "word" = whole word only · /regex/i = regex · lines starting with "# " are comments.'),
      ta,
      el('button', {
        class: 'sf-btn', textContent: 'Reset keywords to default',
        onclick: () => {
          if (!confirm('Reset the keyword list to the default?')) return;
          ta.value = DEFAULT_KEYWORDS;
          ta.dispatchEvent(new Event('input'));
        },
      }),
      el('div', { class: 'sf-help' }, 'Alt+click a blurred item to reveal it. Changes apply instantly.'),
    );
    (document.body || document.documentElement).appendChild(panel);
  }

  // ================= start =================
  function onNav() { updateSkip(); scheduleScan(); }

  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { const p = document.getElementById('sf-panel'); if (p) p.remove(); return; }
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (e.altKey && e.shiftKey && e.code === 'KeyB' && !/INPUT|TEXTAREA/.test(tag)) {
      e.preventDefault();
      toggleMaster();
    }
  }, true);

  ['yt-navigate-finish', 'yt-page-data-updated'].forEach((ev) => {
    document.addEventListener(ev, onNav);
    window.addEventListener(ev, onNav);
  });
  setInterval(updateSkip, 1000);

  apply();
  rebuildMenu();
  new MutationObserver(() => scheduleScan()).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
  });
})();
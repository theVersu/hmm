// ==UserScript==
// @name         Novel Cross-Redirector (Auto-Resolving Path Fixer)
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Cross-redirect sidebar that builds candidate URLs for each novel site and VERIFIES every one (status, redirect target, page title) before linking to it. Detects which NovelPing/NovelArrow domain is live.
// @author       Gemini, Claude
// @match        *://*.webnovel.com/*
// @match        *://*.novelfire.net/*
// @match        *://*.novelphoenix.com/*
// @match        *://*.mvlempyr.io/*
// @match        *://*.novelping.com/*
// @match        *://*.novelarrow.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      webnovel.com
// @connect      novelfire.net
// @connect      novelphoenix.com
// @connect      mvlempyr.io
// @connect      novelping.com
// @connect      novelarrow.com
// @connect      yueimg.com
// @connect      mvlempyr.app
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Novel%20Cross-Redirector.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Novel%20Cross-Redirector.js
// ==/UserScript==

(function () {
    'use strict';

    /* ------------------------------------------------------------------ *
     *  Config
     * ------------------------------------------------------------------ */

    const CACHE_PREFIX = 'ncs2:';
    const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // verified links are remembered for 14 days
    const PROBE_TIMEOUT_MS = 8000;
    const PROBE_CONCURRENCY = 3;                   // parallel probes per site
    const MAX_CANDIDATES = 30;

    // Suffixes sites append to disambiguate novels. Tried in this order after the bare slug.
    const SUFFIXES = ['', '-wn', '-novel', '-v1', '-v2', '-kr-web-novel', '-web-novel'];

    // Patterns stripped from a slug to get the "core" title.
    const STRIP_PATTERNS = [
        /-kr-web-novel$/,
        /-web-novel$/,
        /-wn$/,
        /-novel$/,
        /-v\d+$/,
        // one-off long subtitle seen on some sites
        /-abnormal-state-skillas-i-devastated-everything$/,
        /-abnormal-state-skill-as-i-devastated-everything$/
    ];

    const SITE_PREFIX = {
        novelfire: 'https://novelfire.net/book/',
        novelphoenix: 'https://novelphoenix.com/novel/',
        mvlempyr: 'https://www.mvlempyr.io/novel/',
        novelping: 'https://novelping.com/book/',
        novelarrow: 'https://novelarrow.com/novel/'
    };

    // Domains that are the SAME site under different names over time (novelbin -> novelarrow -> novelping ...).
    // Only one is live at a time and the dead one redirects to the live one. Order = preference if both respond.
    // To add another former/future domain: add it here + SITE_PREFIX + SITE_LOGOS and the @match/@connect lines.
    const MIRRORS = [
        { key: 'novelping',  name: 'NovelPing',  host: 'novelping.com',  home: 'https://novelping.com/' },
        { key: 'novelarrow', name: 'NovelArrow', host: 'novelarrow.com', home: 'https://novelarrow.com/' }
    ];
    const MIRROR_TTL_MS = 30 * 60 * 1000; // re-check which domain is live every 30 min

    /* ---- pure helpers start ---- */

    const bareHost = h => (h || '').toLowerCase().replace(/^www\./, '');

    // Each result = { ok, host } for the matching MIRRORS entry: whether it answered and which host it
    // ended up on after redirects. Every answer "votes" for the mirror it landed on, so
    // novelarrow -> redirects to novelping + novelping answering = 2 votes for novelping.
    function decideMirror(results) {
        const votes = MIRRORS.map(() => 0);
        results.forEach(r => {
            if (!r || !r.ok) return;
            const i = MIRRORS.findIndex(m => m.host === bareHost(r.host));
            if (i !== -1) votes[i]++;
        });
        let best = -1;
        votes.forEach((v, i) => {
            if (v > 0 && (best === -1 || v > votes[best])) best = i;
        });
        return best === -1 ? null : MIRRORS[best];
    }

    // Catches JS / <meta refresh> redirects that GM_xmlhttpRequest doesn't follow.
    function clientRedirectHost(html) {
        if (!html || html.length > 20000) return '';
        const m = html.match(/(?:url\s*=|location(?:\.href)?\s*=|location\.(?:replace|assign)\()\s*['"]?\s*(https?:\/\/[^'"\s>)]+)/i);
        if (!m) return '';
        try {
            const h = bareHost(new URL(m[1]).hostname);
            return MIRRORS.some(x => x.host === h) ? h : '';
        } catch (e) {
            return '';
        }
    }

    // Letters+digits only, lowercased, accents removed. Used to compare titles regardless of
    // hyphens / apostrophes / punctuation ("Hero's Sword" == "hero-s-sword" == "heros-sword").
    function compact(s) {
        return (s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, '');
    }

    function slugify(text, apos, amp) {
        let s = (text || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        s = s.replace(/&/g, amp === 'and' ? ' and ' : ' ');
        // apostrophe handling differs per site: "heros" (dropped) vs "hero-s" (hyphenated)
        s = s.replace(/['\u2018\u2019`\u00B4]/g, apos === 'hyphen' ? '-' : '');
        return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    function stripSuffixes(slug) {
        let s = (slug || '').toLowerCase();
        let changed = true;
        while (changed) {
            changed = false;
            for (const re of STRIP_PATTERNS) {
                const next = s.replace(re, '');
                if (next !== s && next.length > 0) {
                    s = next;
                    changed = true;
                }
            }
        }
        return s;
    }

    // Ordered, de-duplicated list of base slugs to try for a novel.
    function getBaseSlugs(info) {
        const bases = [];

        if (info.title) {
            // Title-derived (Webnovel has no slug we can reuse, so build every plausible form).
            const apoModes = ['drop', 'hyphen'];
            const ampModes = /&/.test(info.title) ? ['drop', 'and'] : ['drop'];
            for (const apos of apoModes) {
                for (const amp of ampModes) {
                    bases.push(slugify(info.title, apos, amp));
                }
            }
        }

        if (info.slug) {
            const core = stripSuffixes(info.slug);
            bases.push(core);
            // "hero-s-sword" -> "heros-sword"
            const merged = core.replace(/([a-z0-9])-s(?=-|$)/g, '$1s');
            if (merged !== core) bases.push(merged);
        }

        return Array.from(new Set(bases.filter(Boolean)));
    }

    function getCandidateUrls(siteKey, info) {
        if (siteKey === 'webnovel') {
            const words = (info.title || stripSuffixes(info.slug)).replace(/-/g, ' ');
            return [`https://www.webnovel.com/search?keywords=${encodeURIComponent(words)}`];
        }

        const prefix = SITE_PREFIX[siteKey];
        if (!prefix) return [];

        const list = [];

        // Exact slug from a non-Webnovel source goes first (the other site may use the same one).
        if (info.rawSlug) list.push(prefix + info.rawSlug);

        const bases = getBaseSlugs(info);
        for (const base of bases) {
            for (const suf of SUFFIXES) {
                list.push(prefix + base + suf);
            }
        }

        return Array.from(new Set(list)).slice(0, MAX_CANDIDATES);
    }

    function titleMatches(expected, found) {
        if (!expected || !found) return false;
        if (found.includes(expected)) return true;
        // page title shorter than ours (e.g. we have a subtitle it lacks)
        return found.length >= 6 && found.length >= expected.length * 0.6 && expected.includes(found);
    }

    /* ---- pure helpers end ---- */

    /* ------------------------------------------------------------------ *
     *  Cache (shared across all matched sites via GM storage)
     * ------------------------------------------------------------------ */

    function cacheGet(key, ttl = CACHE_TTL_MS) {
        try {
            if (typeof GM_getValue !== 'function') return null;
            const raw = GM_getValue(CACHE_PREFIX + key, null);
            if (!raw) return null;
            const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (!obj || !obj.url || Date.now() - obj.t > ttl) return null;
            return obj.url;
        } catch (e) {
            return null;
        }
    }

    function cacheSet(key, url) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(CACHE_PREFIX + key, JSON.stringify({ url, t: Date.now() }));
            }
        } catch (e) {}
    }

    /* ------------------------------------------------------------------ *
     *  Styles
     * ------------------------------------------------------------------ */

    function injectCSS() {
        if (document.getElementById('ncs-styles')) return;

        const css = `
            #novel-cross-sidebar {
                position: fixed !important;
                top: 50% !important;
                left: 10px !important;
                transform: translateY(-50%) !important;
                z-index: 2147483647 !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 12px !important;
                padding: 0 !important;
                background: transparent !important;
                border: none !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                pointer-events: auto !important;
            }

            .ncs-btn {
                position: relative !important;
                width: 38px !important;
                height: 38px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                text-decoration: none !important;
                transition: transform 0.2s ease, filter 0.2s ease, opacity 0.2s ease !important;
                cursor: pointer !important;
                user-select: none !important;
                background-color: transparent !important;
                border: none !important;
                padding: 0 !important;
                margin: 0 !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                border-radius: 8px !important;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4) !important;
                line-height: 0 !important;
                font-size: 0 !important;
            }

            .ncs-btn:hover {
                transform: scale(1.2) !important;
                filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.7)) brightness(1.15) !important;
            }

            /* Link is being verified */
            .ncs-btn.ncs-checking {
                opacity: 0.55 !important;
                animation: ncs-pulse 1.2s ease-in-out infinite !important;
            }
            @keyframes ncs-pulse { 50% { opacity: 0.9; } }

            /* Could not verify any candidate - link is a best guess and may 404 */
            .ncs-btn.ncs-unverified {
                box-shadow: 0 0 0 2px #f59e0b, 0 2px 8px rgba(0, 0, 0, 0.4) !important;
            }

            .ncs-btn img {
                width: 100% !important;
                height: 100% !important;
                object-fit: contain !important;
                pointer-events: none !important;
                display: block !important;
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
            }

            /* Novelfire - #121212 background card */
            .ncs-btn-novelfire {
                background-color: #121212 !important;
            }

            .ncs-btn-novelfire img {
                width: 100% !important;
                height: 100% !important;
                object-fit: contain !important;
            }

            /* NovelPhoenix - #121212 card + mix-blend-mode lighten */
            .ncs-btn-novelphoenix {
                background-color: #121212 !important;
            }

            .ncs-btn-novelphoenix img {
                width: 100% !important;
                height: 100% !important;
                object-fit: contain !important;
                filter: invert(1) hue-rotate(180deg) brightness(0.8) !important;
                mix-blend-mode: lighten !important;
            }

            /* NovelPing - #14425d card */
            .ncs-btn-novelping {
                background-color: #14425d !important;
            }

            .ncs-btn-novelping img {
                width: 100% !important;
                height: 100% !important;
                object-fit: contain !important;
            }

            /* Hover Tooltip */
            .ncs-btn::after {
                content: attr(data-tooltip) !important;
                position: absolute !important;
                left: 100% !important;
                top: 50% !important;
                transform: translateY(-50%) translateX(10px) !important;
                background: #0f172a !important;
                color: #ffffff !important;
                padding: 6px 12px !important;
                font-size: 12px !important;
                font-weight: 600 !important;
                white-space: nowrap !important;
                border-radius: 8px !important;
                opacity: 0 !important;
                pointer-events: none !important;
                transition: opacity 0.2s ease, filter 0.2s ease !important;
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5) !important;
                border: 1px solid rgba(255, 255, 255, 0.2) !important;
                line-height: 1.2 !important;
            }

            .ncs-btn:hover::after {
                opacity: 1 !important;
                transform: translateY(-50%) translateX(14px) !important;
            }
        `;

        const style = document.createElement('style');
        style.id = 'ncs-styles';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    /* ------------------------------------------------------------------ *
     *  Reading the novel from the current page
     * ------------------------------------------------------------------ */

    function getSourceInfo() {
        const host = window.location.hostname;
        const parts = window.location.pathname.split('/').filter(Boolean);

        let slug = '';
        const idx = parts.findIndex(p => p === 'book' || p === 'novel');
        if (idx !== -1 && parts[idx + 1]) {
            slug = parts[idx + 1];
            if (host.includes('webnovel.com')) slug = slug.replace(/_\d+$/, '');
        }

        let title = '';
        const isWebnovel = host.includes('webnovel.com');

        // Only read the title on an actual novel/chapter page (URL has /book/<slug>). On the homepage,
        // lists, rankings etc. the page is full of OTHER novels' thumbnails and must not be mistaken for ours.
        if (isWebnovel && slug) {
            const h1El = document.querySelector('h1.pt4.fs16');
            const imgAltEl = document.querySelector('.g_thumb img');
            const breadcrumbEl = document.querySelector('.det-hd span');

            if (h1El && h1El.textContent.trim()) {
                title = h1El.textContent.trim();
            } else if (imgAltEl && imgAltEl.getAttribute('alt')) {
                title = imgAltEl.getAttribute('alt').trim();
            } else if (breadcrumbEl && breadcrumbEl.textContent.trim()) {
                title = breadcrumbEl.textContent.trim();
            }

            // Webnovel is partly client-rendered: if the DOM title doesn't agree with the URL
            // it's stale (previous novel) or a recommendation thumbnail - trust the URL instead.
            if (title) {
                const a = compact(title);
                const b = compact(stripSuffixes(slug));
                if (a && b && !a.includes(b) && !b.includes(a)) title = '';
            }
        }

        const key = compact(title || stripSuffixes(slug));

        return {
            title,
            slug,
            // exact slug is only reusable when it came from a non-Webnovel site
            rawSlug: isWebnovel ? '' : slug,
            key
        };
    }

    /* ------------------------------------------------------------------ *
     *  Candidate verification
     * ------------------------------------------------------------------ */

    // Returns { state: 'ok' | 'weak' | 'fail', url }
    //   ok   = page loaded, stayed on a novel page, and its title/heading matches our novel
    //   weak = page loaded fine but exposes no title info to compare (client-rendered shell)
    //   fail = 404, redirected away (home/search/listing), or it is a different novel
    function judgeResponse(response, requestedUrl, siteKey, expectedKey) {
        const fail = { state: 'fail', url: requestedUrl };

        if (!response || response.status !== 200) return fail;

        let finalU, reqU;
        try {
            finalU = new URL(response.finalUrl || requestedUrl);
            reqU = new URL(requestedUrl);
        } catch (e) {
            return fail;
        }

        // Same host - or a redirect between the mirror domains (stale detection still ends up right)
        const fh = bareHost(finalU.hostname);
        const rh = bareHost(reqU.hostname);
        const bothMirrors = MIRRORS.some(m => m.host === fh) && MIRRORS.some(m => m.host === rh);
        if (fh !== rh && !bothMirrors) return fail;

        // Must still be a novel page: /book/<something> or /novel/<something>
        if (!/^\/(book|novel)\/[^/]+/.test(finalU.pathname)) return fail;

        let doc;
        try {
            doc = new DOMParser().parseFromString(response.responseText || '', 'text/html');
        } catch (e) {
            return fail;
        }

        const meta = sel => {
            const el = doc.querySelector(sel);
            return el ? (el.getAttribute('content') || '').trim() : '';
        };

        const headings = [
            meta('meta[property="og:title"]'),
            meta('meta[name="twitter:title"]'),
            ...Array.from(doc.querySelectorAll('h1')).slice(0, 3).map(h => h.textContent.trim())
        ].filter(Boolean);

        const docTitle = (doc.title || '').trim();
        const allTexts = docTitle ? headings.concat(docTitle) : headings;

        // Soft-404 detection (page returns 200 but says it doesn't exist)
        if (allTexts.some(t => /\b(404|page not found|not found)\b/i.test(t))) return fail;

        const url = finalU.origin + finalU.pathname;

        if (allTexts.some(t => titleMatches(expectedKey, compact(t)))) {
            return { state: 'ok', url };
        }

        // Nothing to compare against -> can't prove it, but it isn't clearly wrong either
        if (headings.length === 0) return { state: 'weak', url };

        return fail; // page has a title and it's a different novel
    }

    /* ------------------------------------------------------------------ *
     *  Sidebar state
     * ------------------------------------------------------------------ */

    let generation = 0; // bumped on every rebuild so late async results are ignored

    function setState(btn, site, state, url) {
        if (url) btn.href = url;
        btn.classList.toggle('ncs-checking', state === 'checking');
        btn.classList.toggle('ncs-unverified', state === 'unverified');

        let label = site.name;
        if (state === 'checking') label += ' \u00B7 checking\u2026';
        else if (state === 'unverified') label += ' \u00B7 unverified (may not exist)';
        btn.setAttribute('data-tooltip', label);
    }

    // Probe every candidate (a few at a time) and link to the HIGHEST-PRIORITY one that verifies.
    function resolveLink(site, info, btn, gen, onFail) {
        const candidates = getCandidateUrls(site.key, info);
        if (candidates.length === 0) {
            setState(btn, site, 'unverified', site.defaultUrl);
            return;
        }

        // Webnovel target is a search page - nothing to verify
        if (site.key === 'webnovel') {
            setState(btn, site, 'ok', candidates[0]);
            return;
        }

        const cacheKey = site.key + ':' + info.key;
        const cached = cacheGet(cacheKey);
        if (cached) {
            setState(btn, site, 'ok', cached);
            return;
        }

        // Until something verifies, point at the best guess
        setState(btn, site, 'checking', candidates[0]);

        if (typeof GM_xmlhttpRequest !== 'function') {
            setState(btn, site, 'unverified', candidates[0]);
            return;
        }

        const results = new Array(candidates.length).fill(null);
        let next = 0;
        let active = 0;
        let finished = false;

        function finish(state, url) {
            if (finished) return;
            finished = true;
            if (gen !== generation) return;
            if (state === 'ok') {
                cacheSet(cacheKey, url);
                setState(btn, site, 'ok', url);
            } else if (state === 'weak') {
                setState(btn, site, 'ok', url);
            } else {
                setState(btn, site, 'unverified', candidates[0]);
                if (onFail) onFail();
            }
        }

        function settle() {
            if (finished) return;
            if (gen !== generation) { finished = true; return; }

            let weak = null;
            let pending = false;

            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                if (!r) { pending = true; break; }      // can't decide past an unfinished higher-priority candidate
                if (r.state === 'ok') return finish('ok', r.url);
                if (r.state === 'weak' && !weak) weak = r;
            }

            if (pending) return;
            if (weak) return finish('weak', weak.url);
            finish('fail');
        }

        function launch(i) {
            active++;
            const target = candidates[i];
            let done = false;

            const complete = result => {
                if (done) return;
                done = true;
                active--;
                results[i] = result;
                settle();
                pump();
            };

            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: target,
                    timeout: PROBE_TIMEOUT_MS,
                    onload: response => complete(judgeResponse(response, target, site.key, info.key)),
                    onerror: () => complete({ state: 'fail', url: target }),
                    ontimeout: () => complete({ state: 'fail', url: target }),
                    onabort: () => complete({ state: 'fail', url: target })
                });
            } catch (e) {
                complete({ state: 'fail', url: target });
            }
        }

        function pump() {
            while (!finished && active < PROBE_CONCURRENCY && next < candidates.length) {
                launch(next++);
            }
        }

        pump();
    }

    /* ------------------------------------------------------------------ *
     *  Which mirror (NovelPing / NovelArrow / ...) is live right now?
     * ------------------------------------------------------------------ */

    let mirrorWaiters = null; // callbacks waiting on an in-flight detection

    // Requests every mirror's home page. The dead domain redirects to the live one, so each answer
    // (including where it ended up) votes for the live domain. Result is cached for MIRROR_TTL_MS.
    function detectLiveMirror(cb) {
        const cachedKey = cacheGet('mirror', MIRROR_TTL_MS);
        const hit = cachedKey && MIRRORS.find(m => m.key === cachedKey);
        if (hit) return cb(hit);

        if (mirrorWaiters) {
            mirrorWaiters.push(cb);
            return;
        }
        mirrorWaiters = [cb];

        const results = new Array(MIRRORS.length).fill(null);
        let remaining = MIRRORS.length;

        function record(i, r) {
            if (results[i]) return;
            results[i] = r;
            if (--remaining > 0) return;

            const live = decideMirror(results);
            if (live) cacheSet('mirror', live.key);
            const waiters = mirrorWaiters;
            mirrorWaiters = null;
            waiters.forEach(fn => fn(live));
        }

        MIRRORS.forEach((m, i) => {
            if (typeof GM_xmlhttpRequest !== 'function') return record(i, { ok: false });
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: m.home,
                    timeout: PROBE_TIMEOUT_MS,
                    onload: r => {
                        let host = m.host;
                        try { host = new URL(r.finalUrl || m.home).hostname; } catch (e) {}
                        // JS / meta-refresh redirect to the other mirror
                        const client = clientRedirectHost(r.responseText);
                        if (client && client !== bareHost(host)) host = client;
                        // 200 = served; 403 = live site behind a bot challenge. 404/5xx = not really live.
                        record(i, { ok: r.status === 200 || r.status === 403, host });
                    },
                    onerror: () => record(i, { ok: false }),
                    ontimeout: () => record(i, { ok: false }),
                    onabort: () => record(i, { ok: false })
                });
            } catch (e) {
                record(i, { ok: false });
            }
        });
    }

    /* ------------------------------------------------------------------ *
     *  Logos
     * ------------------------------------------------------------------ */

    const SITE_LOGOS = {
        webnovel: 'https://www.yueimg.com/en/images/logo2x.3a9b0fa4.png',
        novelfire: 'https://novelfire.net/logo.svg',
        novelphoenix: 'https://novelphoenix.com/logo.svg',
        mvlempyr: 'https://assets.mvlempyr.app/images/asset/LogoMage.webp',
        novelping: 'https://images.novelping.com/domains/novelping.com/logoWordmark-2812f44b643a.png',
        novelarrow: 'https://images.novelarrow.com/domains/novelarrow.com/logoIcon-489c4a652c8e.svg'
    };

    const imageBase64Cache = {};

    function loadLogoAsBase64(siteKey, url, imgElement) {
        if (imageBase64Cache[siteKey]) {
            imgElement.src = imageBase64Cache[siteKey];
            return;
        }

        imgElement.src = url;

        if (typeof GM_xmlhttpRequest === 'function') {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                onload: function (response) {
                    if (response.status === 200) {
                        const reader = new FileReader();
                        reader.onloadend = function () {
                            if (siteKey === 'novelping') {
                                const tempImg = new Image();
                                tempImg.onload = function () {
                                    const canvas = document.createElement('canvas');
                                    const cropWidth = Math.floor(tempImg.width * 0.70);
                                    canvas.width = cropWidth;
                                    canvas.height = tempImg.height;
                                    const ctx = canvas.getContext('2d');
                                    ctx.drawImage(tempImg, 0, 0, cropWidth, tempImg.height, 0, 0, cropWidth, tempImg.height);

                                    const trimmedBase64 = canvas.toDataURL('image/png');
                                    imageBase64Cache[siteKey] = trimmedBase64;
                                    imgElement.src = trimmedBase64;
                                };
                                tempImg.src = reader.result;
                            } else {
                                imageBase64Cache[siteKey] = reader.result;
                                imgElement.src = reader.result;
                            }
                        };
                        reader.readAsDataURL(response.response);
                    }
                }
            });
        }
    }

    /* ------------------------------------------------------------------ *
     *  Sidebar build
     * ------------------------------------------------------------------ */

    function initSidebar() {
        const info = getSourceInfo();
        const sig = window.location.pathname + '|' + info.key;

        const existing = document.getElementById('novel-cross-sidebar');
        if (existing) {
            // Same page + same novel: nothing to do. Otherwise (SPA navigation to another novel,
            // or the title only appeared after load) rebuild so links never go stale.
            if (existing.getAttribute('data-sig') === sig) return;
            existing.remove();
        }

        injectCSS();
        const gen = ++generation;

        const host = window.location.hostname;
        const onMirror = MIRRORS.some(m => host.includes(m.host));

        const sites = [
            { name: 'Webnovel',     key: 'webnovel',     logo: SITE_LOGOS.webnovel,     defaultUrl: 'https://www.webnovel.com/',  isCurrent: host.includes('webnovel.com') },
            { name: 'Novelfire',    key: 'novelfire',    logo: SITE_LOGOS.novelfire,    defaultUrl: 'https://novelfire.net/home', isCurrent: host.includes('novelfire.net') },
            { name: 'NovelPhoenix', key: 'novelphoenix', logo: SITE_LOGOS.novelphoenix, defaultUrl: 'https://novelphoenix.com/',  isCurrent: host.includes('novelphoenix.com') },
            { name: 'Mvlempyr',     key: 'mvlempyr',     logo: SITE_LOGOS.mvlempyr,     defaultUrl: 'https://www.mvlempyr.io/',   isCurrent: host.includes('mvlempyr.io') },
            // One slot for the NovelPing/NovelArrow(/...) family; which domain it points to is detected live.
            { name: 'NovelPing/NovelArrow', key: 'mirror',       logo: null,                    defaultUrl: MIRRORS[0].home,              isCurrent: onMirror }
        ];

        const container = document.createElement('div');
        container.id = 'novel-cross-sidebar';
        container.setAttribute('data-sig', sig);

        sites.forEach(site => {
            if (site.isCurrent) return;

            const btn = document.createElement('a');
            btn.target = '_blank';
            btn.className = `ncs-btn ncs-btn-${site.key}`;
            btn.setAttribute('data-tooltip', site.name);

            const img = document.createElement('img');
            img.alt = site.name;

            if (site.key === 'mirror') {
                // Find the domain that is online right now, then restyle + resolve against it
                setState(btn, site, 'checking', site.defaultUrl);
                detectLiveMirror(live => {
                    if (gen !== generation) return;
                    const m = live || MIRRORS[0]; // detection failed -> best guess, verified below
                    const resolved = { name: m.name, key: m.key, defaultUrl: m.home };

                    btn.className = `ncs-btn ncs-btn-${m.key}`;
                    img.alt = m.name;
                    loadLogoAsBase64(m.key, SITE_LOGOS[m.key], img);

                    if (info.key) {
                        // if nothing verifies, forget the cached detection so the next page re-checks
                        resolveLink(resolved, info, btn, gen, () => cacheSet('mirror', ''));
                    } else {
                        setState(btn, resolved, live ? 'ok' : 'unverified', m.home);
                    }
                });
            } else {
                if (info.key) {
                    resolveLink(site, info, btn, gen);
                } else {
                    btn.href = site.defaultUrl;
                }
                loadLogoAsBase64(site.key, site.logo, img);
            }

            btn.appendChild(img);
            container.appendChild(btn);
        });

        const targetEl = document.body || document.documentElement;
        if (targetEl) {
            targetEl.appendChild(container);
        }
    }

    initSidebar();
    setInterval(initSidebar, 1500);
})();

// ==UserScript==
// @name         Novel Cross-Redirector (Auto-Resolving Path Fixer)
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Cross-redirect sidebar that builds candidate URLs for each novel site and VERIFIES every one (status, redirect target, page title) before linking to it. Detects which NovelPing/NovelArrow domain is live, hides itself on mobile, and links to the SAME CHAPTER on other sites where possible.
// @author       Claude
// @match        *://*.webnovel.com/*
// @match        *://*.novelfire.net/*
// @match        *://*.novelphoenix.com/*
// @match        *://*.mvlempyr.io/*
// @match        *://*.novelping.com/*
// @match        *://*.novelarrow.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
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
    const PROBE_TIMEOUT_MS = 12000;
    const PROBE_CONCURRENCY = 3;                   // parallel probes per site
    const MAX_CANDIDATES = 42;

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

    // Mobile layout: sidebar is hidden and slides in from the left when the small tab is tapped.
    const MOBILE_TAB_TOP = '50%';   // vertical position of the pull tab (e.g. '35%' to move it up)

    // Chapter links can be built for every target except Webnovel (its chapter URLs use its own chapter IDs),
    // which always gets a search page instead.
    //   'number' = .../chapter-16                      (NovelFire + NovelPhoenix: same software/layout)
    //   'title'  = .../chapter-16-into-the-breach      (NovelPing / NovelArrow)
    //   'mvlempyr' = /chapter/<novel id>-16            (the id is the cover image's file name: .../images/900/14613.webp)
    const CHAPTER_STYLE = {
        novelfire: 'number',
        novelphoenix: 'number',
        novelping: 'title',
        novelarrow: 'title',
        mvlempyr: 'mvlempyr'
    };

    const DEBUG = false;            // true = log what the script read from the page to the browser console

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

    // apos  : "drop" -> heros          | "hyphen" -> hero-s
    // amp   : "drop" -> (nothing)      | "and"    -> and
    // num   : "join" -> 10,000x=10000x | "hyphen" -> 10-000x          (commas inside numbers)
    // punct : "hyphen" -> re-zero      | "drop"   -> rezero           (any other punctuation)
    // Sites differ on every one of these, so callers generate the combinations and the right one is verified.
    function slugify(text, apos, amp, num, punct) {
        let s = (text || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        s = s.replace(/&/g, amp === 'and' ? ' and ' : ' ');
        s = s.replace(/['\u2018\u2019`\u00B4]/g, apos === 'hyphen' ? '-' : '');
        if (num === 'join') s = s.replace(/(\d),(?=\d)/g, '$1');
        if (punct === 'drop') s = s.replace(/[^a-z0-9\s-]+/g, '');
        return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    // Every plausible slug for a title, most common conventions first, de-duplicated
    // (a title without apostrophes / number commas / odd punctuation collapses to just 1-2 slugs).
    function titleSlugVariants(text) {
        if (!text) return [];
        const amps = /&/.test(text) ? ['drop', 'and'] : ['drop'];
        const combos = [            // [apostrophe, comma-in-number, other punctuation]
            ['drop', 'join', 'hyphen'],
            ['drop', 'hyphen', 'hyphen'],
            ['hyphen', 'join', 'hyphen'],
            ['hyphen', 'hyphen', 'hyphen'],
            ['drop', 'join', 'drop'],
            ['hyphen', 'join', 'drop']
        ];
        const out = [];
        for (const amp of amps) {
            for (const c of combos) out.push(slugify(text, c[0], amp, c[1], c[2]));
        }
        return Array.from(new Set(out.filter(Boolean)));
    }

    // Slug -> its other number spellings:  ...-10-000x-... <-> ...-10000x-...
    function slugNumberVariants(slug) {
        const out = [];

        let joined = slug;
        for (let i = 0; i < 4; i++) {
            const next = joined.replace(/(\d)-(\d{3})(?=-|[a-z]|$)/g, '$1$2');
            if (next === joined) break;
            joined = next;
        }
        if (joined !== slug) out.push(joined);

        const split = slug.replace(/(?<!\d)(\d{4,9})(?!\d)/g, m => m.replace(/\B(?=(\d{3})+(?!\d))/g, '-'));
        if (split !== slug) out.push(split);

        return out;
    }

    const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'of', 'in', 'on', 'to', 'is', 'for', 'my', 'i', 'with', 'at', 'by']);

    function tokens(s) {
        return (s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/(\d)[,](?=\d)/g, '$1')
            .replace(/(\d)-(?=\d{3}(?!\d))/g, '$1')
            .replace(/['\u2018\u2019`]/g, '')
            .split(/[^\p{L}\p{N}]+/u)
            .filter(Boolean);
    }

    // Fallback when the exact title differs slightly ("Heroes & Villains" vs "Heroes and Villains"):
    // most of the meaningful words must be present.
    function tokensMatch(expected, foundText) {
        const exp = (expected || []).filter(t => !STOP_WORDS.has(t));
        if (exp.length < 3) return false;
        const found = new Set(tokens(foundText));
        let hit = 0;
        for (const t of exp) if (found.has(t)) hit++;
        return hit / exp.length >= 0.85;
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
            bases.push.apply(bases, titleSlugVariants(info.title));
        }

        if (info.slug) {
            const core = stripSuffixes(info.slug);
            // "hero-s-sword" -> "heros-sword"
            const merged = core.replace(/([a-z0-9])-s(?=-|$)/g, '$1s');
            [core, merged].forEach(c => {
                bases.push(c);
                bases.push.apply(bases, slugNumberVariants(c));
            });
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

        // Suffix-major: every spelling is tried with the most common (empty) suffix before moving on,
        // so a long list of spellings can never push the right one past the cap.
        const bases = getBaseSlugs(info);
        for (const suf of SUFFIXES) {
            for (const base of bases) {
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

    // "Chapter 16: Into The Breach" -> { n: 16, title: 'Into The Breach' }
    // Repeated prefixes ("Chapter 1: Chapter 1: Foo") and a trailing reader-progress "| 3.89%" are removed.
    function parseChapterText(text) {
        const t = (text || '').replace(/\s+/g, ' ').trim();
        const m = t.match(/^(?:chapter|chap\.?|ch\.?)\s*0*(\d+)\b\s*[:.\-\u2013\u2014]*\s*(.*)$/i);
        if (!m) return null;
        let title = m[2];
        title = title.replace(/^(?:(?:chapter|chap\.?|ch\.?)\s*0*\d+\b\s*[:.\-\u2013\u2014]*\s*)+/i, '');
        title = title.replace(/\s*[|\u2502\u00A6]?\s*\d+(?:\.\d+)?\s*%\s*$/, '').trim();
        return { n: parseInt(m[1], 10), title };
    }

    // Webnovel reader top bar: "<Novel title> / Chapter 16: Into The Breach | 3.89%"
    // -> { novel, n, title }   (n is null when the part after "/" isn't a numbered chapter)
    function parseReaderHeader(text) {
        const t = (text || '').replace(/\s+/g, ' ').trim();

        let m = t.match(/^(.+?)\s*\/\s*((?:chapter|chap\.?|ch\.?)\s*\d.*)$/i);
        if (m) {
            const ch = parseChapterText(m[2]);
            if (ch && m[1].trim().length >= 2) return { novel: m[1].trim(), n: ch.n, title: ch.title };
        }

        m = t.match(/^(.+?)\s+\/\s+(.+)$/);
        if (m && m[1].trim().length >= 3) {
            return { novel: m[1].trim(), n: null, title: m[2].replace(/\s*[|\u2502\u00A6]?\s*\d+(?:\.\d+)?\s*%\s*$/, '').trim() };
        }
        return null;
    }

    // Chapter URLs to try under an already-verified novel URL (see CHAPTER_STYLE).
    //   number sites (NovelFire / NovelPhoenix): exactly one URL - the number is all they use.
    //   title sites (NovelPing / NovelArrow): number + title slug variants, bare number as the last resort.
    function getChapterCandidates(siteKey, novelUrl, ch) {
        if (!ch || ch.n === null || ch.n === undefined) return [];
        const base = novelUrl.replace(/\/+$/, '');
        const num = `chapter-${ch.n}`;

        if (CHAPTER_STYLE[siteKey] === 'number') return [`${base}/${num}`];

        const titleSlugs = [];
        if (ch.rawSlug) titleSlugs.push(ch.rawSlug.toLowerCase());
        if (ch.title) titleSlugs.push.apply(titleSlugs, titleSlugVariants(ch.title));
        const withTitle = Array.from(new Set(titleSlugs.filter(Boolean))).map(t => `${num}-${t}`);

        return Array.from(new Set(withTitle.concat([num]).map(s => `${base}/${s}`))).slice(0, 8);
    }

    // "https://assets.mvlempyr.app/images/900/14613.webp" -> "14613"
    function mvlIdFromUrl(str) {
        const m = /mvlempyr\.app\/images\/(?:\d+\/)?(\d+)\.(?:webp|png|jpe?g|avif|gif)/i.exec(str || '');
        return m ? m[1] : '';
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

    // Violentmonkey menu entry: forget every verified link (useful when testing or after a site changes)
    if (typeof GM_registerMenuCommand === 'function' && typeof GM_listValues === 'function' && typeof GM_deleteValue === 'function') {
        GM_registerMenuCommand('Novel Cross-Redirector: clear saved links', () => {
            try {
                GM_listValues().filter(k => k.indexOf(CACHE_PREFIX) === 0).forEach(k => GM_deleteValue(k));
                alert('Saved links cleared. Reload the page.');
            } catch (e) {}
        });
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

            /* ---------- Mobile: hidden slide-in panel + small pull tab ---------- */
            #novel-cross-sidebar.ncs-mobile {
                --ncs-panel-w: 62px;
                top: ${MOBILE_TAB_TOP} !important;
                left: 0 !important;
                width: var(--ncs-panel-w) !important;
                box-sizing: border-box !important;
                padding: 10px 9px !important;
                gap: 10px !important;
                background: rgba(15, 23, 42, 0.94) !important;
                border-radius: 0 14px 14px 0 !important;
                box-shadow: 4px 0 18px rgba(0, 0, 0, 0.5) !important;
                transform: translate(-100%, -50%) !important;
                visibility: hidden !important;
                pointer-events: none !important;
                transition: transform 0.25s ease, visibility 0s linear 0.25s !important;
            }

            #novel-cross-sidebar.ncs-mobile.ncs-open {
                transform: translate(0, -50%) !important;
                visibility: visible !important;
                pointer-events: auto !important;
                transition: transform 0.25s ease, visibility 0s linear 0s !important;
            }

            .ncs-mobile .ncs-btn {
                width: 44px !important;
                height: 44px !important;
            }

            /* no hover on touch: kill sticky hover zoom + tooltips */
            .ncs-mobile .ncs-btn:hover {
                transform: none !important;
                filter: none !important;
            }
            .ncs-mobile .ncs-btn::after,
            .ncs-mobile .ncs-btn:hover::after {
                display: none !important;
            }

            #ncs-toggle {
                position: fixed !important;
                top: ${MOBILE_TAB_TOP} !important;
                left: 0 !important;
                transform: translateY(-50%) !important;
                width: 20px !important;
                height: 56px !important;
                z-index: 2147483647 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                box-sizing: border-box !important;
                background: rgba(15, 23, 42, 0.6) !important;
                color: #ffffff !important;
                border-radius: 0 10px 10px 0 !important;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4) !important;
                font: 700 20px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                opacity: 0.6 !important;
                cursor: pointer !important;
                user-select: none !important;
                -webkit-tap-highlight-color: transparent !important;
                touch-action: manipulation !important;
                transition: left 0.25s ease, opacity 0.2s ease, background 0.2s ease !important;
            }

            #ncs-toggle.ncs-open {
                left: 62px !important;
                opacity: 0.95 !important;
                background: rgba(15, 23, 42, 0.94) !important;
            }

            #ncs-toggle span {
                display: block !important;
                transition: transform 0.25s ease !important;
            }

            #ncs-toggle.ncs-open span {
                transform: rotate(180deg) !important;
            }
        `;

        const style = document.createElement('style');
        style.id = 'ncs-styles';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    /* ------------------------------------------------------------------ *
     *  Reading the novel / chapter from the current page
     * ------------------------------------------------------------------ */

    function dbg() {
        if (DEBUG) console.log.apply(console, ['[NCS]'].concat(Array.from(arguments)));
    }

    // Webnovel's reader shows "<Novel title> / Chapter N: <name>" in a top bar that updates while you scroll.
    function readWebnovelHeader() {
        if (!document.body) return null;
        const all = document.body.querySelectorAll('*');
        const limit = Math.min(all.length, 700); // the bar sits near the top of the DOM
        let strict = null;
        let loose = null;

        for (let i = 0; i < limit; i++) {
            const el = all[i];
            if (el.childElementCount > 8) continue;
            const txt = el.textContent;
            if (!txt || txt.length < 8 || txt.length > 500 || txt.indexOf('/') === -1) continue;

            const parsed = parseReaderHeader(txt);
            if (!parsed) continue;

            const rect = el.getBoundingClientRect();
            if (rect.height === 0 || rect.height > 140 || rect.top > 220) continue;

            // smallest element that contains both parts = the bar's own wrapper
            if (parsed.n !== null) {
                if (!strict || txt.length < strict.len) strict = { len: txt.length, parsed };
            } else if (!loose || txt.length < loose.len) {
                loose = { len: txt.length, parsed };
            }
        }

        const best = strict || loose;
        return best ? best.parsed : null;
    }

    const CHAPTER_SELECTOR = [
        'h1', 'h2', 'h3', 'h4',
        '[class*="chapter-title" i]', '[class*="chapter_title" i]', '[class*="chapter-name" i]',
        '[class*="chr-" i]',
        '[class*="breadcrumb" i] li', '[class*="breadcrumb" i] a', '[class*="breadcrumb" i] span'
    ].join(',');

    // Looks for "Chapter N: Name" in the page's headings / breadcrumbs / <title>.
    // wantN = a specific chapter number to match, or null for "whatever chapter this page is".
    function findChapterOnPage(wantN) {
        let fallback = null;

        const consider = text => {
            const p = parseChapterText(text);
            if (!p) return null;
            if (wantN !== null && p.n !== wantN) return null;
            return p;
        };

        const els = document.querySelectorAll(CHAPTER_SELECTOR);
        for (let i = 0; i < Math.min(els.length, 120); i++) {
            const t = els[i].textContent;
            if (!t || t.length > 200) continue;
            const p = consider(t);
            if (!p) continue;
            if (p.title) return p;
            if (!fallback) fallback = p;
        }

        const ogEl = document.querySelector('meta[property="og:title"]');
        const sources = [ogEl ? ogEl.getAttribute('content') : '', document.title];
        for (const src of sources) {
            if (!src) continue;
            for (const seg of src.split(/\s+[|\-\u2013\u2014]\s+/)) {
                const p = consider(seg);
                if (!p) continue;
                if (p.title) return p;
                if (!fallback) fallback = p;
            }
        }

        return fallback;
    }

    // Chapter pages of some sites (e.g. Mvlempyr) have no novel slug in their URL - but they link back to the novel.
    function slugFromNovelLink() {
        const anchors = document.querySelectorAll('a[href*="/novel/"], a[href*="/book/"]');
        for (let i = 0; i < Math.min(anchors.length, 100); i++) {
            try {
                const u = new URL(anchors[i].href, window.location.href);
                if (bareHost(u.hostname) !== bareHost(window.location.hostname)) continue;
                const m = u.pathname.match(/^\/(?:novel|book)\/([^/]+)\/?$/);
                if (m) return { slug: m[1], text: (anchors[i].textContent || '').trim() };
            } catch (e) {}
        }
        return null;
    }

    function novelTitleFromDocumentTitle() {
        const segs = (document.title || '').split(/\s+[|\-\u2013\u2014]\s+/).map(s => s.trim()).filter(Boolean);
        for (const seg of segs) {
            if (parseChapterText(seg)) continue;
            if (/webnovel|novelfire|novelphoenix|mvlempyr|novelping|novelarrow/i.test(seg)) continue;
            if (seg.length >= 3) return seg;
        }
        return '';
    }

    function getSourceInfo() {
        const host = window.location.hostname;
        const path = window.location.pathname;
        const parts = path.split('/').filter(Boolean);
        const isWebnovel = host.includes('webnovel.com');

        let slug = '';
        let chapterSeg = '';
        const idx = parts.findIndex(p => p === 'book' || p === 'novel');
        const onNovelPath = idx !== -1 && !!parts[idx + 1];
        if (onNovelPath) {
            slug = parts[idx + 1];
            chapterSeg = parts[idx + 2] || '';
            if (isWebnovel) slug = slug.replace(/_\d+$/, '');
        }
        // Webnovel's id-only URLs (/book/34771191700870405) carry no title at all
        if (/^\d{8,}$/.test(slug)) slug = '';

        let title = '';
        let chapter = null;
        let mvlId = '';

        if (isWebnovel) {
            if (onNovelPath && chapterSeg) {
                // Reader page: novel + chapter come from the top bar (URL may be id-only)
                const hdr = readWebnovelHeader();
                if (hdr) {
                    title = hdr.novel;
                    if (hdr.n !== null) chapter = { n: hdr.n, title: hdr.title, rawSlug: '' };
                }
                if (!chapter) {
                    const f = findChapterOnPage(null);
                    if (f) chapter = { n: f.n, title: f.title, rawSlug: '' };
                }
                if (!title) title = novelTitleFromDocumentTitle();

                const seg = chapterSeg.replace(/_\d+$/, '');
                if (chapter && seg && !/^\d+$/.test(seg)) chapter.rawSlug = seg; // pristine chapter slug from the URL
            } else if (onNovelPath) {
                // Novel page: title from the page itself
                const h1El = document.querySelector('h1.pt4.fs16');
                const imgAltEl = document.querySelector('.g_thumb img');
                const breadcrumbEl = document.querySelector('.det-hd span');

                if (h1El && h1El.textContent.trim()) {
                    title = h1El.textContent.trim();
                } else if (imgAltEl && imgAltEl.getAttribute('alt')) {
                    title = imgAltEl.getAttribute('alt').trim();
                } else if (breadcrumbEl && breadcrumbEl.textContent.trim()) {
                    title = breadcrumbEl.textContent.trim();
                } else if (!slug) {
                    title = novelTitleFromDocumentTitle();
                }
            }
            // anywhere else on Webnovel (home, lists, rankings...): not a novel page -> no title
        } else {
            // Mvlempyr chapter URL: /chapter/<novel id>-<chapter number>
            const mv = /mvlempyr/i.test(host) ? path.match(/^\/chapter\/(\d+)-(\d+)\/?$/) : null;
            if (mv) {
                mvlId = mv[1];
                chapter = { n: parseInt(mv[2], 10), title: '', rawSlug: '' };
            }

            if (chapterSeg) {
                const m = chapterSeg.match(/^chapter[-_]?0*(\d+)(?:[-_](.+))?$/i);
                if (m) chapter = { n: parseInt(m[1], 10), title: '', rawSlug: (m[2] || '').toLowerCase() };
            }

            if (chapterSeg || /chapter/i.test(path)) {
                const found = findChapterOnPage(chapter ? chapter.n : null);
                if (found) {
                    if (chapter) chapter.title = found.title;
                    else chapter = { n: found.n, title: found.title, rawSlug: '' };
                }
                if (!slug) {
                    const link = slugFromNovelLink();
                    if (link) {
                        slug = link.slug;
                        title = link.text;
                    }
                }
            }
        }

        // The title on screen must agree with the URL's novel, otherwise it is stale / belongs to something else
        if (title && slug) {
            const a = compact(title);
            const b = compact(stripSuffixes(slug));
            if (a && b && !a.includes(b) && !b.includes(a)) title = '';
        }
        if (title.length > 200) title = '';

        const key = compact(title || stripSuffixes(slug));

        return {
            title,
            slug,
            tokens: tokens(title || stripSuffixes(slug).replace(/-/g, ' ')),
            // exact slug is only reusable when it came from a non-Webnovel site
            rawSlug: isWebnovel ? '' : slug,
            key,
            chapter,
            mvlId
        };
    }

    /* ------------------------------------------------------------------ *
     *  Candidate verification
     * ------------------------------------------------------------------ */

    // Returns { state: 'ok' | 'weak' | 'fail', url }
    //   ok   = page loaded, stayed on a novel page, and its title/heading matches our novel
    //   weak = page loaded fine but exposes no title info to compare (client-rendered shell)
    //   fail = 404, redirected away (home/search/listing), or it is a different novel
    function judgeResponse(response, requestedUrl, siteKey, info) {
        const expectedKey = info.key;
        const bad = why => ({ state: 'fail', url: requestedUrl, why });

        if (!response) return bad('no response');
        if (response.status !== 200) return bad('HTTP ' + response.status);

        let finalU, reqU;
        try {
            finalU = new URL(response.finalUrl || requestedUrl);
            reqU = new URL(requestedUrl);
        } catch (e) {
            return bad('bad url');
        }

        // Same host - or a redirect between the mirror domains (stale detection still ends up right)
        const fh = bareHost(finalU.hostname);
        const rh = bareHost(reqU.hostname);
        const bothMirrors = MIRRORS.some(m => m.host === fh) && MIRRORS.some(m => m.host === rh);
        if (fh !== rh && !bothMirrors) return bad('redirected to another site: ' + fh);

        // Must still be a novel page: /book/<something> or /novel/<something>
        if (!/^\/(book|novel)\/[^/]+/.test(finalU.pathname)) return bad('redirected away from a novel page: ' + finalU.pathname);

        let doc;
        try {
            doc = new DOMParser().parseFromString(response.responseText || '', 'text/html');
        } catch (e) {
            return bad('unreadable page');
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

        const url = finalU.origin + finalU.pathname;

        // Mvlempyr: the cover image's file name is the novel id needed for chapter links
        const novelId = siteKey === 'mvlempyr' ? extractMvlempyrId(doc, response.responseText || '', expectedKey) : '';

        // A title match always wins (so a novel actually named "...404..." or "...Not Found" is fine)
        if (allTexts.some(t => titleMatches(expectedKey, compact(t)))) return { state: 'ok', url, why: 'title match', novelId };
        if (allTexts.some(t => tokensMatch(info.tokens, t))) return { state: 'ok', url, why: 'title match (loose)', novelId };

        // Soft-404 (page returns 200 but says it doesn't exist)
        if (allTexts.some(t => /\b(404|page not found|not found)\b/i.test(t))) return bad('page says "not found"');

        // Nothing to compare against -> can't prove it, but it isn't clearly wrong either
        if (headings.length === 0) return { state: 'weak', url, why: 'no title on page to compare', novelId };

        return bad('different title: ' + allTexts.slice(0, 3).join(' | '));
    }

    // Finds the novel's id on a Mvlempyr novel page = file name of its cover image.
    // Order: og:image / twitter:image -> an <img> whose alt matches the novel -> the only cover id on the page.
    // (Never "the first image": recommended novels on the same page have their own covers.)
    function extractMvlempyrId(doc, html, expectedKey) {
        try {
            for (const sel of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
                const el = doc.querySelector(sel);
                const id = mvlIdFromUrl(el ? el.getAttribute('content') : '');
                if (id) return id;
            }

            const imgs = Array.from(doc.querySelectorAll('img'));
            const imgUrl = img => ['src', 'data-src', 'srcset', 'data-srcset']
                .map(a => img.getAttribute(a) || '').join(' ');

            for (const img of imgs) {
                const id = mvlIdFromUrl(imgUrl(img));
                if (!id) continue;
                const alt = compact((img.getAttribute('alt') || '') + ' ' + (img.getAttribute('title') || ''));
                if (alt && expectedKey && (alt.includes(expectedKey) || expectedKey.includes(alt))) return id;
            }

            const ids = new Set();
            imgs.forEach(img => { const id = mvlIdFromUrl(imgUrl(img)); if (id) ids.add(id); });
            const re = /mvlempyr\.app\/images\/(?:\d+\/)?(\d+)\.(?:webp|png|jpe?g|avif|gif)/gi;
            let m;
            while ((m = re.exec(html || '')) !== null) ids.add(m[1]);
            if (ids.size === 1) return Array.from(ids)[0];
        } catch (e) {}
        return '';
    }

    // Verifies a Mvlempyr chapter url: /chapter/<id>-<n>
    function judgeMvlempyrChapter(response, requestedUrl, id, n, info) {
        const bad = why => ({ state: 'fail', url: requestedUrl, why });
        if (!response) return bad('no response');
        if (response.status !== 200) return bad('HTTP ' + response.status);

        let finalU, reqU;
        try {
            finalU = new URL(response.finalUrl || requestedUrl);
            reqU = new URL(requestedUrl);
        } catch (e) {
            return bad('bad url');
        }
        if (bareHost(finalU.hostname) !== bareHost(reqU.hostname)) return bad('redirected to another site');

        const path = finalU.pathname.replace(/\/+$/, '');
        if (path !== '/chapter/' + id + '-' + n) return bad('redirected elsewhere: ' + path);

        let doc;
        try {
            doc = new DOMParser().parseFromString(response.responseText || '', 'text/html');
        } catch (e) {
            return bad('unreadable page');
        }

        const ogEl = doc.querySelector('meta[property="og:title"]');
        const og = ogEl ? (ogEl.getAttribute('content') || '').trim() : '';
        const docTitle = (doc.title || '').trim();
        const heads = [og].concat(Array.from(doc.querySelectorAll('h1, h2')).slice(0, 8).map(h => h.textContent.trim())).filter(Boolean);
        const texts = docTitle ? heads.concat(docTitle) : heads;

        const url = finalU.origin + finalU.pathname;
        const numRe = new RegExp('chapter[\\s_-]*0*' + n + '(?!\\d)', 'i');

        if (texts.some(t => titleMatches(info.key, compact(t)) || tokensMatch(info.tokens, t))) return { state: 'ok', url, why: 'novel title on page' };
        if (texts.some(t => numRe.test(t))) return { state: 'weak', url, why: 'chapter number on page (novel title not shown)' };
        if (/page not found|\b404\b/i.test(texts.join(' '))) return bad('page says "not found"');
        // client-rendered shell: nothing to read, but the URL pattern is exactly right
        if (heads.length === 0) return { state: 'weak', url, why: 'no headings to confirm' };
        return bad('chapter ' + n + ' / novel not on page: ' + texts.slice(0, 3).join(' | '));
    }

    // Novel id for a Mvlempyr novel page: remembered, else read from the page's cover image.
    function ensureMvlempyrId(st, cb) {
        if (st.novelId) return cb(st.novelId);

        const cached = cacheGet('mvid:' + st.novelUrl);
        if (cached) {
            st.novelId = cached;
            return cb(cached);
        }

        if (typeof GM_xmlhttpRequest !== 'function') return cb('');
        const gen = st.gen;
        try {
            GM_xmlhttpRequest({
                method: 'GET',
                url: st.novelUrl,
                timeout: PROBE_TIMEOUT_MS,
                onload: response => {
                    if (gen !== generation) return;
                    let id = '';
                    try {
                        const doc = new DOMParser().parseFromString(response.responseText || '', 'text/html');
                        id = extractMvlempyrId(doc, response.responseText || '', latestKey);
                    } catch (e) {}
                    dbg('mvlempyr novel id from page:', id || '(not found)');
                    if (id) {
                        cacheSet('mvid:' + st.novelUrl, id);
                        st.novelId = id;
                    }
                    cb(id);
                },
                onerror: () => cb(''),
                ontimeout: () => cb(''),
                onabort: () => cb('')
            });
        } catch (e) {
            cb('');
        }
    }

    // Verifies a CHAPTER url under an already-verified novel url.
    //   ok   = loaded, stayed under the novel, and the page/URL says it is chapter n
    //   weak = loaded fine but exposes nothing to confirm the chapter number
    function judgeChapter(response, requestedUrl, novelUrl, n) {
        const bad = why => ({ state: 'fail', url: requestedUrl, why });
        if (!response) return bad('no response');
        if (response.status !== 200) return bad('HTTP ' + response.status);

        let finalU, reqU, novelU;
        try {
            finalU = new URL(response.finalUrl || requestedUrl);
            reqU = new URL(requestedUrl);
            novelU = new URL(novelUrl);
        } catch (e) {
            return bad('bad url');
        }

        const fh = bareHost(finalU.hostname);
        const rh = bareHost(reqU.hostname);
        const bothMirrors = MIRRORS.some(m => m.host === fh) && MIRRORS.some(m => m.host === rh);
        if (fh !== rh && !bothMirrors) return bad('redirected to another site: ' + fh);

        // Must be a page UNDER the novel: a redirect back to the novel page / a listing means "no such chapter"
        const novelPath = novelU.pathname.replace(/\/+$/, '');
        const finalPath = finalU.pathname.replace(/\/+$/, '');
        const under = finalPath.startsWith(novelPath + '/') ||
            (fh !== rh && /^\/(book|novel)\/[^/]+\/[^/]+/.test(finalPath));
        if (!under) return bad('redirected away from the novel: ' + finalPath);

        let doc;
        try {
            doc = new DOMParser().parseFromString(response.responseText || '', 'text/html');
        } catch (e) {
            return bad('unreadable page');
        }

        const ogEl = doc.querySelector('meta[property="og:title"]');
        const og = ogEl ? (ogEl.getAttribute('content') || '').trim() : '';
        const docTitle = (doc.title || '').trim();

        const numRe = new RegExp('chapter[\\s_-]*0*' + n + '(?!\\d)', 'i');
        const texts = [og, docTitle]
            .concat(Array.from(doc.querySelectorAll('h1, h2')).slice(0, 8).map(h => h.textContent.trim()))
            .filter(Boolean);

        const url = finalU.origin + finalU.pathname;

        // Chapter number found in the URL or page -> ok (so "Chapter 404" is not mistaken for an error page)
        if (numRe.test(finalPath) || texts.some(t => numRe.test(t))) return { state: 'ok', url, why: 'chapter number found' };
        if (/page not found|\b404\b/i.test(og + ' ' + docTitle)) return bad('page says "not found"');
        if (texts.length === 0) return { state: 'weak', url, why: 'no headings to confirm chapter number' };
        return bad('chapter number ' + n + ' not on page: ' + texts.slice(0, 3).join(' | '));
    }

    /* ------------------------------------------------------------------ *
     *  Sidebar state
     * ------------------------------------------------------------------ */

    let generation = 0;        // bumped on every rebuild so late async results are ignored
    let latestChapter = null;  // chapter currently shown on the page (re-read every tick)
    let latestInfo = { key: '', tokens: [] };
    let latestKey = '';
    let lastMvlRemembered = '';

    function setState(btn, site, state, url, note) {
        if (url) btn.href = url;
        btn.classList.toggle('ncs-checking', state === 'checking');
        btn.classList.toggle('ncs-unverified', state === 'unverified');

        let label = site.name;
        if (state === 'checking') label += ' \u00B7 checking\u2026';
        else if (state === 'unverified') label += ' \u00B7 unverified (may not exist)';
        else if (note) label += ' \u00B7 ' + note;
        btn.setAttribute('data-tooltip', label);
    }

    // Probes candidate URLs (a few at a time) and reports the HIGHEST-PRIORITY one that verifies.
    //   judge(response, url) -> { state: 'ok' | 'weak' | 'fail', url }
    //   done(result | null)  -> null when nothing verified
    function probeCandidates(candidates, judge, gen, done, label) {
        if (!candidates.length || typeof GM_xmlhttpRequest !== 'function') {
            done(null);
            return;
        }

        const results = new Array(candidates.length).fill(null);
        let next = 0;
        let active = 0;
        let finished = false;

        function finish(r) {
            if (finished) return;
            finished = true;
            if (gen !== generation) return;
            done(r);
        }

        function settle() {
            if (finished) return;
            if (gen !== generation) { finished = true; return; }

            let weak = null;
            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                if (!r) return;                         // can't decide past an unfinished higher-priority candidate
                if (r.state === 'ok') return finish(r);
                if (r.state === 'weak' && !weak) weak = r;
            }
            finish(weak);
        }

        function launch(i) {
            active++;
            const target = candidates[i];
            let settled = false;

            const complete = result => {
                if (settled) return;
                settled = true;
                active--;
                results[i] = result;
                dbg('probe', label || '', target, '->', result.state, result.why || '');
                settle();
                pump();
            };

            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: target,
                    timeout: PROBE_TIMEOUT_MS,
                    onload: response => complete(judge(response, target)),
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

    // Step 2 for a button: once the novel page is known, point at the CURRENT chapter on that site.
    // Called again whenever the chapter on screen changes (Webnovel updates it while you scroll).
    function applyChapter(btn) {
        const st = btn._ncs;
        if (!st || !st.ok || st.gen !== generation) return;

        const ch = latestChapter;
        const style = CHAPTER_STYLE[st.site.key];

        // Nothing chapter-specific to do here: show the novel page
        if (!style || !ch || ch.n === null || ch.n === undefined) {
            st.chapKey = '';
            st.token++;
            setState(btn, st.site, 'ok', st.novelUrl);
            return;
        }

        // Same request as the one already applied / in flight -> leave it alone, so a jittering title or a
        // repeated refresh can never restart (and keep cancelling) a slow site's check.
        const chapKey = (style === 'number' || style === 'mvlempyr') ? String(ch.n) : [ch.n, ch.title, ch.rawSlug].join('|');
        if (st.chapKey === chapKey) return;
        st.chapKey = chapKey;

        const token = ++st.token;

        // Meanwhile (and as the fallback): the novel page itself
        setState(btn, st.site, 'ok', st.novelUrl);

        const cacheKey = 'ch:' + st.novelUrl + ':' + ch.n;
        const cached = cacheGet(cacheKey);
        if (cached) {
            dbg(st.site.key, 'chapter', ch.n, 'cache hit', cached);
            setState(btn, st.site, 'ok', cached, 'Chapter ' + ch.n);
            return;
        }

        // Mvlempyr: needs the novel id (cover image name) before the URL can even be built
        if (style === 'mvlempyr') {
            ensureMvlempyrId(st, id => {
                if (token !== st.token || st.gen !== generation) return;
                if (!id) {
                    dbg('mvlempyr: novel id not found on', st.novelUrl);
                    setState(btn, st.site, 'ok', st.novelUrl, 'novel page (novel id not found)');
                    return;
                }
                const url = new URL(st.novelUrl).origin + '/chapter/' + id + '-' + ch.n;
                probeCandidates(
                    [url],
                    (response, u) => judgeMvlempyrChapter(response, u, id, ch.n, latestInfo),
                    st.gen,
                    r => {
                        if (r && r.state === 'ok') cacheSet(cacheKey, r.url);
                        if (token !== st.token) return;
                        if (r) {
                            setState(btn, st.site, 'ok', r.url, 'Chapter ' + ch.n);
                        } else {
                            dbg('mvlempyr chapter NOT FOUND', url);
                            setState(btn, st.site, 'ok', st.novelUrl, 'novel page (chapter link not found)');
                        }
                    },
                    'mvlempyr chapter ' + ch.n
                );
            });
            return;
        }

        const candidates = getChapterCandidates(st.site.key, st.novelUrl, ch);
        probeCandidates(
            candidates,
            (response, url) => judgeChapter(response, url, st.novelUrl, ch.n),
            st.gen,
            r => {
                // Remember a verified result even if the chapter on screen has already moved on
                if (r && r.state === 'ok') cacheSet(cacheKey, r.url);
                if (token !== st.token) return; // a newer chapter was requested meanwhile
                if (r) {
                    setState(btn, st.site, 'ok', r.url, 'Chapter ' + ch.n);
                } else {
                    dbg(st.site.key, 'chapter', ch.n, 'NOT FOUND - tried', candidates);
                    setState(btn, st.site, 'ok', st.novelUrl, 'novel page (chapter link not found)');
                }
            },
            st.site.key + ' chapter ' + ch.n
        );
    }

    function refreshChapters(container) {
        Array.from(container.children).forEach(btn => {
            if (btn._ncs) applyChapter(btn);
        });
    }

    // Step 1 for a button: find + verify the novel page on the target site, then hand over to applyChapter.
    function resolveLink(site, info, btn, gen, onFail) {
        const st = btn._ncs = { site, gen, ok: false, novelUrl: '', novelId: '', token: 0, chapKey: '' };

        const candidates = getCandidateUrls(site.key, info);
        if (candidates.length === 0) {
            setState(btn, site, 'unverified', site.defaultUrl);
            return;
        }

        // Webnovel target is a search page - nothing to verify, and no chapter links
        if (site.key === 'webnovel') {
            st.ok = true;
            st.novelUrl = candidates[0];
            setState(btn, site, 'ok', candidates[0], 'search');
            return;
        }

        const cacheKey = site.key + ':' + info.key;
        const cached = cacheGet(cacheKey);
        if (cached) {
            dbg(site.key, 'novel cache hit', cached);
            st.ok = true;
            st.novelUrl = cached;
            applyChapter(btn);
            return;
        }

        // Until something verifies, point at the best guess
        setState(btn, site, 'checking', candidates[0]);
        dbg(site.key, 'novel: probing', candidates.length, 'candidates, first 8:', candidates.slice(0, 8));

        probeCandidates(
            candidates,
            (response, url) => judgeResponse(response, url, site.key, info),
            gen,
            r => {
                if (!r) {
                    dbg(site.key, 'novel NOT FOUND - nothing verified');
                    setState(btn, site, 'unverified', candidates[0]);
                    if (onFail) onFail();
                    return;
                }
                dbg(site.key, 'novel verified', r.url, '(' + r.state + ')');
                if (r.state === 'ok') cacheSet(cacheKey, r.url);
                st.ok = true;
                st.novelUrl = r.url;
                if (r.novelId) {
                    st.novelId = r.novelId;
                    cacheSet('mvid:' + r.url, r.novelId);
                }
                applyChapter(btn);
            },
            site.key + ' novel'
        );
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
     *  Mobile mode (hidden panel + pull tab)
     * ------------------------------------------------------------------ */

    const touchMQ = window.matchMedia ? window.matchMedia('(hover: none) and (pointer: coarse)') : null;
    let menuOpen = false;

    function isMobile() {
        return !!(touchMQ && touchMQ.matches) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    }

    function applyOpenState() {
        const box = document.getElementById('novel-cross-sidebar');
        const tab = document.getElementById('ncs-toggle');
        if (box) box.classList.toggle('ncs-open', menuOpen);
        if (tab) {
            tab.classList.toggle('ncs-open', menuOpen);
            tab.setAttribute('aria-expanded', String(menuOpen));
        }
    }

    function setMenuOpen(open) {
        menuOpen = open;
        applyOpenState();
    }

    // Create / remove the pull tab depending on mode
    function syncToggle(mobile) {
        let tab = document.getElementById('ncs-toggle');

        if (!mobile) {
            if (tab) tab.remove();
            menuOpen = false;
            return;
        }

        if (!tab) {
            tab = document.createElement('div');
            tab.id = 'ncs-toggle';
            tab.setAttribute('role', 'button');
            tab.setAttribute('aria-label', 'Toggle novel site links');
            const arrow = document.createElement('span');
            arrow.textContent = '\u203A'; // ›
            tab.appendChild(arrow);
            tab.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(!menuOpen);
            });
            (document.body || document.documentElement).appendChild(tab);
        }

        tab.classList.toggle('ncs-open', menuOpen);
    }

    // Tap anywhere outside the panel / tab closes it
    document.addEventListener('pointerdown', e => {
        if (!menuOpen) return;
        const t = e.target;
        if (t && t.closest && (t.closest('#novel-cross-sidebar') || t.closest('#ncs-toggle'))) return;
        setMenuOpen(false);
    }, true);

    /* ------------------------------------------------------------------ *
     *  Sidebar build
     * ------------------------------------------------------------------ */

    function initSidebar() {
        injectCSS();

        const mobile = isMobile();
        syncToggle(mobile);

        const info = getSourceInfo();
        latestChapter = info.chapter;
        latestInfo = info;
        latestKey = info.key;

        // On a Mvlempyr chapter page the novel id is right in the URL - remember it for later trips back to Mvlempyr
        if (info.mvlId && info.slug && lastMvlRemembered !== info.slug + info.mvlId) {
            lastMvlRemembered = info.slug + info.mvlId;
            cacheSet('mvid:' + SITE_PREFIX.mvlempyr + info.slug, info.mvlId);
        }

        // Rebuild only when the NOVEL changes (or the title became known / layout mode changed).
        const sig = info.key + '|' + (info.title ? 't' : 's') + '|' + (mobile ? 'm' : 'd');
        // Chapter changes (e.g. scrolling in Webnovel's reader) only re-point the chapter links.
        const chapSig = info.chapter ? [info.chapter.n, info.chapter.title, info.chapter.rawSlug].join('|') : '';

        const existing = document.getElementById('novel-cross-sidebar');
        if (existing) {
            if (existing.getAttribute('data-sig') === sig) {
                if (existing.getAttribute('data-chap') !== chapSig) {
                    existing.setAttribute('data-chap', chapSig);
                    dbg('chapter ->', info.chapter);
                    refreshChapters(existing);
                }
                return;
            }
            existing.remove();
        }

        dbg('novel ->', { key: info.key, title: info.title, slug: info.slug, chapter: info.chapter });

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
        container.setAttribute('data-chap', chapSig);
        if (mobile) {
            container.classList.add('ncs-mobile');
            if (menuOpen) container.classList.add('ncs-open');
            // after picking a site (opens in a new tab) tuck the panel away again
            container.addEventListener('click', e => {
                if (e.target.closest && e.target.closest('a.ncs-btn')) setTimeout(() => setMenuOpen(false), 150);
            });
        }

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

// ==UserScript==
// @name         Universal Timezone Converter to Poland Time
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Converts dates/times on whitelisted sites to Polish time (always 24h) and keeps the original in brackets.
// @author       Claude
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Universal_Timezone_Converter_to_Poland_Time.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Universal_Timezone_Converter_to_Poland_Time.js
// ==/UserScript==

(function () {
    'use strict';

    /* =====================================================================
     *  SETTINGS
     * ===================================================================== */
    const CONFIG = {
        targetZone: 'Europe/Warsaw',
        label: 'PL',                 // appended when a real timezone conversion happened
        keepOriginal: true,          // keep the replaced text next to the new one
        originalWrap: ['(', ')'],    // what surrounds the original text
        convertDateOnly: true,       // "Oct 14, 2025" -> "Tue 14 Oct 2025 (Oct 14, 2025)"
        convertTimeOnly: true,       // "3:00 PM"       -> "15:00 (3:00 PM)"
        numericDateOrder: 'DMY',     // how to read ambiguous 03/04/2025 when it has a time: 'DMY' or 'MDY'
        debounceMs: 150
    };

    /* =====================================================================
     *  TIMEZONE DATA
     *  Abbreviations are taken literally (EST is always UTC-5, EDT UTC-4).
     *  ET / CT / MT / PT follow US daylight saving automatically.
     *  Ambiguous ones: CST = US Central, IST = India, BST = British Summer.
     * ===================================================================== */
    const FIXED = {
        Z: 0, UT: 0, UTC: 0, GMT: 0, WET: 0, WEST: 60, BST: 60,
        CET: 60, CEST: 120, EET: 120, EEST: 180, MSK: 180,
        EST: -300, EDT: -240, CST: -360, CDT: -300,
        MST: -420, MDT: -360, PST: -480, PDT: -420,
        AKST: -540, AKDT: -480, HST: -600,
        PKT: 300, IST: 330, ICT: 420, WIB: 420,
        SGT: 480, HKT: 480, PHT: 480, AWST: 480,
        JST: 540, KST: 540, ACST: 570, AEST: 600, AEDT: 660,
        NZST: 720, NZDT: 780
    };
    const DYNAMIC = {
        ET: 'America/New_York', CT: 'America/Chicago',
        MT: 'America/Denver', PT: 'America/Los_Angeles'
    };
    const OFFSET_RE = /^(?:UTC|GMT)?\s?([+-])(\d{1,2})(?::?(\d{2}))?$/;
    const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

    /** Timezone text -> { offset: minutes } | { iana: 'Zone/Name' } | null */
    function parseZoneToken(tok) {
        tok = String(tok || '').trim();
        if (!tok) return null;
        if (has(FIXED, tok)) return { offset: FIXED[tok] };
        if (has(DYNAMIC, tok)) return { iana: DYNAMIC[tok] };
        const m = tok.match(OFFSET_RE);
        if (m) {
            const mins = parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0);
            return { offset: (m[1] === '-' ? -1 : 1) * mins };
        }
        if (tok.includes('/')) {
            try { new Intl.DateTimeFormat('en-US', { timeZone: tok }); return { iana: tok }; }
            catch (e) { return null; }
        }
        return null;
    }

    const dtfCache = new Map();
    function getDtf(zone) {
        let f = dtfCache.get(zone);
        if (!f) {
            f = new Intl.DateTimeFormat('en-US', {
                timeZone: zone, hourCycle: 'h23',
                year: 'numeric', month: 'numeric', day: 'numeric',
                hour: 'numeric', minute: 'numeric', second: 'numeric'
            });
            dtfCache.set(zone, f);
        }
        return f;
    }

    /** Wall-clock parts of timestamp `ts` in zone `spec`. month is 1-based. */
    function zoneParts(spec, ts) {
        if (spec.offset !== undefined) {
            const d = new Date(ts + spec.offset * 60000);
            return {
                y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
                h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds()
            };
        }
        const o = {};
        for (const p of getDtf(spec.iana).formatToParts(ts)) {
            if (p.type !== 'literal') o[p.type] = parseInt(p.value, 10);
        }
        return { y: o.year, m: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second };
    }

    function offsetMin(spec, ts) {
        if (spec.offset !== undefined) return spec.offset;
        const p = zoneParts(spec, ts);
        return (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ts / 1000) * 1000) / 60000;
    }

    /** Wall-clock time in zone `spec` -> UTC timestamp (DST-aware). month is 0-based. */
    function wallToUtc(spec, y, mo, d, h, mi, s) {
        const wall = Date.UTC(y, mo, d, h, mi, s);
        if (spec.offset !== undefined) return wall - spec.offset * 60000;
        const t1 = wall - offsetMin(spec, wall) * 60000;
        return wall - offsetMin(spec, t1) * 60000;
    }

    const PL = { iana: CONFIG.targetZone };
    const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTH_IDX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

    /* =====================================================================
     *  SITE WHITELIST + MENU
     * ===================================================================== */
    const host = window.location.hostname;
    const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);

    function getRootDomain(h) {
        if (/^[\d.]+$/.test(h) || h.includes(':')) return h;
        const parts = h.split('.');
        if (parts.length <= 2) return h;
        const last = parts[parts.length - 1];
        const keep = last.length === 2 && SECOND_LEVEL.has(parts[parts.length - 2]) ? 3 : 2;
        return parts.slice(-keep).join('.');
    }

    const domain = getRootDomain(host);
    const WL_KEY = 'whitelist_domains';
    const TZ_KEY = 'site_tz_' + domain;
    const hostMatches = (h, d) => h === d || h.endsWith('.' + d);
    const getWhitelist = () => {
        const l = GM_getValue(WL_KEY, []);
        return Array.isArray(l) ? l : [];
    };
    const setWhitelist = (l) => GM_setValue(WL_KEY, [...new Set(l)]);

    // One-time migration from the old per-site "site_active_<domain>" flags.
    (function migrateLegacy() {
        try {
            const legacy = GM_listValues().filter(k => k.startsWith('site_active_'));
            if (!legacy.length) return;
            const list = getWhitelist();
            for (const k of legacy) {
                if (GM_getValue(k, false) === true) list.push(k.slice('site_active_'.length));
                GM_deleteValue(k);
            }
            setWhitelist(list);
        } catch (e) { /* ignore */ }
    })();

    const active = getWhitelist().some(d => hostMatches(host, d));

    if (window.self === window.top) {
        GM_registerMenuCommand(
            active ? `🔴 Turn OFF for ${domain}` : `🟢 Turn ON for ${domain}`,
            () => {
                const list = getWhitelist();
                setWhitelist(active ? list.filter(d => !hostMatches(host, d)) : [...list, domain]);
                location.reload();
            }
        );

        GM_registerMenuCommand(`🕒 Timezone of zone-less times on ${domain}…`, () => {
            const current = GM_getValue(TZ_KEY, '');
            const input = prompt(
                'Which timezone are times shown in when the page gives NO timezone?\n' +
                'Examples: EST, PT, UTC+2, America/New_York\n' +
                'Leave empty = your browser\'s own timezone.',
                current
            );
            if (input === null) return;
            let value = input.trim();
            if (value && !parseZoneToken(value)) {
                const upper = value.toUpperCase();
                if (!parseZoneToken(upper)) { alert('Unknown timezone: ' + value); return; }
                value = upper;
            }
            if (value) GM_setValue(TZ_KEY, value); else GM_deleteValue(TZ_KEY);
            location.reload();
        });

        GM_registerMenuCommand('⚙️ Manage Whitelist Sites', () => {
            const input = prompt('Whitelisted domains (comma-separated):', getWhitelist().join(', '));
            if (input === null) return;
            setWhitelist(input.split(',').map(s => s.trim()).filter(Boolean));
            location.reload();
        });
    }

    if (!active) return;

    /* =====================================================================
     *  PATTERN
     *  Branch A: date [+ time [+ zone]]      Branch B: time [+ zone]
     *  Time may be a range ("3-5 PM", "10:00 - 12:00 EST").
     *  Written without the /i flag so zone names stay strictly UPPERCASE.
     * ===================================================================== */
    const R = String.raw;
    const ci = (s) => s.replace(/[a-z]/gi, c => `[${c.toLowerCase()}${c.toUpperCase()}]`);

    const AP = R`[aApP](?:\.[mM]\.?|[mM])(?![A-Za-z])`;
    const TIME_CORE = R`\d{1,2}(?::\d{2}){1,2}(?:\.\d{1,3})?(?:\s*${AP})?|\d{1,2}\s*${AP}`;
    const SEP_RANGE = R`\s*(?:-|–|—|${ci('to')})\s*`;
    const timePart = (s) =>
        R`(?:(?<s1${s}>${TIME_CORE})|(?<sb${s}>\d{1,2})(?=${SEP_RANGE}\d{1,2}(?::\d{2})?\s*${AP}))` +
        R`(?:${SEP_RANGE}(?<e${s}>${TIME_CORE}))?`;

    const tzNames = [...Object.keys(FIXED), ...Object.keys(DYNAMIC)]
        .sort((a, b) => b.length - a.length).join('|');
    const TZ_TOKEN =
        R`(?:(?:UTC|GMT)\s?[+-]\d{1,2}(?::?\d{2})?|[+-]\d{2}:?\d{2}|${tzNames}|` +
        R`[A-Z][A-Za-z]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)(?![A-Za-z0-9/])`;
    const tzPart = (s) => R`(?:\s*(?:\((?<zp${s}>${TZ_TOKEN})\)|(?<z${s}>${TZ_TOKEN})))`;

    const MONTH =
        R`(?:${ci('january|february|march|april|may|june|july|august|september|october|november|december')}` +
        R`|${ci('jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec')})(?![A-Za-z])\.?`;
    const ORD = R`(?:${ci('st|nd|rd|th')})?`;
    const WD =
        R`(?:(?<![A-Za-z])(?:${ci('mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?')})\.?,?\s+)?`;

    const ISO = R`(?<![\d./-])(?<iso>\d{4}[-/.]\d{1,2}[-/.]\d{1,2})(?!\d)`;
    const TXT1 = R`(?<![A-Za-z])(?<mon>${MONTH})\s+(?<d1>\d{1,2})${ORD}(?![\d:])(?:,?\s+(?<y1>\d{4})(?![\d:]))?`;
    const TXT2 = R`(?<![\d:./-])(?<d2>\d{1,2})${ORD}\s+(?:${ci('of')}\s+)?(?<mon2>${MONTH})(?:,?\s+(?<y2>\d{4})(?![\d:]))?`;
    const NUM = R`(?<![\d./-])(?<n1>\d{1,2})[/.-](?<n2>\d{1,2})[/.-](?<n3>\d{4})(?!\d)`;
    const SEP = R`(?:\s*(?:@|,|[-–]|${ci('at')})\s*|\s+|T(?=\d))`;

    const BRANCH_A =
        R`(?<date>${WD}(?:${ISO}|${TXT1}|${TXT2}|${NUM}))` +
        R`(?:${SEP}${timePart('A')}(?:${tzPart('A')})?(?![\w:]))?(?![\d:])`;
    const BRANCH_B = R`(?<![\w:./-])${timePart('B')}(?:${tzPart('B')})?(?![\w:])`;
    const RE = new RegExp(`${BRANCH_A}|${BRANCH_B}`, 'g');

    /* =====================================================================
     *  CONVERSION
     * ===================================================================== */
    const browserZone = (() => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
        catch (e) { return 'UTC'; }
    })();
    // Zone assumed for times that carry no zone: per-site setting, else the browser's zone.
    const defaultSpec = parseZoneToken(GM_getValue(TZ_KEY, '')) || { iana: browserZone };

    const pad = (n) => String(n).padStart(2, '0');
    const dayDiff = (p, q) => Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(q.y, q.m - 1, q.d)) / 864e5);
    const signed = (n) => (n > 0 ? '+' : '') + n + 'd';

    function fmtDate(y, m, d, withYear) {
        const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
        return `${wd} ${d} ${MONTH_NAMES[m - 1]}${withYear ? ' ' + y : ''}`;
    }
    const fmtTime = (p, withSeconds) => `${pad(p.h)}:${pad(p.mi)}${withSeconds ? ':' + pad(p.s) : ''}`;
    const withOriginal = (text, original) =>
        CONFIG.keepOriginal ? `${text} ${CONFIG.originalWrap[0]}${original}${CONFIG.originalWrap[1]}` : text;

    function extractDate(g) {
        let y = null, mo, d, ambiguous = false;
        if (g.iso) {
            const [a, b, c] = g.iso.split(/[-/.]/).map(Number);
            y = a; mo = b - 1; d = c;
        } else if (g.mon) {
            mo = MONTH_IDX[g.mon.slice(0, 3).toLowerCase()]; d = +g.d1;
            if (g.y1) y = +g.y1;
        } else if (g.mon2) {
            mo = MONTH_IDX[g.mon2.slice(0, 3).toLowerCase()]; d = +g.d2;
            if (g.y2) y = +g.y2;
        } else if (g.n1) {
            const a = +g.n1, b = +g.n2;
            y = +g.n3;
            if (a > 12) { d = a; mo = b - 1; }
            else if (b > 12) { mo = a - 1; d = b; }
            else {
                ambiguous = a !== b;
                if (CONFIG.numericDateOrder === 'MDY') { mo = a - 1; d = b; } else { d = a; mo = b - 1; }
            }
        } else return null;

        const probe = new Date(Date.UTC(y === null ? 2000 : y, mo, d));
        if (!(mo >= 0 && mo <= 11) || probe.getUTCMonth() !== mo || probe.getUTCDate() !== d) return null;
        return { y, mo, d, ambiguous };
    }

    function parseTok(tok) {
        const t = tok.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?(?:\.\d+)?\s*(?:([ap])\.?m\.?)?$/i);
        if (!t) return null;
        return {
            h: +t[1], m: t[2] ? +t[2] : 0,
            s: t[3] !== undefined ? +t[3] : null,
            ap: t[4] ? t[4].toLowerCase() : null
        };
    }
    function to24(t) {
        if (t.m > 59 || (t.s !== null && t.s > 59)) return null;
        if (t.ap) {
            if (t.h < 1 || t.h > 12) return null;
            return (t.h % 12) + (t.ap === 'p' ? 12 : 0);
        }
        return t.h <= 23 ? t.h : null;
    }
    const minutesOf = (t) => (to24(t) ?? 99) * 60 + t.m;

    function convertDateOnly(m, di) {
        if (!CONFIG.convertDateOnly || di.ambiguous) return null;
        const y = di.y ?? zoneParts(PL, Date.now()).y;
        const out = fmtDate(y, di.mo + 1, di.d, di.y !== null);
        if (out === m[0] || out.slice(4) === m[0]) return null;   // already looks like that
        return withOriginal(out, m[0]);
    }

    /** One regex match -> replacement string, or null to leave the text alone. */
    function convertMatch(m) {
        const g = m.groups;
        const sfx = g.date !== undefined ? 'A' : 'B';
        const startTok = g['s1' + sfx] || g['sb' + sfx];
        const endTok = g['e' + sfx];
        const tzTok = g['z' + sfx] || g['zp' + sfx];

        let di = null;
        if (sfx === 'A') {
            di = extractDate(g);
            if (!di) return null;
            if (!startTok) return convertDateOnly(m, di);
        } else if (!CONFIG.convertTimeOnly) return null;

        const a = parseTok(startTok);
        const b = endTok ? parseTok(endTok) : null;
        if (!a || (endTok && !b) || (g['sb' + sfx] && !b)) return null;

        // Ranges like "3-5 PM" / "11 - 1 PM": the am/pm of one side applies to the other.
        if (b) {
            if (!a.ap && b.ap && a.h >= 1 && a.h <= 12) {
                a.ap = b.ap;
                if (minutesOf(a) > minutesOf(b)) a.ap = b.ap === 'a' ? 'p' : 'a';
            } else if (a.ap && !b.ap && b.h >= 1 && b.h <= 12) {
                b.ap = a.ap;
            }
        }
        const h1 = to24(a), h2 = b ? to24(b) : 0;
        if (h1 === null || h2 === null) return null;

        const hasAP = !!(a.ap || (b && b.ap));
        // A bare "12:30" with no date, no am/pm and no zone is far more likely a duration/score.
        if (sfx === 'B' && !hasAP && !tzTok) return null;

        const spec = tzTok ? parseZoneToken(tzTok) : defaultSpec;
        if (!spec) return null;

        let y, mo, d;
        if (di) {
            y = di.y ?? zoneParts(spec, Date.now()).y; mo = di.mo; d = di.d;
            const probe = new Date(Date.UTC(y, mo, d));
            if (probe.getUTCMonth() !== mo) return null;          // e.g. Feb 29 in a non-leap year
        } else {
            const t = zoneParts(spec, Date.now());
            y = t.y; mo = t.m - 1; d = t.d;
        }

        const startTs = wallToUtc(spec, y, mo, d, h1, a.m, a.s || 0);
        const converted = offsetMin(spec, startTs) !== offsetMin(PL, startTs);
        if (!converted && !hasAP) return null;                    // already Polish time in 24h

        const p1 = zoneParts(PL, startTs);
        let text = fmtTime(p1, a.s !== null);

        if (b) {
            let endTs = wallToUtc(spec, y, mo, d, h2, b.m, b.s || 0);
            if (endTs <= startTs) endTs += 864e5;                 // e.g. 11 PM - 1 AM
            const p2 = zoneParts(PL, endTs);
            const endDiff = dayDiff(p2, p1);
            text += ' – ' + fmtTime(p2, b.s !== null) + (endDiff ? ' ' + signed(endDiff) : '');
        }

        if (di) {
            const showYear = di.y !== null || p1.y !== zoneParts(PL, Date.now()).y;
            text = fmtDate(p1.y, p1.m, p1.d, showYear) + ', ' + text;
        } else {
            const shift = dayDiff(p1, { y, m: mo + 1, d });
            if (shift) text += ' ' + signed(shift);
        }
        if (converted) text += ' ' + CONFIG.label;

        return withOriginal(text, m[0]);
    }

    function convertText(value) {
        let out = '', last = 0, changed = false;
        for (const m of value.matchAll(RE)) {
            let rep = null;
            try { rep = convertMatch(m); } catch (e) { rep = null; }
            if (rep === null) continue;
            out += value.slice(last, m.index) + rep;
            last = m.index + m[0].length;
            changed = true;
        }
        return changed ? out + value.slice(last) : null;
    }

    /* =====================================================================
     *  DOM WALKING
     *  Text nodes are edited in place (nodeValue) instead of being replaced,
     *  so React/Vue-style sites keep working.
     * ===================================================================== */
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION']);
    const done = new WeakMap();   // node -> the text we wrote, so we never process it twice

    function processTextNode(node) {
        const value = node.nodeValue;
        if (!value || value.length < 4 || done.get(node) === value || !/\d/.test(value)) return;
        const parent = node.parentElement;
        if (!parent || SKIP_TAGS.has(parent.tagName) || parent.isContentEditable) return;
        const result = convertText(value);
        if (result !== null) {
            node.nodeValue = result;
            done.set(node, result);
        }
    }

    function collectTextNodes(root, out) {
        if (root.nodeType === Node.TEXT_NODE) { out.push(root); return; }
        if (root.nodeType !== Node.ELEMENT_NODE) return;
        if (SKIP_TAGS.has(root.tagName)) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    }

    const pending = new Set();
    let timer = null;

    function flush() {
        timer = null;
        const nodes = [];
        for (const n of pending) if (n.isConnected) collectTextNodes(n, nodes);
        pending.clear();
        for (const n of nodes) processTextNode(n);
        observer.takeRecords();   // drop the mutations we just caused ourselves
    }

    const observer = new MutationObserver((records) => {
        for (const r of records) {
            if (r.type === 'characterData') pending.add(r.target);
            else for (const n of r.addedNodes) pending.add(n);
        }
        if (!timer) timer = setTimeout(flush, CONFIG.debounceMs);
    });

    pending.add(document.body);
    flush();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
})();

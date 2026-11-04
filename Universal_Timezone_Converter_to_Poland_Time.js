// ==UserScript==
// @name         Universal Timezone Converter to Poland Time
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Converts date/time/timezone matches to Poland time with a clean format.
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Universal_Timezone_Converter_to_Poland_Time.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Universal_Timezone_Converter_to_Poland_Time.js
// ==/UserScript==

(function() {
    'use strict';

    function getRootDomain(host) {
        const parts = host.split('.');
        if (parts.length <= 2) return host;
        return parts.slice(-2).join('.');
    }

    const currentDomain = getRootDomain(window.location.hostname);

    let siteActive = GM_getValue('site_active_' + currentDomain, false);

    if (window.self === window.top) {
        const currentActive = GM_getValue('site_active_' + currentDomain, false);

        GM_registerMenuCommand(
            currentActive ? `🔴 Turn OFF for ${currentDomain}` : `🟢 Turn ON for ${currentDomain}`,
            () => {
                const newState = !currentActive;
                GM_setValue('site_active_' + currentDomain, newState);

                let list = GM_getValue('whitelist_domains', []);
                if (newState && !list.includes(currentDomain)) {
                    list.push(currentDomain);
                    GM_setValue('whitelist_domains', list);
                } else if (!newState) {
                    list = list.filter(d => d !== currentDomain);
                    GM_setValue('whitelist_domains', list);
                }
                alert(`Script is now ${newState ? 'ON' : 'OFF'} for ${currentDomain}`);
                location.reload();
            }
        );

        GM_registerMenuCommand("⚙️ Manage Whitelist Sites", () => {
            let list = GM_getValue('whitelist_domains', []);
            let input = prompt(
                "Current whitelisted domains (comma-separated):",
                list.join(', ')
            );
            if (input !== null) {
                let newList = input.split(',').map(s => s.trim()).filter(s => s.length > 0);
                GM_setValue('whitelist_domains', newList);
                alert("Whitelist updated!");
                location.reload();
            }
        });
    }

    if (!siteActive) return;

    function getTimeZoneOffset(tz, date) {
        tz = tz.toUpperCase().replace(/[^A-Z0-9+-]/g, '');
        const year = date.getFullYear();

        const isUS_DST = (d) => {
            const mar2ndSun = new Date(year, 2, 8 + (7 - new Date(year, 2, 1).getDay()) % 7, 2);
            const nov1stSun = new Date(year, 10, 1 + (7 - new Date(year, 10, 1).getDay()) % 7, 2);
            return d >= mar2ndSun && d < nov1stSun;
        };

        const isEU_DST = (d) => {
            const marLastSun = new Date(year, 2, 31 - new Date(year, 2, 31).getDay(), 1);
            const octLastSun = new Date(year, 9, 31 - new Date(year, 9, 31).getDay(), 1);
            return d >= marLastSun && d < octLastSun;
        };

        const inUS = isUS_DST(date);

        const offsets = {
            'ET': inUS ? -4 : -5, 'EDT': -4, 'EST': -5,
            'CT': inUS ? -5 : -6, 'CDT': -5, 'CST': -6,
            'PT': inUS ? -7 : -8, 'PDT': -7, 'PST': -8,
            'MT': inUS ? -6 : -7, 'MDT': -6, 'MST': -7,
            'UTC': 0, 'GMT': 0,
            'BST': 1, 'CET': 1, 'CEST': 2, 'EET': 2, 'EEST': 3,
            'JST': 9, 'AEST': 10, 'AEDT': 11
        };

        if (tz in offsets) return offsets[tz];

        const match = tz.match(/^([+-])(\d{1,2}):?(\d{2})?$/);
        if (match) {
            const sign = match[1] === '+' ? 1 : -1;
            const hours = parseInt(match[2], 10);
            const mins = match[3] ? parseInt(match[3], 10) / 60 : 0;
            return sign * (hours + mins);
        }

        return null;
    }

    const months = {
        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
        may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
        sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
    };

    const universalRegex = /\b(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+)?(?:(\d{4}[-/]\d{1,2}[-/]\d{1,2})|(([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?)|((\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})))\s*(?:@|at)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)(?:\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?\s+([A-Z]{2,5}|[+-]\d{2}:?\d{2})\b/gi;

    function parseTime(timeStr) {
        const match = timeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
        if (!match) return null;
        let hours = parseInt(match[1], 10);
        let minutes = match[2] ? parseInt(match[2], 10) : 0;
        const ampm = match[3] ? match[3].toLowerCase() : null;

        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;

        return { hours, minutes };
    }

    function processText(text) {
        return text.replace(universalRegex, (match, isoDate, textDateGroup, monthStr, dayStr, yearStr, numDateGroup, dayNum, monthNum, yearNum, startTimeStr, endTimeStr, tzStr) => {
            const now = new Date();
            let year = now.getFullYear();
            let month, day;

            if (isoDate) {
                const parts = isoDate.split(/[-/]/);
                year = parseInt(parts[0], 10);
                month = parseInt(parts[1], 10) - 1;
                day = parseInt(parts[2], 10);
            } else if (textDateGroup) {
                if (yearStr) year = parseInt(yearStr, 10);
                month = months[monthStr.toLowerCase()];
                day = parseInt(dayStr, 10);
            } else if (numDateGroup) {
                day = parseInt(dayNum, 10);
                month = parseInt(monthNum, 10) - 1;
                year = parseInt(yearNum, 10);
            }

            if (month === undefined || isNaN(day)) return match;

            const startTime = parseTime(startTimeStr);
            if (!startTime) return match;

            let baseDate = new Date(Date.UTC(year, month, day, startTime.hours, startTime.minutes));
            const offsetHours = getTimeZoneOffset(tzStr, baseDate);
            if (offsetHours === null) return match;

            baseDate.setUTCHours(baseDate.getUTCHours() - offsetHours);

            // --- Customizing the Format ---
            const formatOptions = {
                timeZone: 'Europe/Warsaw',
                weekday: 'short', // e.g., "Mon"
                month: 'short',   // e.g., "Oct"
                day: 'numeric',   // e.g., "12"
                hour: '2-digit',  // e.g., "20"
                minute: '2-digit',// e.g., "00"
                hour12: false     // 24-hour format
            };

            const formatter = new Intl.DateTimeFormat('en-GB', formatOptions);
            let startFormatted = formatter.format(baseDate);

            if (endTimeStr) {
                const endTime = parseTime(endTimeStr);
                if (endTime) {
                    let endDate = new Date(Date.UTC(year, month, day, endTime.hours, endTime.minutes));
                    endDate.setUTCHours(endDate.getUTCHours() - offsetHours);

                    const endFormatter = new Intl.DateTimeFormat('en-GB', {
                        timeZone: 'Europe/Warsaw',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });

                    return `${startFormatted} – ${endFormatter.format(endDate)} (Poland Time)`;
                }
            }

            return `${startFormatted} (Poland Time)`;
        });
    }

    function walkTree(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (universalRegex.test(node.nodeValue)) {
                node.nodeValue = processText(node.nodeValue);
            }
        } else {
            const tag = node.tagName ? node.tagName.toLowerCase() : '';
            if (!['script', 'style', 'textarea', 'input'].includes(tag)) {
                for (let child of node.childNodes) {
                    walkTree(child);
                }
            }
        }
    }

    walkTree(document.body);

    const observer = new MutationObserver((mutations) => {
        for (let mutation of mutations) {
            for (let node of mutation.addedNodes) {
                walkTree(node);
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();

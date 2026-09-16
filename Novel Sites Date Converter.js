// ==UserScript==
// @name         Novel Sites Date Converter
// @namespace    https://violentmonkey.github.io/
// @version      3.5
// @description  Modular script for site-specific date formatting across novel platforms.
// @author       You
// @match        *://*.webnovel.com/*
// @match        *://*.mvlempyr.io/*
// @match        *://*.novelfire.net/*
// @match        *://*.novelphoenix.com/*
// @match        *://*.novelarrow.com/*
// @run-at       document-end
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Novel%20Sites%20Date%20Converter.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Novel%20Sites%20Date%20Converter.js
// ==/UserScript==

(function () {
    'use strict';

    // Helper Utility: Standardized DD.MM.YYYY Date Formatter
    function formatDate(date) {
        if (isNaN(date.getTime())) return null;
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }

    // Helper Utility: Parse ISO or Date Strings into Formatted Date
    function parseAndFormatDateString(dateStr) {
        if (!dateStr) return null;
        const parsedDate = new Date(dateStr);
        return isNaN(parsedDate.getTime()) ? null : formatDate(parsedDate);
    }

    // Helper Utility: Calculate Relative Time String from Date
    function getRelativeTimeString(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return 'just now';

        const minutes = Math.floor(diffInSeconds / 60);
        if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;

        const hours = Math.floor(diffInSeconds / 3600);
        if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;

        const days = Math.floor(diffInSeconds / 86400);
        if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;

        const months = Math.floor(days / 30);
        if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;

        const years = Math.floor(days / 365);
        return `${years} year${years > 1 ? 's' : ''} ago`;
    }

    // Helper Utility: Parse Relative "X ago" Strings to DD.MM.YYYY
    function calculateRelativeDate(relativeStr) {
        const now = new Date();
        const cleanText = relativeStr.trim().toLowerCase();

        if (cleanText.includes('just now') || cleanText.includes('today')) {
            return formatDate(now);
        }
        if (cleanText.includes('yesterday')) {
            now.setDate(now.getDate() - 1);
            return formatDate(now);
        }

        const match = cleanText.match(/(\d+)\s+(second|min|minute|hour|day|week|month|year)s?\s+ago/i);
        if (!match) return null;

        const amount = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();

        switch (unit) {
            case 'second': now.setSeconds(now.getSeconds() - amount); break;
            case 'min':
            case 'minute': now.setMinutes(now.getMinutes() - amount); break;
            case 'hour': now.setHours(now.getHours() - amount); break;
            case 'day': now.setDate(now.getDate() - amount); break;
            case 'week': now.setDate(now.getDate() - (amount * 7)); break;
            case 'month': now.setMonth(now.getMonth() - amount); break;
            case 'year': now.setFullYear(now.getFullYear() - amount); break;
            default: return null;
        }

        return formatDate(now);
    }


    // ==========================================
    // SECTION 1: WEBNOVEL.COM
    // ==========================================
    function handleWebnovel() {
        const selectors = [
            'small.c_s.ml8.vam',
            'small.db.fs12.lh16.c_s'
        ];

        const elements = document.querySelectorAll(selectors.join(', '));

        elements.forEach(el => {
            if (el.dataset.dateReplaced) return;

            const text = el.textContent.trim();

            if (text && /ago|yesterday|today|just now/i.test(text)) {
                const calculatedDate = calculateRelativeDate(text);
                if (calculatedDate) {
                    el.textContent = `${calculatedDate} (${text})`;
                    el.dataset.dateReplaced = 'true';
                }
            }
        });
    }


    // ==========================================
    // SECTION 2: MVLEMPYR.IO
    // ==========================================
    function handleMvlempyr() {
        let latestParsedDate = null;

        // A. Chapter List Items
        const chapterDates = document.querySelectorAll('.chapter-date, .ch-date, .chapter-list-date, [class*="date"]');
        chapterDates.forEach(el => {
            const rawText = el.dataset.originalDate || el.textContent.split('(')[0].trim();
            const parsedDate = new Date(rawText);

            if (!isNaN(parsedDate.getTime())) {
                if (!el.dataset.originalDate) el.dataset.originalDate = rawText;

                if (!latestParsedDate || parsedDate > latestParsedDate) {
                    latestParsedDate = parsedDate;
                }

                if (!el.dataset.dateReplaced) {
                    const relativeText = getRelativeTimeString(parsedDate);
                    el.textContent = `${rawText} (${relativeText})`;
                    el.dataset.dateReplaced = 'true';
                }
            }
        });

        // B. Header "Last Update" display (#last-updated and #last-updated2)
        if (latestParsedDate) {
            const formattedDateStr = formatDate(latestParsedDate);
            const relativeText = getRelativeTimeString(latestParsedDate);
            const headerElements = document.querySelectorAll('#last-updated, #last-updated2');

            headerElements.forEach(el => {
                if (!el.dataset.extraCadence) {
                    const extraMatch = el.textContent.match(/(\([^)]*chs\/[^)]*\))/i);
                    el.dataset.extraCadence = extraMatch ? ` ${extraMatch[1]}` : '';
                }

                const cadenceInfo = el.dataset.extraCadence;
                const newText = `Last update: ${formattedDateStr} (${relativeText})${cadenceInfo}`;

                if (el.textContent !== newText) {
                    el.textContent = newText;
                    el.dataset.dateReplaced = 'true';
                }
            });
        }
    }


    // ==========================================
    // SECTION 3: NOVELFIRE.NET & NOVELPHOENIX.COM
    // ==========================================
    function handleNovelFireAndPhoenix() {
        // A. Novel Main Page - Chapter Card "Updated X ago"
        const cardUpdateElements = document.querySelectorAll('p.update, .grdbtn-latest-container p.update');
        cardUpdateElements.forEach(el => {
            if (el.dataset.dateReplaced) return;

            const text = el.textContent.trim();
            if (/Updated\s+/i.test(text) && /ago/i.test(text)) {
                const relativePart = text.replace(/Updated\s+/i, '').trim();
                const formattedDate = calculateRelativeDate(relativePart);

                if (formattedDate) {
                    el.textContent = `Updated ${formattedDate} (${relativePart})`;
                    el.dataset.dateReplaced = 'true';
                }
            }
        });

        // B. Chapters Page Top Header - "Updated X ago" <time> tag
        const headerTimeEl = document.querySelector('article#chapter-list-page header .novel-stats time[datetime]');
        if (headerTimeEl && !headerTimeEl.dataset.dateReplaced) {
            const isoDate = headerTimeEl.getAttribute('datetime');
            const formattedDate = parseAndFormatDateString(isoDate);
            const relativeText = headerTimeEl.textContent.trim();

            if (formattedDate) {
                headerTimeEl.textContent = `${formattedDate} (${relativeText})`;
                headerTimeEl.dataset.dateReplaced = 'true';
            }
        }

        // C. Chapters Page List - Items <time class="chapter-update" datetime="...">
        const chapterTimeElements = document.querySelectorAll('time.chapter-update[datetime]');
        chapterTimeElements.forEach(el => {
            if (el.dataset.dateReplaced) return;

            const isoDate = el.getAttribute('datetime');
            const formattedDate = parseAndFormatDateString(isoDate);
            const relativeText = el.textContent.trim();

            if (formattedDate) {
                el.textContent = `${formattedDate} (${relativeText})`;
                el.dataset.dateReplaced = 'true';
            }
        });
    }


// ==========================================
    // SECTION 4: NOVELARROW.COM
    // ==========================================
    function handleNovelArrow() {
        // A. Main Novel Card Header Date
        const latestCard = document.querySelector('.modern-detail-latest-card, [class*="latest-card"]');
        if (latestCard) {
            // Find all span nodes inside the latest card container
            const spans = latestCard.querySelectorAll('span');
            spans.forEach(span => {
                if (span.dataset.dateReplaced || span.children.length > 0) return;

                const text = span.textContent.trim();

                if (/ago|yesterday|today|just now/i.test(text)) {
                    const formattedDate = calculateRelativeDate(text);
                    if (formattedDate) {
                        span.textContent = `${formattedDate} (${text})`;
                        span.dataset.dateReplaced = 'true';
                    }
                }
            });
        }

        // B. Chapters Page & Tab Lists
        const chapterTimeElements = document.querySelectorAll('time, span[class*="date"], span[class*="time"]');
        chapterTimeElements.forEach(el => {
            if (el.dataset.dateReplaced || el.children.length > 0) return;

            const text = el.textContent.trim();
            if (!text) return;

            if (/ago|yesterday|today|just now/i.test(text)) {
                const formattedDate = calculateRelativeDate(text);
                if (formattedDate) {
                    el.textContent = `${formattedDate} (${text})`;
                    el.dataset.dateReplaced = 'true';
                }
            }
        });
    }

    // ==========================================
    // INITIALIZATION & ROUTER
    // ==========================================
    function runScript() {
        const host = window.location.hostname;

        if (host.includes('webnovel.com')) {
            handleWebnovel();
        } else if (host.includes('mvlempyr.io')) {
            handleMvlempyr();
        } else if (host.includes('novelfire.net') || host.includes('novelphoenix.com')) {
            handleNovelFireAndPhoenix();
        } else if (host.includes('novelarrow.com')) {
            handleNovelArrow();
        }
    }

    runScript();

    const observer = new MutationObserver(() => {
        runScript();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();

// ==UserScript==
// @name         VNDB Site Search Buttons
// @namespace    https://greasyfork.org/users/1071569
// @version      1.5.2
// @description  Adds Google exact-phrase search buttons on VNDB visual novel pages for f95zone.to, www.ryuugames.com, www.anime-sharing.com, and store.steampowered.com. Compatible with VNDBRe — Improved Title Page.
// @author       FunkyJustin
// @license      MIT
// @match        https://vndb.org/v*
// @grant        none
// @run-at       document-end
// @downloadURL https://update.greasyfork.org/scripts/562991/VNDB%20Site%20Search%20Buttons.user.js
// @updateURL https://update.greasyfork.org/scripts/562991/VNDB%20Site%20Search%20Buttons.meta.js
// ==/UserScript==

(function () {
    'use strict';

    if (!/^\/v\d+$/.test(location.pathname)) return;

    function initSearchButtons() {
        if (document.getElementById('vndb-site-search-buttons-container')) return;

        // 1. Detect Main Title
        const mainTitleEl = document.querySelector('#hero-title-group h1, article h1');
        if (!mainTitleEl) return;

        const mainTitle = mainTitleEl.textContent.trim();
        if (!mainTitle) return;

        // 2. Detect Alternative/Original Title
        let originalTitle = '';
        const altEl = document.querySelector('#hero-title-group .alttitle, article .alttitle');
        if (altEl) {
            originalTitle = altEl.textContent.trim();
        }

        if (!originalTitle || originalTitle === mainTitle) {
            const titlesTd = document.querySelector('article td.titles, .details-table td.titles');
            if (titlesTd) {
                const details = titlesTd.querySelector('details');
                if (details) {
                    const jaSpan = details.querySelector('span[lang="ja"]');
                    if (jaSpan) {
                        originalTitle = jaSpan.textContent.trim();
                    } else {
                        const jaRow = details.querySelector('abbr.icon-lang-ja')?.closest('tr');
                        if (jaRow) {
                            const titleCell = jaRow.querySelector('td:nth-child(2)');
                            if (titleCell) {
                                originalTitle = titleCell.textContent.trim().split('\n')[0].trim();
                            }
                        }
                    }
                }
            }
        }

        // 3. Theme detection
        function isDarkMode() {
            const style = getComputedStyle(document.body);
            const bg = style.backgroundColor;
            const match = bg.match(/\d+/g);
            if (!match || match.length < 3) return false;
            const [r, g, b] = match.map(Number);
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return luminance < 0.5;
        }

        const dark = isDarkMode();
        const headerColor = dark ? '#dddddd' : '#212529';
        const buttonBg = dark ? '#2c3e50' : '#f8f9fa';
        const buttonText = dark ? '#ecf0f1' : '#212529';
        const buttonBorder = dark ? '#34495e' : '#dee2e6';
        const buttonHoverBg = dark ? '#34495e' : '#e9ecef';
        const buttonHoverBorder = dark ? '#3e5c76' : '#ced4da';
        const buttonShadow = dark ? '0 2px 6px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.05)';

        const sites = [
            { domain: 'f95zone.to',          name: 'F95Zone' },
            { domain: 'www.ryuugames.com',   name: 'RyuuGames' },
            { domain: 'www.anime-sharing.com', name: 'Anime-Sharing' },
            { domain: 'store.steampowered.com', name: 'Steam' }
        ];

        // 4. Construct elements
        const container = document.createElement('div');
        container.id = 'vndb-site-search-buttons-container';
        container.style.cssText = `
            margin: 16px 0;
            display: flex;
            flex-direction: column;
            gap: 12px;
            font-size: 14px;
            width: 100%;
            z-index: 5;
        `;

        const header = document.createElement('strong');
        header.textContent = 'Quick Site Searches:';
        header.style.cssText = `color: ${headerColor}; align-self: flex-start;`;
        container.appendChild(header);

        // Updated 4-column grid with gap optimization
        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px 10px;
            width: 100%;
        `;

        function createButton(title, site, labelSuffix) {
            if (!title) return null;

            const query = encodeURIComponent(`"${title}" site:${site.domain}`);
            const url = 'https://www.google.com/search?q=' + query;

            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = `${site.name} ${labelSuffix}`;
            a.title = `Google exact search: "${title}" on ${site.domain}`;
            a.style.cssText = `
                padding: 8px 4px;
                background: ${buttonBg};
                color: ${buttonText};
                text-decoration: none;
                border-radius: 6px;
                border: 1px solid ${buttonBorder};
                font-weight: 600;
                font-size: 13px;
                text-align: center;
                transition: all 0.2s ease;
                box-shadow: ${buttonShadow};
                white-space: nowrap;
                width: 100%;
                box-sizing: border-box;
            `;

            a.onmouseover = () => {
                a.style.background = buttonHoverBg;
                a.style.borderColor = buttonHoverBorder;
                a.style.boxShadow = dark ? '0 4px 10px rgba(0,0,0,0.5)' : '0 4px 8px rgba(0,0,0,0.1)';
                a.style.transform = 'translateY(-1px)';
            };
            a.onmouseout = () => {
                a.style.background = buttonBg;
                a.style.borderColor = buttonBorder;
                a.style.boxShadow = buttonShadow;
                a.style.transform = 'none';
            };

            return a;
        }

        if (originalTitle && originalTitle !== mainTitle) {
            sites.forEach(site => {
                const btn = createButton(originalTitle, site, '(Original Title)');
                if (btn) grid.appendChild(btn);
            });
        }

        sites.forEach(site => {
            const btn = createButton(mainTitle, site, '(Main Title)');
            if (btn) grid.appendChild(btn);
        });

        container.appendChild(grid);

        // 5. Attachment Logic
        const heroTitleGroup = document.querySelector('#hero-title-group');
        if (heroTitleGroup) {
            heroTitleGroup.appendChild(container);
        } else {
            const insertPoint = altEl || mainTitleEl;
            if (insertPoint && insertPoint.parentNode) {
                insertPoint.after(container);
            }
        }
    }

    initSearchButtons();

    // 6. Mutation Observer logic
    const observer = new MutationObserver(() => {
        if (!document.getElementById('vndb-site-search-buttons-container')) {
            initSearchButtons();
        } else {
            const container = document.getElementById('vndb-site-search-buttons-container');
            const heroTitleGroup = document.querySelector('#hero-title-group');
            if (heroTitleGroup && container.parentElement !== heroTitleGroup) {
                heroTitleGroup.appendChild(container);
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();

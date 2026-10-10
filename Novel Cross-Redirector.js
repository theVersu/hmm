// ==UserScript==
// @name         Novel Cross-Redirector (Auto-Resolving Path Fixer)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Cross-redirect sidebar with automatic multi-candidate path testing to fix URL discrepancies (-wn, -v1, -novel, -kr-web-novel, -s-) across novel platforms.
// @author       AI Collaborator
// @match        *://*.webnovel.com/*
// @match        *://*.novelfire.net/*
// @match        *://*.novelphoenix.com/*
// @match        *://*.mvlempyr.io/*
// @match        *://*.novelping.com/*
// @match        *://*.novelarrow.com/*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Novel%20Cross-Redirector.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Novel%20Cross-Redirector.js
// ==/UserScript==

(function () {
    'use strict';

    const urlCache = JSON.parse(sessionStorage.getItem('ncs_resolved_urls') || '{}');

    function saveCache(key, val) {
        urlCache[key] = val;
        try {
            sessionStorage.setItem('ncs_resolved_urls', JSON.stringify(urlCache));
        } catch (e) {}
    }

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
                transition: transform 0.2s ease, filter 0.2s ease !important;
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

    function getRawSlug() {
        const host = window.location.hostname;
        const path = window.location.pathname;

        if (path.includes('/book/') || path.includes('/novel/')) {
            const parts = path.split('/').filter(Boolean);
            if (parts.length >= 2) {
                let slug = parts[1];
                if (host.includes('webnovel.com')) {
                    slug = slug.replace(/_\d+$/, '');
                }
                return slug;
            }
        }

        if (host.includes('webnovel.com')) {
            const match = path.match(/\/book\/([^\/]+)/);
            if (match && match[1]) {
                return match[1].replace(/_\d+$/, '');
            }
        }

        return '';
    }

    // Extract core title clean of suffixes
    function getCoreTitle(rawSlug) {
        if (!rawSlug) return '';
        let core = rawSlug.toLowerCase();

        // Strip common platform suffix tags
        core = core
            .replace(/-kr-web-novel$/, '')
            .replace(/-wn$/, '')
            .replace(/-novel$/, '')
            .replace(/-v\d+$/, '')
            .replace(/-abnormal-state-skillas-i-devastated-everything$/, '')
            .replace(/-abnormal-state-skill-as-i-devastated-everything$/, '');

        // Normalize hyphenated apostrophes
        core = core.replace(/-s-/g, '-s');

        return core;
    }

    // Generate candidates for dynamic testing
    function getCandidateUrls(siteKey, coreTitle, rawSlug) {
        const baseDomains = {
            novelfire: 'https://novelfire.net/book/',
            novelphoenix: 'https://novelphoenix.com/novel/',
            mvlempyr: 'https://www.mvlempyr.io/novel/',
            novelping: 'https://novelping.com/book/',
            novelarrow: 'https://novelarrow.com/novel/'
        };

        if (siteKey === 'webnovel') {
            const titleQuery = coreTitle.replace(/-/g, ' ');
            return [`https://www.webnovel.com/search?keywords=${encodeURIComponent(titleQuery)}`];
        }

        const prefix = baseDomains[siteKey];
        if (!prefix) return [];

        const candidates = [];

        // 1. Exact raw slug if provided
        if (rawSlug) candidates.push(prefix + rawSlug);

        // 2. Core title variations
        candidates.push(prefix + coreTitle);
        candidates.push(prefix + coreTitle + '-wn');
        candidates.push(prefix + coreTitle + '-novel');
        candidates.push(prefix + coreTitle + '-v1');
        candidates.push(prefix + coreTitle + '-kr-web-novel');

        // 3. Apostrophe variation (-s -> -s-)
        if (coreTitle.includes('-s')) {
            const sVar = coreTitle.replace(/-s/g, '-s-');
            candidates.push(prefix + sVar);
            candidates.push(prefix + sVar + '-wn');
        }

        // Deduplicate candidates
        return Array.from(new Set(candidates));
    }

    // Automatically probe candidate URLs to find the working one
    function resolveAndSetUrl(siteKey, candidateUrls, btnElement) {
        if (!candidateUrls || candidateUrls.length === 0) return;

        // Default to first candidate initially
        const cacheKey = siteKey + '_' + candidateUrls[0];
        if (urlCache[cacheKey]) {
            btnElement.href = urlCache[cacheKey];
            return;
        }

        btnElement.href = candidateUrls[0];

        // Webnovel search link needs no probing
        if (siteKey === 'webnovel' || candidateUrls.length === 1) return;

        let resolved = false;

        function testCandidate(index) {
            if (index >= candidateUrls.length || resolved) return;

            const targetUrl = candidateUrls[index];

            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: targetUrl,
                    timeout: 4000,
                    onload: function (response) {
                        // Check if valid page response (status 200 and not redirected to 404/home)
                        const finalUrl = response.finalUrl || targetUrl;
                        if (response.status === 200 && !finalUrl.includes('/404') && !finalUrl.includes('/home') && !response.responseText.includes('Page Not Found')) {
                            resolved = true;
                            btnElement.href = targetUrl;
                            saveCache(cacheKey, targetUrl);
                        } else {
                            testCandidate(index + 1);
                        }
                    },
                    onerror: function () {
                        testCandidate(index + 1);
                    }
                });
            }
        }

        testCandidate(0);
    }

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

    function initSidebar() {
        if (document.getElementById('novel-cross-sidebar')) return;

        injectCSS();

        const rawSlug = getRawSlug();
        const coreTitle = getCoreTitle(rawSlug);
        const host = window.location.hostname;

        const activeArrowPing = host.includes('novelarrow.com') ? 'novelarrow' : 'novelping';

        const sites = [
            {
                name: 'Webnovel',
                key: 'webnovel',
                logo: SITE_LOGOS.webnovel,
                defaultUrl: 'https://www.webnovel.com/',
                isCurrent: host.includes('webnovel.com')
            },
            {
                name: 'Novelfire',
                key: 'novelfire',
                logo: SITE_LOGOS.novelfire,
                defaultUrl: 'https://novelfire.net/home',
                isCurrent: host.includes('novelfire.net')
            },
            {
                name: 'NovelPhoenix',
                key: 'novelphoenix',
                logo: SITE_LOGOS.novelphoenix,
                defaultUrl: 'https://novelphoenix.com/',
                isCurrent: host.includes('novelphoenix.com')
            },
            {
                name: 'Mvlempyr',
                key: 'mvlempyr',
                logo: SITE_LOGOS.mvlempyr,
                defaultUrl: 'https://www.mvlempyr.io/',
                isCurrent: host.includes('mvlempyr.io')
            },
            {
                name: 'NovelPing',
                key: 'novelping',
                logo: SITE_LOGOS.novelping,
                defaultUrl: 'https://novelping.com/',
                isCurrent: host.includes('novelping.com')
            },
            {
                name: 'NovelArrow',
                key: 'novelarrow',
                logo: SITE_LOGOS.novelarrow,
                defaultUrl: 'https://novelarrow.com/',
                isCurrent: host.includes('novelarrow.com')
            }
        ].filter(site => {
            if (site.key === 'novelarrow' && activeArrowPing !== 'novelarrow') return false;
            if (site.key === 'novelping' && activeArrowPing !== 'novelping') return false;
            return true;
        });

        const container = document.createElement('div');
        container.id = 'novel-cross-sidebar';

        sites.forEach(site => {
            if (!site.isCurrent) {
                const btn = document.createElement('a');
                btn.target = '_blank';
                btn.className = `ncs-btn ncs-btn-${site.key}`;
                btn.setAttribute('data-tooltip', site.name);

                if (rawSlug) {
                    const candidates = getCandidateUrls(site.key, coreTitle, rawSlug);
                    resolveAndSetUrl(site.key, candidates, btn);
                } else {
                    btn.href = site.defaultUrl;
                }

                const img = document.createElement('img');
                img.alt = site.name;

                loadLogoAsBase64(site.key, site.logo, img);

                btn.appendChild(img);
                container.appendChild(btn);
            }
        });

        const targetEl = document.body || document.documentElement;
        if (targetEl) {
            targetEl.appendChild(container);
        }
    }

    initSidebar();
    setInterval(initSidebar, 1500);
})();

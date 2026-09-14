// ==UserScript==
// @name         VNDB Improved Title Page edited
// @namespace    Kellen's userstyles
// @version      3.6
// @description  Hybrid layout with a Hero block, centered sidebar details, organized releases order, fixed image resolutions, non-overlapping navigation hitboxes, dynamic screenshot filtering, and full-resolution cover image viewer support.
// @author       kln (t.me/kln_lzt)
// @homepageURL  https://github.com/Kellenok/userscipts/
// @supportURL   https://github.com/Kellenok/userscipts/issues
// @match        https://vndb.org/v*
// @grant        GM_addStyle
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/VNDB%20Improved%20Title%20Page%20edited.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/VNDB%20Improved%20Title%20Page%20edited.js
// ==/UserScript==

(function() {
    'use strict';

    // === 1. CSS ===
    GM_addStyle(`
        /* DISABLE VNDB NATIVE VIEWER OVERLAY */
        #ivview, .ivview, .ivloading { display: none !important; }

        /* CUSTOM IMAGE VIEWER MODAL */
        #custom-iv-backdrop {
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.85);
            z-index: 999999;
            display: flex; align-items: center; justify-content: center;
        }

        #custom-iv-box {
            position: relative;
            display: inline-block;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.9);
            line-height: 0;
            user-select: none;
            background: #000;
        }

        #custom-iv-box img {
            display: block; margin: 0; padding: 0; border: 0;
            image-rendering: -webkit-optimize-contrast;
            image-rendering: crisp-edges;
            pointer-events: auto;
        }

        .custom-iv-nav {
            position: absolute; top: 0; bottom: 30px; width: 35%;
            z-index: 10; display: flex; align-items: center;
            text-decoration: none !important; opacity: 0;
            transition: opacity 0.15s ease-in-out;
            cursor: pointer; pointer-events: auto;
        }
        .custom-iv-nav:hover { opacity: 1; }
        .custom-iv-prev { left: 0; justify-content: flex-start; background: linear-gradient(to right, rgba(0,0,0,0.6), transparent); }
        .custom-iv-next { right: 0; justify-content: flex-end; background: linear-gradient(to left, rgba(0,0,0,0.6), transparent); }

        .custom-iv-label {
            color: #fff; background: rgba(0, 0, 0, 0.7);
            padding: 8px 14px; font-size: 14px; font-weight: bold;
            border-radius: 4px; margin: 0 15px;
            text-shadow: 0 1px 3px #000; pointer-events: none;
        }

        #custom-iv-footer {
            height: 30px; line-height: 30px;
            background: rgba(15, 23, 36, 0.95); color: #ccc; font-size: 12px;
            display: flex; justify-content: space-between; align-items: center;
            padding: 0 12px; box-sizing: border-box;
            border-top: 1px solid rgba(255,255,255,0.1);
            position: relative; z-index: 20;
        }
        #custom-iv-footer a { color: #79b; text-decoration: none; cursor: pointer; pointer-events: auto; }
        #custom-iv-footer a:hover { text-decoration: underline; }

        main > article:has(#hero-container) {
            padding: 0;
        }

        /* --- 1. HERO BLOCK --- */
        #hero-container {
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: flex-start !important;
            gap: 20px;
            margin-bottom: 1em;
            position: relative;
            overflow: hidden;
            padding: 32px;
        }
        #hero-container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 200px;
            background-size: cover;
            background-position: top;
            -webkit-mask-image: linear-gradient(0deg,rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 1) 300%);
            mask-image: linear-gradient(0deg,rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 1) 300%);
            filter: blur(5px);
            z-index: 1;
            transform: scale(1.2);
        }
        #hero-cover {
            width: 200px;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            gap: 15px;
            z-index: 2;
        }
        #hero-main {
            flex: 1 1 300px;
            min-width: 0;
            z-index: 2;
            position: relative;
        }
        #hero-title-box {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
            margin-bottom: 1em;
            z-index: 2;
        }
        #hero-title-group {
            display: flex;
            flex-direction: column;
            min-width: 0;
        }
        #hero-title-group h1 {
            font-size: 3em !important;
            margin: 0 0 10px 0 !important;
            padding: 0 !important;
            line-height: 1.1;
            color: var(--alttitle);
            z-index: 2;
        }
        #hero-title-group h2.alttitle {
            font-size: 1.5em !important;
            margin: 0 0 16px 0 !important;
            color: var(--grayedout) !important;
            text-shadow: 2px 3px 6px rgba(0, 0, 0, 0.9), 0px 1px 12px rgba(0, 0, 0, 0.7);
        }

        /* RATING STYLES */
        #hero-rating-container {
            text-align: center;
            flex-shrink: 0;
        }
        #hero-rating-box {
            display: block;
            color: var(--maintext);
            border-radius: 5px;
            font-size: 2em;
            font-weight: bold;
            line-height: 1;
            min-width: 70px;
        }
        #hero-votes-count {
            display: block;
            margin-top: 0;
            font-size: 0.9em;
        }

        #hero-duration-block {
            margin-top: 24px;
            text-align: center;
        }
        .hero-duration-value {
            display: block;
            color: var(--maintext);
            font-size: 1.5em;
            font-weight: bold;
            line-height: 1.1;
        }
        .hero-duration-info {
            display: block;
            margin-top: 3px;
            font-size: 0.9em;
            color: var(--grayedout);
        }

        .vndesc h2 { display: none; }
        .vndesc p { padding: 0; margin-bottom: 0 !important; }
        #vntags span { margin-left: 0px; margin-right: 15px; }
        #hero-cover > #widget2 { width: 100%; box-sizing: border-box; }

        .vndesc {
            position: relative;
            max-width: 100%;
            margin-bottom: 0px !important;
        }

        #tagops { margin-top: 24px; }

        /* HIDE OLD NATIVE INPUTS COMPLETELY */
        input[id^="scrhide_"] { display: none !important; }

        /* --- SCREENSHOTS CONTAINER --- */
        #custom-screenshots-article {
            width: 100% !important;
            box-sizing: border-box !important;
            z-index: 2 !important;
            margin-top: 15px !important;
            padding: 14px 18px !important;
            background: rgba(15, 23, 36, 0.6) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            border-radius: 6px !important;
            position: relative !important;
            float: none !important;
            clear: both !important;
        }

        #hero-container > #custom-screenshots-article {
            flex: 1 1 100% !important;
        }

        .cs-header-box {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            clear: both;
            flex-wrap: wrap;
            gap: 10px;
        }

        .cs-header-box h1 {
            margin: 0 !important;
            font-size: 1.4em !important;
        }

        .cs-controls {
            display: flex;
            gap: 12px;
            align-items: center;
            font-size: 0.9em;
            flex-wrap: wrap;
        }

        .cs-control-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .cs-control-group label {
            cursor: pointer;
            user-select: none;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .cs-rel-title {
            text-align: left;
            margin: 14px 0 6px 0;
            clear: both;
            font-weight: bold;
        }

        .cs-grid {
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-start;
            align-items: flex-start;
            width: 100%;
            margin-bottom: 12px;
            clear: both;
        }

        .cs-item {
            position: relative;
            display: inline-block;
            cursor: pointer;
        }

        .cs-item img {
            display: block;
            border-radius: 3px;
        }

        .cs-item.cs-flagged::after {
            content: '!';
            position: absolute;
            top: 4px; right: 4px;
            background: #b30000;
            color: #fff;
            font-weight: bold;
            font-size: 11px;
            width: 16px; height: 16px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 0 4px rgba(0,0,0,0.8);
            pointer-events: none;
        }

        /* --- 2. MOVED DETAILS CONTAINER --- */
        #new-left-column {
            width: 100%;
            display: flex;
            flex-direction: column;
        }
        #new-left-column > article {
            margin-bottom: 1em;
        }
        #new-votes-count {
            color: var(--grayedout);
        }
        #new-left-column table:has(.relations-header) {
            width: 100%;
        }

        /* --- STACKED & CENTERED SIDEBAR STYLES --- */
        .details-table {
            width: 100% !important;
        }
        .details-table tbody > tr {
            display: block !important;
            width: 100% !important;
            text-align: center !important;
            box-sizing: border-box !important;
            margin-bottom: 8px;
        }

        .details-table tbody > tr > td {
            display: block !important;
            width: 100% !important;
            text-align: center !important;
            box-sizing: border-box !important;
            padding: 2px 0 !important;
        }

        .details-table tbody > tr:has(> td:nth-child(2)) > td:first-child {
            font-weight: bold !important;
            padding-top: 6px !important;
        }

        /* SINGLE TITLE FLAT CONTAINER */
        .custom-single-title-container {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            text-align: center !important;
            padding: 4px 0 6px 0 !important;
        }

        .custom-single-title-container div {
            text-align: center !important;
            width: 100% !important;
            margin: 2px 0 !important;
        }

        /* MULTI-TITLE DETAILS ACCORDION */
        .details-table details summary {
            list-style: none !important;
            cursor: pointer;
            text-align: center !important;
            font-weight: bold !important;
            position: relative;
            padding: 4px 0 !important;
        }

        .details-table details summary::-webkit-details-marker { display: none; }
        .details-table details summary::before {
            content: '►';
            font-size: 0.8em;
            position: absolute;
            left: 10px;
            top: 4px;
            transition: transform 0.15s ease-in-out;
        }
        .details-table details[open] > summary::before {
            transform: rotate(90deg);
        }

        .details-table details table {
            width: 100% !important;
            margin: 0 auto !important;
            border-collapse: collapse;
        }

        .details-table details table tr {
            display: block !important;
            width: 100% !important;
            text-align: center !important;
            margin-bottom: 6px;
        }

        .details-table details table td {
            display: block !important;
            width: 100% !important;
            text-align: center !important;
            padding: 1px 0 !important;
        }

        /* EXPANDABLE EXTRA PUBLISHERS ACCORDION */
        .details-table summary.extra-pub-summary {
            font-weight: bold !important;
            text-align: center !important;
        }

        /* --- 3. GENERAL STYLES AND FIXES --- */
        .vndetails table tr.nostripe { display: none; }
        td[colspan="2"] details > div { padding: 5px 10px 0 10px; text-align: center; }

        #new-left-column .relations .unofficial { display: none; }
        #new-left-column .relations input#unoffrelations:checked ~ dl .unofficial { display: block; }

        div.vnimg { margin: 0; width: 200px !important; }
        div.vnimg .imghover { width: 200px !important; height: auto !important; }
        div.vnimg .imghover img { width: 200px !important; height: auto !important; max-width: 100% !important; }

        #tagops { text-align: left; }
        div#vntags { margin: 10px 0 0 0; padding: 10px 0 0 0; text-align: left; }
        .relations-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin-bottom: 5px;
        }
        .relations-header .details-key { font-weight: bold; }
        .relations-header label { margin: 0; }
        .relations.linkradio dt { margin-top: 12px; }
        body > nav { z-index: 2; }
        td.notes textarea { resize: vertical; }
        .ulistvn table > tr > td:nth-child(1) { width: 40%; }
        .ulistvn table { width: 100%; table-layout: fixed; margin-top: 8px; }
        .ulistvn table select { width: 100%; }
        .ulistvn .vote button { width: 80%; }
    `);

    // === 2. CUSTOM IMAGE VIEWER ENGINE ===
    let activeGallery = [];
    let activeIndex = 0;
    let modalBackdrop = null;

    const parseVndbMedia = (str) => {
        if (!str) return null;
        // Matches cover (/cv/) and screenshot (/sf/) paths, including thumbnail suffixes like .c, .f, .t
        const match = str.match(/\/(cv|sf)(?:\.[a-z0-9]+)?\/(?:\d+\/)?(\d+)\.(jpg|png|webp)/i);
        if (match) {
            const prefix = match[1].toLowerCase();
            const id = match[2];
            const ext = match[3].toLowerCase();
            const sub = Math.floor(parseInt(id, 10) % 100).toString().padStart(2, '0');
            return {
                prefix: prefix,
                id: id,
                uid: `${prefix}${id}`,
                fullUrl: `https://s2.vndb.org/${prefix}/${sub}/${id}.${ext}`,
                flagUrl: `https://vndb.org/${prefix}${id}`
            };
        }
        const pageMatch = str.match(/\/(cv|sf)(\d{3,})/i);
        if (pageMatch) {
            return {
                prefix: pageMatch[1].toLowerCase(),
                id: pageMatch[2],
                uid: `${pageMatch[1].toLowerCase()}${pageMatch[2]}`,
                fullUrl: null,
                flagUrl: `https://vndb.org/${pageMatch[1].toLowerCase()}${pageMatch[2]}`
            };
        }
        return null;
    };

    const closeCustomViewer = () => {
        if (modalBackdrop) {
            modalBackdrop.remove();
            modalBackdrop = null;
        }
        document.removeEventListener('keydown', handleKeyNav);
    };

    const displayImage = (index) => {
        if (!modalBackdrop || !activeGallery.length) return;
        if (index < 0) index = activeGallery.length - 1;
        if (index >= activeGallery.length) index = 0;
        activeIndex = index;

        const currentItem = activeGallery[activeIndex];
        const box = modalBackdrop.querySelector('#custom-iv-box');
        box.innerHTML = '';

        const img = document.createElement('img');
        img.src = currentItem.url;

        img.onload = () => {
            const dpr = window.devicePixelRatio || 1;
            const maxVh = window.innerHeight * 0.92 - 30;
            const maxVw = window.innerWidth * 0.94;

            let targetWidth = img.naturalWidth / dpr;
            let targetHeight = img.naturalHeight / dpr;

            if (targetHeight > maxVh) {
                const ratio = maxVh / targetHeight;
                targetHeight = maxVh;
                targetWidth = targetWidth * ratio;
            }
            if (targetWidth > maxVw) {
                const ratio = maxVw / targetWidth;
                targetWidth = maxVw;
                targetHeight = targetHeight * ratio;
            }

            img.style.width = targetWidth + 'px';
            img.style.height = targetHeight + 'px';
            box.appendChild(img);

            if (activeGallery.length > 1) {
                const prevBtn = document.createElement('a');
                prevBtn.className = 'custom-iv-nav custom-iv-prev';
                prevBtn.innerHTML = `<span class="custom-iv-label">« previous</span>`;
                prevBtn.onclick = (e) => { e.stopPropagation(); displayImage(activeIndex - 1); };

                const nextBtn = document.createElement('a');
                nextBtn.className = 'custom-iv-nav custom-iv-next';
                nextBtn.innerHTML = `<span class="custom-iv-label">next »</span>`;
                nextBtn.onclick = (e) => { e.stopPropagation(); displayImage(activeIndex + 1); };

                box.appendChild(prevBtn);
                box.appendChild(nextBtn);
            }

            const footer = document.createElement('div');
            footer.id = 'custom-iv-footer';

            const resSpan = document.createElement('span');
            resSpan.textContent = `${img.naturalWidth}x${img.naturalHeight}`;

            const flagSpan = document.createElement('span');
            if (currentItem.flagUrl) {
                const flagLink = document.createElement('a');
                flagLink.href = currentItem.flagUrl;
                flagLink.textContent = 'Flag / Details';
                flagLink.onclick = (e) => { e.stopPropagation(); e.stopImmediatePropagation(); window.location.href = currentItem.flagUrl; };
                flagSpan.appendChild(flagLink);
            } else {
                flagSpan.textContent = 'Flag / Details';
            }

            footer.appendChild(resSpan);
            footer.appendChild(flagSpan);
            box.appendChild(footer);
        };
    };

    const handleKeyNav = (e) => {
        if (!modalBackdrop) return;
        if (e.key === 'Escape') closeCustomViewer();
        if (e.key === 'ArrowLeft') displayImage(activeIndex - 1);
        if (e.key === 'ArrowRight') displayImage(activeIndex + 1);
    };

    const openCustomViewer = (gallery, startIndex) => {
        closeCustomViewer();
        activeGallery = gallery;
        activeIndex = startIndex;

        modalBackdrop = document.createElement('div');
        modalBackdrop.id = 'custom-iv-backdrop';
        modalBackdrop.onclick = closeCustomViewer;

        const box = document.createElement('div');
        box.id = 'custom-iv-box';
        box.onclick = (e) => e.stopPropagation();

        modalBackdrop.appendChild(box);
        document.body.appendChild(modalBackdrop);

        document.addEventListener('keydown', handleKeyNav);
        displayImage(activeIndex);
    };

    const initCustomGalleryListeners = () => {
        document.addEventListener('click', (e) => {
            if (e.target.closest('#custom-iv-footer')) return;

            // Allow subpage cover navigation tabs and native action buttons to work normally
            if (e.target.closest('a[href*="/cv#cv"]') || e.target.closest('.imghover--overlay') || e.target.closest('.maintabs') || e.target.closest('input, button, select, label')) return;

            const coverContainer = e.target.closest('.vnimg, .imghover, article.covers, div.covers');
            const screenshotsArticle = e.target.closest('#custom-screenshots-article, #screenshots, article#screenshots');

            if (!coverContainer && !screenshotsArticle) return;

            let candidateNodes = [];
            let clickedNode = e.target;

            if (coverContainer) {
                candidateNodes = Array.from(document.querySelectorAll('.vnimg, .imghover, article.covers div.scr, article.covers .imghover, article.covers a, div.covers a'));
            } else if (screenshotsArticle) {
                candidateNodes = Array.from(screenshotsArticle.querySelectorAll('a.scrlnk, .cs-item, div.scr a, div.scr img'));
            }

            const galleryMap = new Map();
            let clickedUid = null;

            candidateNodes.forEach(node => {
                const anchor = node.closest('a') || (node.tagName === 'A' ? node : null);
                const href = anchor ? (anchor.href || anchor.getAttribute('href') || '') : '';
                const imgNode = node.tagName === 'IMG' ? node : node.querySelector('img');
                const src = imgNode ? (imgNode.src || imgNode.getAttribute('src') || '') : '';

                const hrefMedia = parseVndbMedia(href);
                const srcMedia = parseVndbMedia(src);
                const media = hrefMedia || srcMedia;

                if (media) {
                    const resolvedFullUrl = (hrefMedia && hrefMedia.fullUrl) ? hrefMedia.fullUrl : ((srcMedia && srcMedia.fullUrl) ? srcMedia.fullUrl : (href || src));

                    if (!galleryMap.has(media.uid)) {
                        galleryMap.set(media.uid, { uid: media.uid, url: resolvedFullUrl, flagUrl: media.flagUrl });
                    }
                    if (node === clickedNode || node.contains(clickedNode) || clickedNode.contains(node)) {
                        clickedUid = media.uid;
                    }
                }
            });

            const gallery = Array.from(galleryMap.values());

            if (gallery.length > 0 && clickedUid) {
                e.preventDefault();
                e.stopPropagation();
                const startIndex = gallery.findIndex(item => item.uid === clickedUid);
                openCustomViewer(gallery, startIndex >= 0 ? startIndex : 0);
            }
        }, true);
    };

    initCustomGalleryListeners();

    // === 3. UNIFIED DYNAMIC & EXACT-MATCH SCREENSHOT ENGINE ===
    const parseAndRebuildScreenshots = () => {
        const origScreenshots = document.querySelector('#screenshots, article#screenshots');
        if (!origScreenshots) return null;

        const rawData = [];
        let currentRel = 'General / Default';

        let maxSexualLevel = 0;
        let maxViolentLevel = 0;
        let hasViolentContent = false;

        Array.from(origScreenshots.children).forEach(child => {
            if (child.classList.contains('rel')) {
                currentRel = child.innerHTML.trim();
            } else if (child.classList.contains('scr')) {
                const links = Array.from(child.querySelectorAll('a[class*="scrlnk"]'));
                links.forEach(a => {
                    const img = a.querySelector('img');
                    const classList = Array.from(a.classList);

                    const hasS0 = classList.includes('scrlnk_s0');
                    const hasS1 = classList.includes('scrlnk_s1');
                    const hasV0 = classList.includes('scrlnk_v0');
                    const hasV1 = classList.includes('scrlnk_v1');
                    const isNsfw = classList.includes('nsfw');

                    let sexualLevel = 2;
                    if (hasS0) sexualLevel = 0;
                    else if (hasS1) sexualLevel = 1;

                    let violentLevel = 0;
                    if (hasV1) violentLevel = 2;
                    else if (hasV0) violentLevel = 1;

                    if (hasV0 || hasV1) hasViolentContent = true;

                    if (sexualLevel > maxSexualLevel) maxSexualLevel = sexualLevel;
                    if (violentLevel > maxViolentLevel) maxViolentLevel = violentLevel;

                    rawData.push({
                        href: a.href,
                        imgSrc: img ? img.src : '',
                        rel: currentRel,
                        sexualLevel: sexualLevel,
                        violentLevel: violentLevel,
                        isNsfw: isNsfw
                    });
                });
            }
        });

        origScreenshots.remove();
        if (rawData.length === 0) return null;

        let sexualOptions = [{ level: 0, label: 'Safe' }];
        if (maxSexualLevel >= 1) sexualOptions.push({ level: 1, label: 'Suggestive' });
        if (maxSexualLevel >= 2) sexualOptions.push({ level: 2, label: 'Explicit' });

        let violentOptions = [{ level: 0, label: 'Tame' }];
        if (maxViolentLevel >= 1) violentOptions.push({ level: 1, label: 'Violent' });

        sexualOptions.forEach(opt => {
            opt.count = rawData.filter(item => item.sexualLevel === opt.level).length;
        });
        violentOptions.forEach(opt => {
            opt.count = rawData.filter(item => item.violentLevel === opt.level).length;
        });

        sexualOptions = sexualOptions.filter(opt => opt.count > 0);
        violentOptions = violentOptions.filter(opt => opt.count > 0);

        let activeSexual = sexualOptions.length > 0 ? sexualOptions[sexualOptions.length - 1].level : 0;
        let activeViolent = violentOptions.length > 0 ? violentOptions[violentOptions.length - 1].level : 0;

        const customArticle = document.createElement('article');
        customArticle.id = 'custom-screenshots-article';

        const headerBox = document.createElement('div');
        headerBox.className = 'cs-header-box';

        const titleH1 = document.createElement('h1');
        titleH1.textContent = 'Screenshots';

        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'cs-controls';

        const createRadioGroup = (name, options, initialVal, onChange) => {
            const group = document.createElement('div');
            group.className = 'cs-control-group';

            options.forEach(opt => {
                const radLabel = document.createElement('label');
                const rad = document.createElement('input');
                rad.type = 'radio';
                rad.name = name;
                rad.value = opt.level;
                if (opt.level === initialVal) rad.checked = true;

                rad.addEventListener('change', () => onChange(parseInt(rad.value, 10)));
                radLabel.append(rad, document.createTextNode(` ${opt.label} (${opt.count})`));
                group.appendChild(radLabel);
            });
            return group;
        };

        const showSexControls = sexualOptions.length > 1;
        const showViolControls = violentOptions.length > 1;

        if (showSexControls && showViolControls) {
            const sexGroup = createRadioGroup('cs_sexual_filter', sexualOptions, activeSexual, val => {
                activeSexual = val;
                renderGrid();
            });
            const separator = document.createElement('span');
            separator.style.margin = '0 6px';
            separator.style.color = 'var(--grayedout)';
            separator.textContent = '|';

            const violGroup = createRadioGroup('cs_violent_filter', violentOptions, activeViolent, val => {
                activeViolent = val;
                renderGrid();
            });

            controlsDiv.append(sexGroup, separator, violGroup);

        } else if (showSexControls) {
            controlsDiv.appendChild(createRadioGroup('cs_sexual_filter', sexualOptions, activeSexual, val => {
                activeSexual = val;
                renderGrid();
            }));

        } else if (showViolControls) {
            controlsDiv.appendChild(createRadioGroup('cs_violent_filter', violentOptions, activeViolent, val => {
                activeViolent = val;
                renderGrid();
            }));
        }

        headerBox.append(titleH1, controlsDiv);
        customArticle.appendChild(headerBox);

        const contentContainer = document.createElement('div');
        customArticle.appendChild(contentContainer);

        const renderGrid = () => {
            contentContainer.innerHTML = '';

            const grouped = {};
            rawData.forEach(item => {
                const matchesSexual = !showSexControls || item.sexualLevel <= activeSexual;
                const matchesViolent = !showViolControls || item.violentLevel <= activeViolent;

                if (matchesSexual && matchesViolent) {
                    if (!grouped[item.rel]) grouped[item.rel] = [];
                    grouped[item.rel].push(item);
                }
            });

            const keys = Object.keys(grouped);
            if (keys.length === 0) {
                const noItems = document.createElement('p');
                noItems.style.color = 'var(--grayedout)';
                noItems.style.padding = '10px 0';
                noItems.textContent = 'No screenshots match current filter criteria.';
                contentContainer.appendChild(noItems);
                return;
            }

            keys.forEach(rel => {
                const relTitle = document.createElement('p');
                relTitle.className = 'cs-rel-title';
                relTitle.innerHTML = rel;

                const grid = document.createElement('div');
                grid.className = 'cs-grid';

                grouped[rel].forEach(item => {
                    const itemAnchor = document.createElement('a');
                    itemAnchor.href = item.href;
                    itemAnchor.className = `cs-item ${item.isNsfw ? 'cs-flagged' : ''}`;

                    const img = document.createElement('img');
                    img.src = item.imgSrc;

                    itemAnchor.appendChild(img);
                    grid.appendChild(itemAnchor);
                });

                contentContainer.append(relTitle, grid);
            });
        };

        renderGrid();
        return customArticle;
    };

    // === 4. JAVASCRIPT RESTRUCTURING ===
    const mainArticle = document.querySelector('main > article:first-of-type');
    if (!mainArticle) return;

    const customScreenshotsElement = parseAndRebuildScreenshots();

    // --- A. Collect elements ---
    const titleH1 = mainArticle.querySelector('h1');
    const altTitleH2 = mainArticle.querySelector('h2.alttitle');
    const vndetailsDiv = mainArticle.querySelector('div.vndetails');
    const voteStatsFooter = document.querySelector('.votestats .votegraph tfoot td');

    if (!titleH1 || !vndetailsDiv) return;

    const coverContainer = vndetailsDiv.querySelector('.vnimg');
    const detailsTable = vndetailsDiv.querySelector('table.stripe');
    const userOptions = detailsTable ? detailsTable.querySelector('#widget2') : null;
    const description = detailsTable ? detailsTable.querySelector('.vndesc') : null;
    const tagOps = mainArticle.querySelector('#tagops');
    const coverImage = coverContainer ? coverContainer.querySelector('img') : null;
    if (!coverContainer || !detailsTable || !userOptions || !description || !coverImage) return;

    detailsTable.classList.add('details-table');
    if (userOptions) userOptions.remove();

    // --- DATA EXTRACTION: Play Time ---
    let durationTimeDisplay = null;
    let lengthVotesCount = null;
    const playTimeRow = Array.from(detailsTable.querySelectorAll('tbody > tr')).find(row => {
        const keyCell = row.querySelector('td');
        return keyCell && keyCell.textContent.trim() === 'Play time';
    });
    if (playTimeRow) {
        const valueCell = playTimeRow.cells[1];
        if (valueCell) {
            let rawText = valueCell.innerHTML;
            rawText = rawText.replace(/<a[^>]*mylengthvote[^>]*>.*?<\/a>/i, '');
            rawText = rawText.replace(/<span[^>]*small[^>]*>(\d+m)<\/span>/i, '$1');
            const votesMatch = rawText.match(/from\s*<a[^>]*>(\d+)\s+votes<\/a>/i);
            if (votesMatch) { lengthVotesCount = votesMatch[1]; }
            const timeMatch = rawText.match(/(\d+h\s*\d*m)/i);
            if (timeMatch) { durationTimeDisplay = timeMatch[1].replace(/(\d+h)(\d+m)/i, '$1 $2').trim(); }
        }
    }

    // --- B. Process details table ---
    let relationsRow = null;

    // Detect Single-Title layout: Unwrap nested table into clean centered divs
    const firstRow = detailsTable.querySelector('tbody > tr');
    if (firstRow && firstRow.cells.length === 2 && firstRow.cells[0].textContent.trim() === 'Title') {
        const nestedTable = firstRow.cells[1].querySelector('table');
        if (nestedTable) {
            const containerDiv = document.createElement('div');
            containerDiv.className = 'custom-single-title-container';

            const nestedRows = Array.from(nestedTable.querySelectorAll('tr'));
            nestedRows.forEach(tr => {
                Array.from(tr.cells).forEach(td => {
                    const lineDiv = document.createElement('div');
                    lineDiv.innerHTML = td.innerHTML;
                    containerDiv.appendChild(lineDiv);
                });
            });

            const newCell = document.createElement('td');
            newCell.colSpan = 2;
            newCell.appendChild(containerDiv);

            firstRow.innerHTML = '';
            firstRow.appendChild(newCell);
        }
    }

    Array.from(detailsTable.querySelectorAll('tbody > tr')).forEach(row => {
        const keyCell = row.querySelector('td');
        if (!keyCell) return;

        if (keyCell.textContent.trim() === 'Publishers' && keyCell.nextElementSibling) {
            const valueCell = keyCell.nextElementSibling;

            const lines = valueCell.innerHTML.split(/<br\s*\/?>/i);
            const officialLines = [];
            const extraLines = [];

            lines.forEach(lineHtml => {
                if (!lineHtml.trim()) return;

                const tempContainer = document.createElement('div');
                tempContainer.innerHTML = lineHtml;
                const hasGrayedOut = tempContainer.querySelector('a.grayedout') !== null;

                if (hasGrayedOut) {
                    extraLines.push(lineHtml.trim());
                } else {
                    officialLines.push(lineHtml.trim());
                }
            });

            const parent = row.parentNode;

            if (officialLines.length > 0) {
                const officialRow = document.createElement('tr');
                const officialKey = document.createElement('td');
                officialKey.textContent = 'Publishers';
                const officialVal = document.createElement('td');
                officialVal.innerHTML = officialLines.join('<br>');
                officialRow.append(officialKey, officialVal);
                parent.insertBefore(officialRow, row);
            }

            if (extraLines.length > 0) {
                const extraRow = document.createElement('tr');
                const extraCell = document.createElement('td');
                extraCell.colSpan = 2;
                extraCell.style.padding = '5px 0';

                const details = document.createElement('details');
                const summary = document.createElement('summary');
                summary.className = 'extra-pub-summary';
                summary.textContent = 'Extra Publishers';

                const contentDiv = document.createElement('div');
                contentDiv.innerHTML = extraLines.join('<br>');

                details.append(summary, contentDiv);
                extraCell.appendChild(details);
                extraRow.appendChild(extraCell);

                parent.replaceChild(extraRow, row);
            } else {
                row.remove();
            }
        }

        if (keyCell.textContent.trim() === 'Relations') { relationsRow = row; }
    });

    if (playTimeRow) {
        const keyCell = playTimeRow.cells[0];
        const valueCell = playTimeRow.cells[1];
        if (keyCell && valueCell) {
            const voteLink = valueCell.querySelector('a.mylengthvote');
            if (voteLink) {
                voteLink.textContent = 'Vote';
                keyCell.appendChild(document.createElement('br'));
                keyCell.appendChild(voteLink);
            }
        }
    }

    // --- C. Create "Left Details Column" ---
    const newLeftColumn = document.createElement('div');
    newLeftColumn.id = 'new-left-column';
    const detailsArticle = document.createElement('article');
    if (relationsRow) relationsRow.remove();
    detailsArticle.appendChild(detailsTable);
    newLeftColumn.appendChild(detailsArticle);
    if (relationsRow) {
        const keyCell = relationsRow.cells[0];
        const valueCell = relationsRow.cells[1];
        if (keyCell && valueCell) {
            keyCell.className = valueCell.className;
            const unofficialInput = valueCell.querySelector('input#unoffrelations');
            const unofficialLabel = valueCell.querySelector('label[for="unoffrelations"]');
            const relationsDL = valueCell.querySelector('dl');
            const headerDiv = document.createElement('div'); headerDiv.className = 'relations-header';
            const titleDiv = document.createElement('div'); titleDiv.className = 'details-key';
            titleDiv.textContent = keyCell.textContent.trim();
            headerDiv.appendChild(titleDiv);
            if (unofficialLabel) { headerDiv.appendChild(unofficialLabel); }
            keyCell.textContent = '';
            keyCell.appendChild(headerDiv);
            if (unofficialInput) { keyCell.appendChild(unofficialInput); }
            if (relationsDL) { keyCell.appendChild(relationsDL); }
            keyCell.colSpan = 2;
            valueCell.remove();
        }
        const relationsArticle = document.createElement('article');
        const relationsTable = document.createElement('table'); relationsTable.className = 'stripe';
        const relationsTbody = document.createElement('tbody');
        relationsTbody.appendChild(relationsRow);
        relationsTable.appendChild(relationsTbody);
        relationsArticle.appendChild(relationsTable);
        newLeftColumn.appendChild(relationsArticle);
    }

    // --- C.2 REORDER RELEASES (Japanese > English > Other Official > Rest) ---
    const vnreleasesArticle = document.querySelector('article.vnreleases');
    if (vnreleasesArticle) {
        const releaseDetails = Array.from(vnreleasesArticle.querySelectorAll('details'));

        const getCategoryScore = (detailsEl) => {
            const abbr = detailsEl.querySelector('summary abbr');
            const isJapanese = abbr && abbr.classList.contains('icon-lang-ja');
            const isEnglish = abbr && abbr.classList.contains('icon-lang-en');

            const releaseRows = Array.from(detailsEl.querySelectorAll('table.releases tbody tr'));
            const isFullyUnofficial = releaseRows.length > 0 && releaseRows.every(tr => {
                const titleTd = tr.querySelector('td.tc4');
                return titleTd && titleTd.innerHTML.toLowerCase().includes('unofficial');
            });

            if (isJapanese) return 1;
            if (isEnglish) return 2;
            if (!isFullyUnofficial) return 3;
            return 4;
        };

        releaseDetails.sort((a, b) => getCategoryScore(a) - getCategoryScore(b));
        releaseDetails.forEach(detailsEl => vnreleasesArticle.appendChild(detailsEl));
    }

    // --- D. Create "Hero" block ---
    const heroContainer = document.createElement('article');
    heroContainer.id = 'hero-container';
    heroContainer.style.setProperty('--cover-bg-url', `url(${coverImage.src})`);
    GM_addStyle(`#hero-container::before { background-image: var(--cover-bg-url); }`);
    const heroCover = document.createElement('div'); heroCover.id = 'hero-cover';
    heroCover.append(coverContainer, userOptions, newLeftColumn);
    const heroMain = document.createElement('div'); heroMain.id = 'hero-main';
    const titleBox = document.createElement('div'); titleBox.id = 'hero-title-box';
    const titleGroup = document.createElement('div'); titleGroup.id = 'hero-title-group';
    titleGroup.appendChild(titleH1);
    if (altTitleH2) titleGroup.appendChild(altTitleH2);
    titleBox.append(titleGroup);

    if (voteStatsFooter) {
        const ratingContainer = document.createElement('div');
        ratingContainer.id = 'hero-rating-container';
        const ratingMatch = voteStatsFooter.textContent.match(/(\d+\.\d+) average/);
        if (ratingMatch) {
            const ratingBox = document.createElement('span');
            ratingBox.id = 'hero-rating-box';
            ratingBox.textContent = ratingMatch[1];
            ratingContainer.appendChild(ratingBox);
            const votesMatch = voteStatsFooter.textContent.match(/(\d+)\s+votes/);
            if (votesMatch) {
                const votesCountSpan = document.createElement('span');
                votesCountSpan.id = 'new-votes-count';
                votesCountSpan.textContent = `(${votesMatch[1]} votes)`;
                ratingContainer.appendChild(votesCountSpan);
            }
            if (durationTimeDisplay) {
                const durationBlock = document.createElement('div');
                durationBlock.id = 'hero-duration-block';
                const durationValueSpan = document.createElement('span');
                durationValueSpan.className = 'hero-duration-value';
                durationValueSpan.textContent = durationTimeDisplay;
                const durationInfoSpan = document.createElement('span');
                durationInfoSpan.className = 'hero-duration-info';
                durationInfoSpan.textContent = `(${lengthVotesCount || 0} votes)`;
                durationBlock.append(durationValueSpan, durationInfoSpan);
                ratingContainer.appendChild(durationBlock);
            }
            titleBox.appendChild(ratingContainer);
        }
    }

    // --- E. Assembly ---
    if (description) {
        titleGroup.append(description);
    }
    heroMain.append(titleBox);
    if (tagOps) {
        heroMain.append(tagOps);
    }
    heroContainer.append(heroCover, heroMain);

    const parentContainer = mainArticle.parentElement;
    mainArticle.remove();
    parentContainer.prepend(heroContainer);

    // --- F. INTELLIGENT SCREENSHOT POSITIONING ---
    if (customScreenshotsElement) {
        requestAnimationFrame(() => {
            const coverHeight = heroCover.offsetHeight;
            const mainHeight = heroMain.offsetHeight;

            if (mainHeight < coverHeight) {
                heroMain.appendChild(customScreenshotsElement);
            } else {
                heroContainer.appendChild(customScreenshotsElement);
            }
        });
    }

})();

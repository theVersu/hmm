// ==UserScript==
// @name         Cross-Site Image Tracker (Sankaku Integration v6.2)
// @namespace    https://github.com/yourusername/cross-site-image-tracker
// @version      6.2
// @description  Applies user margin overrides for Sankaku and corrects URL routing rules for single post view actions.
// @author       Gemini
// @match        https://danbooru.donmai.us/*
// @match        https://*.gelbooru.com/*
// @match        https://chan.sankakucomplex.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Cross-Site_Image_Tracker.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Cross-Site_Image_Tracker.js
// ==/UserScript==

(function() {
    'use strict';

    const SHARED_DB_KEY = "SHARED_CROSSDOMAIN_DB";
    const SAME_SITE_CHANNEL_NAME = "vmonkey_tracker_local_sync";
    const CROSS_SITE_PING_KEY = "VMONKEY_TRACKER_CROSS_PING";

    const isDanbooru = window.location.hostname.includes('danbooru');
    const isGelbooru = window.location.hostname.includes('gelbooru');
    const isSankaku = window.location.hostname.includes('sankakucomplex');

    // Refined routing rules based on query parameters vs directory structures
    let isPostViewPage = false;
    if (isDanbooru) {
        isPostViewPage = window.location.pathname.startsWith('/posts/') && !window.location.pathname.includes('check');
    } else if (isGelbooru) {
        isPostViewPage = window.location.search.includes('page=post') && window.location.search.includes('s=view');
    } else if (isSankaku) {
        // Individual pages look like /posts/porq8N8xxa7 without a search query symbol (?)
        isPostViewPage = window.location.pathname.includes('/posts/') && !window.location.href.includes('?');
    }

    const TAB_INSTANCE_ID = Math.random().toString(36).substring(2);

    // 1. Structural Layout Stylesheet
    const style = document.createElement('style');
    style.innerHTML = `
        img.vmonkey-viewed-image {
            opacity: 0.25 !important;
            filter: grayscale(60%) !important;
            transition: opacity 0.2s ease;
            outline: 3px solid #28a745 !important;
            outline-offset: -3px;
        }

        article.post-preview,
        article.thumbnail-preview,
        div.parent-preview,
        div.sibling-preview,
        div.children-preview {
            position: relative !important;
        }

        .vmonkey-tracker-btn, .vmonkey-sync-local-indicator {
            position: absolute !important;
            top: 5px !important;
            color: white !important;
            font-size: 13px !important;
            font-weight: bold !important;
            height: 22px !important;
            border: none !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.4) !important;
            z-index: 99 !important;
            transition: background 0.2s, opacity 0.2s;
            box-sizing: border-box !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        .vmonkey-tracker-btn {
            left: 5px !important;
            width: 22px !important;
            min-width: 22px !important;
            max-width: 22px !important;
            background: rgba(100, 100, 100, 0.6) !important;
            opacity: 0;
            line-height: normal !important;
        }

        article.post-preview:hover .vmonkey-tracker-btn,
        article.thumbnail-preview:hover .vmonkey-tracker-btn,
        div.parent-preview:hover .vmonkey-tracker-btn,
        div.sibling-preview:hover .vmonkey-tracker-btn,
        div.children-preview:hover .vmonkey-tracker-btn {
            opacity: 1 !important;
        }

        .vmonkey-tracker-btn.is-active {
            background: rgba(40, 167, 69, 0.95) !important;
            opacity: 1 !important;
        }

        .vmonkey-sync-local-indicator {
            left: 32px !important;
            width: 22px !important;
            background: rgba(230, 142, 0, 0.95) !important;
            cursor: default !important;
        }

        /* Base parameters for Global Panels */
        .vmonkey-sidebar-deck {
            margin-bottom: 15px !important;
            padding: 10px !important;
            background: rgba(40, 40, 40, 0.9) !important;
            border: 1px solid #555 !important;
            border-radius: 6px !important;
            color: #fff !important;
            text-align: center !important;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3) !important;
            width: 100% !important;
            box-sizing: border-box !important;
            display: block !important;
        }

        /* Customized styles following user adjustment criteria */
        #post-list .vmonkey-sidebar-deck,
        #post-view .vmonkey-sidebar-deck,
        .sidebar .vmonkey-sidebar-deck {
            margin: 0 auto 5px -6px !important;
            padding: 8px !important;
            font-size: 11px !important;
        }

        .vmonkey-sidebar-title {
            font-size: 11px !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
            letter-spacing: 1px !important;
            margin-bottom: 8px !important;
            color: #ccc !important;
        }

        #post-list .vmonkey-sidebar-title, #post-view .vmonkey-sidebar-title {
            font-size: 10px !important;
            letter-spacing: 0.5px !important;
        }

        .vmonkey-sidebar-sync-btn, .vmonkey-post-toggle-btn {
            width: 100% !important;
            padding: 8px !important;
            font-size: 12px !important;
            font-weight: bold !important;
            cursor: pointer !important;
            border: none !important;
            border-radius: 4px !important;
            color: white !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
            box-sizing: border-box !important;
            transition: background 0.2s;
            display: block !important;
        }

        #post-list .vmonkey-sidebar-sync-btn,
        #post-view .vmonkey-sidebar-sync-btn,
        #post-view .vmonkey-post-toggle-btn {
            padding: 6px !important;
            font-size: 11px !important;
        }

        .vmonkey-sidebar-sync-btn {
            background-color: #007bff !important;
        }
        .vmonkey-sidebar-sync-btn:hover {
            background-color: #0056b3 !important;
        }
        .vmonkey-post-toggle-btn {
            margin-top: 8px !important;
        }
        .vmonkey-post-toggle-btn.state-unmarked {
            background-color: #6c757d !important;
        }
        .vmonkey-post-toggle-btn.state-unmarked:hover {
            background-color: #5a6268 !important;
        }
        .vmonkey-post-toggle-btn.state-marked {
            background-color: #28a745 !important;
        }
        .vmonkey-post-toggle-btn.state-marked:hover {
            background-color: #218838 !important;
        }
    `;
    document.head.appendChild(style);

    function extractMD5(src) {
        if (!src) return null;
        const filename = src.substring(src.lastIndexOf('/') + 1);
        const match = filename.match(/([a-f0-9]{32})/i);
        return match ? match[1].toLowerCase() : null;
    }

    function getCleanDatabase() {
        let rawDB = GM_getValue(SHARED_DB_KEY, "[]");
        let cleanArray = [];
        try {
            if (typeof rawDB === 'string') {
                cleanArray = JSON.parse(rawDB);
            } else if (Array.isArray(rawDB)) {
                cleanArray = rawDB;
            }
        } catch (e) {
            console.error("Database tracking read exception:", e);
        }
        return cleanArray.map(item => String(item).trim().toLowerCase());
    }

    function toggleHashInDatabase(md5) {
        if (!md5) return false;

        let currentDB = getCleanDatabase();
        const cleanMd5 = String(md5).toLowerCase();
        const isCurrentlyMarked = currentDB.includes(cleanMd5);

        if (isCurrentlyMarked) {
            currentDB = currentDB.filter(item => item !== cleanMd5);
        } else {
            currentDB.push(cleanMd5);
        }

        GM_setValue(SHARED_DB_KEY, JSON.stringify(currentDB));
        return true;
    }

    function getPostPageMD5() {
        if (isDanbooru) {
            const container = document.getElementById('image-container');
            if (container && container.getAttribute('data-md5')) {
                return container.getAttribute('data-md5').toLowerCase();
            }
            const img = document.getElementById('image');
            return img ? extractMD5(img.src) : null;
        }
        if (isGelbooru) {
            const img = document.getElementById('image');
            if (img) return extractMD5(img.src);
            const highResLink = document.querySelector('a[href*="images"] img#image, #mainBody img#image');
            return highResLink ? extractMD5(highResLink.src) : null;
        }
        if (isSankaku) {
            // Target elements based on single view layout profiles
            const mainImg = document.getElementById('image') ||
                            document.querySelector('.image-container img') ||
                            document.querySelector('#post-view img') ||
                            document.querySelector('.content img');
            if (mainImg) {
                const hash = extractMD5(mainImg.src);
                if (hash) return hash;
            }
            const statsRows = document.querySelectorAll('#sidebar li, #stats tr, .tag-type-none, #tag-sidebar li');
            for (let row of statsRows) {
                if (row.textContent.includes('MD5:')) {
                    const cleanTxt = row.textContent.replace('MD5:', '').trim().toLowerCase();
                    const match = cleanTxt.match(/([a-f0-9]{32})/i);
                    if (match) return match[1];
                }
            }
        }
        return null;
    }

    function syncGridFeeds(clearIndicators = false) {
        const dbList = getCleanDatabase();
        const dbSet = new Set(dbList);

        let targetSelector;
        if (isDanbooru || isSankaku) {
            targetSelector = 'article.post-preview, div.parent-preview, div.sibling-preview, div.children-preview';
        } else {
            targetSelector = 'article.thumbnail-preview';
        }

        document.querySelectorAll(targetSelector).forEach(article => {
            const img = article.querySelector('img');
            if (!img) return;

            const md5 = extractMD5(img.src);
            if (!md5) return;

            const isMarked = dbSet.has(String(md5));

            if (clearIndicators) {
                const indicator = article.querySelector('.vmonkey-sync-local-indicator');
                if (indicator) indicator.remove();
            }

            if (isMarked) img.classList.add('vmonkey-viewed-image');
            else img.classList.remove('vmonkey-viewed-image');

            let checkBtn = article.querySelector('.vmonkey-tracker-btn');
            if (!checkBtn) {
                checkBtn = document.createElement('button');
                checkBtn.className = 'vmonkey-tracker-btn';
                checkBtn.innerHTML = '✓';
                checkBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    toggleHashInDatabase(md5);

                    let indicator = article.querySelector('.vmonkey-sync-local-indicator');
                    if (!indicator) {
                        indicator = document.createElement('div');
                        indicator.className = 'vmonkey-sync-local-indicator';
                        indicator.innerHTML = '🔄';
                        article.appendChild(indicator);
                    } else {
                        indicator.remove();
                    }
                    syncGridFeeds(false);
                    if (isPostViewPage) syncPostViewButton();
                });
                article.appendChild(checkBtn);
            }
            if (isMarked) checkBtn.classList.add('is-active'); else checkBtn.classList.remove('is-active');
        });
    }

    function syncPostViewButton() {
        if (!isPostViewPage) return;

        const md5 = getPostPageMD5();
        if (!md5) return;

        const dbList = getCleanDatabase();
        const isMarked = dbList.includes(md5);

        const actionBtnNode = document.getElementById('vmonkey-post-action-btn');
        if (actionBtnNode) {
            if (isMarked) {
                actionBtnNode.className = "vmonkey-post-toggle-btn state-marked";
                actionBtnNode.innerHTML = "✓ Marked as Viewed";
            } else {
                actionBtnNode.className = "vmonkey-post-toggle-btn state-unmarked";
                actionBtnNode.innerHTML = "＋ Mark as Viewed";
            }
        }
    }

    const localBroadcastChannel = new BroadcastChannel(SAME_SITE_CHANNEL_NAME);

    localBroadcastChannel.onmessage = function(event) {
        if (event.data && event.data.action === "RELOAD_SAME_SITE" && event.data.senderId !== TAB_INSTANCE_ID) {
            window.location.reload();
        }
    };

    GM_addValueChangeListener(CROSS_SITE_PING_KEY, function(key, oldValue, newValue, remote) {
        if (remote && newValue && newValue.senderId !== TAB_INSTANCE_ID) {
            if (newValue.siteOrigin !== window.location.hostname) {
                window.location.reload();
            }
        }
    });

    function triggerGlobalTabSync() {
        syncGridFeeds(true);
        if (isPostViewPage) syncPostViewButton();

        localBroadcastChannel.postMessage({
            action: "RELOAD_SAME_SITE",
            senderId: TAB_INSTANCE_ID
        });

        GM_setValue(CROSS_SITE_PING_KEY, {
            timestamp: Date.now(),
            senderId: TAB_INSTANCE_ID,
            siteOrigin: window.location.hostname
        });
    }

    function initUnifiedSidebarWidget() {
        if (document.getElementById('vmonkey-sidebar-deck')) return;

        let sidebar = null;
        if (isDanbooru) {
            sidebar = document.querySelector('#sidebar, aside#sidebar');
        } else if (isGelbooru) {
            sidebar = document.querySelector('section.aside, .sidebar, #sidebar, #container > xml, #tag-list, div[style*="float: left"], div.side');
        } else if (isSankaku) {
            sidebar = document.querySelector('#post-list div.sidebar') ||
                      document.querySelector('#post-view div.sidebar') ||
                      document.querySelector('div.sidebar');
        }

        if (!sidebar) return;

        const deck = document.createElement('div');
        deck.id = 'vmonkey-sidebar-deck';
        deck.className = 'vmonkey-sidebar-deck';

        let innerHTMLContent = `
            <div class="vmonkey-sidebar-title">Image Tracker Panel</div>
            <button class="vmonkey-sidebar-sync-btn" id="vmonkey-sidebar-sync-action">🔄 Sync All Tabs</button>
        `;

        if (isPostViewPage) {
            innerHTMLContent += `
                <button class="vmonkey-post-toggle-btn state-unmarked" id="vmonkey-post-action-btn">＋ Mark as Viewed</button>
            `;
        }

        deck.innerHTML = innerHTMLContent;
        sidebar.insertBefore(deck, sidebar.firstChild);

        document.getElementById('vmonkey-sidebar-sync-action').addEventListener('click', function() {
            triggerGlobalTabSync();
        });

        if (isPostViewPage) {
            document.getElementById('vmonkey-post-action-btn').addEventListener('click', function() {
                const md5 = getPostPageMD5();
                if (md5) {
                    toggleHashInDatabase(md5);
                    syncPostViewButton();
                    syncGridFeeds(false);
                }
            });
            syncPostViewButton();
        }
    }

    if (isPostViewPage) {
        initUnifiedSidebarWidget();
        syncGridFeeds(true);
        syncPostViewButton();
    } else {
        syncGridFeeds(true);
        initUnifiedSidebarWidget();

        const observer = new MutationObserver(() => {
            initUnifiedSidebarWidget();
            syncGridFeeds(false);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

})();

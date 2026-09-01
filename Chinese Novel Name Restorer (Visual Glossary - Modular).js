// ==UserScript==
// @name         Chinese Novel Name Restorer (Visual Glossary - Modular)
// @namespace    http://tampermonkey.net/
// @version      4.0.3
// @description  Adds multi-novel dropdown support, tabbed categories, scoped import/export, modular per-entry rule toggles (Name-safe, On/Off), and hotkey blocking.
// @author       You
// @match        https://*.mvlempyr.io/*
// @match        https://wtr-lab.com/*
// @match        https://crimsonscrolls.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Chinese%20Novel%20Name%20Restorer%20(Visual%20Glossary%20-%20Modular).js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Chinese%20Novel%20Name%20Restorer%20(Visual%20Glossary%20-%20Modular).js
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 0. MODULAR RULE DEFINITIONS (EASY TO EXTEND)
    // ==========================================
    const RULE_MODULES = [
        {
            id: 'skipCapital',
            icon: '🛑',
            label: 'Skip if followed by Capital Word (Name Safe)',
            default: false
        },
        {
            id: 'enabled',
            icon: '👁️',
            label: 'Enable / Disable Rule',
            default: true
        }
    ];

    function normalizeEntry(entryData) {
        if (typeof entryData === 'string') {
            return {
                target: entryData,
                skipCapital: false,
                enabled: true
            };
        }
        return {
            target: entryData.target || '',
            skipCapital: entryData.skipCapital ?? false,
            enabled: entryData.enabled ?? true
        };
    }

    // ==========================================
    // 1. UNIQUE NOVEL KEY DETECTOR & INDEXING
    // ==========================================

    function isValidNovelKey(key) {
        if (!key || key === 'glossary_default') return false;

        const isWtrNovel = /^glossary_wtr_\d+$/.test(key);
        const isMvlempyrNovel = /^glossary_mvlempyr_\d+$/.test(key);
        const isCrimsonNovel = /^glossary_crimson_[a-zA-Z0-9_-]+$/.test(key);
        const isSeriesNovel = /^glossary_series_[a-zA-Z0-9_-]+$/.test(key);

        return isWtrNovel || isMvlempyrNovel || isCrimsonNovel || isSeriesNovel;
    }

    function getCurrentNovelKey() {
        const url = window.location.href;

        const wtrMatch = url.match(/\/novel\/(\d+)\//i);
        if (wtrMatch && wtrMatch[1]) return `glossary_wtr_${wtrMatch[1]}`;

        const mvlempyrMatch = url.match(/\/chapter\/(\d+)-\d+/i);
        if (mvlempyrMatch && mvlempyrMatch[1]) return `glossary_mvlempyr_${mvlempyrMatch[1]}`;

        const crimsonMatch = url.match(/crimsonscrolls\.net\/novel\/([a-zA-Z0-9_-]+)/i);
        if (crimsonMatch && crimsonMatch[1]) return `glossary_crimson_${crimsonMatch[1]}`;

        const genericMatch = url.match(/(?:\/book\/|\/novel\/|\/series\/)([a-zA-Z0-9_-]+)/i);
        if (genericMatch && genericMatch[1]) return `glossary_series_${genericMatch[1]}`;

        return `glossary_default`;
    }

    const CURRENT_STORAGE_KEY = getCurrentNovelKey();
    const UI_STATE_KEY = `glossary_ui_open_global`;
    const ENGINE_ACTIVE_KEY = `glossary_engine_active_global`;
    const NOVEL_INDEX_KEY = `glossary_novel_index_list`;

    function registerNovelKey(key) {
        if (!isValidNovelKey(key)) return;

        let list = [];
        try { list = JSON.parse(GM_getValue(NOVEL_INDEX_KEY, '[]')); } catch (e) { list = []; }
        if (!list.includes(key)) {
            list.push(key);
            GM_setValue(NOVEL_INDEX_KEY, JSON.stringify(list));
        }
    }
    registerNovelKey(CURRENT_STORAGE_KEY);

    let selectedNovelFilter = CURRENT_STORAGE_KEY;
    let activeTab = 'CN_EN';
    let isEngineActive = GM_getValue(ENGINE_ACTIVE_KEY, true);
    const originalTextMap = new WeakMap();

    function isChinese(str) {
        return /[\u4e00-\u9fa5]/.test(str);
    }

    function loadGlossaryForKey(key) {
        try {
            const rawData = JSON.parse(GM_getValue(key, '{}'));
            const normalized = {};
            for (let [k, v] of Object.entries(rawData)) {
                normalized[k] = normalizeEntry(v);
            }
            return normalized;
        } catch (e) {
            return {};
        }
    }

    function getCombinedActiveGlossary() {
        if (selectedNovelFilter !== 'ALL') {
            return loadGlossaryForKey(selectedNovelFilter);
        }

        let list = [];
        try { list = JSON.parse(GM_getValue(NOVEL_INDEX_KEY, '[]')); } catch (e) { list = []; }

        let merged = {};
        list.forEach(k => {
            const data = loadGlossaryForKey(k);
            merged = { ...merged, ...data };
        });
        return merged;
    }

    function getTargetSaveKey() {
        return (selectedNovelFilter === 'ALL') ? CURRENT_STORAGE_KEY : selectedNovelFilter;
    }

    // ==========================================
    // GLOBAL HOTKEY INTERCEPTOR (CAPTURE PHASE)
    // ==========================================
    ['keydown', 'keyup', 'keypress'].forEach(eventType => {
        window.addEventListener(eventType, (e) => {
            const target = e.target || document.activeElement;
            if (target && target.closest && target.closest('#glossary-panel-container')) {
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }
            }
        }, true);
    });

    // ==========================================
    // 2. TEXT REPLACEMENT ENGINE (SINGLE-PASS MATCHING)
    // ==========================================
    let combinedRegex = null;
    let resultMap = new Map();

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function updateRegexRules() {
        const glossary = getCombinedActiveGlossary();
        const sortedKeys = Object.keys(glossary).sort((a, b) => b.length - a.length);

        resultMap.clear();

        if (sortedKeys.length === 0) {
            combinedRegex = null;
            return;
        }

        const patterns = [];

        sortedKeys.forEach(badName => {
            const ruleObj = glossary[badName];
            if (!ruleObj.enabled) return;

            const hasChineseChar = isChinese(badName);
            let pattern;

            if (hasChineseChar) {
                pattern = escapeRegExp(badName);
            } else {
                const wordParts = badName.split(/\s+/).map(escapeRegExp);
                const corePattern = wordParts.join('\\s+');

                const startsWithWordChar = /^\w/.test(badName);
                const endsWithWordChar = /\w$/.test(badName);

                const prefix = startsWithWordChar ? '\\b' : '';
                let suffix = endsWithWordChar ? '\\b' : '';

                if (ruleObj.skipCapital) {
                    suffix += '(?!\\s+[A-Z][a-z]*)';
                }

                pattern = `${prefix}${corePattern}${suffix}`;
            }

            patterns.push(pattern);
            resultMap.set(badName.replace(/\s+/g, ' '), ruleObj.target);
        });

        if (patterns.length === 0) {
            combinedRegex = null;
            return;
        }

        combinedRegex = new RegExp(patterns.join('|'), 'g');
    }

    function translateTextNode(node) {
        if (!originalTextMap.has(node)) {
            originalTextMap.set(node, node.nodeValue);
        }

        if (!isEngineActive || !combinedRegex) return;

        const originalText = originalTextMap.get(node);

        const newText = originalText.replace(combinedRegex, (matched) => {
            const normalizedMatch = matched.replace(/\s+/g, ' ');
            if (resultMap.has(normalizedMatch)) {
                return resultMap.get(normalizedMatch);
            }
            for (let [key, val] of resultMap.entries()) {
                if (key.toLowerCase() === normalizedMatch.toLowerCase()) {
                    return val;
                }
            }
            return matched;
        });

        if (newText !== node.nodeValue) {
            node.nodeValue = newText;
        }
    }

    function restoreTextNode(node) {
        if (originalTextMap.has(node)) {
            node.nodeValue = originalTextMap.get(node);
        }
    }

    function applyDataHashReplacements() {
        if (!isEngineActive) return;

        const glossary = getCombinedActiveGlossary();
        const spans = document.querySelectorAll('span[data-hash]');

        spans.forEach(span => {
            const hash = span.getAttribute('data-hash');
            if (glossary[hash] && glossary[hash].enabled) {
                span.textContent = glossary[hash].target;
            }
        });
    }

    function runReplacement(rootNode = document.body) {
        if (!rootNode) return;

        applyDataHashReplacements();

        const walker = document.createTreeWalker(
            rootNode,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    const parent = node.parentNode;
                    if (parent) {
                        if (parent.closest('#glossary-panel-container') || parent.closest('#glossary-btn-wrapper')) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        const tag = parent.tagName.toUpperCase();
                        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT') {
                            return NodeFilter.FILTER_REJECT;
                        }
                    }
                    return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
                }
            }
        );

        let node;
        while ((node = walker.nextNode())) {
            if (isEngineActive) {
                translateTextNode(node);
            } else {
                restoreTextNode(node);
            }
        }
    }

    updateRegexRules();
    runReplacement();

    const observer = new MutationObserver((mutations) => {
        for (let i = 0; i < mutations.length; i++) {
            const mutation = mutations[i];
            for (let j = 0; j < mutation.addedNodes.length; j++) {
                const node = mutation.addedNodes[j];
                if (node.nodeType === Node.ELEMENT_NODE) {
                    runReplacement(node);
                } else if (node.nodeType === Node.TEXT_NODE) {
                    if (isEngineActive) translateTextNode(node);
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ==========================================
    // 3. ON-SCREEN GLOSSARY UI
    // ==========================================
    let panel = null;
    let activeImportScope = 'CURRENT';

    function createGlossaryUI() {
        if (document.getElementById('glossary-panel-container')) return;

        const container = document.createElement('div');
        container.id = 'glossary-panel-container';
        container.innerHTML = `
            <style>
                #glossary-panel-container {
                    position: fixed;
                    bottom: 85px;
                    right: 24px;
                    width: 440px;
                    max-width: 92vw;
                    max-height: 80vh;
                    background: #18181b;
                    color: #f4f4f5;
                    border: 1px solid #27272a;
                    border-radius: 12px;
                    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5), 0 10px 10px -5px rgba(0,0,0,0.5);
                    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
                    z-index: 999999;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    box-sizing: border-box;
                    opacity: 0.20;
                    transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                #glossary-panel-container:hover {
                    opacity: 1.0;
                }
                @media (pointer: coarse), (max-width: 768px) {
                    #glossary-panel-container {
                        opacity: 1.0 !important;
                    }
                }
                #glossary-panel-container * { box-sizing: border-box; }
                .gl-header {
                    padding: 10px 14px;
                    background: #202024;
                    border-bottom: 1px solid #27272a;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-weight: 600;
                    font-size: 13px;
                }
                .gl-close {
                    background: none;
                    border: none;
                    color: #a1a1aa;
                    font-size: 20px;
                    cursor: pointer;
                    line-height: 1;
                }
                .gl-close:hover { color: #f43f5e; }

                .gl-filter-bar {
                    padding: 8px 14px;
                    background: #121214;
                    border-bottom: 1px solid #27272a;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 11px;
                    color: #a1a1aa;
                }
                .gl-select {
                    flex: 1;
                    background: #18181b;
                    color: #38bdf8;
                    border: 1px solid #3f3f46;
                    border-radius: 4px;
                    padding: 4px 6px;
                    font-size: 11px;
                    outline: none;
                    cursor: pointer;
                }

                .gl-tabs {
                    display: flex;
                    background: #18181b;
                    border-bottom: 1px solid #27272a;
                }
                .gl-tab-btn {
                    flex: 1;
                    padding: 8px 4px;
                    background: none;
                    border: none;
                    border-bottom: 2px solid transparent;
                    color: #71717a;
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .gl-tab-btn.active {
                    color: #38bdf8;
                    border-bottom-color: #38bdf8;
                    background: #202024;
                }

                .gl-body {
                    padding: 12px 14px;
                    overflow-y: auto;
                    overflow-x: hidden;
                    flex-grow: 1;
                    display: flex;
                    flex-direction: column;
                }
                .gl-inputs {
                    display: flex;
                    gap: 6px;
                    margin-bottom: 12px;
                    width: 100%;
                    align-items: center;
                }
                .gl-inputs input {
                    flex: 1;
                    min-width: 80px;
                    padding: 6px 8px;
                    border: 1px solid #3f3f46;
                    border-radius: 6px;
                    background: #09090b;
                    color: #fff;
                    font-size: 12px;
                    outline: none;
                }
                .gl-inputs input:focus { border-color: #3b82f6; }
                .gl-inputs button {
                    padding: 6px 12px;
                    background: #2563eb;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-weight: 600;
                    font-size: 12px;
                    cursor: pointer;
                    transition: background 0.15s ease;
                    flex-shrink: 0;
                }
                .gl-inputs button:hover { background: #1d4ed8; }
                .gl-reset-btn {
                    background: #27272a;
                    border: 1px solid #3f3f46;
                    color: #a1a1aa;
                    border-radius: 6px;
                    padding: 6px 8px;
                    font-size: 14px;
                    cursor: pointer;
                    line-height: 1;
                    flex-shrink: 0;
                    transition: all 0.15s;
                }
                .gl-reset-btn:hover {
                    background: #3f3f46;
                    color: #f43f5e;
                    border-color: #f43f5e;
                }
                .gl-list {
                    max-height: 200px;
                    overflow-y: auto;
                    overflow-x: hidden;
                    border: 1px solid #27272a;
                    border-radius: 6px;
                    background: #09090b;
                    width: 100%;
                }
                .gl-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6px 10px;
                    border-bottom: 1px solid #18181b;
                    font-size: 12px;
                    gap: 6px;
                }
                .gl-item.disabled {
                    opacity: 0.45;
                }
                .gl-item:last-child { border-bottom: none; }
                .gl-item-text {
                    text-overflow: ellipsis;
                    overflow: hidden;
                    white-space: nowrap;
                    flex-grow: 1;
                }
                .gl-arrow { color: #60a5fa; margin: 0 4px; font-weight: bold; }

                .gl-copy-btn {
                    background: none;
                    border: none;
                    color: #38bdf8;
                    cursor: pointer;
                    font-size: 13px;
                    line-height: 1;
                    padding: 0 4px;
                    flex-shrink: 0;
                    transition: transform 0.1s;
                }
                .gl-copy-btn:hover {
                    color: #7dd3fc;
                    transform: scale(1.15);
                }

                .gl-modules-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    flex-shrink: 0;
                }
                .gl-mod-btn {
                    background: #27272a;
                    border: 1px solid #3f3f46;
                    color: #71717a;
                    border-radius: 4px;
                    padding: 2px 6px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.15s;
                    line-height: 1.2;
                }
                .gl-mod-btn.active {
                    background: #1e293b;
                    border-color: #3b82f6;
                    color: #fff;
                }
                .gl-delete {
                    background: none;
                    border: none;
                    color: #f43f5e;
                    cursor: pointer;
                    font-size: 16px;
                    line-height: 1;
                    padding: 0 4px;
                    flex-shrink: 0;
                }
                .gl-delete:hover { color: #fda4af; }

                .gl-backup-container {
                    margin-top: 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    width: 100%;
                }
                .gl-backup-row {
                    display: flex;
                    gap: 6px;
                    width: 100%;
                }
                .gl-backup-btn {
                    flex: 1;
                    padding: 6px 4px;
                    background: #27272a;
                    border: 1px solid #3f3f46;
                    color: #d4d4d8;
                    border-radius: 6px;
                    font-size: 10px;
                    font-weight: 600;
                    cursor: pointer;
                    text-align: center;
                    transition: background 0.15s, color 0.15s;
                }
                .gl-backup-btn:hover {
                    background: #3f3f46;
                    color: #fff;
                }
                .gl-backup-btn.all-btn {
                    background: #1e293b;
                    border-color: #334155;
                    color: #38bdf8;
                }
                .gl-backup-btn.all-btn:hover {
                    background: #334155;
                    color: #7dd3fc;
                }
            </style>

            <div class="gl-header">
                <span>Name Restorer Settings</span>
                <button class="gl-close" id="gl-close-btn">&times;</button>
            </div>

            <div class="gl-filter-bar">
                <span>Novel Context:</span>
                <select id="gl-novel-select" class="gl-select"></select>
            </div>

            <div class="gl-tabs">
                <button class="gl-tab-btn active" id="gl-tab-cn">Chinese > English (0)</button>
                <button class="gl-tab-btn" id="gl-tab-en">English > English (0)</button>
            </div>

            <div class="gl-body">
                <div class="gl-inputs">
                    <button class="gl-reset-btn" id="gl-reset-inputs-btn" title="Clear textboxes">🧹</button>
                    <input type="text" id="gl-input-bad" placeholder="Chinese Raw Term">
                    <input type="text" id="gl-input-good" placeholder="Target Term">
                    <button id="gl-add-btn">Add</button>
                </div>
                <div class="gl-list" id="gl-list-container"></div>

                <div class="gl-backup-container">
                    <div class="gl-backup-row">
                        <button id="gl-export-current-btn" class="gl-backup-btn">📤 Export Current Novel</button>
                        <button id="gl-import-current-btn" class="gl-backup-btn">📥 Import to Current</button>
                    </div>
                    <div class="gl-backup-row">
                        <button id="gl-export-all-btn" class="gl-backup-btn all-btn">🌐 Export All Novels</button>
                        <button id="gl-import-all-btn" class="gl-backup-btn all-btn">🌐 Import All Novels</button>
                    </div>
                    <input type="file" id="gl-import-file" accept=".json" style="display: none;">
                </div>
            </div>
        `;

        document.body.appendChild(container);
        panel = container;

        populateNovelDropdown();
        renderList();

        document.getElementById('gl-close-btn').addEventListener('click', () => {
            panel.style.display = 'none';
            GM_setValue(UI_STATE_KEY, false);
        });

        document.getElementById('gl-novel-select').addEventListener('change', (e) => {
            selectedNovelFilter = e.target.value;
            renderList();
        });

        const tabCN = document.getElementById('gl-tab-cn');
        const tabEN = document.getElementById('gl-tab-en');

        tabCN.addEventListener('click', () => {
            activeTab = 'CN_EN';
            tabCN.classList.add('active');
            tabEN.classList.remove('active');
            document.getElementById('gl-input-bad').placeholder = "Chinese Raw Term";
            renderList();
        });

        tabEN.addEventListener('click', () => {
            activeTab = 'EN_EN';
            tabEN.classList.add('active');
            tabCN.classList.remove('active');
            document.getElementById('gl-input-bad').placeholder = "English Raw Name / Unit / Hash";
            renderList();
        });

        document.getElementById('gl-reset-inputs-btn').addEventListener('click', () => {
            document.getElementById('gl-input-bad').value = '';
            document.getElementById('gl-input-good').value = '';
            document.getElementById('gl-input-bad').focus();
        });

        document.getElementById('gl-add-btn').addEventListener('click', addNewPair);
        document.getElementById('gl-input-good').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addNewPair();
        });

        const fileInput = document.getElementById('gl-import-file');

        document.getElementById('gl-export-current-btn').addEventListener('click', () => exportGlossary('CURRENT'));
        document.getElementById('gl-export-all-btn').addEventListener('click', () => exportGlossary('ALL'));

        document.getElementById('gl-import-current-btn').addEventListener('click', () => {
            activeImportScope = 'CURRENT';
            fileInput.click();
        });
        document.getElementById('gl-import-all-btn').addEventListener('click', () => {
            activeImportScope = 'ALL';
            fileInput.click();
        });

        fileInput.addEventListener('change', importGlossary);

        const shouldBeOpen = GM_getValue(UI_STATE_KEY, true);
        panel.style.display = shouldBeOpen ? 'flex' : 'none';
    }

    function populateNovelDropdown() {
        const select = document.getElementById('gl-novel-select');
        if (!select) return;

        select.innerHTML = '';

        const optAll = document.createElement('option');
        optAll.value = 'ALL';
        optAll.textContent = '🌐 All Combined Novels';
        select.appendChild(optAll);

        let list = [];
        try { list = JSON.parse(GM_getValue(NOVEL_INDEX_KEY, '[]')); } catch (e) { list = []; }

        list.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = (k === CURRENT_STORAGE_KEY) ? `📖 ${k} (Current Novel)` : `📖 ${k}`;
            select.appendChild(opt);
        });

        select.value = selectedNovelFilter;
    }

    function renderList() {
        const glossary = getCombinedActiveGlossary();
        const listContainer = document.getElementById('gl-list-container');
        if (!listContainer) return;

        const allKeys = Object.keys(glossary);
        let cnCount = 0;
        let enCount = 0;

        allKeys.forEach(key => {
            if (isChinese(key)) {
                cnCount++;
            } else {
                enCount++;
            }
        });

        const tabCN = document.getElementById('gl-tab-cn');
        const tabEN = document.getElementById('gl-tab-en');
        if (tabCN) tabCN.textContent = `Chinese > English (${cnCount})`;
        if (tabEN) tabEN.textContent = `English > English (${enCount})`;

        listContainer.innerHTML = '';

        const filteredKeys = allKeys.filter(key => {
            const hasChinese = isChinese(key);
            return activeTab === 'CN_EN' ? hasChinese : !hasChinese;
        });

        if (filteredKeys.length === 0) {
            listContainer.innerHTML = `<div style="padding:15px; color:#71717a; text-align:center; font-size:11px;">
                No ${activeTab === 'CN_EN' ? 'Chinese' : 'English'} terms in this view scope.
            </div>`;
            return;
        }

        filteredKeys.forEach(badName => {
            const ruleObj = glossary[badName];
            const item = document.createElement('div');
            item.className = `gl-item ${ruleObj.enabled ? '' : 'disabled'}`;

            let modulesHtml = '<div class="gl-modules-wrapper">';
            RULE_MODULES.forEach(mod => {
                const isActive = ruleObj[mod.id] ?? mod.default;
                modulesHtml += `<button class="gl-mod-btn ${isActive ? 'active' : ''}" data-key="${badName}" data-mod="${mod.id}" title="${mod.label}">${mod.icon}</button>`;
            });
            modulesHtml += '</div>';

            item.innerHTML = `
                <button class="gl-copy-btn" data-bad="${badName}" data-good="${ruleObj.target}" title="Copy into input boxes">📝</button>
                <span class="gl-item-text" title="${badName} to ${ruleObj.target}">
                    <strong>${badName}</strong> <span class="gl-arrow">&rarr;</span> <strong>${ruleObj.target}</strong>
                </span>
                ${modulesHtml}
                <button class="gl-delete" data-key="${badName}">&times;</button>
            `;
            listContainer.appendChild(item);
        });

        listContainer.querySelectorAll('.gl-copy-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const badVal = this.getAttribute('data-bad');
                const goodVal = this.getAttribute('data-good');
                document.getElementById('gl-input-bad').value = badVal;
                document.getElementById('gl-input-good').value = goodVal;
                document.getElementById('gl-input-bad').focus();
            });
        });

        listContainer.querySelectorAll('.gl-mod-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const key = this.getAttribute('data-key');
                const modId = this.getAttribute('data-mod');
                toggleModuleForRule(key, modId);
            });
        });

        listContainer.querySelectorAll('.gl-delete').forEach(btn => {
            btn.addEventListener('click', function() {
                const keyToDelete = this.getAttribute('data-key');
                deleteTerm(keyToDelete);
            });
        });
    }

    function toggleModuleForRule(badName, modId) {
        function updateSingleGlossary(g) {
            if (g[badName]) {
                g[badName] = normalizeEntry(g[badName]);
                g[badName][modId] = !g[badName][modId];
            }
        }

        if (selectedNovelFilter === 'ALL') {
            let list = [];
            try { list = JSON.parse(GM_getValue(NOVEL_INDEX_KEY, '[]')); } catch (e) { list = []; }
            list.forEach(k => {
                const g = loadGlossaryForKey(k);
                if (g[badName]) {
                    updateSingleGlossary(g);
                    GM_setValue(k, JSON.stringify(g));
                }
            });
        } else {
            const targetGlossary = loadGlossaryForKey(selectedNovelFilter);
            updateSingleGlossary(targetGlossary);
            GM_setValue(selectedNovelFilter, JSON.stringify(targetGlossary));
        }

        updateRegexRules();
        if (isEngineActive) runReplacement();
        renderList();
    }

    function addNewPair() {
        const badInput = document.getElementById('gl-input-bad');
        const goodInput = document.getElementById('gl-input-good');
        const badVal = badInput.value.trim();
        const goodVal = goodInput.value.trim();

        if (!badVal || !goodVal) return;

        const targetKey = getTargetSaveKey();
        const targetGlossary = loadGlossaryForKey(targetKey);

        targetGlossary[badVal] = normalizeEntry({ target: goodVal });
        GM_setValue(targetKey, JSON.stringify(targetGlossary));

        updateRegexRules();
        if (isEngineActive) runReplacement();
        renderList();

        badInput.value = '';
        goodInput.value = '';
        badInput.focus();
    }

    function deleteTerm(keyToDelete) {
        if (selectedNovelFilter === 'ALL') {
            let list = [];
            try { list = JSON.parse(GM_getValue(NOVEL_INDEX_KEY, '[]')); } catch (e) { list = []; }
            list.forEach(k => {
                const g = loadGlossaryForKey(k);
                if (g[keyToDelete]) {
                    delete g[keyToDelete];
                    GM_setValue(k, JSON.stringify(g));
                }
            });
        } else {
            const targetGlossary = loadGlossaryForKey(selectedNovelFilter);
            delete targetGlossary[keyToDelete];
            GM_setValue(selectedNovelFilter, JSON.stringify(targetGlossary));
        }

        updateRegexRules();
        if (isEngineActive) runReplacement();
        renderList();
    }

    // ==========================================
    // BACKUP ENGINE (EXPORT / IMPORT)
    // ==========================================
    function exportGlossary(scope) {
        if (scope === 'CURRENT') {
            const targetKey = getTargetSaveKey();
            const glossary = loadGlossaryForKey(targetKey);

            if (Object.keys(glossary).length === 0) {
                alert("The selected novel glossary is currently empty.");
                return;
            }

            downloadJson(glossary, `${targetKey}.json`);
        } else if (scope === 'ALL') {
            let list = [];
            try { list = JSON.parse(GM_getValue(NOVEL_INDEX_KEY, '[]')); } catch (e) { list = []; }

            let fullBackup = {
                _type: "FULL_NOVEL_GLOSSARY_BACKUP",
                index: list,
                novels: {}
            };

            list.forEach(key => {
                fullBackup.novels[key] = loadGlossaryForKey(key);
            });

            downloadJson(fullBackup, `glossary_full_backup_all_novels.json`);
        }
    }

    function downloadJson(data, filename) {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", filename);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }

    function importGlossary(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedData = JSON.parse(e.target.result);

                if (activeImportScope === 'CURRENT') {
                    if (typeof importedData === 'object' && importedData !== null && !Array.isArray(importedData) && !importedData._type) {
                        const targetKey = getTargetSaveKey();
                        const glossary = loadGlossaryForKey(targetKey);
                        for (let [k, v] of Object.entries(importedData)) {
                            glossary[k] = normalizeEntry(v);
                        }
                        GM_setValue(targetKey, JSON.stringify(glossary));
                        updateRegexRules();
                        if (isEngineActive) runReplacement();
                        renderList();
                        alert("Glossary imported and merged into the current novel!");
                    } else {
                        alert("Error: Please select a valid single-novel dictionary JSON file.");
                    }
                } else if (activeImportScope === 'ALL') {
                    if (importedData && importedData._type === "FULL_NOVEL_GLOSSARY_BACKUP") {
                        let currentList = [];
                        try { currentList = JSON.parse(GM_getValue(NOVEL_INDEX_KEY, '[]')); } catch (e) { currentList = []; }

                        Object.keys(importedData.novels).forEach(key => {
                            if (!currentList.includes(key)) currentList.push(key);
                            const existing = loadGlossaryForKey(key);
                            for (let [k, v] of Object.entries(importedData.novels[key])) {
                                existing[k] = normalizeEntry(v);
                            }
                            GM_setValue(key, JSON.stringify(existing));
                        });

                        GM_setValue(NOVEL_INDEX_KEY, JSON.stringify(currentList));
                        populateNovelDropdown();
                        updateRegexRules();
                        if (isEngineActive) runReplacement();
                        renderList();
                        alert("All novel glossaries imported and merged successfully!");
                    } else if (typeof importedData === 'object' && importedData !== null && !Array.isArray(importedData)) {
                        let list = [];
                        try { list = JSON.parse(GM_getValue(NOVEL_INDEX_KEY, '[]')); } catch (e) { list = []; }

                        list.forEach(key => {
                            const existing = loadGlossaryForKey(key);
                            for (let [k, v] of Object.entries(importedData)) {
                                existing[k] = normalizeEntry(v);
                            }
                            GM_setValue(key, JSON.stringify(existing));
                        });

                        updateRegexRules();
                        if (isEngineActive) runReplacement();
                        renderList();
                        alert("Terms merged into all registered novel glossaries!");
                    } else {
                        alert("Error: Invalid JSON format.");
                    }
                }
            } catch (err) {
                alert("Error: Failed to process file. Make sure it is a valid JSON file.");
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    function togglePanel() {
        if (!panel) {
            createGlossaryUI();
        } else {
            const isCurrentlyHidden = panel.style.display === 'none';
            panel.style.display = isCurrentlyHidden ? 'flex' : 'none';
            GM_setValue(UI_STATE_KEY, isCurrentlyHidden);
        }
    }

    // ==========================================
    // 4. FLOATING CONTROL BUTTONS
    // ==========================================
    function createFloatingControls() {
        if (document.getElementById('glossary-btn-wrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'glossary-btn-wrapper';
        wrapper.innerHTML = `
            <style>
                #glossary-btn-wrapper {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    display: flex;
                    gap: 8px;
                    z-index: 999998;
                    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
                }
                .gl-float-btn {
                    padding: 8px 14px;
                    color: white;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: 13px;
                    letter-spacing: 0.2px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    transition: background 0.15s, transform 0.1s;
                    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
                }
                #glossary-open-btn {
                    background: #2563eb;
                    border: 1px solid #3b82f6;
                }
                #glossary-open-btn:hover { background: #1d4ed8; transform: translateY(-1px); }

                #glossary-toggle-btn {
                    background: ${isEngineActive ? '#16a34a' : '#dc2626'};
                    border: 1px solid ${isEngineActive ? '#22c55e' : '#ef4444'};
                    min-width: 90px;
                    justify-content: center;
                }
                #glossary-toggle-btn:hover {
                    background: ${isEngineActive ? '#15803d' : '#b91c1c'};
                    transform: translateY(-1px);
                }
                .gl-float-btn:active { transform: translateY(1px); }
            </style>
            <button id="glossary-toggle-btn" class="gl-float-btn">${isEngineActive ? '👁️ ON' : '🙈 OFF'}</button>
            <button id="glossary-open-btn" class="gl-float-btn">⚙️ Glossary</button>
        `;

        document.body.appendChild(wrapper);

        document.getElementById('glossary-open-btn').addEventListener('click', togglePanel);

        const toggleBtn = document.getElementById('glossary-toggle-btn');
        toggleBtn.addEventListener('click', () => {
            isEngineActive = !isEngineActive;
            GM_setValue(ENGINE_ACTIVE_KEY, isEngineActive);

            toggleBtn.innerHTML = isEngineActive ? '👁️ ON' : '🙈 OFF';
            toggleBtn.style.background = isEngineActive ? '#16a34a' : '#dc2626';
            toggleBtn.style.borderColor = isEngineActive ? '#22c55e' : '#ef4444';

            runReplacement();
        });
    }

    createFloatingControls();
    createGlossaryUI();

    GM_registerMenuCommand("Toggle Novel Glossary UI", togglePanel);

})();

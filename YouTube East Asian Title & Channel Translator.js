// ==UserScript==
// @name         YouTube East Asian Title & Channel Translator
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Translates Chinese, Japanese, and Korean video titles and channel names to English when hovering.
// @author       Your Name
// @match        https://www.youtube.com/*
// @grant        GM.xmlHttpRequest
// @connect      translate.googleapis.com
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/YouTube East Asian Title & Channel Translator.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/YouTube East Asian Title & Channel Translator.js
// ==/UserScript==

(function() {
    'use strict';

    // Regex checking for Chinese characters, Japanese (Hiragana/Katakana), and Korean (Hangul)
    const eastAsianRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/;
    const translationCache = new Map();

    const cardSelectors = [
        'ytd-rich-item-renderer',
        'ytd-rich-grid-media',
        'ytd-video-renderer',
        'ytd-compact-video-renderer',
        'yt-lockup-view-model',
        'ytd-watch-metadata'
    ].join(', ');

    const titleSelectors = [
        '.ytLockupMetadataViewModelTitle',
        '#video-title',
        '#video-title-link',
        'h1.ytd-watch-metadata',
        '#title.ytd-watch-metadata',
        'ytd-watch-metadata h1 yt-formatted-string'
    ].join(', ');

    const channelSelectors = [
        '.ytContentMetadataViewModelMetadataRow a',
        '#channel-name',
        '#text.ytd-channel-name',
        '#upload-info #channel-name',
        'ytd-channel-name #text'
    ].join(', ');

    function fetchTranslation(text) {
        if (translationCache.has(text)) {
            return Promise.resolve(translationCache.get(text));
        }

        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;

        return new Promise((resolve) => {
            GM.xmlHttpRequest({
                method: "GET",
                url: url,
                onload: function(response) {
                    try {
                        const result = JSON.parse(response.responseText);
                        if (result && result[0]) {
                            let translatedText = result[0].map(segment => segment[0]).join('');
                            translationCache.set(text, translatedText);
                            resolve(translatedText);
                            return;
                        }
                    } catch (e) {
                        console.error("Translation error:", e);
                    }
                    resolve(text);
                },
                onerror: () => resolve(text)
            });
        });
    }

    async function translateSegmentedText(fullText) {
        const parts = fullText.split(/([♡|【】│/\\()\[\]]+)/g);
        const translatedParts = await Promise.all(parts.map(async (part) => {
            if (eastAsianRegex.test(part)) {
                return await fetchTranslation(part);
            }
            return part;
        }));
        return translatedParts.join('');
    }

    function updateTextPreservingStructure(element, newText) {
        const targetNode = element.querySelector('yt-formatted-string, span, yt-core-attributed-string') || element;

        if (targetNode.firstChild && targetNode.firstChild.nodeType === Node.TEXT_NODE) {
            targetNode.firstChild.nodeValue = newText;
        } else {
            targetNode.textContent = newText;
        }
    }

    async function checkAndTranslate(element) {
        if (!element || element.getAttribute('data-translated')) return;

        const originalText = element.textContent.trim();
        if (eastAsianRegex.test(originalText)) {
            element.setAttribute('data-translated', 'pending');
            const translated = await translateSegmentedText(originalText);

            updateTextPreservingStructure(element, translated);
            element.setAttribute('data-translated', 'true');
        }
    }

    document.addEventListener('mouseover', function(event) {
        const target = event.target;
        if (!target) return;

        let directTarget = target.closest(`${titleSelectors}, ${channelSelectors}`);
        if (directTarget) {
            checkAndTranslate(directTarget);
            return;
        }

        const cardEl = target.closest(cardSelectors);
        if (cardEl) {
            const titleEl = cardEl.querySelector(titleSelectors);
            const channelEl = cardEl.querySelector(channelSelectors);

            if (titleEl) checkAndTranslate(titleEl);
            if (channelEl) checkAndTranslate(channelEl);
        }
    }, { passive: true });
})();

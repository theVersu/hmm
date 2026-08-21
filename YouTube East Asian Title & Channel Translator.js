// ==UserScript==
// @name         YouTube East Asian Title & Channel Translator
// @namespace    http://tampermonkey.net/
// @version      1.5
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

    // Selectors for top-level video containers (cards, sidebar list items, and main watch page metadata)
    const cardSelectors = 'ytd-rich-item-renderer, ytd-rich-grid-media, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-watch-metadata';

    // Selectors for video titles (includes cards, feed items, and main watch page title)
    const titleSelectors = '.ytLockupMetadataViewModelTitle, #video-title, #video-title-link, ytd-watch-metadata #title yt-formatted-string, h1.ytd-watch-metadata, #title.ytd-watch-metadata';

    // Selectors for channel names (handles home grid, sidebar, standard layout, and main watch page channel)
    const channelSelectors = '.ytContentMetadataViewModelMetadataRow a, #channel-name, #text.ytd-channel-name, #upload-info #channel-name';

    function translateText(text, element) {
        if (translationCache.has(text)) {
            element.textContent = translationCache.get(text);
            return;
        }

        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;

        GM.xmlHttpRequest({
            method: "GET",
            url: url,
            onload: function(response) {
                try {
                    const result = JSON.parse(response.responseText);
                    if (result && result[0]) {
                        let translatedText = result[0].map(segment => segment[0]).join('');
                        if (translatedText) {
                            translationCache.set(text, translatedText);
                            element.textContent = translatedText;
                            element.setAttribute('data-translated', 'true');

                            // Keep deep nested spans or formatted string children updated if they exist
                            const innerSpan = element.querySelector('span, yt-formatted-string');
                            if (innerSpan) {
                                innerSpan.textContent = translatedText;
                            }
                        }
                    }
                } catch (e) {
                    console.error("Translation error:", e);
                }
            }
        });
    }

    // Helper to run translation checks on an element
    function checkAndTranslate(element) {
        if (!element || element.hasAttribute('data-translated')) return;

        const originalText = element.textContent.trim();
        if (eastAsianRegex.test(originalText)) {
            element.setAttribute('data-translated', 'pending');
            translateText(originalText, element);
        }
    }

    // Monitor global mouseover events
    document.addEventListener('mouseover', function(event) {
        const target = event.target;

        // 1. Check if hovered directly on/inside a title or channel name
        let directTarget = target.closest(`${titleSelectors}, ${channelSelectors}`);
        if (directTarget) {
            checkAndTranslate(directTarget);
            return;
        }

        // 2. If hovered on a card container/thumbnail/watch metadata container, grab BOTH title and channel
        const cardEl = target.closest(cardSelectors);
        if (cardEl) {
            const titleEl = cardEl.querySelector(titleSelectors);
            const channelEl = cardEl.querySelector(channelSelectors);

            if (titleEl) checkAndTranslate(titleEl);
            if (channelEl) checkAndTranslate(channelEl);
        }
    }, { passive: true });
})();

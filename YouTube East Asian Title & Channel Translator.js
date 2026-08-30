// ==UserScript==
// @name         YouTube East Asian Title & Channel Translator
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Translates Chinese, Japanese, and Korean video titles and channel names to English when hovering.
// @author       Your Name
// @match        https://www.youtube.com/*
// @grant        GM.xmlHttpRequest
// @connect      translate.googleapis.com
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/YouTube%20East%20Asian%20Title%20%26%20Channel%20Translator.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/YouTube%20East%20Asian%20Title%20%26%20Channel%20Translator.js
// ==/UserScript==

(function() {
    'use strict';

    const eastAsianRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/;
    const translationCache = new Map();

    const titleSelectors = [
        '.ytLockupMetadataViewModelTitle',
        '#video-title',
        '#video-title-link',
        'h1.ytd-watch-metadata',
        '#title.ytd-watch-metadata'
    ].join(', ');

    const channelSelectors = [
        '#channel-name a',
        '#text.ytd-channel-name',
        'ytd-channel-name a',
        '.ytContentMetadataViewModelMetadataRow a'
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

    // Helper to extract clean text without duplicate child badge strings
    function getDirectTextContent(element) {
        const target = element.querySelector('yt-core-attributed-string, yt-formatted-string, span') || element;
        return target.innerText ? target.innerText.trim() : target.textContent.trim();
    }

    function updateTextPreservingStructure(element, newText) {
        // Find the specific visible text node or component to avoid touching child badges
        const targetNode = element.querySelector('yt-core-attributed-string, yt-formatted-string, span') || element;
        
        // If there's an internal child text node, modify only that node
        let textNodeFound = false;
        for (let child of targetNode.childNodes) {
            if (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim().length > 0) {
                child.nodeValue = newText;
                textNodeFound = true;
                break;
            }
        }
        
        // Fallback for custom web components without simple text child nodes
        if (!textNodeFound) {
            targetNode.textContent = newText;
        }
    }

    async function checkAndTranslate(element) {
        if (!element || element.getAttribute('data-translated')) return;

        const originalText = getDirectTextContent(element);
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

        let el = target.closest(`${titleSelectors}, ${channelSelectors}`);
        if (el) {
            checkAndTranslate(el);
        }
    }, { passive: true });
})();

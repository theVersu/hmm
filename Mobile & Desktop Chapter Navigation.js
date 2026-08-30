// ==UserScript==
// @name         Mobile & Desktop Chapter Navigation
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Adds on-screen arrows for mobile and keyboard arrow shortcuts for PC to navigate novel chapters.
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Mobile & Desktop Chapter Navigation.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Mobile & Desktop Chapter Navigation.js
// ==/UserScript==

(function() {
    'use strict';

    // 1. Persistent State Management
    let isEnabled = GM_getValue('nav_buttons_enabled', true);

    function updateMenuCommand() {
        GM_registerMenuCommand(
            `${isEnabled ? '✅ Enabled' : '❌ Disabled'} - Toggle Nav Script`,
            () => {
                isEnabled = !isEnabled;
                GM_setValue('nav_buttons_enabled', isEnabled);
                toggleButtonsVisibility();
                location.reload();
            }
        );
    }
    updateMenuCommand();

    // 2. Helper to Check Active Text Focus
    function isEditingText() {
        const active = document.activeElement;
        if (!active) return false;

        const tag = active.tagName.toUpperCase();

        if (tag === 'TEXTAREA' || tag === 'INPUT') {
            const type = (active.type || '').toLowerCase();
            const nonTextTypes = ['button', 'submit', 'checkbox', 'radio', 'image', 'reset', 'range', 'color'];
            return !nonTextTypes.includes(type);
        }

        if (active.isContentEditable) return true;

        return false;
    }

    // 3. UI Creation (On-Screen Buttons with Hover Transparency)
    const container = document.createElement('div');
    container.id = 'vm-nav-buttons-container';

    const style = document.createElement('style');
    style.textContent = `
        #vm-nav-buttons-container {
            position: fixed;
            bottom: 15px;
            left: 50%;
            transform: translateX(-50%);
            display: ${isEnabled ? 'flex' : 'none'};
            gap: 12px;
            z-index: 999999;
            pointer-events: none;
        }
        .vm-nav-btn {
            pointer-events: auto;
            width: 65px;
            height: 42px;
            background-color: rgba(30, 30, 30, 0.85);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(4px);
            user-select: none;
            -webkit-user-select: none;
            touch-action: manipulation;
            cursor: pointer;
            opacity: 0.25; /* Barely visible by default on desktop */
            transition: opacity 0.2s ease, transform 0.1s ease, background-color 0.2s ease;
        }

        /* Hover effect for desktop/PC */
        @media (hover: hover) {
            .vm-nav-btn:hover {
                opacity: 1; /* Fully visible on hover */
                background-color: rgba(45, 45, 45, 0.95);
            }
        }

        /* Active click state */
        .vm-nav-btn:active {
            opacity: 1;
            background-color: rgba(70, 70, 70, 0.95);
            transform: scale(0.95);
        }

        /* Keep fully visible on mobile/touch screens since hover doesn't exist */
        @media (hover: none) {
            .vm-nav-btn {
                opacity: 0.85;
            }
        }

        .vm-nav-btn svg {
            width: 24px;
            height: 24px;
            fill: currentColor;
        }
    `;
    document.head.appendChild(style);

    const leftBtn = document.createElement('button');
    leftBtn.className = 'vm-nav-btn';
    leftBtn.setAttribute('aria-label', 'Previous Chapter');
    leftBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;

    const rightBtn = document.createElement('button');
    rightBtn.className = 'vm-nav-btn';
    rightBtn.setAttribute('aria-label', 'Next Chapter');
    rightBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;

    container.appendChild(leftBtn);
    container.appendChild(rightBtn);
    document.body.appendChild(container);

    // 4. Navigation Logic (Find and click "Previous" / "Next" links on the page)
    const prevKeywords = ['prev', 'previous', 'prior', 'chapter-prev', 'btn-prev', 'ch-prev', 'before', '‹', '«', '<-'];
    const nextKeywords = ['next', 'following', 'chapter-next', 'btn-next', 'ch-next', 'after', '›', '»', '->'];

    function findAndClickLink(keywords) {
        if (!isEnabled || isEditingText()) return false;

        const links = Array.from(document.querySelectorAll('a, button, [role="button"]'));

        for (const link of links) {
            if (link.offsetParent === null && getComputedStyle(link).display === 'none') continue;

            const text = (link.textContent || '').trim().toLowerCase();
            const href = (link.getAttribute('href') || '').toLowerCase();
            const className = (link.className || '').toString().toLowerCase();
            const id = (link.id || '').toLowerCase();
            const rel = (link.getAttribute('rel') || '').toLowerCase();
            const aria = (link.getAttribute('aria-label') || '').toLowerCase();

            const matches = keywords.some(kw =>
                text === kw ||
                rel === kw ||
                aria.includes(kw) ||
                className.includes(kw) ||
                id.includes(kw) ||
                (text.length < 20 && text.includes(kw))
            );

            if (matches) {
                link.click();
                return true;
            }
        }
        return false;
    }

    function triggerArrowKey(key, keyCode) {
        if (isEditingText()) return;

        const eventInit = {
            key: key,
            code: key,
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true,
            composed: true
        };
        document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
    }

    // Button Click Actions
    leftBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (isEditingText()) return;
        const found = findAndClickLink(prevKeywords);
        if (!found) triggerArrowKey('ArrowLeft', 37);
    });

    rightBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (isEditingText()) return;
        const found = findAndClickLink(nextKeywords);
        if (!found) triggerArrowKey('ArrowRight', 39);
    });

    // 5. Desktop Keyboard Event Listener directly clicks the buttons
    window.addEventListener('keydown', (e) => {
        if (!isEnabled || isEditingText()) return;

        if (e.key === 'ArrowLeft' || e.code === 'ArrowLeft') {
            e.preventDefault();
            leftBtn.click();
        } else if (e.key === 'ArrowRight' || e.code === 'ArrowRight') {
            e.preventDefault();
            rightBtn.click();
        }
    }, true);

    function toggleButtonsVisibility() {
        container.style.display = isEnabled ? 'flex' : 'none';
    }
})();

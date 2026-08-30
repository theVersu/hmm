// ==UserScript==
// @name         Mobile & Desktop Chapter Navigation
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Adds on-screen arrows for mobile and keyboard arrow shortcuts for PC with snake rainbow hover, internal heavy-press background visual, and guaranteed mouse/touch responsiveness.
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Mobile%20%26%20Desktop%20Chapter%20Navigation.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Mobile%20%26%20Desktop%20Chapter%20Navigation.js
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

    // 3. UI Creation & Styling
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
            z-index: 2147483647; /* Maximum possible z-index */
            pointer-events: none;
        }

        .vm-nav-btn {
            position: relative;
            pointer-events: auto !important;
            width: 65px;
            height: 42px;
            background-color: #1c1d21;
            color: #ffffff;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 6px 14px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(4px);
            user-select: none;
            -webkit-user-select: none;
            touch-action: none;
            cursor: pointer;
            opacity: 0.35;
            transition: opacity 0.2s ease, transform 0.1s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.1s ease, background-color 0.2s ease;
            outline: none;
            overflow: hidden;
            border: none;
        }

        /* Snake Rainbow Line around the border */
        .vm-nav-btn::before {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: 8px;
            padding: 2.5px;
            background: conic-gradient(
                from var(--border-angle, 0deg),
                #ff0000,
                #ff7f00,
                #ffff00,
                #00ff00,
                #00ffff,
                #0000ff,
                #8b0083,
                transparent 60%
            );
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            z-index: 2;
            opacity: 0;
            transition: opacity 0.2s ease;
            pointer-events: none;
        }

        @property --border-angle {
            syntax: '<angle>';
            initial-value: 0deg;
            inherits: false;
        }

        @keyframes snakeCoil {
            to {
                --border-angle: 360deg;
            }
        }

        /* Hover Behavior */
        @media (hover: hover) {
            .vm-nav-btn:hover {
                opacity: 1;
                background-color: #121316;
            }
            .vm-nav-btn:hover::before {
                opacity: 1;
                animation: snakeCoil 1.2s linear infinite;
            }
        }

        /* Mobile Visibility Fallback */
        @media (hover: none) {
            .vm-nav-btn {
                opacity: 0.85;
            }
        }

        /* Heavy Internal Weight Press Effect Layer */
        .vm-nav-btn::after {
            content: '';
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at center,
                rgba(255, 0, 128, 0.85) 0%,
                rgba(0, 255, 255, 0.7) 35%,
                rgba(255, 215, 0, 0.5) 60%,
                rgba(0,0,0,0.9) 100%
            );
            opacity: 0;
            z-index: 1;
            pointer-events: none;
            transform: scale(1.6);
            transition: transform 0.15s ease-out, opacity 0.15s ease-out;
        }

        /* Pressed State (Heavy Weight Simulation) */
        .vm-nav-btn.vm-pressed {
            opacity: 1 !important;
            transform: translateY(3px) scale(0.91) !important;
            box-shadow: inset 0 4px 10px rgba(0, 0, 0, 0.9), 0 1px 3px rgba(0, 0, 0, 0.5) !important;
            background-color: #090a0c !important;
        }

        .vm-nav-btn.vm-pressed::after {
            opacity: 1;
            transform: scale(0.65);
        }

        .vm-nav-btn svg {
            width: 24px;
            height: 24px;
            fill: currentColor;
            z-index: 3;
            position: relative;
            transition: transform 0.1s ease;
            pointer-events: none;
        }

        .vm-nav-btn.vm-pressed svg {
            transform: scale(0.85);
        }
    `;
    document.head.appendChild(style);

    const leftBtn = document.createElement('button');
    leftBtn.className = 'vm-nav-btn';
    leftBtn.id = 'vm-nav-left';
    leftBtn.setAttribute('aria-label', 'Previous Chapter');
    leftBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;

    const rightBtn = document.createElement('button');
    rightBtn.className = 'vm-nav-btn';
    rightBtn.id = 'vm-nav-right';
    rightBtn.setAttribute('aria-label', 'Next Chapter');
    rightBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;

    container.appendChild(leftBtn);
    container.appendChild(rightBtn);

    // Mount to documentElement to avoid body shadow/DOM capture issues
    (document.body || document.documentElement).appendChild(container);

    // 4. Navigation & Link Detection Logic
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

    function executeNavigation(type) {
        if (isEditingText()) return;
        if (type === 'left') {
            const found = findAndClickLink(prevKeywords);
            if (!found) triggerArrowKey('ArrowLeft', 37);
        } else if (type === 'right') {
            const found = findAndClickLink(nextKeywords);
            if (!found) triggerArrowKey('ArrowRight', 39);
        }
    }

    // 5. Global Capturing Press/Hold Engine (Bypasses web page event blocking)
    let activePress = null;
    let holdTimer = null;
    let repeatInterval = null;

    function startButtonPress(button, type) {
        if (activePress || isEditingText()) return;
        activePress = type;

        button.classList.add('vm-pressed');
        executeNavigation(type);

        holdTimer = setTimeout(() => {
            repeatInterval = setInterval(() => {
                executeNavigation(type);
            }, 200);
        }, 400);
    }

    function stopButtonPress() {
        if (!activePress) return;

        leftBtn.classList.remove('vm-pressed');
        rightBtn.classList.remove('vm-pressed');

        if (holdTimer) clearTimeout(holdTimer);
        if (repeatInterval) clearInterval(repeatInterval);

        activePress = null;
        holdTimer = null;
        repeatInterval = null;
    }

    // Capture pointers directly at window phase to bypass page event blocking
    window.addEventListener('pointerdown', (e) => {
        const target = e.target.closest('.vm-nav-btn');
        if (!target) return;

        e.preventDefault();
        e.stopPropagation();

        if (target.id === 'vm-nav-left') {
            startButtonPress(leftBtn, 'left');
        } else if (target.id === 'vm-nav-right') {
            startButtonPress(rightBtn, 'right');
        }
    }, true);

    window.addEventListener('pointerup', stopButtonPress, true);
    window.addEventListener('pointercancel', stopButtonPress, true);

    // 6. Keyboard Listeners Synced with Visual & Navigation Logic
    window.addEventListener('keydown', (e) => {
        if (!isEnabled || isEditingText() || e.repeat) return;

        if (e.key === 'ArrowLeft' || e.code === 'ArrowLeft') {
            e.preventDefault();
            startButtonPress(leftBtn, 'left');
        } else if (e.key === 'ArrowRight' || e.code === 'ArrowRight') {
            e.preventDefault();
            startButtonPress(rightBtn, 'right');
        }
    }, true);

    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft' || e.code === 'ArrowLeft' || e.key === 'ArrowRight' || e.code === 'ArrowRight') {
            stopButtonPress();
        }
    }, true);

    function toggleButtonsVisibility() {
        container.style.display = isEnabled ? 'flex' : 'none';
    }
})();

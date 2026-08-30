// ==UserScript==
// @name         Mobile & Desktop Chapter Navigation
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Adds on-screen arrows for mobile and keyboard arrow shortcuts for PC to navigate novel chapters with rainbow effects.
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

    // 3. UI Creation (On-Screen Buttons with Rainbow Hover & Stomp Effects)
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
            position: relative;
            pointer-events: auto;
            width: 65px;
            height: 42px;
            background-color: rgba(30, 30, 30, 0.85);
            color: #ffffff;
            border: 2px solid transparent;
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
            transition: opacity 0.2s ease, transform 0.1s ease, background-color 0.2s ease, box-shadow 0.2s ease;
            outline: none;
            overflow: visible;
        }

        /* Continuous Rotating Rainbow Gradient for Hover Border */
        .vm-nav-btn::before {
            content: '';
            position: absolute;
            top: -2px;
            left: -2px;
            right: -2px;
            bottom: -2px;
            border-radius: 10px;
            background: linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b0083, #ff0000);
            background-size: 300% 300%;
            z-index: -1;
            opacity: 0;
            transition: opacity 0.2s ease;
            animation: rainbowBorder 2s linear infinite;
        }

        @keyframes rainbowBorder {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        /* Hover effect for desktop/PC */
        @media (hover: hover) {
            .vm-nav-btn:hover {
                opacity: 1;
                background-color: rgba(20, 20, 20, 0.95);
            }
            .vm-nav-btn:hover::before {
                opacity: 1;
            }
        }

        /* Keep fully visible on mobile/touch screens */
        @media (hover: none) {
            .vm-nav-btn {
                opacity: 0.85;
            }
        }

        /* Stomp / Pulse Animation on Click */
        .vm-nav-btn.vm-stomp {
            opacity: 1 !important;
            animation: stompPulse 0.4s ease-out forwards;
        }

        @keyframes stompPulse {
            0% {
                transform: scale(0.85);
                box-shadow: 0 0 0 0px rgba(255, 0, 128, 0.8),
                            0 0 15px 5px rgba(0, 255, 255, 0.8);
                background-color: rgba(60, 60, 60, 1);
            }
            50% {
                transform: scale(1.15);
                box-shadow: 0 0 25px 8px rgba(255, 255, 0, 0.9),
                            0 0 35px 12px rgba(128, 0, 255, 0.7);
                background-color: rgba(40, 40, 40, 0.9);
            }
            100% {
                transform: scale(1);
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
            }
        }

        .vm-nav-btn svg {
            width: 24px;
            height: 24px;
            fill: currentColor;
            z-index: 1;
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

    // Helper to trigger the rainbow stomp animation
    function triggerStompEffect(button) {
        button.classList.remove('vm-stomp');
        // Force reflow so the animation restarts if triggered repeatedly
        void button.offsetWidth;
        button.classList.add('vm-stomp');
        setTimeout(() => button.classList.remove('vm-stomp'), 400);
    }

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
        triggerStompEffect(leftBtn);
        const found = findAndClickLink(prevKeywords);
        if (!found) triggerArrowKey('ArrowLeft', 37);
    });

    rightBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (isEditingText()) return;
        triggerStompEffect(rightBtn);
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

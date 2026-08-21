// ==UserScript==
// @name         Mobile Chapter Navigation Arrows
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds fixed Left/Right navigation buttons for novel websites on mobile.
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Mobile Chapter Navigation Arrows.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Mobile Chapter Navigation Arrows.js
// ==/UserScript==

(function() {
    'use strict';

    // 1. Persistent State Management
    let isEnabled = GM_getValue('nav_buttons_enabled', true);

    function updateMenuCommand() {
        // Registers a toggle switch inside the Violentmonkey popup menu
        GM_registerMenuCommand(
            `${isEnabled ? '✅ Enabled' : '❌ Disabled'} - Toggle Nav Buttons`,
            () => {
                isEnabled = !isEnabled;
                GM_setValue('nav_buttons_enabled', isEnabled);
                toggleButtonsVisibility();
                location.reload(); // Refresh to update command label clearly
            }
        );
    }
    updateMenuCommand();

    // 2. UI Creation
    const container = document.createElement('div');
    container.id = 'vm-nav-buttons-container';
    
    // Inject CSS
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
            pointer-events: none; /* Allows clicking through space between buttons */
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
        }
        .vm-nav-btn:active {
            background-color: rgba(70, 70, 70, 0.95);
            transform: scale(0.95);
        }
        .vm-nav-btn svg {
            width: 24px;
            height: 24px;
            fill: currentColor;
        }
    `;
    document.head.appendChild(style);

    // Left Button (SVG Arrow)
    const leftBtn = document.createElement('button');
    leftBtn.className = 'vm-nav-btn';
    leftBtn.setAttribute('aria-label', 'Previous Chapter');
    leftBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;

    // Right Button (SVG Arrow)
    const rightBtn = document.createElement('button');
    rightBtn.className = 'vm-nav-btn';
    rightBtn.setAttribute('aria-label', 'Next Chapter');
    rightBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;

    container.appendChild(leftBtn);
    container.appendChild(rightBtn);
    document.body.appendChild(container);

    // 3. Simulated Keyboard Events
    function triggerArrowKey(key, keyCode) {
        const eventInit = {
            key: key,
            code: key,
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true,
            composed: true
        };

        // Fire both keydown and keyup for max site compatibility
        document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
    }

    leftBtn.addEventListener('click', (e) => {
        e.preventDefault();
        triggerArrowKey('ArrowLeft', 37);
    });

    rightBtn.addEventListener('click', (e) => {
        e.preventDefault();
        triggerArrowKey('ArrowRight', 39);
    });

    function toggleButtonsVisibility() {
        container.style.display = isEnabled ? 'flex' : 'none';
    }
})();

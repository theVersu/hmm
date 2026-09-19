// ==UserScript==
// @name         Fast Scroll To Top
// @namespace    violentmonkey.scroll.top
// @version      1.1
// @description  Lightweight, optimized fixed button to scroll to top.
// @match        *://*/*
// @grant        none
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Fast%20Scroll%20To%20Top.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Fast%20Scroll%20To%20Top.js
// ==/UserScript==

(function () {
  'use strict';

  // Create style element directly
  const style = document.createElement('style');
  style.textContent = `
    #vm-scroll-top-btn, #vm-scroll-top-btn * {
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 0 !important;
      max-width: none !important;
      max-height: none !important;
    }
    #vm-scroll-top-btn {
      position: fixed !important;
      bottom: 20px !important;
      left: 20px !important;
      width: 36px !important;
      height: 36px !important;
      min-width: 36px !important;
      min-height: 36px !important;
      border-radius: 50% !important;
      background-color: rgba(30, 30, 30, 0.75) !important;
      color: #ffffff !important;
      border: none !important;
      outline: none !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
      z-index: 2147483647 !important;
      opacity: 0 !important;
      visibility: hidden !important;
      transform: scale(0.8) !important;
      transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s !important;
      backdrop-filter: blur(4px) !important;
      will-change: opacity, transform !important;
      pointer-events: none !important;
    }
    #vm-scroll-top-btn.visible {
      opacity: 1 !important;
      visibility: visible !important;
      transform: scale(1) !important;
      pointer-events: auto !important;
    }
    #vm-scroll-top-btn:hover {
      background-color: rgba(0, 0, 0, 0.9) !important;
      transform: scale(1.1) !important;
    }
    #vm-scroll-top-btn svg {
      width: 18px !important;
      height: 18px !important;
      min-width: 18px !important;
      min-height: 18px !important;
      max-width: 18px !important;
      max-height: 18px !important;
      fill: none !important;
      stroke: currentColor !important;
      stroke-width: 2.5 !important;
      stroke-linecap: round !important;
      stroke-linejoin: round !important;
      display: block !important;
    }
  `;
  document.head.appendChild(style);

  // Create Button Element with inline SVG icon
  const button = document.createElement('button');
  button.id = 'vm-scroll-top-btn';
  button.setAttribute('aria-label', 'Scroll to top');
  button.innerHTML = `<svg viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>`;
  document.body.appendChild(button);

  // Optimized Scroll Handling using requestAnimationFrame
  let ticking = false;

  const toggleButtonVisibility = () => {
    if (window.scrollY > 300) {
      button.classList.add('visible');
    } else {
      button.classList.remove('visible');
    }
    ticking = false;
  };

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        window.requestAnimationFrame(toggleButtonVisibility);
        ticking = true;
      }
    },
    { passive: true }
  );

  // Fast Smooth Scroll
  button.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
})();

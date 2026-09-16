// ==UserScript==
// @name         Fast Scroll To Top
// @namespace    violentmonkey.scroll.top
// @version      1.0
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
    #vm-scroll-top-btn {
      position: fixed;
      bottom: 20px;
      left: 20px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background-color: rgba(30, 30, 30, 0.75);
      color: #ffffff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      z-index: 2147483647;
      opacity: 0;
      visibility: hidden;
      transform: scale(0.8);
      transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
      backdrop-filter: blur(4px);
      will-change: opacity, transform;
    }
    #vm-scroll-top-btn.visible {
      opacity: 1;
      visibility: visible;
      transform: scale(1);
    }
    #vm-scroll-top-btn:hover {
      background-color: rgba(0, 0, 0, 0.9);
      transform: scale(1.1);
    }
    #vm-scroll-top-btn svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
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

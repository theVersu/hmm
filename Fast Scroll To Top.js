// ==UserScript==
// @name         Fast Scroll To Top
// @namespace    violentmonkey.scroll.top
// @version      1.1
// @description  Zero-conflict, Canvas-rendered scroll-to-top button.
// @match        *://*/*
// @grant        none
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Fast%20Scroll%20To%20Top.js
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Fast%20Scroll%20To%20Top.js
// ==/UserScript==

(function () {
  'use strict';

  // Attach to <html> instead of <body> to prevent layout flow disruptions
  const host = document.createElement('div');

  // Strict fixed container
  Object.assign(host.style, {
    position: 'fixed',
    bottom: '20px',
    left: '20px',
    width: '36px',
    height: '36px',
    zIndex: '2147483647',
    pointerEvents: 'none',
    margin: '0',
    padding: '0',
    border: 'none'
  });

  const shadow = host.attachShadow({ mode: 'closed' });

  // Native HTML5 Canvas renders crisp shapes immune to page CSS rules
  const canvas = document.createElement('canvas');
  canvas.width = 72;  // High-DPI scaling (2x)
  canvas.height = 72;

  Object.assign(canvas.style, {
    width: '36px',
    height: '36px',
    cursor: 'pointer',
    opacity: '0',
    visibility: 'hidden',
    transform: 'scale(0.8)',
    transition: 'opacity 0.2s ease, transform 0.2s ease, visibility 0.2s',
    pointerEvents: 'none',
    display: 'block'
  });

  const ctx = canvas.getContext('2d');

  function drawButton(isHovered = false) {
    ctx.clearRect(0, 0, 72, 72);

    // Background circle
    ctx.beginPath();
    ctx.arc(36, 36, 34, 0, Math.PI * 2);
    ctx.fillStyle = isHovered ? 'rgba(0, 0, 0, 0.95)' : 'rgba(30, 30, 30, 0.85)';
    ctx.fill();

    // Arrow icon stroke
    ctx.beginPath();
    ctx.moveTo(22, 42);
    ctx.lineTo(36, 28);
    ctx.lineTo(50, 42);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  drawButton(false);
  shadow.appendChild(canvas);

  (document.documentElement || document.body).appendChild(host);

  // Hover states via Canvas redraw
  canvas.addEventListener('mouseenter', () => drawButton(true));
  canvas.addEventListener('mouseleave', () => drawButton(false));

  // Scroll visibility handling
  let ticking = false;
  const toggleVisibility = () => {
    if (window.scrollY > 300) {
      canvas.style.opacity = '1';
      canvas.style.visibility = 'visible';
      canvas.style.transform = 'scale(1)';
      canvas.style.pointerEvents = 'auto';
    } else {
      canvas.style.opacity = '0';
      canvas.style.visibility = 'hidden';
      canvas.style.transform = 'scale(0.8)';
      canvas.style.pointerEvents = 'none';
    }
    ticking = false;
  };

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        window.requestAnimationFrame(toggleVisibility);
        ticking = true;
      }
    },
    { passive: true }
  );

  // Click handler
  canvas.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
})();

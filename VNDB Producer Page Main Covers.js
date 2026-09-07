// ==UserScript==
// @name         VNDB Producer Page Main Covers
// @namespace    https://vndb.org/
// @version      1.6
// @description  Display cover images with true 1:1 physical pixel resolution mouse tracking preview capped strictly to browser height without letterboxing.
// @author       You
// @match        https://vndb.org/p*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.vndb.org
// ==/UserScript==

(function () {
  'use strict';

  // Inject CSS styles
  const style = document.createElement('style');
  style.textContent = `
    .vndb-cover-container {
      position: relative;
      display: inline-block;
      margin-right: 12px;
      vertical-align: middle;
      background: transparent;
      border-radius: 4px;
      line-height: 0;
    }
    .vndb-cover-img {
      height: 200px;
      width: auto;
      max-width: 300px;
      object-fit: contain;
      border-radius: 3px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
      display: block;
    }
    .vndb-cover-controls {
      position: absolute;
      top: 4px;
      right: 4px;
      display: flex;
      gap: 3px;
      opacity: 0;
      transition: opacity 0.2s ease-in-out;
      z-index: 10;
    }
    .vndb-cover-container:hover .vndb-cover-controls {
      opacity: 1;
    }
    .vndb-cover-btn {
      background: rgba(20, 20, 20, 0.85);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.3);
      font-size: 11px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border-radius: 3px;
      user-select: none;
      padding: 0;
    }
    .vndb-cover-btn:hover {
      background: #3e4856;
      border-color: #fff;
    }
    /* Native resolution preview element */
    .vndb-fullsize-preview {
      position: fixed;
      pointer-events: none;
      z-index: 999999;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.75);
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      background: #111;
      display: none;
      box-sizing: border-box;
    }
  `;
  document.head.appendChild(style);

  let activePreviewImg = null;
  let mouseMoveHandler = null;

  function removePreview() {
    if (activePreviewImg) {
      activePreviewImg.remove();
      activePreviewImg = null;
    }
    if (mouseMoveHandler) {
      window.removeEventListener('mousemove', mouseMoveHandler);
      mouseMoveHandler = null;
    }
    window.removeEventListener('click', dismissPreviewOnGlobalClick, true);
  }

  function dismissPreviewOnGlobalClick() {
    removePreview();
  }

  // Storage cache
  const CACHE_KEY = 'vndb_cover_cache_v1';
  let imageCache = GM_getValue(CACHE_KEY, {});

  function saveCache() {
    GM_setValue(CACHE_KEY, imageCache);
  }

  // Read VN links from DOM
  const vnRows = document.querySelectorAll('tr.vn');
  const vnMap = new Map();

  vnRows.forEach(row => {
    const link = row.querySelector('a[href^="/v"]');
    if (!link) return;
    const match = link.getAttribute('href').match(/\/v(\d+)/);
    if (match) {
      const vnId = 'v' + match[1];
      const tdCell = row.querySelector('td');
      if (tdCell) {
        if (!vnMap.has(vnId)) {
          vnMap.set(vnId, []);
        }
        vnMap.get(vnId).push({ cell: tdCell, link: link });
      }
    }
  });

  // VNDB API Query
  function fetchVnCovers(vnIds, callback) {
    if (vnIds.length === 0) return;

    const filterExpression = vnIds.length === 1
      ? ['id', '=', vnIds[0]]
      : ['or', ...vnIds.map(id => ['id', '=', id])];

    GM_xmlhttpRequest({
      method: 'POST',
      url: 'https://api.vndb.org/kana/vn',
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        filters: filterExpression,
        fields: 'image.url',
        results: vnIds.length
      }),
      onload: function (response) {
        if (response.status === 200) {
          try {
            const json = JSON.parse(response.responseText);
            const results = {};
            if (json.results) {
              json.results.forEach(vn => {
                if (vn.image && vn.image.url) {
                  results[vn.id] = vn.image.url;
                }
              });
            }
            callback(results);
          } catch (e) {
            console.error('Failed to parse API response:', e);
          }
        }
      }
    });
  }

  // Render elements & logic
  function renderCover(tdCell, vnId, initialUrl) {
    if (tdCell.querySelector('.vndb-cover-container')) return;

    const container = document.createElement('div');
    container.className = 'vndb-cover-container';

    const img = document.createElement('img');
    img.className = 'vndb-cover-img';
    img.src = initialUrl || 'https://s.vndb.org/s/angel-bg.jpg';
    img.alt = vnId;

    const controls = document.createElement('div');
    controls.className = 'vndb-cover-controls';

    // Button 1: Original size preview tracking mouse
    const fullSizeBtn = document.createElement('button');
    fullSizeBtn.className = 'vndb-cover-btn';
    fullSizeBtn.textContent = '🔍';
    fullSizeBtn.title = 'View in original resolution attached to mouse';
    fullSizeBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();

      removePreview();

      const previewImg = document.createElement('img');
      previewImg.className = 'vndb-fullsize-preview';
      previewImg.src = img.src;
      document.body.appendChild(previewImg);

      activePreviewImg = previewImg;

      const applyPhysicalScale = () => {
        if (!previewImg.naturalWidth || !previewImg.naturalHeight) return;

        // Counteract browser zoom ratio to maintain 1:1 physical pixel rendering
        const dpr = window.devicePixelRatio || 1;
        let targetWidth = previewImg.naturalWidth / dpr;
        let targetHeight = previewImg.naturalHeight / dpr;

        const maxAllowedHeight = window.innerHeight;

        // Cap height exclusively to browser height if image exceeds it
        if (targetHeight > maxAllowedHeight) {
          const ratio = maxAllowedHeight / targetHeight;
          targetHeight = maxAllowedHeight;
          targetWidth = targetWidth * ratio;
        }

        previewImg.style.width = targetWidth + 'px';
        previewImg.style.height = targetHeight + 'px';
        previewImg.style.display = 'block';
      };

      if (previewImg.complete) {
        applyPhysicalScale();
      } else {
        previewImg.onload = applyPhysicalScale;
      }

      mouseMoveHandler = function (evt) {
        if (!activePreviewImg) return;

        const imgWidth = activePreviewImg.offsetWidth;
        const imgHeight = activePreviewImg.offsetHeight;
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        const offsetX = 15;
        const offsetY = 15;

        // Ideal position relative to mouse cursor
        let left = evt.clientX + offsetX;
        let top = evt.clientY + offsetY;

        // Flip to left side if overflowing right edge
        if (left + imgWidth > winWidth) {
          left = evt.clientX - imgWidth - offsetX;
        }

        // Flip to top side if overflowing bottom edge
        if (top + imgHeight > winHeight) {
          top = evt.clientY - imgHeight - offsetY;
        }

        // Clamp values to ensure it NEVER leaves the browser viewport edges
        left = Math.max(0, Math.min(left, winWidth - imgWidth));
        top = Math.max(0, Math.min(top, winHeight - imgHeight));

        activePreviewImg.style.left = left + 'px';
        activePreviewImg.style.top = top + 'px';
      };

      // Set initial location
      mouseMoveHandler(e);

      window.addEventListener('mousemove', mouseMoveHandler);

      // Listener to dismiss image on global click
      setTimeout(() => {
        window.addEventListener('click', dismissPreviewOnGlobalClick, true);
      }, 50);
    };

    // Button 2: Force API Refresh
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'vndb-cover-btn';
    refreshBtn.textContent = '↻';
    refreshBtn.title = 'Refresh cover image';
    refreshBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      refreshBtn.textContent = '…';
      fetchVnCovers([vnId], function (results) {
        if (results[vnId]) {
          const newUrl = results[vnId];
          imageCache[vnId] = newUrl;
          saveCache();
          img.src = newUrl;
        }
        refreshBtn.textContent = '↻';
      });
    };

    // Button 3: Custom URL Input
    const customBtn = document.createElement('button');
    customBtn.className = 'vndb-cover-btn';
    customBtn.textContent = '✎';
    customBtn.title = 'Set custom image URL';
    customBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      const currentSrc = imageCache[vnId] || '';
      const customUrl = prompt('Enter image URL for ' + vnId + ':', currentSrc);
      if (customUrl !== null && customUrl.trim() !== '') {
        imageCache[vnId] = customUrl.trim();
        saveCache();
        img.src = customUrl.trim();
      }
    };

    controls.appendChild(fullSizeBtn);
    controls.appendChild(refreshBtn);
    controls.appendChild(customBtn);

    container.appendChild(img);
    container.appendChild(controls);

    tdCell.insertBefore(container, tdCell.firstChild);
  }

  // Initial execution & batching
  const idsToFetch = [];

  vnMap.forEach((entries, vnId) => {
    const cachedUrl = imageCache[vnId];
    entries.forEach(entry => {
      renderCover(entry.cell, vnId, cachedUrl);
    });

    if (!cachedUrl) {
      idsToFetch.push(vnId);
    }
  });

  if (idsToFetch.length > 0) {
    fetchVnCovers(idsToFetch, function (results) {
      Object.keys(results).forEach(vnId => {
        const url = results[vnId];
        imageCache[vnId] = url;

        const entries = vnMap.get(vnId);
        if (entries) {
          entries.forEach(entry => {
            const img = entry.cell.querySelector('.vndb-cover-img');
            if (img) img.src = url;
          });
        }
      });
      saveCache();
    });
  }
})();

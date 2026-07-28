// ==UserScript==
// @name        WTR-Lab Chapter Downloader (EPUB) and Unlimited Replace Terms
// @namespace   Violentmonkey Scripts
// @match       https://wtr-lab.com/en/*
// @grant       GM_getValue
// @grant       GM_setValue
// @version     2.5
// @author      -
// @description No longer need 2 scripts, same as the other script, so you only need to download 1
// @downloadURL https://update.greasyfork.org/scripts/552952/WTR-Lab%20Chapter%20Downloader%20%28EPUB%29%20and%20Unlimited%20Replace%20Terms.user.js
// @updateURL   https://update.greasyfork.org/scripts/552952/WTR-Lab%20Chapter%20Downloader%20%28EPUB%29%20and%20Unlimited%20Replace%20Terms.meta.js
// ==/UserScript==

(async function WTRDownloader() {
    "use strict";

  // --- Helper for Mobile/Android Check ---
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

  // --- 0. Replacement logic ---
  const STORAGE_KEY = 'wordReplacerPairsV3';
  const data = GM_getValue(STORAGE_KEY, {});

  function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\",]/g, '\\$&'); }

  function isStartOfSentenceV(index, fullText) {
    if (index === 0) return true;
    const before = fullText.slice(0, index).replace(/\s+$/, '');
    if (/[\n\r]$/.test(before)) return true;
    if (/[.!?…]["”’')\]]*$/.test(before)) return true;
    if (/["“”'‘(\[]\s*$/.test(before)) return true;
    if (/Chapter\s+\d+:\s*,?\s*$/.test(before)) return true;
    return false;
  }

  function isInsideDialogueAtIndexV(htmlText, index) {
    const quoteChars = `"'“”‘’`;
    const clean = htmlText.replace(/<[^>]*>/g, '');
    const leftText = clean.slice(0, index);
    const quoteCount = (leftText.match(new RegExp(`[${quoteChars}]`, 'g')) || []).length;
    return quoteCount % 2 === 1;
  }

  function applyPreserveCapitalV(orig, replacement) {
    if (!orig) return replacement;
    return (orig[0].toUpperCase() === orig[0]) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
  }

  function applyReplacementsV(text, replacements) {
    let replacedText = text;
    const WILDCARD = '@';
    const punctuationRegex = /^[\W_'"“”‘’„,;:!?~()\[\]{}<>【】「」『』（）《》〈〉—–-]|[\W_'"“”‘’„,;:!?~()\[\]{}<>【】「」『』（）《》〈〉—–-]$/;

    for (const entry of replacements) {
      if (!entry.from || !entry.to || !entry.enabled) continue;
      const flags = entry.ignoreCapital ? 'gi' : 'g';
      let base = escapeRegex(entry.from).replace(new RegExp(`\\${WILDCARD}`, 'g'), '.');
      const firstChar = entry.from.charAt(0);
      const lastChar = entry.from.charAt(entry.from.length - 1);
      const skipBoundaries = punctuationRegex.test(firstChar) || punctuationRegex.test(lastChar);
      const patternStr = (entry.allInstances || skipBoundaries) ? base : `(?<=^|[^A-Za-z0-9])${base}(?=[^A-Za-z0-9]|$)`;
      const regex = new RegExp(patternStr, flags);

      let newText = '';
      let lastIndex = 0, match;
      while ((match = regex.exec(replacedText)) !== null) {
        const idx = match.index;
        const insideDialogue = isInsideDialogueAtIndexV(replacedText, idx);
        if ((entry.insideDialogueOnly && !insideDialogue) || (entry.outsideDialogueOnly && insideDialogue)) continue;

        newText += replacedText.slice(lastIndex, idx);
        const startSentence = entry.startOfSentence && isStartOfSentenceV(idx, replacedText);
        let finalReplacement = entry.preserveFirstCapital ? applyPreserveCapitalV(match[0], entry.to) : entry.to;
        if (startSentence) finalReplacement = finalReplacement.charAt(0).toUpperCase() + finalReplacement.slice(1);

        newText += finalReplacement;
        lastIndex = idx + match[0].length;
      }
      if (lastIndex < replacedText.length) newText += replacedText.slice(lastIndex);
      replacedText = newText;
    }
    return replacedText;
  }

  function applyReplacementsVToText(text, seriesIdParam = null) {
    const seriesId = seriesIdParam || (() => {
      const urlMatch = location.href.match(/\/novel\/(\d+)\//i);
      if (urlMatch) return urlMatch[1];
      const crumb = document.querySelector('.breadcrumb li.breadcrumb-item a[href*="/novel/"]');
      if (crumb) { const crumbMatch = crumb.href.match(/\/novel\/(\d+)\//i); if (crumbMatch) return crumbMatch[1]; }
      return null;
    })();

    let replacements = [];
    for (const key in data) {
      if (key === 'global' || (seriesId && key === `series-${seriesId}`) || (seriesIdParam && key === `series-${seriesIdParam}`)) {
        replacements = replacements.concat(data[key].filter(e => e.enabled));
      }
    }
    return replacements.length ? applyReplacementsV(text, replacements) : text;
  }

  // Helper for applying consistent Dark Theme styling across menus
  function styleDarkElement(el, isButton = false) {
    if (isButton) {
      el.style.color = '#fff';
      el.style.background = '#333';
      el.style.border = '1px solid #666';
      el.style.borderRadius = '4px';
      el.style.padding = '4px 8px';
      el.style.cursor = 'pointer';
    } else {
      el.style.background = '#000';
      el.style.color = '#fff';
      el.style.border = '1px solid #ccc';
    }
  }

  // --- 1. Chapter info ---
  const dom = document;
  const leaves = dom.baseURI.split("/");
  const novelIndex = leaves.indexOf("novel");
  const language = leaves[novelIndex - 1];
  const id = leaves[novelIndex + 1];
  const novelLink = document.querySelector('a[href*="/novel/"]');
  const novelTitle = novelLink ? novelLink.textContent.trim().replace(/[\/\\?%*:|"<>]/g, '-') : leaves[leaves.length - 1].split("?")[0];

  const chaptersResp = await fetch(`https://wtr-lab.com/api/chapters/${id}`, { credentials: "include" });
  const chaptersJson = await chaptersResp.json();
  const chapters = chaptersJson.chapters;

// --- 2. Menu (Dark Theme) ---
const menu = document.createElement("div");

if (isMobile) {
  // Mobile / Android Style List
  menu.style.cssText = `
    position: fixed; top: 60px; right: 20px; background: #000; color: #fff; border: 1px solid #ccc; border-radius: 12px;
    padding: 0; max-height: 80vh; overflow-y: auto; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    display: none; width: 350px;
  `;
} else {
  // PC / Desktop Style List
  menu.style.cssText = `
    position: fixed; top: 60px; right: 20px; background: #000; color: #fff; border: 1px solid #ccc; border-radius: 12px;
    padding: 0; max-height: 80vh; overflow-y: auto; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    display: none; width: 350px;
  `;
}

// --- fixed top bar inside menu ---
menu.innerHTML = `
  <div id="menuHeader" style="
    position: sticky; top: 0; background: #000; z-index: 10;
    padding: 10px; border-bottom: 1px solid #444; color: #fff;
  ">
    <h3 style="margin: 0 0 6px 0; color: gold;">Select chapters</h3>
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
      <label style="flex:1;"><input type="checkbox" id="selectAllChk" checked> All</label>
      <button id="selectFromCurrentBtn">From Current Chapter Onwards</button>
      <button id="jumpToCurrentBtn">Jump to Current Chapter</button>
      <button id="downloadEpubBtn" style="flex-shrink:0;">Download</button>
    </div>
  </div>
  <div id="chaptersList" style="padding:10px;">
    ${chapters.map(ch => `
      <label style="display:block; border-bottom:1px solid #222; padding:4px 0; color: #fff;">
        <input type="checkbox" checked data-order="${ch.order}">
        ${ch.order}: ${ch.title}
      </label>
    `).join("")}
  </div>
`;
document.body.appendChild(menu);

// Apply style to menu buttons
menu.querySelectorAll("button").forEach(b => styleDarkElement(b, true));

// --- menu bar "Continue" button for most recent novel ---
const menuContinueBtn = document.createElement("button");
menuContinueBtn.textContent = "Continue From Latest";
menuContinueBtn.style.flexShrink = "0";
styleDarkElement(menuContinueBtn, true);
document.querySelector("#menuHeader > div").appendChild(menuContinueBtn);

menuContinueBtn.onclick = () => {
  const library = loadLibrary();
  if (!library.length) return alert("Library is empty. No novel to continue.");

  // pick the most recently downloaded novel
  const recent = library.reduce((a,b) => (a.lastDownloaded > b.lastDownloaded ? a : b));
  continueDownload(recent);
};

  // --- Info button ---
const infoBtn = document.createElement("button");
infoBtn.textContent = "ℹ Info";
infoBtn.style.flexShrink = "0";
styleDarkElement(infoBtn, true);
document.querySelector("#menuHeader > div").appendChild(infoBtn);

// --- Modal (Dark Theme) ---
const infoModal = document.createElement("div");
infoModal.style.cssText = `
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 9999;
`;

infoModal.innerHTML = `
  <div style="
    background: #000;
    color: #fff;
    border: 1px solid #ccc;
    padding: 16px 20px;
    max-width: 420px;
    border-radius: 6px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    font-size: 14px;
    line-height: 1.5;
  ">
    <h4 style="margin-top:0; color: gold;">Download Requirement</h4>
    <p>
      Downloads must be started <b>from inside a chapter page</b>,
      not from the novel overview page.
    </p>
      <p>
    Instructions Read Carefully!!!! Go to chapter 1 of whatever novel you are downloading.
    Be sure to have selected all. Click Download. Refresh the page when the refresh message appears.
    Click Continue From Latest.
    Wait to refresh.
    Repeat until all chapters are downloaded.
    If it shows an error immediately after clicking Continue From Latest, click Download Saved for override.
    </p>
    <p>
      This is required to pass the site's security check and avoid
      automatic download blocking.
    </p>
    <div style="text-align:right; margin-top:12px;">
      <button id="closeInfoModal">Close</button>
    </div>
  </div>
`;

document.body.appendChild(infoModal);
styleDarkElement(infoModal.querySelector("#closeInfoModal"), true);

// --- Modal behavior ---
infoBtn.onclick = () => {
  infoModal.style.display = "flex";
};

infoModal.onclick = (e) => {
  if (e.target === infoModal) {
    infoModal.style.display = "none";
  }
};

infoModal.querySelector("#closeInfoModal").onclick = () => {
  infoModal.style.display = "none";
};
// --- toggle button ---
const toggleBtn = document.createElement("button");
toggleBtn.textContent = "📚 Chapters";
styleDarkElement(toggleBtn, true);

if (isMobile) {
  // Mobile / Android Style List
  toggleBtn.style.cssText = `position: fixed; bottom: 5%; left: 1%; z-index: 99999; background: #000; color: #fff; border: 1px solid #ccc; padding: 6px 12px; cursor: pointer; borderRadius: 4px;`;
} else {
  // PC / Desktop Style List
  toggleBtn.style.cssText = `position: fixed; bottom: 1%; right: 12%; z-index: 99999; background: #000; color: #fff; border: 1px solid #ccc; padding: 6px 12px; cursor: pointer; borderRadius: 4px;`;
}

toggleBtn.onclick = () => menu.style.display = menu.style.display === "none" ? "block" : "none";
document.body.appendChild(toggleBtn);

  const libraryBtn = document.createElement("button");
libraryBtn.textContent = "Library";
libraryBtn.style.flexShrink = "0";
styleDarkElement(libraryBtn, true);
document.querySelector("#menuHeader > div").appendChild(libraryBtn);

// --- select/deselect all ---
const selectAllChk = document.getElementById("selectAllChk");
selectAllChk.addEventListener("change", () => {
  menu.querySelectorAll("#chaptersList input[type=checkbox]").forEach(cb => cb.checked = selectAllChk.checked);
});

// --- current chapter logic ---
const currentChapterOrder = parseInt(location.pathname.match(/chapter-(\d+)/)?.[1] ?? "1");

// --- select from current onward ---
document.getElementById("selectFromCurrentBtn").onclick = () => {
  menu.querySelectorAll("#chaptersList input[type=checkbox]").forEach(cb => {
    cb.checked = parseInt(cb.dataset.order) >= currentChapterOrder;
  });
  selectAllChk.checked = false;
};

// --- jump to current + highlight ---
document.getElementById("jumpToCurrentBtn").onclick = () => {
  menu.querySelectorAll("#chaptersList label").forEach(lbl => lbl.style.background = "");
  const currentCheckbox = menu.querySelector(`#chaptersList input[data-order="${currentChapterOrder}"]`);
  if (currentCheckbox) {
    currentCheckbox.scrollIntoView({ behavior: "smooth", block: "center" });
    currentCheckbox.parentElement.style.background = "#333";
  }
};

// --- stop download flag ---
let stopDownloadFlag = false;

// --- Stop Download Button ---
const stopDownloadBtn = document.createElement("button");
stopDownloadBtn.textContent = "Stop Download";
stopDownloadBtn.style.flexShrink = "0";
styleDarkElement(stopDownloadBtn, true);
document.querySelector("#menuHeader > div").appendChild(stopDownloadBtn);

stopDownloadBtn.onclick = () => {
  stopDownloadFlag = true;
  securityAlert.textContent = "⏹️ Download manually stopped. You can continue later.";
  securityAlert.style.display = "block";
};

// --- Download Saved Button ---
const downloadSavedBtn = document.createElement("button");
downloadSavedBtn.textContent = "Download Saved";
downloadSavedBtn.style.flexShrink = "0";
styleDarkElement(downloadSavedBtn, true);
document.querySelector("#menuHeader > div").appendChild(downloadSavedBtn);

downloadSavedBtn.onclick = async () => {
  const temp = loadTempProgress();
  if (!temp) {
    alert("No saved progress found in local storage.");
    return;
  }

  // Show indicator like downloading
  const header = document.getElementById("menuHeader");
  let indicator = header.querySelector(".download-indicator");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "download-indicator";
    indicator.style.cssText = `
      display:inline-block; margin-left:10px; padding:2px 6px;
      background:#ffd700; color:#000; border-radius:8px;
      font-size:12px; font-weight:bold;
      animation: blink 1s infinite;
    `;
    header.appendChild(indicator);
  }
  indicator.textContent = `Downloading saved... (${temp.orders.length}/${temp.totalChapters || "?"})`;
  indicator.style.display = "inline-block";

  try {
    await downloadAsEPUB(temp.title, temp.chapters, temp.orders);
    clearTempProgress();
    console.info("[DOWNLOAD SAVED] EPUB downloaded and temp cleared.");
  } catch (err) {
    console.error("[DOWNLOAD SAVED] Failed:", err);
  } finally {
    indicator.style.display = "none";
  }
};

const INTERRUPTED_KEY = "epubDownloadTemp";

function saveTempProgress(entry, chapters, orders) {
  localStorage.setItem(INTERRUPTED_KEY, JSON.stringify({
    id: entry.id,
    title: entry.title,
    coverUrl: entry.coverUrl,
    chapters,
    orders
  }));
}

function loadTempProgress() {
  const raw = localStorage.getItem(INTERRUPTED_KEY);
  return raw ? JSON.parse(raw) : null;
}

function clearTempProgress() {
  localStorage.removeItem(INTERRUPTED_KEY);
}
async function continueDownload(entry) {
  const novelId = entry.id;
  const novelTitle = entry.title;
  const startChapter = entry.latestChapter + 1;
  const totalChapters = entry.totalChapters;

  console.info(`[DOWNLOAD] Continuing ${novelTitle} from chapter ${startChapter}`);

  let coverUrl = entry.coverUrl || findCoverImageUrl(document);
  let successfulChapters = [];
  let successfulOrders = [];

  // If there is temp progress for this novel, load it
  const temp = loadTempProgress();
  if (temp && temp.id === novelId) {
    successfulChapters = temp.chapters;
    successfulOrders = temp.orders;
    console.info(`[DOWNLOAD] Resuming from temp progress: ${successfulOrders.slice(-1)[0]}`);
  }

  for (let ch = startChapter; ch <= totalChapters; ch++) {

    if (stopDownloadFlag) {
      console.warn("[STOP] Manual stop triggered — treating as failed chapter.");
      securityAlert.textContent = "⚠️ Download paused due to failure. Refresh page to continue.";
      securityAlert.style.display = "block";
      saveTempProgress(entry, successfulChapters, successfulOrders);
      return;
    }
    try {
      const html = await fetchChapterContent(ch);
      successfulChapters.push(html);
      successfulOrders.push(ch);

      saveTempProgress(entry, successfulChapters, successfulOrders);

      const library = loadLibrary();
      const existing = library.find(e => e.id === novelId);
      if (existing) {
        existing.totalChapters = totalChapters;
        existing.latestChapter = Math.max(...successfulOrders);
        existing.coverUrl = coverUrl;
        saveLibrary(library);
      }

      console.info(`[CONTINUE] Fetched chapter ${ch}`);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.warn(`[CONTINUE] Chapter ${ch} failed:`, err);
      securityAlert.textContent = "⚠️ Download paused due to failure. Refresh page to continue.";
      securityAlert.style.display = "block";
      return;
    }
  }

  if (successfulChapters.length > 0) {
    await downloadAsEPUB(novelTitle, successfulChapters, successfulOrders);

    const library = loadLibrary();
    const existing = library.find(e => e.id === novelId);
    if (existing) {
      existing.latestChapter = Math.max(...successfulOrders);
      existing.coverUrl = coverUrl;
      saveLibrary(library);
    }

    clearTempProgress();
    renderLibrary();
    console.info(`[DOWNLOAD] Completed ${novelTitle} up to chapter ${totalChapters}`);
  }
}

  // --- library data store key ---
const LIBRARY_KEY = "epubLibraryV1";
function loadLibrary() {
  const raw = localStorage.getItem(LIBRARY_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveLibrary(data) { localStorage.setItem(LIBRARY_KEY, JSON.stringify(data)); }

// --- tiny security alert popup ---
const securityAlert = document.createElement("div");
securityAlert.style.cssText = `
  position: fixed; top: 40px; right: 10px; background:#600; color:#fff;
  padding:2px 6px; border-radius:6px; font-size:12px; display:none; z-index:999999; border: 1px solid red;
`;
securityAlert.innerHTML = "⚠️ Security check encountered — download paused. Refresh page if stuck.";
document.body.appendChild(securityAlert);

// --- library UI panel (Dark Theme) ---
const libraryPanel = document.createElement("div");

if (isMobile) {
  // Mobile / Android Style List
  libraryPanel.style.cssText = `
    position: fixed; top: 60px; right: 380px; width: 380px; height: 80vh;
    overflow-y: auto; background: #000; color: #fff; border: 1px solid #ccc; border-radius: 12px; padding: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5); z-index: 9999; display:none;
  `;
} else {
  // PC / Desktop Style List
  libraryPanel.style.cssText = `
    position: fixed; top: 60px; right: 380px; width: 380px; height: 80vh;
    overflow-y: auto; background: #000; color: #fff; border: 1px solid #ccc; border-radius: 12px; padding: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5); z-index: 9999; display:none;
  `;
}

libraryPanel.innerHTML = `
  <h3 style="color:gold; margin-top:0;">EPUB Library</h3>
  <input type="text" id="librarySearch" placeholder="Search by title..." style="width:100%; margin-bottom:10px; background:#222; color:#fff; border:1px solid #666; padding:4px;"/>
  <select id="librarySort" style="width:100%; margin-bottom:10px; background:#222; color:#fff; border:1px solid #666; padding:4px;">
    <option value="recent">Most Recent</option>
    <option value="title">Title A-Z</option>
    <option value="latestChapter">Latest Chapter</option>
  </select>
  <div id="libraryList"></div>
`;
document.body.appendChild(libraryPanel);

// --- open library (close menu, show panel) ---
libraryBtn.onclick = () => {
  menu.style.display = "none";
  libraryPanel.style.display = "block";
};

// --- blank container for items ---
const libraryItemsContainer = document.createElement("div");
libraryItemsContainer.id = "libraryItems";
libraryPanel.appendChild(libraryItemsContainer);

renderLibrary();

let tempEPUB = null;

// --- get chapter info from EPUB ---
async function getEPUBChapterInfo(file) {
  await ensureJSZip();
  const zip = await JSZip.loadAsync(file);
  const allFiles = Object.keys(zip.files);

  const chapterFiles = allFiles
    .map(f => f.match(/^OEBPS\/ch(\d+)\.xhtml$/i))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));

  const latestChapter = chapterFiles.length ? Math.max(...chapterFiles) : 0;
  const totalChapters = chapterFiles.length;

  return { latestChapter, totalChapters };
}

  // --- TEMP STORAGE BAR ---
const tempStorageBar = document.createElement("div");
tempStorageBar.id = "tempStorageBar";
tempStorageBar.style.cssText = `
  background:#222; padding:6px 8px; margin-bottom:10px; border-radius:6px;
  font-size:12px; color:#fff; display:flex; justify-content:space-between; align-items:center; border: 1px solid #444;
`;
tempStorageBar.innerHTML = `
  <span id="tempStorageInfo">No temp storage</span>
  <button id="clearTempStorageBtn" style="padding:2px 6px; font-size:11px; background:#333; color:#fff; border:1px solid #666;">Clear</button>
`;
libraryPanel.appendChild(tempStorageBar);

document.getElementById("clearTempStorageBtn").onclick = () => {
  clearTempProgress();
  updateTempStorageBar();
};

function updateTempStorageBar() {
  const info = document.getElementById("tempStorageInfo");
  if (!info) return;

  const temp = loadTempProgress();
  if (temp) {
    const size = new Blob([JSON.stringify(temp)]).size;
    info.textContent = `Temp storage: ${size} bytes — ${temp.orders?.length || 0} chapters saved` +
      (temp.title ? ` — "${temp.title}"` : "");
  } else {
    info.textContent = "No temp storage";
  }
}

// --- Render Library ---
function renderLibrary() {
  updateTempStorageBar();

  const library = loadLibrary();
  const sortMode = libraryPanel.querySelector("#librarySort")?.value || "recent";
  const searchQuery = libraryPanel.querySelector("#librarySearch")?.value.trim().toLowerCase() || "";

  let sorted = [...library];
  if (sortMode === "recent") sorted.sort((a,b) => (b.lastDownloaded||0) - (a.lastDownloaded||0));
  else if (sortMode === "title") sorted.sort((a,b) => (a.title||"").localeCompare(b.title||""));
  else if (sortMode === "latestChapter") sorted.sort((a,b) => (Number(b.latestChapter)||0) - (Number(a.latestChapter)||0));

  const filtered = sorted.filter(e => e.title.toLowerCase().includes(searchQuery));

  // --- Fixed top bar ---
  let fixedBar = libraryPanel.querySelector("#libraryFixedBar");
  if (!fixedBar) {
    fixedBar = document.createElement("div");
    fixedBar.id = "libraryFixedBar";
    fixedBar.style.cssText = `
      position: sticky; top: 0;
      display:flex; justify-content:flex-end; gap:6px;
      padding:4px 0; background:#000; border-bottom:1px solid #444; z-index:10;
    `;

    const importEPUBBtn = document.createElement("button");
    importEPUBBtn.textContent = "Import EPUB";
    styleDarkElement(importEPUBBtn, true);
    importEPUBBtn.onclick = () => {
      const inputFile = document.createElement("input");
      inputFile.type = "file";
      inputFile.accept = ".epub";

      inputFile.onchange = async (e) => {
        if (!e.target.files.length) return;
        const file = e.target.files[0];

        let title = file.name.replace(/\.epub$/i, "")
                             .replace(/- WTR-LAB.*$/i, "")
                             .replace(/^Chapter\s+\d+\s*[-:]?\s*/i, "")
                             .trim();

        const library = loadLibrary();
        const existingIndex = library.findIndex(e => e.title === title);

        const { latestChapter: epubLatest, totalChapters: epubTotal } = await getEPUBChapterInfo(file);

        let entry;
        if (existingIndex >= 0) {
          entry = library[existingIndex];
          entry.file = file;
          entry.latestChapter = epubLatest;
          entry.totalChapters = Math.max(entry.totalChapters, epubTotal);
          entry.lastDownloaded = Date.now();
        } else {
          entry = {
            id: "epub-" + Date.now(),
            title,
            coverUrl: "",
            latestChapter: epubLatest,
            totalChapters: epubTotal,
            file,
            lastDownloaded: Date.now(),
            inLocalStorage: true
          };
          library.push(entry);
        }

        saveLibrary(library);
        saveTempProgress(entry, [], []);
        renderLibrary();
      };

      inputFile.click();
    };
    fixedBar.appendChild(importEPUBBtn);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    styleDarkElement(closeBtn, true);
    closeBtn.onclick = () => libraryPanel.style.display = "none";
    fixedBar.appendChild(closeBtn);

    libraryPanel.prepend(fixedBar);
  }

  // --- Scrollable list ---
  let listContainer = libraryPanel.querySelector("#libraryItems");
  if (!listContainer) {
    listContainer = document.createElement("div");
    listContainer.id = "libraryItems";
    listContainer.style.cssText = `
      overflow-y:auto; height: calc(100% - ${fixedBar.offsetHeight}px); padding:6px;
    `;
    libraryPanel.appendChild(listContainer);
  }

  listContainer.innerHTML = filtered.map(entry => `
    <div style="display:grid;grid-template-columns:60px 1fr 140px;gap:10px;align-items:center;padding:6px;border-bottom:1px solid #333;">
      <img src="${entry.coverUrl||''}" style="width:60px;height:80px;object-fit:cover;border:1px solid #444; background:#111;" />
      <div>
        <div style="font-weight:bold; color:#fff;">${entry.title}</div>
        <div style="font-size:12px; color:#aaa;">Chapters: ${entry.latestChapter||0}/${entry.totalChapters||0}</div>
      </div>
      <div style="display:flex;gap:4px;">
        <button data-id="${entry.id}" class="continueBtn" style="background:#333; color:#fff; border:1px solid #666; padding:2px 6px; cursor:pointer;">Continue</button>
        <button data-id="${entry.id}" class="deleteBtn" style="background:#550000; color:#fff; border:1px solid #990000; padding:2px 6px; cursor:pointer;">Delete</button>
      </div>
    </div>
  `).join("");

  listContainer.querySelectorAll(".continueBtn").forEach(btn => {
    btn.onclick = async () => {
      const entry = library.find(e => e.id === btn.dataset.id);
      if (!entry) return;

      console.info("[Library] Continuing download for", entry.title);
      const start = entry.latestChapter + 1;

      try {
        const newChapters = await continueDownload(entry, start);

        if (entry.file) {
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const oldBytes = new Uint8Array(ev.target.result);
            const mergedBytes = new Uint8Array([...oldBytes, ...newChapters]);
            const mergedFile = new File([mergedBytes], entry.title + ".epub", { type: "application/epub+zip" });

            entry.file = mergedFile;
            entry.latestChapter += newChapters.length;
            entry.totalChapters = Math.max(entry.totalChapters, entry.latestChapter);

            saveLibrary(library);
            renderLibrary();
            libraryPanel.style.display = "none";
          };
          reader.readAsArrayBuffer(entry.file);
        } else {
          entry.latestChapter += newChapters.length;
          entry.totalChapters = Math.max(entry.totalChapters, entry.latestChapter);
          saveLibrary(library);
          renderLibrary();
          libraryPanel.style.display = "none";
        }

      } catch (err) {
        console.warn("[Library] Download interrupted", err);
        entry.interrupted = true;
        saveLibrary(library);
      }
    };
  });

  listContainer.querySelectorAll(".deleteBtn").forEach(btn => {
    btn.onclick = () => {
      const index = library.findIndex(e => e.id === btn.dataset.id);
      if (index >= 0) {
        library.splice(index, 1);
        saveLibrary(library);
        renderLibrary();
      }
    };
  });
}

function addToLibrary(novelId, novelTitle, coverUrl, totalChapters, latestChapter, file = null) {
  const library = loadLibrary();
  const now = Date.now();
  const existing = library.find(e => e.id === novelId);

  const normalizedTitle = novelTitle.replace(/:/g, "-").trim();

  if (existing) {
    existing.totalChapters = totalChapters;
    existing.latestChapter = latestChapter;
    existing.lastDownloaded = now;
    if (coverUrl) existing.coverUrl = coverUrl;
    if (file) existing.file = file;
    existing.title = normalizedTitle;
  } else {
    library.push({
      id: novelId,
      title: normalizedTitle,
      coverUrl: coverUrl || '',
      totalChapters,
      latestChapter,
      lastDownloaded: now,
      file
    });
  }

  saveLibrary(library);
  renderLibrary();
}

function getRenderedText(container) {
  return Array.from(container.querySelectorAll("p[data-line], p"))
    .map(p => p.textContent)
    .join("\n")
    .trim();
}

  // --- 3. Fetch chapter content ---
async function fetchChapterContent(order) {
  const formData = { translate: "ai", language, raw_id: id, chapter_no: order };

  const res = await fetch("https://wtr-lab.com/api/reader/get", {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify(formData),
    credentials: "include"
  });

  let json;
  try {
    json = await res.json();
  } catch {
    console.warn(`Chapter ${order}: Failed to parse JSON`);
    throw new Error("Invalid JSON");
  }

  if (!json?.data?.data?.body) {
    console.warn(`Chapter ${order}: No body in response`, json);
    throw new Error("Missing body");
  }

  const tempDiv = document.createElement("div");
  let imgCounter = 0;

  json.data.data.body.forEach(el => {
    if (el === "[image]") {
      const src = json.data.data?.images?.[imgCounter++] ?? "";
      if (src) {
        const img = document.createElement("img");
        img.src = src;
        tempDiv.appendChild(img);
      }
    } else {
      const pnode = document.createElement("p");
      const wrapper = document.createElement("div");
      wrapper.innerHTML = el;
      pnode.textContent = wrapper.textContent;

      for (let i = 0; i < (json?.data?.data?.glossary_data?.terms?.length ?? 0); i++) {
        const term = json.data.data.glossary_data.terms[i][0];
        if (!term) continue;
        pnode.textContent = pnode.textContent.replaceAll(`※${i}⛬`, term);
        pnode.textContent = pnode.textContent.replaceAll(`※${i}〓`, term);
      }

      tempDiv.appendChild(pnode);
    }
  });

  const rawText = getRenderedText(tempDiv);
  const processedText = applyReplacementsVToText(rawText, id);
  return `<h1>${order}: ${json.chapter?.title ?? "Untitled"}</h1><p>${processedText.replace(/\n/g,"<br>")}</p>`;
}

async function buildAllContentFromSelected() {
  const selectedOrders = [...menu.querySelectorAll("#chaptersList input:checked")].map(cb => cb.dataset.order);
  const allContent = [];

  for (const order of selectedOrders) {
    try {
      const html = await fetchChapterContent(order);
      allContent.push(html);
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`Unexpected error fetching chapter ${order}:`, err);
      allContent.push(`<h1>${order}: (unexpected error)</h1>`);
    }
  }

  console.info("[INFO] Finished fetching all chapters.");
  return { content: allContent, orders: selectedOrders };
}

  // --- 4. EPUB functions ---
  async function ensureJSZip() { if (window.JSZip) return window.JSZip; return new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"; s.onload = () => res(window.JSZip); s.onerror = rej; document.head.appendChild(s); }); }
  function escapeXml(str) { return (str+"").replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'})[c]); }
  function sanitizeFilename(name) { return (name||"book").replace(/[\/\\?%*:|"<>]/g,"-").slice(0,200); }

function findCoverImageUrl(dom = document) {
  const pictureSources = Array.from(dom.querySelectorAll("picture source[srcset]"))
    .map(s => s.srcset)
    .filter(u => u && u.includes("/cdn/series/"));
  if (pictureSources.length) return pictureSources[0];

  const imgs = Array.from(dom.querySelectorAll(".image-wrap img, .cover img"))
    .map(i => i.src)
    .filter(u => u && u.includes("/cdn/series/") && !u.includes("/placeholder"));
  if (imgs.length) return imgs[0];

  try {
    const jsonText = dom.querySelector('script#__NEXT_DATA__')?.textContent;
    if (jsonText) {
      const j = JSON.parse(jsonText);
      return j?.props?.pageProps?.series?.cover ||
             j?.props?.pageProps?.novel?.cover ||
             j?.props?.initialState?.series?.cover ||
             null;
    }
  } catch (e) {}

  return null;
}

async function downloadAsEPUB(novelTitle, allContent, chapterOrders) {
  await ensureJSZip();

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  const metaInf = zip.folder("META-INF");
  const oebps = zip.folder("OEBPS");
  const imagesFolder = oebps.folder("images");

  metaInf.file(
    "container.xml",
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  let coverHref = null;
  let coverId = "cover-image";
  try {
    const coverUrl = findCoverImageUrl(document);
    if (coverUrl) {
      const absolute = new URL(coverUrl, location.href).href;
      const resp = await fetch(absolute, { credentials: "include" });
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const ct = resp.headers.get("content-type") || "";
        let ext = "jpg";
        if (ct.includes("png")) ext = "png";
        else if (ct.includes("webp")) ext = "webp";
        else if (ct.includes("jpeg")) ext = "jpg";
        else {
          const m = absolute.match(/\.(png|jpe?g|webp)(?:$|\?)/i);
          if (m) ext = m[1].toLowerCase().replace("jpeg", "jpg");
        }
        coverHref = `images/cover.${ext}`;
        imagesFolder.file(`cover.${ext}`, new Uint8Array(buf));
      } else {
        console.warn("[EPUB] cover fetch failed:", resp.status);
      }
    }
  } catch (err) {
    console.warn("[EPUB] cover embed skipped (error):", err);
    coverHref = null;
  }

  const chapterTitles = chapterOrders.map((num, i) => {
    const html = allContent[i] || "";
    const m = html.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/i);
    if (m && m[1]) return m[1].trim();
    try {
      if (typeof chapters !== "undefined" && Array.isArray(chapters)) {
        const found = chapters.find(c => String(c.order) === String(num));
        if (found && found.title) return found.title;
      }
    } catch (e) {}
    return `Chapter ${num}`;
  });

  const tocEntries = chapterOrders
    .map((num, i) => `<li><a href="ch${num}.xhtml">${escapeXml(chapterTitles[i])}</a></li>`)
    .join("\n");

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Table of Contents</title></head>
  <body>
    <nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${tocEntries}</ol></nav>
  </body>
</html>`;
  oebps.file("nav.xhtml", navXhtml);

  const manifestItems = [
    `<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>`,
    ...chapterOrders.map(num => `<item id="ch${num}" href="ch${num}.xhtml" media-type="application/xhtml+xml"/>`)
  ];
  if (coverHref) {
    const ext = coverHref.split(".").pop().toLowerCase();
    let mtype = "image/jpeg";
    if (ext === "png") mtype = "image/png";
    else if (ext === "webp") mtype = "image/webp";
    manifestItems.splice(1, 0, `<item id="${coverId}" href="${coverHref}" media-type="${mtype}"/>`);
  }

  const manifestXml = manifestItems.join("\n");
  const spineItems = chapterOrders.map(num => `<itemref idref="ch${num}"/>`).join("\n");

  const metaCoverTag = coverHref ? `<meta name="cover" content="${coverId}"/>` : "";
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(novelTitle || "Untitled")}</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="BookId">urn:uuid:${crypto.randomUUID()}</dc:identifier>
    ${metaCoverTag}
  </metadata>
  <manifest>
    ${manifestXml}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`;
  oebps.file("content.opf", opf);

  allContent.forEach((html, idx) => {
    const order = chapterOrders[idx];
    const title = escapeXml(chapterTitles[idx] || `Chapter ${order}`);
    const safeHtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>${title}</title></head>
  <body>${html}</body>
</html>`;
    oebps.file(`ch${order}.xhtml`, safeHtml);
  });

  if (coverHref) {
    const coverPage = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Cover</title></head>
  <body>
    <div style="text-align:center;">
      <img src="${coverHref}" alt="Cover" style="max-width:100%;height:auto;"/>
    </div>
  </body>
</html>`;
    oebps.file("cover.xhtml", coverPage);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${sanitizeFilename(novelTitle || "book")}.epub`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  console.info("[EPUB] Download triggered.");
}

const downloadBtn = document.getElementById("downloadEpubBtn");

function getNovelTitleFromBreadcrumb() {
  const a = document.querySelector(".breadcrumb-item.active a");
  if (a && a.textContent.trim()) {
    return a.textContent.trim();
  }
  return "Novel";
}

downloadBtn.addEventListener("click", async () => {
  console.info("[DOWNLOAD] Starting chapter download...");

  const header = document.getElementById("menuHeader");
  let indicator = header.querySelector(".download-indicator");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "download-indicator";
    indicator.style.cssText = `
      display:inline-block; margin-left:10px; padding:2px 6px;
      background:#ffd700; color:#000; border-radius:8px;
      font-size:12px; font-weight:bold;
      animation: blink 1s infinite;
    `;
    indicator.textContent = "Downloading...";
    header.appendChild(indicator);
  }
  indicator.style.display = "inline-block";

  if (!document.getElementById("blinkAnimation")) {
    const style = document.createElement("style");
    style.id = "blinkAnimation";
    style.textContent = `
      @keyframes blink { 0%,50%,100% { opacity: 1; } 25%,75% { opacity: 0.3; } }
    `;
    document.head.appendChild(style);
  }

  const novelTitle = getNovelTitleFromBreadcrumb();
  const novelId = location.pathname.split("/").pop();
  const selectedChapters = Array.from(menu.querySelectorAll("#chaptersList input[type=checkbox]:checked"))
    .map(cb => ({
      order: parseInt(cb.dataset.order),
      title: cb.parentElement.textContent.trim()
    }));

  let coverUrl = "";
  try {
    const imageWrap = document.querySelector("div.image-wrap picture source[srcset]");
    if (imageWrap) coverUrl = imageWrap.srcset;
  } catch (err) { console.warn("[DOWNLOAD] Could not grab cover URL:", err); }

  const totalChapters = chapters.length;
  libraryPanel.style.display = "block";
  menu.style.display = "none";

  const temp = loadTempProgress();
  let successfulChapters = temp && temp.id === novelId ? temp.chapters : [];
  let successfulOrders = temp && temp.id === novelId ? temp.orders : [];

for (let ch of selectedChapters) {
  if (stopDownloadFlag) {
    console.warn("[STOP] Manual stop triggered — treating as failed chapter.");
    securityAlert.textContent = "⚠️ Download paused due to manual stop. Refresh page to continue.";
    securityAlert.style.display = "block";

    saveTempProgress({ id: novelId, title: novelTitle, coverUrl }, successfulChapters, successfulOrders);
    indicator.style.display = "none";
    return;
  }

  try {
    const chapterContent = await fetchChapterContent(ch.order);
    if (!chapterContent || chapterContent.trim() === "") throw new Error("Empty chapter content");

    successfulChapters.push(chapterContent);
    successfulOrders.push(ch.order);

    saveTempProgress({ id: novelId, title: novelTitle, coverUrl }, successfulChapters, successfulOrders);

    addToLibrary(novelId, novelTitle, coverUrl, totalChapters, Math.max(...successfulOrders));
    libraryPanel.scrollTop = libraryPanel.scrollHeight;
    console.info(`[Library] Downloaded chapter ${ch.order}: ${ch.title}`);
  } catch (err) {
    console.error(`[DOWNLOAD] Chapter ${ch.order} failed:`, err);
    securityAlert.textContent = "⚠️ Download paused due to security check. Refresh page to continue.";
    securityAlert.style.display = "block";
    indicator.style.display = "none";
    return;
  }
}

  await downloadAsEPUB(novelTitle, successfulChapters, successfulOrders);
  clearTempProgress();

  indicator.style.display = "none";
  console.info("[DOWNLOAD] All chapters downloaded successfully.");
});

})();


(function () {
      'use strict';

      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

      const STORAGE_KEY = 'wordReplacerPairsV3';
      let data = loadData();

      const mainButton = document.createElement('button');
      mainButton.textContent = 'Word Replacer';

      if (isMobile) {
        // Mobile / Android Style List
        Object.assign(mainButton.style, {
          position: 'fixed',
          bottom: '1%',
          left: '1%',
          zIndex: '100001',
          padding: '8px 14px',
          fontSize: '16px',
          backgroundColor: '#333',
          color: '#fff',
          border: '1px solid #666',
          borderRadius: '6px',
          cursor: 'pointer',
        });
      } else {
        // PC / Desktop Style List
        Object.assign(mainButton.style, {
          position: 'fixed',
          bottom: '1%',
          right: '19%',
          zIndex: '100001',
          padding: '8px 14px',
          fontSize: '16px',
          backgroundColor: '#333',
          color: '#fff',
          border: '1px solid #666',
          borderRadius: '6px',
          cursor: 'pointer',
        });
      }

      document.body.appendChild(mainButton);

      let popup = null;

      mainButton.addEventListener('click', () => {
        if (popup) {
          closePopup();
        } else {
          openPopup();
          replaceTextInChapter();
        }
      });

      function loadData() {
        return GM_getValue(STORAGE_KEY, {});
      }

      function saveData(obj) {
        GM_setValue(STORAGE_KEY, obj);
      }
      function closePopup() {
        if (popup) {
          popup.remove();
          popup = null;
        }
      }

      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\",]/g, '\\$&');

      function isStartOfSentence(index, fullText) {
        if (index === 0) return true;
        const before = fullText.slice(0, index);
        if (/^\s*$/.test(before)) return true;
        const trimmed = before.replace(/\s+$/, '');
        if (/[.!?…]["”’')\]]*$/.test(trimmed)) return true;
        if (/[\n\r]\s*$/.test(before)) return true;
        if (/["“”'‘(\[]\s*$/.test(before)) return true;
        if (/["“”]$/.test(before)) return true;
        if (/Chapter\s+\d+:\s*,?\s*$/.test(before)) return true;
        return false;
      }

function isInsideDialogueAtIndex(text, index) {
  const quoteChars = `"“”‘’`;
  let count = 0;
  for (let i = 0; i < index; i++) {
    if (quoteChars.includes(text[i])) {
      count++;
    }
  }
  return (count % 2) === 1;
}

      function applyPreserveCapital(orig, replacement) {
        if (!orig) return replacement;
        if (orig[0] >= 'A' && orig[0] <= 'Z') {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
      }

    function buildIgnoreRegex(from, ignoreTerm, entry, wildcardSymbol) {
        const flags = entry.ignoreCapital ? 'gi' : 'g';
        let basePattern = escapeRegex(from).replace(new RegExp(`\\${wildcardSymbol}`, 'g'), '.');

        if (entry.noTrailingSpace) {
            basePattern = basePattern.trim();
        }

        if (ignoreTerm) {
            return new RegExp(
                basePattern + `(?![\\s"“”'’,.-]+${escapeRegex(ignoreTerm)})`,
                flags
            );
        } else {
            return new RegExp(basePattern, flags);
        }
    }

function applyReplacements(text, replacements) {
  let replacedText = text;
  const WILDCARD = '@';
  const punctuationRegex =
    /^[\W_'"“”‘’„,;:!?~()\[\]{}<>【】「」『』（）《》〈〉—–-]|[\W_'"“”‘’„,;:!?~()\[\]{}<>【】「」『』（）《》〈〉—–-]$/;

  for (const entry of replacements) {
    if (!entry.from || !entry.to) continue;

    const flags = entry.ignoreCapital ? 'gi' : 'g';
    let searchTerm = entry.noTrailingSpace ? entry.from.trimEnd() : entry.from;

    let ignoreTerm = null;
    const prefixMatch = searchTerm.match(/^\|(.*?)\|\s*(.+)$/);
    const suffixMatch = searchTerm.match(/^(.*?)\s*\|(.*?)\|$/);

    if (prefixMatch) {
      ignoreTerm = { type: 'before', value: prefixMatch[1] };
      searchTerm = prefixMatch[2];
    } else if (suffixMatch) {
      ignoreTerm = { type: 'after', value: suffixMatch[2] };
      searchTerm = suffixMatch[1];
    }

    const quoteChars = `"'“”‘’`;
    if (quoteChars.includes(searchTerm.charAt(0))) {
      searchTerm = `[${quoteChars}]` + escapeRegex(searchTerm.slice(1));
    } else {
      searchTerm = escapeRegex(searchTerm);
    }

    const caretFrom = (entry.from.match(/\^/g) || []).length;
    const caretTo = (entry.to.match(/\^/g) || []).length;
    const usePlaceholder = caretFrom === 1 && caretTo === 1;

    let base = usePlaceholder
      ? searchTerm.replace('\\^', '([^\\s])')
      : searchTerm.replace(new RegExp(`\\${WILDCARD}`, 'g'), '.');

    const firstChar = entry.from.charAt(0);
    const lastChar = entry.from.charAt(entry.from.length - 1);
    const skipBoundaries =
      punctuationRegex.test(firstChar) || punctuationRegex.test(lastChar);

    let patternStr = (entry.allInstances || skipBoundaries)
      ? base
      : `(?<=^|[^A-Za-z0-9])${base}(?=[^A-Za-z0-9]|$)`;

    if (ignoreTerm?.value) {
      const escaped = escapeRegex(ignoreTerm.value);
      if (ignoreTerm.type === 'before') {
        patternStr = `(?<!${escaped})${patternStr}`;
      } else {
        patternStr = `${patternStr}(?!${escaped}\\s*)`;
      }
    }

    const regex = new RegExp(patternStr, flags);

    let newText = '';
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(replacedText)) !== null) {
      const idx = match.index;
      const insideDialogue = isInsideDialogueAtIndex(replacedText, idx);

      const blocked =
        (entry.insideDialogueOnly && !insideDialogue) ||
        (entry.outsideDialogueOnly && insideDialogue);

      if (blocked) {
        newText += replacedText.slice(lastIndex, idx + match[0].length);
        lastIndex = idx + match[0].length;
        continue;
      }

      newText += replacedText.slice(lastIndex, idx);

      let replacement = entry.noTrailingSpace
        ? entry.to.trimEnd()
        : entry.to;

      if (usePlaceholder && match[1]) {
        replacement = replacement.replace('^', match[1]);
      }

      const startSentence =
        entry.startOfSentence &&
        typeof isStartOfSentence === 'function' &&
        isStartOfSentence(idx, replacedText);

      if (startSentence) {
        replacement = entry.preserveFirstCapital
          ? applyPreserveCapital(match[0], replacement)
          : replacement.charAt(0).toUpperCase() + replacement.slice(1);
      } else if (entry.preserveFirstCapital) {
        replacement = applyPreserveCapital(match[0], replacement);
      }

      newText += replacement;
      lastIndex = idx + match[0].length;
    }

    newText += replacedText.slice(lastIndex);
    replacedText = newText;
  }

  return replacedText;
}

    function replaceTextInChapter() {
      const seriesId = (() => {
        const urlMatch = location.href.match(/\/novel\/(\d+)\//i);
        if (urlMatch) return urlMatch[1];
        const crumb = document.querySelector('.breadcrumb li.breadcrumb-item a[href*="/novel/"]');
        if (crumb) {
          const crumbMatch = crumb.href.match(/\/novel\/(\d+)\//i);
          if (crumbMatch) return crumbMatch[1];
        }
        return null;
      })();

      let replacements = [];
      for (const key in data) {
        if (key === 'global' || (seriesId && key === `series-${seriesId}`)) {
          replacements = replacements.concat(data[key].filter(e => e.enabled));
        }
      }

      if (replacements.length === 0) return false;

      const paragraphs = document.querySelectorAll(
        'div.chapter-body div[data-line], h3.chapter-title'
      );

      let replacedAny = false;

      paragraphs.forEach(p => {
        const textNodes = [];
        const originalLengths = [];
        let originalText = '';

        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null, false);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.nodeValue) continue;
          textNodes.push(node);
          originalLengths.push(node.nodeValue.length);
          originalText += node.nodeValue;
        }

        if (!originalText) return;

        let replacedText = applyReplacements(originalText, replacements);

        const totalOriginalLength = originalText.length;
        const totalReplacedLength = replacedText.length;
        let currentIndex = 0;

        textNodes.forEach((node, i) => {
          const proportion = originalLengths[i] / totalOriginalLength;
          let sliceLength = Math.round(proportion * totalReplacedLength);
          if (i === textNodes.length - 1) sliceLength = totalReplacedLength - currentIndex;
          node.nodeValue = replacedText.slice(currentIndex, currentIndex + sliceLength);
          currentIndex += sliceLength;
        });

        textNodes.forEach(node => {
          let nodeVal = node.nodeValue;
          replacements.forEach(entry => {
            if (entry.note && entry.note.trim()) {
              let idx = 0;
              while ((idx = nodeVal.indexOf(entry.to, idx)) !== -1) {
                const parent = node.parentNode;
                if (!parent) break;

                const span = document.createElement('span');
                span.className = 'text-patch system_term';
                span.dataset.note = entry.note;
                span.textContent = entry.to;

                const before = nodeVal.slice(0, idx);
                const after = nodeVal.slice(idx + entry.to.length);

                if (before) parent.insertBefore(document.createTextNode(before), node);
                parent.insertBefore(span, node);
                nodeVal = after;
                idx = 0;
                node.nodeValue = nodeVal;
                if (!nodeVal) {
                  parent.removeChild(node);
                  break;
                }
              }
            }
          });
        });

        replacedAny = true;
      });

      if (replacedAny) console.log('Replacements done on chapter paragraphs.');
      return replacedAny;
    }

    function runReplacementMultiple(times = 1, delay = 100) {
      let count = 0;

    function initInlinePopoverButtons() {
      const seriesId = window.seriesId || 'default-series';
      const shownotesRaw = localStorage.getItem('shownotes') || '';
      const shownotesSet = new Set(shownotesRaw.split(',').filter(Boolean));
      const notesVisible = shownotesSet.has(seriesId);

      document.querySelectorAll('span.text-patch.system_term[data-note]').forEach(span => {
        if (span.dataset.hasPencil === 'true') return;
        span.dataset.hasPencil = 'true';

        const btn = document.createElement('button');
        btn.textContent = '✎';
        btn.title = 'Show Note';
        Object.assign(btn.style, {
          fontSize: '10px',
          padding: '0 2px',
          marginLeft: '4px',
          cursor: 'pointer',
          lineHeight: '1',
          verticalAlign: 'middle',
          border: 'none',
          background: 'transparent',
          color: '#fff',
          display: notesVisible ? 'inline' : 'none',
        });

        span.insertAdjacentElement('afterend', btn);

        const pop = document.createElement('div');
        pop.className = 'user-popover';
        Object.assign(pop.style, {
          position: 'absolute',
          zIndex: 9999,
          maxWidth: '280px',
          background: 'black',
          color: 'white',
          border: '1px solid #ccc',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          padding: '8px',
          display: 'none',
        });

        const desc = document.createElement('div');
        desc.className = 'patch-desc';
        desc.textContent = 'Note: ' + span.dataset.note;
        pop.appendChild(desc);
        document.body.appendChild(pop);

        span._popover = pop;

        btn.addEventListener('click', e => {
          e.stopPropagation();
          document.querySelectorAll('.user-popover').forEach(p => {
            if (p !== pop) p.style.display = 'none';
          });

          desc.textContent = 'Note: ' + span.dataset.note;

          const rect = span.getBoundingClientRect();
          pop.style.top = `${window.scrollY + rect.bottom + 5}px`;
          pop.style.left = `${window.scrollX + rect.left}px`;

          pop.style.display = pop.style.display === 'block' ? 'none' : 'block';
        });
      });

      document.addEventListener('click', () => {
        document.querySelectorAll('.user-popover').forEach(p => (p.style.display = 'none'));
      });
    }

    function removeExtraPencils() {
      document.querySelectorAll('span.text-patch.system_term[data-note]').forEach(span => {
        const siblings = [];
        let next = span.nextElementSibling;

        while (next && next.tagName === 'BUTTON') {
          if (next.textContent.trim() === '✎') siblings.push(next);
          next = next.nextElementSibling;
        }

        siblings.slice(1).forEach(btn => btn.remove());
      });
    }

    function nextPass() {
      const replaced = replaceTextInChapter();
      initInlinePopoverButtons();
      count++;
      if (count < times) {
        setTimeout(nextPass, delay);
      } else {
        setTimeout(removeExtraPencils, 150);
      }
    }

    nextPass();
    }

    setTimeout(() => runReplacementMultiple(1, 100), 2000);

    (function () {
      let lastUrl = location.href;

      function checkUrlChange() {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
          runReplacementMultiple(1, 100);
          removeExtraPencils();
          applyDataHashReplacements();
        }
      }

      const originalPushState = history.pushState;
      history.pushState = function () {
        originalPushState.apply(this, arguments);
        window.dispatchEvent(new Event("locationchange"));
      };

      const originalReplaceState = history.replaceState;
      history.replaceState = function () {
        originalReplaceState.apply(this, arguments);
        window.dispatchEvent(new Event("locationchange"));
      };

      window.addEventListener("popstate", () => window.dispatchEvent(new Event("locationchange")));
      window.addEventListener("locationchange", checkUrlChange);

      runReplacementMultiple(1, 100);
      applyDataHashReplacements(1,100);
    })();

    function openPopup() {
      if (popup) return;

    popup = document.createElement('div');

    if (isMobile) {
      // Mobile / Android Style List
      Object.assign(popup.style, {
        position: 'fixed',
        bottom: '8%',
        right: '5%',
        width: '100vw',
        maxWidth: '370px',
        height: 'auto',
        maxHeight: 'none',
        backgroundColor: '#000',
        color: '#fff',
        border: '1px solid #aaa',
        padding: '15px',
        boxShadow: '0 0 15px rgba(0,0,0,0.5)',
        overflow: 'visible',
        zIndex: '100000',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
      });
    } else {
      // PC / Desktop Style List
      Object.assign(popup.style, {
        position: 'fixed',
        bottom: '8%',
        right: '5%',
        width: '100vw',
        maxWidth: '370px',
        height: 'auto',
        maxHeight: 'none',
        backgroundColor: '#000',
        color: '#fff',
        border: '1px solid #aaa',
        padding: '15px',
        boxShadow: '0 0 15px rgba(0,0,0,0.5)',
        overflow: 'visible',
        zIndex: '100000',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
      });
    }

    document.body.appendChild(popup);

      const toggleListBtn = document.createElement('button');
      toggleListBtn.textContent = 'List';
      toggleListBtn.style.marginBottom = '1px';
      toggleListBtn.style.display = 'block';
      styleButton(toggleListBtn);

    const infoBtn = document.createElement('button');
    infoBtn.textContent = 'Info';
    infoBtn.style.marginLeft = '6px';
    infoBtn.style.padding = '5px 10px';
    infoBtn.style.alignSelf = 'flex-start';
    styleButton(infoBtn);

    const topBtnContainer = document.createElement('div');
    topBtnContainer.style.display = 'flex';
    topBtnContainer.style.alignItems = 'center';
    topBtnContainer.appendChild(toggleListBtn);
    topBtnContainer.appendChild(infoBtn);
    popup.appendChild(topBtnContainer);

    const openRawsBtn = document.createElement('button');
    openRawsBtn.textContent = 'Raws';
    styleButton(openRawsBtn);
    openRawsBtn.style.marginLeft = '6px';
    topBtnContainer.appendChild(openRawsBtn);

window.replacements = GM_getValue('dataHashReplacements', []);

window.applyDataHashReplacements = function () {
    if (!window.replacements.length) return;
    const spans = document.querySelectorAll('span[data-hash]');
    spans.forEach(span => {
        const dhEntry = window.replacements.find(r => r.dataHash === span.getAttribute('data-hash'));
        if (dhEntry) span.textContent = dhEntry.to;
    });
};

window.runReplacementMultiple = function (times = 2, delay = 50) {
    let count = 0;
    function nextPass() {
        window.applyDataHashReplacements();
        count++;
        if (count < times) setTimeout(nextPass, delay);
    }
    nextPass();
};

(function () {
    let lastUrl = location.href;

    function checkUrlChange() {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            window.runReplacementMultiple(2, 50);
        }
    }

    const originalPushState = history.pushState;
    history.pushState = function () {
        originalPushState.apply(this, arguments);
        window.dispatchEvent(new Event("locationchange"));
      };

      const originalReplaceState = history.replaceState;
      history.replaceState = function () {
        originalReplaceState.apply(this, arguments);
        window.dispatchEvent(new Event("locationchange"));
      };

      window.addEventListener("popstate", () => window.dispatchEvent(new Event("locationchange")));
      window.addEventListener("locationchange", checkUrlChange);

      setTimeout(() => window.runReplacementMultiple(2, 50), 500);
})();

function openRawsModal() {
    if (document.querySelector('#rawsModal')) return;

    // 1. Check if user is on Android / Mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

    const modal = document.createElement('div');
    modal.id = 'rawsModal';

    // 2. Apply desktop styles by default, or mobile styles if on Android
    if (isMobile) {
        Object.assign(modal.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)', // Perfectly centers it on mobile
            background: '#000',
            border: '1px solid #ccc',
            padding: '15px',
            zIndex: '100001',
            width: '90vw',                     // Takes 90% of screen width so it fits safely
            maxWidth: '380px',
            maxHeight: '90vh',                 // Ensures height fits inside vertical screen
            overflowY: 'auto',
            boxShadow: '0 0 12px rgba(0,0,0,0.5)',
            borderRadius: '6px',
            boxSizing: 'border-box'
        });
    } else {
        // Original PC styling preserved completely
        Object.assign(modal.style, {
            position: 'fixed',
            top: '50%',
            left: '15%',
            transform: 'translate(-50%, -50%)',
            background: '#000',
            border: '1px solid #ccc',
            padding: '20px',
            zIndex: '100001',
            width: '400px',
            maxHeight: '100%',
            overflowY: 'auto',
            boxShadow: '0 0 12px rgba(0,0,0,0.5)',
            borderRadius: '6px',
        });
    }

    document.body.appendChild(modal);

    // ... (rest of your openRawsModal function remains unchanged)

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.float = 'right';
    closeBtn.style.color = '#fff';
    closeBtn.style.background = '#333';
    closeBtn.style.border = '1px solid #666';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = () => modal.remove();
    modal.appendChild(closeBtn);

    const title = document.createElement('h3');
    title.textContent = 'Data-Hash Replacements';
    title.style.color = 'gold';
    title.style.marginTop = '0';
    title.style.marginBottom = '4px';
    modal.appendChild(title);

    const listContainer = document.createElement('div');
    modal.appendChild(listContainer);

    const addContainer = document.createElement('div');
    addContainer.style.marginTop = '10px';
    modal.appendChild(addContainer);

    const dataHashInput = document.createElement('input');
    dataHashInput.placeholder = 'Data Hash';
    dataHashInput.style.width = 'calc(50% - 6px)';
    dataHashInput.style.marginRight = '6px';
    dataHashInput.style.background = '#222';
    dataHashInput.style.color = '#fff';
    dataHashInput.style.border = '1px solid #ccc';
    addContainer.appendChild(dataHashInput);

    const replacementInput = document.createElement('input');
    replacementInput.placeholder = 'Replacement';
    replacementInput.style.width = 'calc(50% - 6px)';
    replacementInput.style.background = '#222';
    replacementInput.style.color = '#fff';
    replacementInput.style.border = '1px solid #ccc';
    addContainer.appendChild(replacementInput);

    const actionRow = document.createElement('div');
    actionRow.style.marginTop = '8px';
    actionRow.style.display = 'flex';
    actionRow.style.gap = '8px';
    actionRow.style.alignItems = 'center';
    addContainer.appendChild(actionRow);

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add';
    addBtn.style.color = '#55ff55';
    addBtn.style.background = '#222';
    addBtn.style.border = '1px solid #55ff55';
    addBtn.style.padding = '4px 12px';
    addBtn.style.borderRadius = '4px';
    addBtn.style.cursor = 'pointer';
    actionRow.appendChild(addBtn);

    const exportRawsBtn = document.createElement('button');
    exportRawsBtn.textContent = 'Export Raws';
    exportRawsBtn.style.color = '#fff';
    exportRawsBtn.style.background = '#333';
    exportRawsBtn.style.border = '1px solid #666';
    exportRawsBtn.style.padding = '4px 12px';
    exportRawsBtn.style.borderRadius = '4px';
    exportRawsBtn.style.cursor = 'pointer';
    exportRawsBtn.onclick = () => {
        if (!window.replacements.length) {
            alert('No Raws replacements to export.');
            return;
        }
        const blob = new Blob([JSON.stringify(window.replacements, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'raws-data-hash-replacements.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    actionRow.appendChild(exportRawsBtn);

    const importRawsBtn = document.createElement('button');
    importRawsBtn.textContent = 'Import Raws';
    importRawsBtn.style.color = '#fff';
    importRawsBtn.style.background = '#333';
    importRawsBtn.style.border = '1px solid #666';
    importRawsBtn.style.padding = '4px 12px';
    importRawsBtn.style.borderRadius = '4px';
    importRawsBtn.style.cursor = 'pointer';
    importRawsBtn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const imported = JSON.parse(event.target.result);
                    if (Array.isArray(imported)) {
                        window.replacements = [...window.replacements, ...imported];
                        saveAndRender();
                    } else {
                        alert('Invalid file format. Must be a JSON array.');
                    }
                } catch (err) {
                    alert('Failed to parse JSON file.');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };
    actionRow.appendChild(importRawsBtn);

    function renderList() {
        listContainer.innerHTML = '';
        window.replacements.forEach((r, idx) => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.style.marginBottom = '4px';
            div.style.paddingLeft = '10px';
            div.style.border = '0.5px solid grey';

            const span = document.createElement('span');
            span.textContent = `${r.dataHash} → ${r.to}`;
            span.style.color = '#fff';
            div.appendChild(span);

            const del = document.createElement('button');
            del.textContent = '✕';
            del.style.cursor = 'pointer';
            styleButton(del);
            del.title = 'Delete this replacement';
            del.style.color = 'red';
            del.style.background = 'none';
            del.style.border = '1px solid #000';
            del.onclick = () => {
                window.replacements.splice(idx, 1);
                saveAndRender();
            };
            div.appendChild(del);

            listContainer.appendChild(div);
        });
    }

    function saveAndRender() {
        GM_setValue('dataHashReplacements', window.replacements);
        renderList();
        window.runReplacementMultiple(2, 50);
    }

    addBtn.onclick = () => {
        const dh = dataHashInput.value.trim();
        const rp = replacementInput.value.trim();
        if (!dh || !rp) return;
        window.replacements.push({ dataHash: dh, to: rp });
        saveAndRender();
        dataHashInput.value = '';
        replacementInput.value = '';
    };

    renderList();
    window.runReplacementMultiple(2, 50);
}

openRawsBtn.onclick = () => {
    const modal = document.querySelector('#rawsModal');
    if (modal) {
        modal.remove();
    } else {
        openRawsModal();
    }
};

    const infoBox = document.createElement('div');
    Object.assign(infoBox.style, {
      maxHeight: '0',
      overflow: 'hidden',
      backgroundColor: '#fff',
      color: 'black',
      border: '1px solid #000',
      padding: '0 10px',
      marginTop: '10px',
      fontSize: '13px',
      lineHeight: '1.4',
      overflowY: 'auto',
      transition: 'max-height 0.3s ease, padding 0.3s ease',
    });
    infoBox.innerHTML = `
      <div style="padding:10px 0;">
        <strong>Replacement System Info:</strong>
        <ul style="margin:5px 0; padding-left:18px;">
          <li><strong>Ignore Capital:</strong> Match case-insensitively.</li>
          <li><strong>Start of Sentence:</strong> Only capitalize if the word starts a sentence.</li>
          <li><strong>Fuzzy Match:</strong> Ignore boundaries, match anywhere.</li>
          <li><strong>Preserve Capital:</strong> Keep first letter capitalized if original was capitalized.</li>
          <li><strong>No Trailing Space:</strong> Trim trailing space in replacement.</li>
          <li><strong>Inside Dialogue Only:</strong> Replace only inside quotation marks.</li>
          <li><strong>Outside Dialogue Only:</strong> Replace only outside quotation marks.</li>
          <li><strong>Global:</strong> Makes the entry apply to all novels.</li>
          <li><strong>|ignore this|:</strong> Use before or after a word to ignore specific matches. Example: <code>|ignore |term</code> or <code>term| ignore|</code>. Spaces must be inside the <code>||</code>.</li>
          <li><strong>@ wildcard:</strong> Any character substitution. Example: <code>fr@t</code> replaces fret, frat, frit, etc.</li>
          <li><strong>^ special placeholder:</strong> Use <code>^</code> in Find like <code>Th^t</code> and in Replace like <code>Br^</code>. The character at <code>^</code> in Find will be preserved in the replacement.</li>
          <li><strong>Edit Entries:</strong> Use 'Show List', tap an entry to make edits and change the series ID. By default, it will be applied only to whatever novel you're on currently. If you entered a term while in Library, it will default to an empty series ID, which is global.</li>
    	  <li>The Show Note requires you have go to the term editor in the Show List, but this is a fragile feature, I don't recommend it.</li>
          <li><strong>Raws:</strong> Match the raw text. You can copy the raw from popover, only works on the clickable terms.</li>
        </ul>
      </div>
    `;

    popup.appendChild(infoBox);

    infoBtn.addEventListener('click', (e) => {
      if (infoBox.style.maxHeight && infoBox.style.maxHeight !== '0px') {
        infoBox.style.maxHeight = '0';
        infoBox.style.padding = '0 10px';
      } else {
        infoBox.style.maxHeight = '200px';
        infoBox.style.padding = '10px';
      }
      e.stopPropagation();
    });

    document.addEventListener('click', (e) => {
      if (!infoBox.contains(e.target) && e.target !== infoBtn) {
        infoBox.style.maxHeight = '0';
        infoBox.style.padding = '0 10px';
      }
    });

    // --- Create invert colors button ---
    const invertBtn = document.createElement('button');
    invertBtn.textContent = 'Invert';
    invertBtn.style.marginLeft = '6px';
    invertBtn.style.padding = '5px 10px';
    invertBtn.style.alignSelf = 'flex-start';
    styleButton(invertBtn);
    topBtnContainer.appendChild(invertBtn);

    // --- Notes toggle button ---
    const notesToggleBtn = document.createElement('button');
    notesToggleBtn.textContent = 'Show Note';
    notesToggleBtn.style.marginLeft = '4px';
    notesToggleBtn.style.padding = '5px 10px';
    styleButton(notesToggleBtn);
    topBtnContainer.appendChild(notesToggleBtn);

    const seriesId = window.seriesId || 'default-series';
    const shownotesRaw = localStorage.getItem('shownotes') || '';
    const shownotesSet = new Set(shownotesRaw.split(',').filter(Boolean));
    let notesInitiallyVisible = shownotesSet.has(seriesId);

    function updatePencils(show) {
      document.querySelectorAll('span.text-patch.system_term[data-note]').forEach(span => {
        const btn = span.nextElementSibling;
        if (!btn || btn.textContent.trim() !== '✎') return;

        const noteSeries = span.dataset.series || 'default-series';
        if (noteSeries !== seriesId) return;

        btn.style.display = show ? 'inline-block' : 'none';
      });
    }

    updatePencils(notesInitiallyVisible);
    notesToggleBtn.textContent = notesInitiallyVisible ? 'Hide Note' : 'Show Note';

    notesToggleBtn.addEventListener('click', () => {
      const showing = notesToggleBtn.textContent === 'Hide Note';
      const newShow = !showing;

      updatePencils(newShow);
      notesToggleBtn.textContent = newShow ? 'Hide Note' : 'Show Note';

      if (newShow) shownotesSet.add(seriesId);
      else shownotesSet.delete(seriesId);

      localStorage.setItem('shownotes', Array.from(shownotesSet).join(','));
    });

    // Persistent and Unified Inversion Logic
    let isInverted = localStorage.getItem('replacementUIInverted') === 'true';

    function applyInversion(state) {
      isInverted = state;
      localStorage.setItem('replacementUIInverted', state);

      if (isInverted) {
        popup.style.backgroundColor = '#000';
        popup.style.color = '#fff';

        infoBox.style.backgroundColor = '#111';
        infoBox.style.color = '#fff';
        infoBox.style.borderColor = '#444';

        popup.querySelectorAll('input, select, textarea').forEach(el => {
          el.style.backgroundColor = '#222';
          el.style.color = '#fff';
          el.style.borderColor = '#666';
        });

        popup.querySelectorAll('button').forEach(btn => {
          btn.style.backgroundColor = '#333';
          btn.style.color = '#fff';
          btn.style.borderColor = '#666';
        });
      } else {
        popup.style.backgroundColor = '#fff';
        popup.style.color = '#000';

        infoBox.style.backgroundColor = '#fff';
        infoBox.style.color = '#000';
        infoBox.style.borderColor = '#000';

        popup.querySelectorAll('input, select, textarea').forEach(el => {
          el.style.backgroundColor = '#fff';
          el.style.color = '#000';
          el.style.borderColor = '#888';
        });

        popup.querySelectorAll('button').forEach(btn => {
          btn.style.backgroundColor = '#eee';
          btn.style.color = '#000';
          btn.style.borderColor = '#888';
        });
      }
    }

    invertBtn.addEventListener('click', () => {
      applyInversion(!isInverted);
    });

    const rulesContainer = document.createElement('div');
    rulesContainer.style.display = 'flex';
    rulesContainer.style.flexWrap = 'wrap';
    rulesContainer.style.gap = '10px';
    rulesContainer.style.alignItems = 'center';
    rulesContainer.style.marginBottom = '10px';
    rulesContainer.style.marginTop = '10px';

    const currentFlags = GM_getValue('userFlags', {
      ignoreCapital: false,
      startOfSentence: false,
      allInstances: false,
      preserveFirstCapital: false,
      global: false,
      noTrailingSpace: false,
      insideDialogueOnly: false,
      outsideDialogueOnly: false,
    });

    function createCheckbox(flagKey, labelText) {
      const label = document.createElement('label');
      label.style.userSelect = 'none';
      label.style.fontSize = '13px';
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '4px';
      label.style.whiteSpace = 'nowrap';
      label.style.flex = '0 1 auto';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = currentFlags[flagKey] ?? false;
      input.style.cursor = 'pointer';

      input.addEventListener('change', () => {
        currentFlags[flagKey] = input.checked;
        GM_setValue('userFlags', currentFlags);
      });

      label.appendChild(input);
      label.appendChild(document.createTextNode(labelText));
      return label;
    }

    rulesContainer.appendChild(createCheckbox('ignoreCapital', 'Ignore Capital'));
    rulesContainer.appendChild(createCheckbox('startOfSentence', 'Start of Sentence'));
    rulesContainer.appendChild(createCheckbox('allInstances', 'Fuzzy Match'));
    rulesContainer.appendChild(createCheckbox('preserveFirstCapital', 'Preserve Capital'));
    rulesContainer.appendChild(createCheckbox('global', 'Global'));
    rulesContainer.appendChild(createCheckbox('noTrailingSpace', 'No Trailing Space'));
    rulesContainer.appendChild(createCheckbox('insideDialogueOnly', 'Edit Inside Dialogue'));
    rulesContainer.appendChild(createCheckbox('outsideDialogueOnly', 'Edit Outside Dialogue'));

    popup.appendChild(rulesContainer);

      const listUIContainer = document.createElement('div');
      listUIContainer.style.display = 'none';
      popup.appendChild(listUIContainer);

      const searchInput = document.createElement('input');
      searchInput.type = 'search';
      searchInput.placeholder = 'Search terms...';
      searchInput.style.width = '100%';
      searchInput.style.marginBottom = '10px';
      listUIContainer.appendChild(searchInput);

      const toggleFilter = document.createElement('select');
      ['Current Series', 'Global + Others', 'All'].forEach(optText => {
        const option = document.createElement('option');
        option.textContent = optText;
        toggleFilter.appendChild(option);
      });
      toggleFilter.style.width = '100%';
      toggleFilter.style.marginBottom = '10px';
      listUIContainer.appendChild(toggleFilter);

      const btnContainer = document.createElement('div');
      btnContainer.style.marginBottom = '10px';
      btnContainer.style.textAlign = 'right';

      const exportBtn = document.createElement('button');
      exportBtn.textContent = 'Export';
      styleButton(exportBtn);
      btnContainer.appendChild(exportBtn);
      exportBtn.style.marginRight = '4px';
      exportBtn.style.padding = '2px 4px';

      const importBtn = document.createElement('button');
      importBtn.textContent = 'Import';
      styleButton(importBtn);
      importBtn.style.marginLeft = '4px';
      btnContainer.appendChild(importBtn);
      importBtn.style.padding = '2px 4px';

    const exportCurrentBtn = document.createElement('button');
    exportCurrentBtn.textContent = 'Export Current';
    styleButton(exportCurrentBtn);
    exportCurrentBtn.style.marginRight = '4px';
    exportCurrentBtn.style.padding = '2px 4px';

    const importCurrentBtn = document.createElement('button');
    importCurrentBtn.textContent = 'Import Current';
    styleButton(importCurrentBtn);
    importCurrentBtn.style.marginRight = '4px';
    importCurrentBtn.style.padding = '2px 4px';

    btnContainer.insertBefore(exportCurrentBtn, exportBtn);
    btnContainer.insertBefore(importCurrentBtn, exportBtn);

    exportCurrentBtn.addEventListener('click', function() {
      const seriesId = getCurrentSeriesId();
      if (!seriesId) {
        alert('No current series selected!');
        return;
      }

      const exportData = [];
      for (const key in data) {
        (data[key] || []).forEach(entry => {
          if (entry.series === seriesId) {
            exportData.push(entry);
          }
        });
      }

      if (exportData.length === 0) {
        alert('No entries found for the current series.');
        return;
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `word-replacer-series-${seriesId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    importCurrentBtn.addEventListener('click', function() {
      const seriesId = getCurrentSeriesId();
      if (!seriesId) {
        alert('No current series selected!');
        return;
      }

      const seriesKey = `series-${seriesId}`;
      if (!data[seriesKey]) data[seriesKey] = [];

      const inputFile = document.createElement('input');
      inputFile.type = 'file';
      inputFile.accept = '.json,.txt';

      inputFile.addEventListener('change', (e) => {
        if (!e.target.files.length) return;
        const file = e.target.files[0];
        const reader = new FileReader();

        reader.onload = (event) => {
          try {
            const parsed = JSON.parse(event.target.result);
            if (!Array.isArray(parsed)) {
              alert('Invalid format: must be an array of replacement entries.');
              return;
            }

            parsed.forEach(entry => {
              if (!entry.from || !entry.to) return;
              data[seriesKey].push({
                ...entry,
                series: seriesId,
                enabled: true,
              });
            });

            saveData(data);
            renderList();
            replaceTextInChapter();
          } catch (err) {
            alert('Import failed: ' + err.message);
          }
        };

        reader.readAsText(file);
      });

      inputFile.click();
    });

      listUIContainer.appendChild(btnContainer);

      const listContainer = document.createElement('div');
      listContainer.style.maxHeight = '260px';
      listContainer.style.overflowY = 'auto';
      listContainer.style.borderTop = '1px solid #ddd';
      listContainer.style.paddingTop = '8px';
      listUIContainer.appendChild(listContainer);

      function styleButton(btn) {
        btn.style.padding = '5px 12px';
        btn.style.fontSize = '13px';
        btn.style.cursor = 'pointer';
        btn.style.border = '1px solid #888';
        btn.style.borderRadius = '4px';
        btn.style.backgroundColor = '#eee';
        btn.style.color = '#000';
        btn.style.userSelect = 'none';
      }

    toggleListBtn.addEventListener('click', () => {
      const isShowing = listUIContainer.style.display !== 'none';

      if (!isShowing) {
        listUIContainer.style.display = 'block';
        rulesContainer.style.display = 'none';
        toggleListBtn.textContent = 'List';
        renderList();
      } else {
        listUIContainer.style.display = 'none';
        rulesContainer.style.display = 'flex';
        toggleListBtn.textContent = 'List';
      }
    });

    function getCurrentSeriesId() {
      const urlMatch = location.href.match(/\/novel\/(\d+)\//i);
      if (urlMatch) return urlMatch[1];

      const crumb = document.querySelector('.breadcrumb li.breadcrumb-item a[href*="/novel/"]');
      if (crumb) {
        const crumbMatch = crumb.href.match(/\/novel\/(\d+)\//i);
        if (crumbMatch) return crumbMatch[1];
      }

      return null;
    }

      function renderList() {
        listContainer.innerHTML = '';

        const seriesId = getCurrentSeriesId();
        let keysToShow = [];

        if (toggleFilter.value === 'Current Series') {
          if (seriesId) keysToShow = [`series-${seriesId}`];
          else keysToShow = [];
        } else if (toggleFilter.value === 'Global + Others') {
          keysToShow = Object.keys(data).filter(k => k !== `series-${seriesId}`);
        } else {
          keysToShow = Object.keys(data);
        }

        let allEntries = [];
        keysToShow.forEach(key => {
          if (data[key]) allEntries = allEntries.concat(data[key]);
        });

        const searchLower = searchInput.value.trim().toLowerCase();
        if (searchLower) {
          allEntries = allEntries.filter(e =>
            (e.from && e.from.toLowerCase().includes(searchLower)) ||
            (e.to && e.to.toLowerCase().includes(searchLower))
          );
        }

        if (allEntries.length === 0) {
          const emptyMsg = document.createElement('div');
          emptyMsg.textContent = 'No terms found.';
          emptyMsg.style.fontStyle = 'italic';
          listContainer.appendChild(emptyMsg);
          return;
        }

    allEntries.forEach((entry) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'flex-start';
      row.style.justifyContent = 'space-between';
      row.style.marginBottom = '6px';
      row.style.width = '100%';

      const textContainer = document.createElement('div');
      textContainer.style.display = 'flex';
      textContainer.style.flexDirection = 'row';
      textContainer.style.flexWrap = 'wrap';
      textContainer.style.flexGrow = '1';
      textContainer.style.minWidth = '0';

      const fromSpan = document.createElement('span');
      fromSpan.textContent = entry.from;
      fromSpan.style.cursor = 'pointer';
      fromSpan.style.userSelect = 'none';
      fromSpan.style.color = '#007bff';
      fromSpan.style.wordBreak = 'break-word';
      fromSpan.style.overflowWrap = 'anywhere';
      fromSpan.addEventListener('click', () => {
        openEditDialog(entry);
      });

      const toSpan = document.createElement('span');
      toSpan.textContent = ' → ' + entry.to;
      toSpan.style.marginLeft = '8px';
      toSpan.style.wordBreak = 'break-word';
      toSpan.style.overflowWrap = 'anywhere';

      textContainer.appendChild(fromSpan);
      textContainer.appendChild(toSpan);

      const controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.alignItems = 'center';
      controls.style.flexShrink = '0';
      controls.style.marginLeft = '12px';

      const enabledCheckbox = document.createElement('input');
      enabledCheckbox.type = 'checkbox';
      enabledCheckbox.checked = entry.enabled ?? true;
      enabledCheckbox.title = 'Enable / Disable this replacement';
      enabledCheckbox.style.marginRight = '8px';
      enabledCheckbox.addEventListener('change', () => {
        entry.enabled = enabledCheckbox.checked;
        saveData(data);
        replaceTextInChapter();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '✕';
      deleteBtn.style.cursor = 'pointer';
      styleButton(deleteBtn);
      deleteBtn.title = 'Delete this replacement';
      deleteBtn.addEventListener('click', () => {
        deleteEntry(entry);
      });

      controls.appendChild(enabledCheckbox);
      controls.appendChild(deleteBtn);

      row.appendChild(textContainer);
      row.appendChild(controls);

      listContainer.appendChild(row);
    });
    applyInversion(isInverted);
      }

        function deleteEntry(entry) {
          for (const key in data) {
            const arr = data[key];
            const idx = arr.findIndex(e => e.from === entry.from);
            if (idx >= 0) {
              arr.splice(idx, 1);
              if (arr.length === 0 && key !== 'global') {
                delete data[key];
              }
              saveData(data);
              renderList();
              replaceTextInChapter();
              break;
            }
          }
        }

        function openEditDialog(entry) {
          const modalBg = document.createElement('div');
          Object.assign(modalBg.style, {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 100001,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          });

    const modal = document.createElement('div');
    Object.assign(modal.style, {
      backgroundColor: isInverted ? '#000' : 'white',
      color: isInverted ? '#fff' : '#000',
      padding: '20px',
      borderRadius: '8px',
      width: '320px',
      boxShadow: '0 0 15px rgba(0,0,0,0.5)',
      fontSize: '14px',
    });

          modalBg.appendChild(modal);

          const title = document.createElement('h3');
          title.textContent = 'Edit Replacement';
          title.style.marginTop = '0';
          modal.appendChild(title);

          const fromLabel = document.createElement('label');
          fromLabel.textContent = 'Find: ';
          const fromInput = document.createElement('input');
          fromInput.type = 'text';
          fromInput.value = entry.from;
          fromInput.style.width = '100%';
          fromInput.required = true;
          fromLabel.appendChild(fromInput);
          modal.appendChild(fromLabel);

          modal.appendChild(document.createElement('br'));

          const toLabel = document.createElement('label');
          toLabel.textContent = 'Replace with: ';
          const toInput = document.createElement('input');
          toInput.type = 'text';
          toInput.value = entry.to;
          toInput.style.width = '100%';
          toLabel.appendChild(toInput);
          modal.appendChild(toLabel);

          modal.appendChild(document.createElement('br'));

    	  const noteBtn = document.createElement('button');
          noteBtn.textContent = entry.note ? 'Edit Note' : 'Add Note';
          noteBtn.style.marginTop = '8px';
          noteBtn.style.display = 'block';

          modal.appendChild(noteBtn);
          noteBtn.addEventListener('click', () => openNoteModal(entry, noteBtn));

    function openNoteModal(entry, buttonRef) {
      const noteModalBg = document.createElement('div');
      Object.assign(noteModalBg.style, {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999999,
      });

      const noteModal = document.createElement('div');
      Object.assign(noteModal.style, {
        backgroundColor: '#000',
        color: '#fff',
        border: '1px solid #ccc',
        padding: '20px',
        borderRadius: '8px',
        width: '280px',
        boxShadow: '0 0 15px rgba(0,0,0,0.5)',
        fontSize: '14px',
      });

      noteModalBg.appendChild(noteModal);

      const noteTitle = document.createElement('h3');
      noteTitle.textContent = 'Add Note';
      noteTitle.style.marginTop = '0';
      noteTitle.style.color = 'gold';
      noteModal.appendChild(noteTitle);

      const noteInput = document.createElement('textarea');
      noteInput.rows = 3;
      noteInput.maxLength = 30;
      noteInput.value = entry.note || '';
      noteInput.style.width = '100%';
      noteInput.style.background = '#222';
      noteInput.style.color = '#fff';
      noteInput.placeholder = 'Enter a short note';
      noteModal.appendChild(noteInput);

      const noteSave = document.createElement('button');
      noteSave.textContent = 'Save';
      noteSave.style.marginRight = '10px';
      styleButton(noteSave);

      const noteCancel = document.createElement('button');
      noteCancel.textContent = 'Cancel';
      styleButton(noteCancel);

      noteModal.appendChild(noteSave);
      noteModal.appendChild(noteCancel);

      document.body.appendChild(noteModalBg);

      noteSave.addEventListener('click', () => {
        entry.note = noteInput.value.trim().slice(0, 30);
        if (buttonRef) buttonRef.textContent = entry.note ? 'Edit Note' : 'Add Note';
        document.body.removeChild(noteModalBg);
      });

      noteCancel.addEventListener('click', () => {
        document.body.removeChild(noteModalBg);
      });
    }

          const enabledLabel = document.createElement('label');
          const enabledInput = document.createElement('input');
          enabledInput.type = 'checkbox';
          enabledInput.checked = entry.enabled ?? true;
          enabledLabel.appendChild(enabledInput);
          enabledLabel.append(' Enabled');
          enabledLabel.style.userSelect = 'none';
          modal.appendChild(enabledLabel);

          modal.appendChild(document.createElement('br'));

          const flags = [
            { key: 'ignoreCapital', label: 'Ignore Capitalization' },
            { key: 'startOfSentence', label: 'Match Whether Start of Sentence' },
            { key: 'allInstances', label: 'Fuzzy Match' },
            { key: 'preserveFirstCapital', label: 'Preserve First Capital Letter' },
            { key: 'noTrailingSpace', label: 'No Trailing Space' },
            { key: 'insideDialogueOnly', label: 'Edit Only Inside Dialogue' },
            { key: 'outsideDialogueOnly', label: 'Edit Only Outside Dialogue' },
          ];

          flags.forEach(f => {
            const flagLabel = document.createElement('label');
            const flagInput = document.createElement('input');
            flagInput.type = 'checkbox';
            flagInput.checked = entry[f.key] ?? false;
            flagLabel.appendChild(flagInput);
            flagLabel.append(' ' + f.label);
            flagLabel.style.display = 'block';
            flagLabel.style.userSelect = 'none';
            modal.appendChild(flagLabel);

            flagInput.addEventListener('change', () => {
              entry[f.key] = flagInput.checked;
            });
          });

          modal.appendChild(document.createElement('br'));

          const seriesLabel = document.createElement('label');
          seriesLabel.textContent = 'Series ID (empty = global): ';
          const seriesInput = document.createElement('input');
          seriesInput.type = 'text';
          seriesInput.value = entry.series || '';
          seriesInput.style.width = '100%';
          seriesLabel.appendChild(seriesInput);
          modal.appendChild(seriesLabel);

          modal.appendChild(document.createElement('br'));

          const btnSave = document.createElement('button');
          btnSave.textContent = 'Save';
          btnSave.style.marginRight = '10px';
          styleButton(btnSave);

          const btnCancel = document.createElement('button');
          btnCancel.textContent = 'Cancel';
          styleButton(btnCancel);

          modal.appendChild(btnSave);
          modal.appendChild(btnCancel);

    btnSave.addEventListener('click', () => {
      let f = fromInput.value;
      const t = toInput.value;

      if (entry.noTrailingSpace) {
        f = f.trim();
      }
            const oldSeriesKey = entry.series ? `series-${entry.series}` : 'global';
            const newSeriesKey = seriesInput.value ? `series-${seriesInput.value}` : 'global';

            if (oldSeriesKey !== newSeriesKey) {
              if (data[oldSeriesKey]) {
                const idx = data[oldSeriesKey].indexOf(entry);
                if (idx >= 0) data[oldSeriesKey].splice(idx, 1);
                if (data[oldSeriesKey].length === 0 && oldSeriesKey !== 'global') {
                  delete data[oldSeriesKey];
                }
              }
              if (!data[newSeriesKey]) data[newSeriesKey] = [];
              data[newSeriesKey].push(entry);
              entry.series = seriesInput.value.trim();
            }

            entry.from = f;
            entry.to = t;
            entry.enabled = enabledInput.checked;

            saveData(data);
            renderList();
            replaceTextInChapter();
            closeEditModal();
          });

          btnCancel.addEventListener('click', () => {
            closeEditModal();
          });

          function closeEditModal() {
            modalBg.remove();
          }

          document.body.appendChild(modalBg);
        }

        const addNewLabel = document.createElement('div');
        addNewLabel.textContent = 'Add New Replacement:';
        addNewLabel.style.marginTop = '15px';
        addNewLabel.style.fontWeight = 'bold';
        popup.appendChild(addNewLabel);

    const inputContainer = document.createElement('div');
    inputContainer.style.display = 'flex';
    inputContainer.style.gap = '6px';
    inputContainer.style.marginTop = '6px';
    inputContainer.style.flexWrap = 'nowrap';
    inputContainer.style.alignItems = 'center';

    const fromInputNew = document.createElement('input');
    fromInputNew.placeholder = 'Find';
    fromInputNew.style.flex = '1';
    fromInputNew.style.minWidth = '60px';
    inputContainer.appendChild(fromInputNew);

    const toInputNew = document.createElement('input');
    toInputNew.placeholder = 'Replace with';
    toInputNew.style.flex = '1';
    toInputNew.style.minWidth = '60px';
    inputContainer.appendChild(toInputNew);

    const replaceSuggestionBox = document.createElement('ul');
    Object.assign(replaceSuggestionBox.style, {
      position: 'absolute',
      zIndex: 9999,
      border: '1px solid #ccc',
      background: '#000',
      color: '#fff',
      listStyle: 'none',
      margin: 0,
      padding: 0,
      maxHeight: '120px',
      overflowY: 'auto',
      display: 'none',
      opacity: '1',
    });
    inputContainer.appendChild(replaceSuggestionBox);

    function positionReplaceBox() {
      replaceSuggestionBox.style.display = 'block';
      replaceSuggestionBox.style.left = (toInputNew.offsetLeft) + 'px';
      replaceSuggestionBox.style.top = (toInputNew.offsetTop - replaceSuggestionBox.offsetHeight) + 'px';
    }

    toInputNew.addEventListener('input', () => {
      const val = toInputNew.value.trim().toLowerCase();
      replaceSuggestionBox.innerHTML = '';

      if (val.length < 2) {
        replaceSuggestionBox.style.display = 'none';
        return;
      }

      const allTerms = Object.values(data)
        .flat()
        .map(entry => entry.to)
        .filter((v, i, self) => v && self.indexOf(v) === i);

      const matches = allTerms.filter(term => term.toLowerCase().includes(val));

      if (!matches.length) {
        replaceSuggestionBox.style.display = 'none';
        return;
      }

    matches.forEach(term => {
      const li = document.createElement('li');
      li.textContent = term;
      li.style.padding = '4px 6px';
      li.style.cursor = 'pointer';
      li.style.background = '#000';
      li.style.color = '#fff';

      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        toInputNew.value = term;
        replaceSuggestionBox.style.display = 'none';
      });

      li.addEventListener('mouseover', () => {
        li.style.background = '#111';
      });
      li.addEventListener('mouseout', () => {
        li.style.background = '#000';
      });

      replaceSuggestionBox.appendChild(li);
    });

      positionReplaceBox();
      replaceSuggestionBox.style.display = 'block';
    });

    document.addEventListener('click', (e) => {
      if (!inputContainer.contains(e.target)) {
        replaceSuggestionBox.style.display = 'none';
      }
    });

        const addBtn = document.createElement('button');
        addBtn.textContent = 'Add';
        styleButton(addBtn);

    addBtn.addEventListener('click', () => {
    let f = fromInputNew.value;
    const t = toInputNew.value;

    const noTrailingSpaceChecked = document.querySelector('#noTrailingSpaceCheckboxId')?.checked;
    if (noTrailingSpaceChecked) {
      f = f.trim();
    }

      if (!f) {
        alert('Find term cannot be empty');
        return;
      }

      const seriesId = currentFlags.global ? '' : getCurrentSeriesId();
      const seriesKey = seriesId ? `series-${seriesId}` : 'global';

      if (!data[seriesKey]) data[seriesKey] = [];

      if (data[seriesKey].some(e => e.from.toLowerCase() === f.toLowerCase())) {
        alert('This find term already exists in this series/global.');
        return;
      }

    data[seriesKey].push({
      from: f,
      to: t,
      note: '',
      enabled: true,
      ignoreCapital: currentFlags.ignoreCapital,
      startOfSentence: currentFlags.startOfSentence,
      allInstances: currentFlags.allInstances,
      preserveFirstCapital: currentFlags.preserveFirstCapital,
      series: seriesId || '',
      noTrailingSpace: currentFlags.noTrailingSpace,
      insideDialogueOnly: currentFlags.insideDialogueOnly,
      outsideDialogueOnly: currentFlags.outsideDialogueOnly,
    });

      saveData(data);
      fromInputNew.value = '';
      toInputNew.value = '';
      renderList();
      replaceTextInChapter();
    });

        inputContainer.appendChild(addBtn);
        popup.appendChild(inputContainer);

        exportBtn.addEventListener('click', () => {
          const dataStr = JSON.stringify(data, null, 2);
          const blob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.href = url;
          a.download = 'word-replacer-data.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          URL.revokeObjectURL(url);
        });

        importBtn.addEventListener('click', () => {
          const inputFile = document.createElement('input');
          inputFile.type = 'file';
          inputFile.accept = '.json,.txt';

          inputFile.addEventListener('change', (e) => {
            if (!e.target.files.length) return;
            const file = e.target.files[0];
            const reader = new FileReader();

    function importData(parsed) {
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const key in parsed) {
          if (!data[key]) data[key] = [];
          parsed[key].forEach(newEntry => data[key].push(newEntry));
        }
      } else if (Array.isArray(parsed)) {
        if (!data.global) data.global = [];
        const newPairs = parsed.map(pair => {
          if (!Array.isArray(pair) || pair.length < 2) return null;
          return {
            from: pair[0],
            to: pair[1],
            enabled: true,
            startOfSentence: false,
            ignoreCapital: false,
            allInstances: false,
            preserveFirstCapital: false,
            global: true,
            seriesId: ''
          };
        }).filter(Boolean);
        data.global.push(...newPairs);
      } else {
        alert('Import failed: unsupported format.');
        return;
      }
      saveData(data);
      renderList();
      replaceTextInChapter();
    }

    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        importData(parsed);
        alert('Import successful!');
      } catch (err) {
        alert('Invalid JSON: ' + err.message);
      }
    };
            reader.readAsText(file);
          });

          inputFile.click();
        });

        searchInput.addEventListener('input', renderList);
        toggleFilter.addEventListener('change', renderList);

        renderList();
        applyInversion(isInverted);

        document.body.appendChild(popup);
      }

    })();

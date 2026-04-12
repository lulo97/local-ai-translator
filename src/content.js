// ─────────────────────────────────────────────
//  content.js — Content Script
//  Select text → floating icon → stream result directly
//  marked.min.js is loaded before this file via manifest
// ─────────────────────────────────────────────

(function () {
  "use strict";

  // ── Config ─────────────────────────────────
  const DEBOUNCE_MS = 300;
  const ICON_ID     = "lat-float-icon";
  const BUBBLE_ID   = "lat-bubble";

  // Configure marked: treat single newlines as <br>
  if (typeof marked !== "undefined") {
    marked.setOptions({ breaks: true, gfm: true });
  }

  // ── State ───────────────────────────────────
  let debounceTimer    = null;
  let lastSelectedText = "";
  let lastRange        = null;
  let activePort       = null;

  // ── Bootstrap ───────────────────────────────
  document.addEventListener("mouseup",   onPointerUp);
  document.addEventListener("keyup",     onPointerUp);
  document.addEventListener("mousedown", onPointerDown);

  // Context menu path — background sends mode already detected
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "CONTEXT_MENU_TRANSLATE") {
      startTranslation(msg.text, msg.mode, null);
    }
  });

  // ── Pointer handlers ─────────────────────────
  function onPointerDown(e) {
    const bubble = document.getElementById(BUBBLE_ID);
    const icon   = document.getElementById(ICON_ID);
    if (containedBy(bubble, e.target) || containedBy(icon, e.target)) return;
    removeAll();
  }

  function onPointerUp(e) {
    const bubble = document.getElementById(BUBBLE_ID);
    const icon   = document.getElementById(ICON_ID);
    if (containedBy(bubble, e.target) || containedBy(icon, e.target)) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const sel  = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || text.length < 2) { removeIcon(); return; }

      lastSelectedText = text;
      lastRange        = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      showIcon(lastRange?.getBoundingClientRect() ?? null);
    }, DEBOUNCE_MS);
  }

  function containedBy(parent, child) {
    return parent && child && parent.contains(child);
  }

  // ── Floating icon ────────────────────────────
  function showIcon(rect) {
    removeIcon();
    const icon = document.createElement("div");
    icon.id    = ICON_ID;
    icon.title = "Dịch / Giải thích bằng AI";
    icon.innerHTML = SVG.translate20;

    if (rect) {
      const x = Math.min(rect.right + window.scrollX, window.innerWidth + window.scrollX - 50);
      const y = rect.top + window.scrollY - 44;
      icon.style.left = `${x}px`;
      icon.style.top  = `${y}px`;
    } else {
      icon.style.left = `${window.scrollX + window.innerWidth - 60}px`;
      icon.style.top  = `${window.scrollY + 60}px`;
    }

    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      removeIcon();
      startTranslation(lastSelectedText, detectMode(lastSelectedText), lastRange);
    });

    document.body.appendChild(icon);
  }

  function removeIcon() {
    document.getElementById(ICON_ID)?.remove();
  }

  function removeAll() {
    removeIcon();
    document.getElementById(BUBBLE_ID)?.remove();
    disconnectPort();
  }

  function disconnectPort() {
    if (activePort) {
      try { activePort.disconnect(); } catch {}
      activePort = null;
    }
  }

  // ── Mode detection ────────────────────────────
  function detectMode(text) {
    return text.split(/\s+/).filter(Boolean).length <= 2 ? "explain_word" : "translate";
  }

  // ── Main translation flow ─────────────────────
  function startTranslation(text, mode, range) {
    disconnectPort();

    const bubble     = buildBubble(text, mode, range);
    const resultBody = bubble.querySelector(".lat-result-body");
    const loadingEl  = bubble.querySelector(".lat-loading");

    let rawAccumulator  = "";
    let firstChunk      = true;

    const port = chrome.runtime.connect({ name: "stream" });
    activePort = port;

    port.onMessage.addListener((msg) => {
      if (msg.type === "CHUNK") {
        rawAccumulator += msg.delta;

        // Hide spinner on first real chunk
        if (firstChunk) {
          firstChunk = false;
          loadingEl?.remove();
        }

        const visible = filterThink(rawAccumulator);
        if (resultBody) {
          resultBody.innerHTML = renderMarkdown(visible);
          resultBody.scrollTop = resultBody.scrollHeight;
        }
      } else if (msg.type === "DONE") {
        activePort = null;
        loadingEl?.remove();
        const visible = filterThink(rawAccumulator);
        if (!visible.trim()) {
          showError(bubble, text, mode, range, "Mô hình không trả về kết quả.");
        } else {
          // Final clean render
          if (resultBody) resultBody.innerHTML = renderMarkdown(visible);
          showFooter(bubble, visible);
        }
      } else if (msg.type === "ERROR") {
        activePort = null;
        loadingEl?.remove();
        showError(bubble, text, mode, range, msg.error || "Lỗi không xác định.");
      }
    });

    port.onDisconnect.addListener(() => {
      activePort = null;
    });

    port.postMessage({ type: "TRANSLATE_REQUEST", text, mode });
  }

  // ── Think-tag filter ──────────────────────────
  // Strips complete <think>…</think> blocks.
  // If an opening <think> has arrived but no closing tag yet, hides everything from it onward.
  function filterThink(text) {
    let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
    const openIdx = out.search(/<think>/i);
    if (openIdx !== -1) out = out.slice(0, openIdx);
    return out.trim();
  }

  // ── Markdown render ───────────────────────────
  function renderMarkdown(text) {
    if (typeof marked !== "undefined") {
      return marked.parse(text);
    }
    // Fallback if marked somehow not loaded
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

  // ── Bubble builder ────────────────────────────
  function buildBubble(text, mode, range) {
    document.getElementById(BUBBLE_ID)?.remove();

    const modeLabel = mode === "explain_word" ? "📖 Giải thích từ" : "🔤 Dịch văn bản";
    const preview   = text.length > 60 ? text.slice(0, 57) + "…" : text;

    const bubble = document.createElement("div");
    bubble.id    = BUBBLE_ID;
    bubble.innerHTML = `
      <div class="lat-header">
        <div class="lat-header-left">
          <span class="lat-logo-icon">${SVG.translate16}</span>
          <span class="lat-title">AI Dịch Thuật</span>
          <span class="lat-mode-badge">${esc(modeLabel)}</span>
        </div>
        <button class="lat-close-btn" title="Đóng">${SVG.close16}</button>
      </div>
      <div class="lat-source-preview">"${esc(preview)}"</div>
      <div class="lat-loading">
        <div class="lat-spinner"></div>
        <span>Đang xử lý…</span>
      </div>
      <div class="lat-result-body"></div>`;

    document.body.appendChild(bubble);
    bubble.querySelector(".lat-close-btn")?.addEventListener("click", removeAll);

    positionBubble(bubble, range);
    return bubble;
  }

  // ── Footer (copy button) ──────────────────────
  function showFooter(bubble, plainText) {
    bubble.querySelector(".lat-footer")?.remove();

    const footer = document.createElement("div");
    footer.className = "lat-footer";
    footer.innerHTML = `
      <button class="lat-copy-btn">${SVG.copy} Sao chép</button>
      <span class="lat-powered">llama.cpp · local</span>`;
    bubble.appendChild(footer);

    const copyBtn = footer.querySelector(".lat-copy-btn");
    copyBtn?.addEventListener("click", () => {
      navigator.clipboard.writeText(plainText).then(() => {
        copyBtn.textContent = "✓ Đã sao chép";
        copyBtn.classList.add("lat-copy-success");
        setTimeout(() => {
          copyBtn.innerHTML = `${SVG.copy} Sao chép`;
          copyBtn.classList.remove("lat-copy-success");
        }, 2000);
      });
    });
  }

  // ── Error state ───────────────────────────────
  function showError(bubble, text, mode, range, message) {
    const resultBody = bubble.querySelector(".lat-result-body");
    bubble.querySelector(".lat-loading")?.remove();

    if (resultBody) {
      resultBody.innerHTML = `
        <div class="lat-error-msg">⚠️ ${esc(message)}</div>
        <button class="lat-retry-btn">↺ Thử lại</button>`;

      resultBody.querySelector(".lat-retry-btn")?.addEventListener("click", () => {
        resultBody.innerHTML = "";
        startTranslation(text, mode, range);
      });
    }
  }

  // ── Bubble positioning ────────────────────────
  function positionBubble(bubble, range) {
    bubble.style.visibility = "hidden";

    requestAnimationFrame(() => {
      const bw  = bubble.offsetWidth  || 350;
      const bh  = bubble.offsetHeight || 160;
      const vw  = window.innerWidth;
      const vh  = window.innerHeight;
      const sx  = window.scrollX;
      const sy  = window.scrollY;

      let x, y;

      if (range) {
        const rect = range.getBoundingClientRect();
        x = rect.left + sx;
        y = rect.bottom + sy + 8;

        // Flip above selection if not enough space below
        if (y + bh > sy + vh - 20) y = rect.top + sy - bh - 8;
      } else {
        // Context menu — centre horizontally, near top of viewport
        x = sx + (vw - bw) / 2;
        y = sy + 80;
      }

      // Clamp horizontally
      if (x + bw > sx + vw - 10) x = sx + vw - bw - 10;
      if (x < sx + 10)           x = sx + 10;

      bubble.style.left       = `${x}px`;
      bubble.style.top        = `${y}px`;
      bubble.style.visibility = "visible";
    });
  }

  // ── SVG constants ─────────────────────────────
  const SVG = {
    translate20: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" fill="currentColor"/></svg>`,
    translate16: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" fill="currentColor"/></svg>`,
    close16:     `<svg width="16" height="16" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>`,
    copy:        `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
  };

  // ── Helpers ───────────────────────────────────
  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // alias used in a few places
  const escapeHtml = esc;

})();

// ─────────────────────────────────────────────
//  content.js — Content Script
//  Detects selection → shows floating icon → renders result bubble
// ─────────────────────────────────────────────

(function () {
  "use strict";

  // ── Constants ──────────────────────────────
  const DEBOUNCE_MS = 300;
  const ICON_ID = "lat-float-icon";
  const BUBBLE_ID = "lat-bubble";

  // ── State ──────────────────────────────────
  let debounceTimer = null;
  let lastSelectedText = "";
  let lastRange = null;

  // ── Bootstrap ──────────────────────────────
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("keyup", onMouseUp);
  document.addEventListener("mousedown", onMouseDown);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "CONTEXT_MENU_TRANSLATE") {
      showBubbleAtCaret(msg.text);
    }
  });

  // ── Event handlers ──────────────────────────
  function onMouseDown(e) {
    // Clicking inside the bubble/icon → don't dismiss
    const bubble = document.getElementById(BUBBLE_ID);
    const icon = document.getElementById(ICON_ID);
    if ((bubble && bubble.contains(e.target)) || (icon && icon.contains(e.target))) return;
    removeAll();
  }

  function onMouseUp(e) {
    // Don't trigger from our own UI
    const bubble = document.getElementById(BUBBLE_ID);
    const icon = document.getElementById(ICON_ID);
    if ((bubble && bubble.contains(e.target)) || (icon && icon.contains(e.target))) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (!text || text.length < 2) {
        removeIcon();
        return;
      }

      lastSelectedText = text;
      lastRange = selection.getRangeAt(0);

      const rect = lastRange.getBoundingClientRect();
      showIcon(rect);
    }, DEBOUNCE_MS);
  }

  // ── Floating icon ────────────────────────────
  function showIcon(rect) {
    removeIcon();

    const icon = document.createElement("div");
    icon.id = ICON_ID;
    icon.title = "Dịch bằng AI";
    icon.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" fill="currentColor"/>
      </svg>`;

    // Position: just above the end of selection
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const x = Math.min(rect.right + scrollX, window.innerWidth + scrollX - 50);
    const y = rect.top + scrollY - 44;

    icon.style.left = `${x}px`;
    icon.style.top = `${y}px`;

    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      removeIcon();
      showBubbleAtRange(lastSelectedText, lastRange);
    });

    document.body.appendChild(icon);
  }

  function removeIcon() {
    document.getElementById(ICON_ID)?.remove();
  }

  function removeAll() {
    removeIcon();
    document.getElementById(BUBBLE_ID)?.remove();
  }

  // ── Translation bubble ────────────────────────
  function showBubbleAtRange(text, range) {
    const rect = range ? range.getBoundingClientRect() : { bottom: 100, left: 100, right: 200 };
    showBubble(text, rect);
  }

  function showBubbleAtCaret(text) {
    const rect = { bottom: 200, left: 200, right: 300 };
    showBubble(text, rect);
  }

  function showBubble(text, selectionRect) {
    document.getElementById(BUBBLE_ID)?.remove();

    const bubble = document.createElement("div");
    bubble.id = BUBBLE_ID;

    // Loading state
    bubble.innerHTML = buildLoadingHTML(text);
    positionBubble(bubble, selectionRect);
    document.body.appendChild(bubble);

    // Wire up close button
    bubble.querySelector(".lat-close-btn")?.addEventListener("click", removeAll);

    // Fetch translation
    chrome.runtime.sendMessage(
      { type: "TRANSLATE_REQUEST", text },
      (response) => {
        if (chrome.runtime.lastError) {
          renderError(bubble, "Extension bị ngắt kết nối. Hãy tải lại trang.");
          return;
        }
        if (!response || !response.success) {
          renderError(bubble, response?.error || "Lỗi không xác định.");
          return;
        }
        renderResult(bubble, text, response.data);
      }
    );
  }

  function positionBubble(bubble, rect) {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // Temporarily place off-screen to measure
    bubble.style.visibility = "hidden";
    bubble.style.left = "0px";
    bubble.style.top = "0px";

    // After append we can measure; use rAF to get dimensions
    requestAnimationFrame(() => {
      const bw = bubble.offsetWidth || 350;
      const bh = bubble.offsetHeight || 200;
      const vw = window.innerWidth;

      let x = rect.left + scrollX;
      let y = rect.bottom + scrollY + 8;

      // Clamp horizontally
      if (x + bw > vw + scrollX - 10) x = vw + scrollX - bw - 10;
      if (x < scrollX + 10) x = scrollX + 10;

      // Flip above if not enough room below
      if (y + bh > window.innerHeight + scrollY - 20) {
        y = (rect.top || 0) + scrollY - bh - 8;
      }

      bubble.style.left = `${x}px`;
      bubble.style.top = `${y}px`;
      bubble.style.visibility = "visible";
    });
  }

  // ── HTML builders ─────────────────────────────
  function buildLoadingHTML(text) {
    const preview = text.length > 60 ? text.slice(0, 57) + "…" : text;
    return `
      <div class="lat-header">
        <div class="lat-header-left">
          <span class="lat-logo-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" fill="currentColor"/></svg>
          </span>
          <span class="lat-title">AI Dịch Thuật</span>
        </div>
        <button class="lat-close-btn" title="Đóng">
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>
        </button>
      </div>
      <div class="lat-source-preview">"${escapeHtml(preview)}"</div>
      <div class="lat-loading">
        <div class="lat-spinner"></div>
        <span>Đang dịch…</span>
      </div>`;
  }

  function renderResult(bubble, originalText, data) {
    const modeLabel = data.mode === "translate" ? "🔤 Dịch thuật" : "📖 Phân tích";
    const preview = originalText.length > 60 ? originalText.slice(0, 57) + "…" : originalText;
    const formattedContent = formatMarkdown(data.text);

    bubble.innerHTML = `
      <div class="lat-header">
        <div class="lat-header-left">
          <span class="lat-logo-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" fill="currentColor"/></svg>
          </span>
          <span class="lat-title">AI Dịch Thuật</span>
          <span class="lat-mode-badge">${modeLabel}</span>
        </div>
        <button class="lat-close-btn" title="Đóng">
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>
        </button>
      </div>
      <div class="lat-source-preview">"${escapeHtml(preview)}"</div>
      <div class="lat-result-body">${formattedContent}</div>
      <div class="lat-footer">
        <button class="lat-copy-btn" id="lat-copy-btn">
          <svg width="14" height="14" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/></svg>
          Sao chép
        </button>
        <span class="lat-powered">llama.cpp · local</span>
      </div>`;

    bubble.querySelector(".lat-close-btn")?.addEventListener("click", removeAll);
    bubble.querySelector("#lat-copy-btn")?.addEventListener("click", () => {
      navigator.clipboard.writeText(data.text).then(() => {
        const btn = bubble.querySelector("#lat-copy-btn");
        if (btn) {
          btn.textContent = "✓ Đã sao chép";
          btn.classList.add("lat-copy-success");
          setTimeout(() => {
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/></svg> Sao chép`;
            btn.classList.remove("lat-copy-success");
          }, 2000);
        }
      });
    });
  }

  function renderError(bubble, message) {
    const errDiv = bubble.querySelector(".lat-loading");
    if (errDiv) {
      errDiv.innerHTML = `<div class="lat-error">⚠️ ${escapeHtml(message)}</div>`;
    }
  }

  // ── Helpers ────────────────────────────────────
  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Very lightweight markdown → HTML (bold, sections)
  function formatMarkdown(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Headers ## → styled section
      .replace(/^## (.+)$/gm, '<div class="lat-section-header">$1</div>')
      // Bold **text**
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // Line breaks
      .replace(/\n/g, "<br>");
  }
})();

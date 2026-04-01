// ─────────────────────────────────────────────
//  content.js — Content Script
//  Detects selection → shows floating icon → renders choice bubble → result
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
      // Direct translation from context menu — skip choice bubble
      showBubbleWithMode(msg.text, msg.mode || "translate", null);
    }
  });

  // ── Event handlers ──────────────────────────
  function onMouseDown(e) {
    const bubble = document.getElementById(BUBBLE_ID);
    const icon = document.getElementById(ICON_ID);
    if ((bubble && bubble.contains(e.target)) || (icon && icon.contains(e.target))) return;
    removeAll();
  }

  function onMouseUp(e) {
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
    icon.title = "Dịch / Giải thích bằng AI";
    icon.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" fill="currentColor"/>
      </svg>`;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const x = Math.min(rect.right + scrollX, window.innerWidth + scrollX - 50);
    const y = rect.top + scrollY - 44;

    icon.style.left = `${x}px`;
    icon.style.top = `${y}px`;

    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      removeIcon();
      showChoiceBubble(lastSelectedText, lastRange);
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

  // ── Choice bubble (two-button) ────────────────
  function showChoiceBubble(text, range) {
    document.getElementById(BUBBLE_ID)?.remove();

    const bubble = document.createElement("div");
    bubble.id = BUBBLE_ID;

    const preview = text.length > 60 ? text.slice(0, 57) + "…" : text;

    bubble.innerHTML = `
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
      <div class="lat-choice-buttons">
        <button class="lat-choice-btn lat-translate-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04z"/></svg>
          Dịch văn bản
        </button>
        <button class="lat-choice-btn lat-explain-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
          Giải thích từ
        </button>
      </div>`;

    const rect = range ? range.getBoundingClientRect() : { bottom: 100, left: 100, right: 200 };
    positionBubble(bubble, rect);
    document.body.appendChild(bubble);

    bubble.querySelector(".lat-close-btn")?.addEventListener("click", removeAll);
    bubble.querySelector(".lat-translate-btn")?.addEventListener("click", () => {
      performTranslation(text, "translate", bubble, rect);
    });
    bubble.querySelector(".lat-explain-btn")?.addEventListener("click", () => {
      performTranslation(text, "explain_word", bubble, rect);
    });
  }

  // ── Direct-mode bubble (from context menu) ────
  function showBubbleWithMode(text, mode, range) {
    document.getElementById(BUBBLE_ID)?.remove();

    const bubble = document.createElement("div");
    bubble.id = BUBBLE_ID;
    bubble.innerHTML = buildLoadingHTML(text, mode === "translate" ? "Đang dịch văn bản…" : "Đang phân tích từ…");

    const rect = range
      ? range.getBoundingClientRect()
      : { bottom: 200, left: 200, right: 300 };
    positionBubble(bubble, rect);
    document.body.appendChild(bubble);
    bubble.querySelector(".lat-close-btn")?.addEventListener("click", removeAll);

    chrome.runtime.sendMessage(
      { type: "TRANSLATE_REQUEST", text, mode },
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

  // ── Perform translation after choice ─────────
  function performTranslation(text, mode, bubble, rect) {
    const loadingLabel = mode === "translate" ? "Đang dịch văn bản…" : "Đang phân tích từ…";
    bubble.innerHTML = buildLoadingHTML(text, loadingLabel);
    bubble.querySelector(".lat-close-btn")?.addEventListener("click", removeAll);

    chrome.runtime.sendMessage(
      { type: "TRANSLATE_REQUEST", text, mode },
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

    bubble.style.visibility = "hidden";
    bubble.style.left = "0px";
    bubble.style.top = "0px";

    requestAnimationFrame(() => {
      const bw = bubble.offsetWidth || 350;
      const bh = bubble.offsetHeight || 200;
      const vw = window.innerWidth;

      let x = rect.left + scrollX;
      let y = rect.bottom + scrollY + 8;

      if (x + bw > vw + scrollX - 10) x = vw + scrollX - bw - 10;
      if (x < scrollX + 10) x = scrollX + 10;

      if (y + bh > window.innerHeight + scrollY - 20) {
        y = (rect.top || 0) + scrollY - bh - 8;
      }

      bubble.style.left = `${x}px`;
      bubble.style.top = `${y}px`;
      bubble.style.visibility = "visible";
    });
  }

  // ── HTML builders ─────────────────────────────
  function buildLoadingHTML(text, loadingLabel = "Đang xử lý…") {
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
        <span>${escapeHtml(loadingLabel)}</span>
      </div>`;
  }

  function renderResult(bubble, originalText, data) {
    const modeLabel = data.mode === "translate" ? "🔤 Dịch văn bản" : "📖 Giải thích từ";
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

  function formatMarkdown(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/^## (.+)$/gm, '<div class="lat-section-header">$1</div>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }
})();
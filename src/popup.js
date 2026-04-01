// ─────────────────────────────────────────────
//  popup.js — Popup Window Logic
// ─────────────────────────────────────────────

const inputEl       = document.getElementById("popup-input");
const translateBtn  = document.getElementById("popup-translate-btn");
const clearBtn      = document.getElementById("popup-clear-btn");
const loadingEl     = document.getElementById("popup-loading");
const errorEl       = document.getElementById("popup-error");
const resultWrap    = document.getElementById("popup-result-wrap");
const resultBody    = document.getElementById("popup-result-body");
const resultMode    = document.getElementById("popup-result-mode");
const copyBtn       = document.getElementById("popup-copy-btn");
const statusBar     = document.getElementById("popup-status-bar");
const portInput     = document.getElementById("popup-port");
const thresholdInput= document.getElementById("popup-threshold");
const saveBtn       = document.getElementById("popup-save-btn");

let lastResultText = "";

// ── Load saved settings ──────────────────────
chrome.storage.sync.get(["port", "threshold"], (data) => {
  if (data.port)      portInput.value      = data.port;
  if (data.threshold) thresholdInput.value = data.threshold;
  updateStatusBar(data.port || 8080);
});

// ── Save settings ────────────────────────────
saveBtn.addEventListener("click", () => {
  const port      = parseInt(portInput.value) || 8080;
  const threshold = parseInt(thresholdInput.value) || 30;
  chrome.storage.sync.set({ port, threshold }, () => {
    saveBtn.textContent = "✓ Đã lưu";
    saveBtn.style.background = "#137333";
    setTimeout(() => {
      saveBtn.textContent = "Lưu";
      saveBtn.style.background = "";
    }, 1500);
    updateStatusBar(port);
  });
});

function updateStatusBar(port) {
  statusBar.textContent = `llama.cpp · localhost:${port}`;
}

// ── Translate button ─────────────────────────
translateBtn.addEventListener("click", runTranslation);

inputEl.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runTranslation();
});

clearBtn.addEventListener("click", () => {
  inputEl.value = "";
  hideResult();
  hideError();
  inputEl.focus();
});

// ── Core flow ────────────────────────────────
function runTranslation() {
  const text = inputEl.value.trim();
  if (!text) {
    inputEl.focus();
    return;
  }

  setLoading(true);
  hideResult();
  hideError();

  chrome.runtime.sendMessage({ type: "TRANSLATE_REQUEST", text }, (response) => {
    setLoading(false);

    if (chrome.runtime.lastError) {
      showError("Extension bị ngắt kết nối. Hãy tải lại extension.");
      return;
    }

    if (!response || !response.success) {
      showError(response?.error || "Lỗi không xác định từ server.");
      return;
    }

    lastResultText = response.data.text;
    showResult(response.data);
  });
}

// ── UI helpers ────────────────────────────────
function setLoading(active) {
  translateBtn.disabled = active;
  loadingEl.classList.toggle("visible", active);
}

function showResult(data) {
  resultMode.textContent = data.mode === "translate" ? "🔤 Dịch thuật" : "📖 Phân tích";
  resultBody.innerHTML = formatMarkdown(data.text);
  resultWrap.classList.add("visible");
}

function hideResult() {
  resultWrap.classList.remove("visible");
  lastResultText = "";
}

function showError(msg) {
  errorEl.textContent = "⚠️ " + msg;
  errorEl.classList.add("visible");
}

function hideError() {
  errorEl.classList.remove("visible");
}

// ── Copy button ───────────────────────────────
copyBtn.addEventListener("click", () => {
  if (!lastResultText) return;
  navigator.clipboard.writeText(lastResultText).then(() => {
    copyBtn.textContent = "✓ Đã sao chép";
    copyBtn.classList.add("success");
    setTimeout(() => {
      copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> Sao chép`;
      copyBtn.classList.remove("success");
    }, 2000);
  });
});

// ── Markdown formatter (same as content.js) ───
function formatMarkdown(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^## (.+)$/gm, '<div class="section-header">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

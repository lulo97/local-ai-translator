// ─────────────────────────────────────────────
//  popup.js — Popup Window Logic (streaming)
// ─────────────────────────────────────────────

// Configure marked
if (typeof marked !== "undefined") {
  marked.setOptions({ breaks: true, gfm: true });
}

// ── DOM refs ──────────────────────────────────
const inputEl      = document.getElementById("popup-input");
const translateBtn = document.getElementById("popup-translate-btn");
const clearBtn     = document.getElementById("popup-clear-btn");
const loadingEl    = document.getElementById("popup-loading");
const errorMsgEl   = document.getElementById("popup-error-msg");
const retryBtn     = document.getElementById("popup-retry-btn");
const resultWrap   = document.getElementById("popup-result-wrap");
const resultBody   = document.getElementById("popup-result-body");
const resultMode   = document.getElementById("popup-result-mode");
const copyBtn      = document.getElementById("popup-copy-btn");
const statusBar    = document.getElementById("popup-status-bar");
const portInput    = document.getElementById("popup-port");
const saveBtn      = document.getElementById("popup-save-btn");

// ── State ─────────────────────────────────────
let activePort       = null;
let rawAccumulator   = "";
let lastText         = "";
let lastMode         = "translate";

// ── Load saved settings ───────────────────────
chrome.storage.sync.get(["port"], (data) => {
  if (data.port) portInput.value = data.port;
  updateStatusBar(data.port || 8080);
});

// ── Save port ─────────────────────────────────
saveBtn.addEventListener("click", () => {
  const port = parseInt(portInput.value) || 8080;
  chrome.storage.sync.set({ port }, () => {
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

// ── Translate button ──────────────────────────
translateBtn.addEventListener("click", runTranslation);

inputEl.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runTranslation();
});

clearBtn.addEventListener("click", () => {
  disconnectPort();
  inputEl.value = "";
  hideAll();
  inputEl.focus();
});

retryBtn.addEventListener("click", () => {
  if (lastText) runTranslationWith(lastText, lastMode);
});

// ── Mode detection ────────────────────────────
function detectMode(text) {
  return text.split(/\s+/).filter(Boolean).length <= 2 ? "explain_word" : "translate";
}

// ── Think-tag filter ──────────────────────────
function filterThink(text) {
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const openIdx = out.search(/<think>/i);
  if (openIdx !== -1) out = out.slice(0, openIdx);
  return out.trim();
}

// ── Markdown render ───────────────────────────
function renderMarkdown(text) {
  if (typeof marked !== "undefined") return marked.parse(text);
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

// ── Core flow ─────────────────────────────────
function runTranslation() {
  const text = inputEl.value.trim();
  if (!text) { inputEl.focus(); return; }
  const mode = detectMode(text);
  runTranslationWith(text, mode);
}

function runTranslationWith(text, mode) {
  disconnectPort();
  lastText = text;
  lastMode = mode;
  rawAccumulator = "";

  setLoading(true);
  hideError();
  showResultArea(mode);
  resultBody.innerHTML = "";

  const port = chrome.runtime.connect({ name: "stream" });
  activePort = port;

  let firstChunk = true;

  port.onMessage.addListener((msg) => {
    if (msg.type === "CHUNK") {
      rawAccumulator += msg.delta;
      if (firstChunk) {
        firstChunk = false;
        setLoading(false);
      }
      const visible = filterThink(rawAccumulator);
      resultBody.innerHTML = renderMarkdown(visible || "");
      resultBody.scrollTop = resultBody.scrollHeight;

    } else if (msg.type === "DONE") {
      activePort = null;
      setLoading(false);
      const visible = filterThink(rawAccumulator);
      if (!visible.trim()) {
        hideResultArea();
        showError("Mô hình không trả về kết quả.");
      } else {
        resultBody.innerHTML = renderMarkdown(visible);
        updateCopyBtn(visible);
      }

    } else if (msg.type === "ERROR") {
      activePort = null;
      setLoading(false);
      hideResultArea();
      showError(msg.error || "Lỗi không xác định.");
    }
  });

  port.onDisconnect.addListener(() => {
    activePort = null;
    setLoading(false);
  });

  port.postMessage({ type: "TRANSLATE_REQUEST", text, mode });
}

// ── Port helpers ──────────────────────────────
function disconnectPort() {
  if (activePort) {
    try { activePort.disconnect(); } catch {}
    activePort = null;
  }
}

// Disconnect port cleanly when popup closes
window.addEventListener("unload", disconnectPort);

// ── UI helpers ────────────────────────────────
function setLoading(active) {
  translateBtn.disabled = active;
  loadingEl.classList.toggle("visible", active);
}

function showResultArea(mode) {
  resultMode.textContent = mode === "explain_word" ? "📖 Giải thích từ" : "🔤 Dịch văn bản";
  resultWrap.classList.add("visible");
}

function hideResultArea() {
  resultWrap.classList.remove("visible");
}

function hideAll() {
  hideResultArea();
  hideError();
  setLoading(false);
  rawAccumulator = "";
}

function showError(msg) {
  errorMsgEl.textContent = "⚠️ " + msg;
  errorMsgEl.classList.add("visible");
  retryBtn.classList.add("visible");
}

function hideError() {
  errorMsgEl.classList.remove("visible");
  retryBtn.classList.remove("visible");
}

// ── Copy button ───────────────────────────────
function updateCopyBtn(plainText) {
  // Remove old listener by cloning
  const fresh = copyBtn.cloneNode(true);
  copyBtn.parentNode.replaceChild(fresh, copyBtn);

  fresh.addEventListener("click", () => {
    navigator.clipboard.writeText(plainText).then(() => {
      fresh.textContent = "✓ Đã sao chép";
      fresh.classList.add("success");
      setTimeout(() => {
        fresh.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> Sao chép`;
        fresh.classList.remove("success");
      }, 2000);
    });
  });
}

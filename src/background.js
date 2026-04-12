// ─────────────────────────────────────────────
//  background.js — Service Worker
//  Port-based streaming to content script & popup
// ─────────────────────────────────────────────

importScripts("config.js");

// ── Context menu — single merged item ────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "local-translate",
    title: "Dịch / Giải thích bằng AI",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!info.selectionText) return;
  const text = info.selectionText.trim();
  const mode = detectMode(text);
  chrome.tabs.sendMessage(tab.id, {
    type: "CONTEXT_MENU_TRANSLATE",
    text,
    mode,
  });
});

// ── Port-based streaming ─────────────────────
// Both content.js and popup.js connect a port named "stream".
// Background streams SSE chunks back through the port.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "stream") return;

  port.onMessage.addListener(async (message) => {
    if (message.type !== "TRANSLATE_REQUEST") return;
    const { text, mode } = message;
    await handleStreamingTranslation(text, mode, port);
  });
});

// ── Mode detection ───────────────────────────
function detectMode(text) {
  return text.split(/\s+/).filter(Boolean).length <= 2
    ? "explain_word"
    : "translate";
}

// ── Safe port send (port may disconnect mid-stream) ──
function safeSend(port, message) {
  try {
    port.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

// ── Core streaming logic ─────────────────────
async function handleStreamingTranslation(text, mode, port) {
  const { systemPrompt, userPrompt, maxTokens } = buildPrompt(text, mode);

  const payload = {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: true,
    return_progress: true, // ← required for streaming with some builds
    reasoning_format: "auto",
    temperature: 0.8,
    max_tokens: -1, // ← use -1 instead of a fixed limit
    dynatemp_range: 0,
    dynatemp_exponent: 1,
    top_k: 40,
    top_p: 0.95,
    min_p: 0.05,
    xtc_probability: 0,
    xtc_threshold: 0.1,
    typ_p: 1,
    repeat_last_n: 64,
    repeat_penalty: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    dry_multiplier: 0,
    dry_base: 1.75,
    dry_allowed_length: 2,
    dry_penalty_last_n: -1,
    samplers: [
      "penalties",
      "dry",
      "top_n_sigma",
      "top_k",
      "typ_p",
      "top_p",
      "min_p",
      "xtc",
      "temperature",
    ],
    timings_per_token: true,
  };

  if (CONFIG.MODEL && CONFIG.MODEL !== "auto") {
    payload.model = CONFIG.MODEL;
  }

  let response;
  try {
    response = await fetch(CONFIG.ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "*/*",               // ← same as curl
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    safeSend(port, {
      type: "ERROR",
      error: `Không kết nối được server: ${e.message}`,
    });
    return;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    safeSend(port, {
      type: "ERROR",
      error: `Server lỗi ${response.status}: ${body}`,
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = "";

  // Track whether port is still alive
  let portAlive = true;
  port.onDisconnect.addListener(() => {
    portAlive = false;
  });

  try {
    while (portAlive) {
      const { done, value } = await reader.read();
      if (done) {
        safeSend(port, { type: "DONE" });
        break;
      }

      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop(); // keep the incomplete trailing line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          safeSend(port, { type: "DONE" });
          return;
        }

        let json;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }

        // Skip reasoning_content (think tokens from reasoning models)
        const delta = json.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          if (!safeSend(port, { type: "CHUNK", delta })) return;
        }
      }
    }
  } catch (e) {
    safeSend(port, { type: "ERROR", error: `Lỗi đọc stream: ${e.message}` });
  } finally {
    reader.cancel().catch(() => {});
  }
}

// ── Prompt builder ───────────────────────────
function buildPrompt(text, mode) {
  const lang = CONFIG.TARGET_LANGUAGE;

  if (mode === "explain_word") {
    return {
      systemPrompt: `You are a professional English to ${lang} translator and lexicographer.`,
      userPrompt:
        `Provide: (1) a concise English definition, (2) an example sentence, ` +
        `and (3) the ${lang} translation for the word or phrase: "${text}"`,
      maxTokens: CONFIG.MAX_TOKENS_TRANSLATE || 300,
    };
  }

  return {
    systemPrompt: `You are a professional English to ${lang} translator.`,
    userPrompt: `Translate the following text to ${lang}:\n"${text}"`,
    maxTokens: CONFIG.MAX_TOKENS_SUMMARIZE || 600,
  };
}

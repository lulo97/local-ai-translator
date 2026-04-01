// ─────────────────────────────────────────────
//  background.js — Service Worker
//  Handles all llama.cpp API communication
// ─────────────────────────────────────────────

importScripts("config.js");

// ── Context menu setup ──────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "local-translate",
    title: "Dịch văn bản bằng AI",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "local-explain",
    title: "Giải thích từ bằng AI",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!info.selectionText) return;
  const text = info.selectionText.trim();

  if (info.menuItemId === "local-translate") {
    chrome.tabs.sendMessage(tab.id, {
      type: "CONTEXT_MENU_TRANSLATE",
      text,
      mode: "translate",
    });
  } else if (info.menuItemId === "local-explain") {
    chrome.tabs.sendMessage(tab.id, {
      type: "CONTEXT_MENU_TRANSLATE",
      text,
      mode: "explain_word",
    });
  }
});

// ── Message listener ─────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TRANSLATE_REQUEST") {
    const mode = message.mode || "translate";
    handleTranslation(message.text, mode)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }
});

// ── Core translation logic ───────────────────
async function handleTranslation(text, mode) {
  const { systemPrompt, userPrompt, maxTokens } = buildPrompt(text, mode);

  const payload = {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false,
    temperature: 0.8,
    max_tokens: maxTokens,
    top_k: 40,
    top_p: 0.95,
    min_p: 0.05,
    repeat_last_n: 64,
    repeat_penalty: 1,
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
  };

  try {
    const response = await fetch(CONFIG.ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Server Error ${response.status}: ${errorBody}`);
    }

    const result = await response.json();

    const choice = result.choices[0];
    let rawContent = choice.message.content || "";

    if (choice.message.reasoning_content) {
      console.log("Detected reasoning, skipping...");
    }

    const cleanContent = rawContent
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(
        /^(?:\s*\d+\.\s+\*\*[\s\S]*?\*\*:?[\s\S]*?)+(?=\n\n|\d\.|$)/i,
        "",
      )
      .trim();

    return {
      text: cleanContent || rawContent,
      mode,
    };
  } catch (e) {
    console.error("Translation Error:", e);
    throw new Error(`Lỗi kết nối: ${e.message}`);
  }
}

// ── Prompt builder ───────────────────────────
function buildPrompt(text, mode) {
  const lang = CONFIG.TARGET_LANGUAGE;

  if (mode === "explain_word") {
    return {
      systemPrompt: `You are a professional English to ${lang} translator and lexicographer.`,
      userPrompt: `Task: Provide a concise English definition, an example sentence, and the ${lang} translation for the word or phrase below.

Input: "${text}"

Output:`,
      maxTokens: CONFIG.MAX_TOKENS_TRANSLATE || 300,
    };
  }

  // Default: translate mode
  return {
    systemPrompt: `You are a professional English to ${lang} translator.`,
    userPrompt: `Translate the following text to ${lang}:\n"${text}"`,
    maxTokens: CONFIG.MAX_TOKENS_SUMMARIZE || 600,
  };
}
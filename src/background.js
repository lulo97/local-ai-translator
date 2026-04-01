// ─────────────────────────────────────────────
//  background.js — Service Worker
//  Handles all llama.cpp API communication
// ─────────────────────────────────────────────

importScripts("config.js");

// ── Context menu setup ──────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "local-translate",
    title: "Dịch / Giải thích bằng AI",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "local-translate" && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: "CONTEXT_MENU_TRANSLATE",
      text: info.selectionText.trim(),
    });
  }
});

// ── Message listener ─────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TRANSLATE_REQUEST") {
    handleTranslation(message.text)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }
});

// ── Core translation logic ───────────────────
async function handleTranslation(text) {
  const isShort = text.split(' ').length <= 1;

  const { systemPrompt, userPrompt, maxTokens } = buildPrompt(text, isShort);

  // Payload khớp chính xác với cấu trúc curl bạn cung cấp
  const payload = {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false, // Tắt stream
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

    // Lấy nội dung chính (tránh phần suy nghĩ nếu model hỗ trợ reasoning_content)
    const choice = result.choices[0];
    let rawContent = choice.message.content || "";

    // Nếu model trả về phần suy nghĩ trong trường riêng (như DeepSeek/Qwen mới)
    // chúng ta ưu tiên bỏ qua nó.
    if (choice.message.reasoning_content) {
      console.log("Detected reasoning, skipping...");
    }

    // Filter để loại bỏ text suy nghĩ lọt vào content chính (giống logic cũ của bạn)
    const cleanContent = rawContent
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(
        /^(?:\s*\d+\.\s+\*\*[\s\S]*?\*\*:?[\s\S]*?)+(?=\n\n|\d\.|$)/i,
        "",
      )
      .trim();

    return {
      text: cleanContent || rawContent,
      mode: isShort ? "translate" : "summarize",
    };
  } catch (e) {
    console.error("Translation Error:", e);
    throw new Error(`Lỗi kết nối: ${e.message}`);
  }
}

// ── SSE stream reader ────────────────────────
// Reads a streaming response and returns only the final answer text,
// discarding reasoning_content (thinking tokens from Qwen3/DeepSeek-R1 etc.)
async function readSSEStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let contentText = "";
  let reasoningText = ""; // Lưu thêm phần suy nghĩ nếu muốn

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;

      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr === "[DONE]") break;

      try {
        const chunk = JSON.parse(jsonStr);
        const delta = chunk?.choices?.[0]?.delta;
        if (!delta) continue;

        // Lưu content chính
        if (delta.content) {
          contentText += delta.content;
        }

        // Lưu reasoning (tùy chọn - để tránh trả về rỗng nếu model chỉ reasoning)
        if (delta.reasoning_content) {
          reasoningText += delta.reasoning_content;
        }
      } catch (e) {
        console.error("Lỗi parse JSON chunk:", e);
      }
    }
  }

  // Nếu content trống nhưng có reasoning, có thể lấy reasoning làm kết quả fallback
  // hoặc trả về lỗi cụ thể hơn.
  return contentText || (reasoningText ? reasoningText : "");
}

// ── Prompt builder ───────────────────────────
function buildPrompt(text, isShort) {
  const lang = CONFIG.TARGET_LANGUAGE;

  if (isShort) {
    return {
      systemPrompt: `You are a professional english to vietnamese translator`,
      userPrompt: `Task: Provide a concise English definition, an example sentence, and the Vietnamese translation from the input word.
Input: "${text}".
Output:"`,
      maxTokens: 300,
    };
  }

  return {
    systemPrompt: `You are a professional english to vietnamese translator`,
    userPrompt: `Task: Output the Vietnamese translation from the input text.
Input: "${text}".
Output:`,
  };
}

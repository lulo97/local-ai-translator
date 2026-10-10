// Service worker: the only place that talks to llama.cpp (avoids mixed-content/CORS in pages).
importScripts("config.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "lat", title: "Local AI: Translate", contexts: ["selection"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.selectionText && tab?.id != null)
    chrome.tabs.sendMessage(tab.id, { type: "CTX", text: info.selectionText.trim() });
});

// Content scripts open a port "llm" and send {messages}. We stream back CHUNK / DONE / ERROR.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "llm") return;
  const ac = new AbortController();
  port.onDisconnect.addListener(() => ac.abort());
  port.onMessage.addListener((m) => stream(m.messages, port, ac.signal));
});

const send = (port, msg) => { try { port.postMessage(msg); return true; } catch { return false; } };

async function stream(messages, port, signal) {
  const payload = { messages, stream: true, temperature: 0, max_tokens: -1, reasoning_format: "auto" };
  if (CONFIG.MODEL && CONFIG.MODEL !== "auto") payload.model = CONFIG.MODEL;

  let res;
  try {
    res = await fetch(`http://localhost:${CONFIG.PORT}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "*/*" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e) {
    if (!signal.aborted) send(port, { type: "ERROR", error: `Cannot reach server on port ${CONFIG.PORT}: ${e.message}` });
    return;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return send(port, { type: "ERROR", error: `Server error ${res.status}: ${body.slice(0, 300)}` });
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return send(port, { type: "DONE" });
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (data === "[DONE]") return send(port, { type: "DONE" });
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta && !send(port, { type: "CHUNK", delta })) return;
        } catch {}
      }
    }
  } catch (e) {
    if (!signal.aborted) send(port, { type: "ERROR", error: `Stream error: ${e.message}` });
  }
}

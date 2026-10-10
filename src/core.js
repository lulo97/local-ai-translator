// Core: feature registry, LLM client, Shadow-DOM host, result panel.
// Add a feature = LAT.register({...}) in features.js. Nothing else to touch.
var LAT = (() => {
  const features = [];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const strip = (t) => t.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "").trim();
  const json = (s) => { const m = s.match(/[\[{][\s\S]*[\]}]/); if (!m) throw new Error("No JSON in model reply"); return JSON.parse(m[0]); };

  marked.setOptions({ breaks: true, gfm: true });

  // ── LLM (via background service worker) ───────────────
  // llm(messages, {signal, onChunk(textSoFar)}) → Promise<full text>
  function llm(messages, { signal, onChunk } = {}) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error("aborted"));
      const port = chrome.runtime.connect({ name: "llm" });
      let acc = "";
      port.onMessage.addListener((m) => {
        if (m.type === "CHUNK") { acc += m.delta; onChunk && onChunk(strip(acc)); }
        else if (m.type === "DONE") { port.disconnect(); resolve(strip(acc)); }
        else if (m.type === "ERROR") { port.disconnect(); reject(new Error(m.error)); }
      });
      port.onDisconnect.addListener(() => reject(new Error("aborted")));
      signal?.addEventListener("abort", () => { try { port.disconnect(); } catch {} reject(new Error("aborted")); });
      port.postMessage({ messages });
    });
  }
  const chat = (system, user, opts) => llm([{ role: "system", content: system }, { role: "user", content: user }], opts);

  // ── Shadow DOM host (isolates our Tailwind CSS from the page) ──
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${LAT_CSS}</style><div id="app"></div>`;
  document.documentElement.appendChild(host);
  const $app = $(root.getElementById("app"));

  // ── Result panel ──────────────────────────────────────
  let panel = null;
  function closePanel() { if (panel) { panel.ac.abort(); panel.$el.remove(); panel = null; } }

  function openPanel(title, source, wide) {
    closePanel();
    const ac = new AbortController();
    const preview = source.length > 70 ? source.slice(0, 67) + "…" : source;
    const $el = $(`
      <div class="fixed top-14 right-5 ${wide ? "w-[700px]" : "w-[460px]"} max-w-[94vw] max-h-[82vh] flex flex-col bg-white text-gray-700 text-sm rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
          <b class="text-blue-600 text-[13px]">🤖 ${esc(title)}</b>
          <button data-x class="w-7 h-7 rounded-full text-gray-500 hover:bg-gray-200 cursor-pointer">✕</button>
        </div>
        <div class="px-4 pt-2 text-xs italic text-gray-500 truncate">"${esc(preview)}"</div>
        <div data-body class="p-4 overflow-y-auto flex-1"></div>
        <div data-foot style="display:none" class="items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50"></div>
      </div>`);
    $app.append($el);
    const $body = $el.find("[data-body]"), $foot = $el.find("[data-foot]");
    $el.find("[data-x]").on("click", closePanel);

    const api = {
      ac, $el, $body, signal: ac.signal,
      loading(msg = "Processing…") {
        $body.html(`<div class="flex items-center gap-2 text-gray-500"><div class="w-5 h-5 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>${esc(msg)}</div>`);
      },
      reset() { $foot.hide().empty(); api.loading(); },
      html(h) { $body.html(h); },
      msg(t) { $body.html(`<p class="text-gray-600">${esc(t)}</p>`); },
      md(t) { $body.html(`<div class="md">${DOMPurify.sanitize(marked.parse(t))}</div>`); $body.scrollTop($body[0].scrollHeight); },
      error(m, retry) {
        const $b = $(`<button class="mt-2 px-3 py-1 text-xs text-blue-600 border border-gray-300 rounded-full hover:bg-blue-50 cursor-pointer">↺ Retry</button>`).on("click", retry);
        $body.html(`<div class="text-red-600">⚠️ ${esc(m)}</div>`).append($b);
      },
      copy(text) {
        const $c = $(`<button class="px-3 py-1 text-xs text-blue-600 border border-gray-300 rounded-full hover:bg-blue-50 cursor-pointer">Copy</button>`)
          .on("click", () => { navigator.clipboard.writeText(text); $c.text("✓ Copied"); setTimeout(() => $c.text("Copy"), 1500); });
        $foot.empty().css("display", "flex").append($c, `<span class="text-[11px] text-gray-400">llama.cpp · local</span>`);
      },
      // table(headers, rows) → array of <tr> jQuery objects; cells are filled with .text() (safe)
      table(headers, rows) {
        const $t = $(`<table class="w-full border-collapse text-[13px]"><thead><tr>${headers.map((h) => `<th class="border border-gray-300 bg-gray-100 px-2 py-1 text-left">${esc(h)}</th>`).join("")}</tr></thead><tbody></tbody></table>`);
        const trs = rows.map((r) => {
          const $r = $("<tr>");
          r.forEach((c) => $r.append($(`<td class="border border-gray-300 px-2 py-1 align-top">`).text(c)));
          $t.find("tbody").append($r);
          return $r;
        });
        $body.empty().append($(`<div class="overflow-x-auto">`).append($t));
        return trs;
      },
      cell: ($tr, i, text) => $tr.find("td").eq(i).text(text),
    };
    return (panel = api);
  }

  // ── Feature registry ──────────────────────────────────
  // register({ id, label, icon, wide?, run: async ({ text, panel }) => {} })
  const register = (f) => features.push(f);

  function run(f, text) {
    const p = openPanel(f.label, text, f.wide);
    const go = () => {
      p.reset();
      Promise.resolve().then(() => f.run({ text, panel: p })).catch((e) => {
        if (e.message !== "aborted" && !p.signal.aborted) p.error(e.message, go);
      });
    };
    go();
  }

  return { features, register, run, esc, strip, json, llm, chat, openPanel, closePanel, host, $app, LANG: CONFIG.LANG };
})();

// ── Features. To add a button: LAT.register({ id, label, icon, run }) ──
// run({ text, panel }) – use LAT.chat(system, user, {signal: panel.signal, onChunk}) and panel.* to render.
(() => {
  const L = LAT.LANG;
  const wordCount = (t) => t.split(/\s+/).filter(Boolean).length;
  const sleepless = (p) => p.signal.aborted;

  // 1) Translate — word → explain, paragraph → translate (streamed markdown)
  LAT.register({
    id: "translate", label: "Translate", icon: "🌐",
    async run({ text, panel }) {
      const sys = `You are a professional English to ${L} translator and lexicographer. Just answer in compact format, no extra text.`;
      const user = wordCount(text) <= 2
        ? `Provide: (1) a concise English definition, (2) an example sentence, and (3) the ${L} translation for the word or phrase: "${text}"`
        : `Translate the following text to ${L}:\n"${text}"`;
      const out = await LAT.chat(sys, user, { signal: panel.signal, onChunk: (t) => t && panel.md(t) });
      if (!out) throw new Error("Model returned nothing.");
      panel.md(out); panel.copy(out);
    },
  });

  // 2) SentencesTrans — split into sentences, translate one by one into an EN | VI table
  LAT.register({
    id: "sentences", label: "SentencesTrans", icon: "📄", wide: true,
    async run({ text, panel }) {
      const seg = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)]
        .map((s) => s.segment.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 60);
      const trs = panel.table(["EN", "VI"], seg.map((s) => [s, "…"]));
      const sys = `You are a professional English to ${L} translator. Output ONLY the ${L} translation, nothing else.`;
      const out = [];
      for (let i = 0; i < seg.length; i++) {
        if (sleepless(panel)) return;
        try {
          const vi = await LAT.chat(sys, seg[i], { signal: panel.signal });
          panel.cell(trs[i], 1, vi); out.push(`${seg[i]}\t${vi}`);
        } catch (e) {
          if (e.message === "aborted") return;
          panel.cell(trs[i], 1, "⚠ " + e.message);
        }
      }
      panel.copy(out.join("\n"));
    },
  });

  // 3) WordTrans — uncommon words only (see common_words.js) → EnWord | EnMeaning | ViWord | ViMeaning
  const isCommon = (w) => {
    if (LAT_COMMON.has(w)) return true;
    for (const suf of ["s", "es", "ed", "d", "ing", "ly", "er", "est", "ies", "ied"]) {
      if (!w.endsWith(suf)) continue;
      const b = w.slice(0, -suf.length);
      if (LAT_COMMON.has(b) || LAT_COMMON.has(b + "e") || LAT_COMMON.has(b + "y") || (b.length > 2 && b.at(-1) === b.at(-2) && LAT_COMMON.has(b.slice(0, -1)))) return true;
    }
    return false;
  };
  LAT.register({
    id: "words", label: "WordTrans", icon: "🔤", wide: true,
    async run({ text, panel }) {
      const words = [...new Set((text.toLowerCase().match(/[a-z][a-z'-]*/g) || []).map((w) => w.replace(/'s$/, "")))]
        .filter((w) => w.length > 2 && !isCommon(w)).slice(0, 60);
      if (!words.length) return panel.msg("No uncommon words found — everything here is already common vocabulary 🎉");
      const trs = panel.table(["EnWord", "EnMeaning", "ViWord", "ViMeaning"], words.map((w) => [w, "…", "…", "…"]));
      const sys = "You are a lexicographer. Reply with ONLY valid JSON, no commentary.";
      const out = [];
      for (let i = 0; i < words.length; i += 10) {
        if (sleepless(panel)) return;
        const batch = words.slice(i, i + 10);
        const user = `For each English word give: "en" = short English definition, "vi_word" = ${L} translation of the word, "vi" = ${L} translation of that definition. ` +
          `Return ONLY a JSON array like [{"word":"..","en":"..","vi_word":"..","vi":".."}] in the same order.\nWords: ${batch.join(", ")}`;
        try {
          const arr = LAT.json(await LAT.chat(sys, user, { signal: panel.signal }));
          batch.forEach((w, j) => {
            const r = arr.find((x) => String(x.word).toLowerCase() === w) || arr[j] || {};
            const row = [r.en || "—", r.vi_word || "—", r.vi || "—"];
            row.forEach((v, k) => panel.cell(trs[i + j], k + 1, v));
            out.push([w, ...row].join("\t"));
          });
        } catch (e) {
          if (e.message === "aborted") return;
          batch.forEach((_, j) => panel.cell(trs[i + j], 1, "⚠ " + e.message));
        }
      }
      panel.copy(out.join("\n"));
    },
  });

  // 4) MCQ — quiz generated from the highlighted text
  LAT.register({
    id: "mcq", label: "MCQ", icon: "❓",
    async run({ text, panel }) {
      const n = wordCount(text);
      if (n < 25) return panel.msg(`Text is too short (${n} words) to make a quiz. Select at least ~25 words.`);
      const count = n < 60 ? 3 : 5;
      const user = `Create ${count} multiple-choice questions (4 options each, exactly one correct) in English that test comprehension of the text. ` +
        `Return ONLY JSON: {"questions":[{"q":"..","options":["..","..","..",".."],"answer":0,"explain":"short reason"}]} where "answer" is the 0-based index of the correct option. ` +
        `If the text has too little meaningful content, return {"questions":[]}.\n\nTEXT:\n"""${text.slice(0, 6000)}"""`;
      const raw = await LAT.chat("You are a quiz generator. Reply with ONLY valid JSON.", user, { signal: panel.signal });
      let qs = [];
      try { const j = LAT.json(raw); qs = (Array.isArray(j) ? j : j.questions || []).filter((q) => q && q.q && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length); } catch {}
      if (!qs.length) return panel.msg("Couldn't generate questions from this text. Try a longer or more informative passage.");

      let done = 0, score = 0;
      const $score = $(`<div class="text-xs text-gray-500 mb-2">Score: 0 / ${qs.length}</div>`);
      const $wrap = $("<div>").append($score);
      qs.forEach((q, qi) => {
        const $q = $(`<div class="mb-4"><div class="font-semibold mb-1">${qi + 1}. ${LAT.esc(q.q)}</div></div>`);
        const $exp = $(`<div class="hidden mt-1 text-xs text-gray-500"></div>`);
        let locked = false;
        const $opts = q.options.map((o, oi) => $(`<button class="block w-full text-left px-3 py-1.5 mb-1 rounded-lg border border-gray-300 hover:bg-blue-50 cursor-pointer"></button>`).text(String.fromCharCode(65 + oi) + ". " + o).on("click", function () {
          if (locked) return; locked = true;
          $opts[q.answer].removeClass("border-gray-300").addClass("bg-green-100 border-green-500");
          if (oi === q.answer) score++; else $(this).removeClass("border-gray-300").addClass("bg-red-100 border-red-500");
          if (q.explain) $exp.text("💡 " + q.explain).removeClass("hidden");
          $score.text(`Score: ${score} / ${qs.length}` + (++done === qs.length ? " — finished 🎉" : ""));
        }));
        $q.append($opts, $exp); $wrap.append($q);
      });
      panel.$body.empty().append($wrap);
    },
  });
})();

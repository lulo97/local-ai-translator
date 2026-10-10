// Selection → floating toolbar with one button per registered feature.
(() => {
  let timer, lastX = 0, lastY = 0;
  const $app = LAT.$app;
  const removeBar = () => $app.find("[data-bar]").remove();
  const inside = (e) => e.composedPath().includes(LAT.host);

  function showBar(text, x, y) {
    removeBar();
    const $bar = $(`<div data-bar class="absolute flex gap-1 p-1 bg-white border border-gray-300 rounded-lg shadow-lg"></div>`);
    LAT.features.forEach((f) => {
      $(`<button class="px-2 py-1 text-xs font-medium text-blue-600 rounded hover:bg-blue-50 whitespace-nowrap cursor-pointer"></button>`)
        .text(`${f.icon || ""} ${f.label}`)
        .on("click", () => { removeBar(); LAT.run(f, text); })
        .appendTo($bar);
    });
    $bar.on("mousedown", (e) => e.preventDefault()); // keep the page selection
    $app.append($bar);
    const maxX = scrollX + innerWidth - $bar[0].offsetWidth - 10;
    $bar.css({ left: Math.max(scrollX + 5, Math.min(x, maxX)), top: Math.max(scrollY + 5, y - 44) });
  }

  document.addEventListener("mousedown", (e) => { if (!inside(e)) removeBar(); });
  const onUp = (e) => {
    if (inside(e)) return;
    if (e.type === "mouseup") { lastX = e.pageX; lastY = e.pageY; }
    clearTimeout(timer);
    timer = setTimeout(() => {
      const sel = getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (text.length < 2) return removeBar();
      let x = lastX, y = lastY;
      if (sel.rangeCount) {
        const r = sel.getRangeAt(0).getBoundingClientRect();
        if (r.width || r.height) { x = r.left + scrollX; y = r.top + scrollY; }
      }
      showBar(text, x, y);
    }, 200);
  };
  document.addEventListener("mouseup", onUp);
  document.addEventListener("keyup", (e) => { if (e.key === "Escape") { LAT.closePanel(); removeBar(); } else onUp(e); });

  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === "CTX") LAT.run(LAT.features.find((f) => f.id === "translate") || LAT.features[0], m.text);
  });
})();

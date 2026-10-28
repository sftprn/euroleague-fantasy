/* Swipe a bottom sheet down from anywhere on it.
   When the sheet's content is scrolled to the top, a downward swipe moves the whole sheet instead of the content;
   let go after a long enough (or quick) swipe and it closes, a short one springs back.
   Scrolled down → the swipe scrolls the content as usual. Sideways swipes (wide tables) are left alone.
   Usage: SheetDrag.attach(sheetElement, onClose)   — the sheet is positioned with translate(-50%, y) like every sheet here. */
(function(){
  function attach(sheet, onClose){
    if (!sheet || sheet._sheetDrag) return;
    sheet._sheetDrag = true;
    let s = null;                                        // the swipe in progress
    const bodyOf = e => e.target.closest?.(".sh-body");
    sheet.addEventListener("touchstart", e => {
      const body = bodyOf(e);
      if (!body || e.touches.length > 1){ s = null; return; }
      const t = e.touches[0];
      s = {body, x0: t.clientX, y0: t.clientY, top: body.scrollTop, mode: null, dy: 0, last: [{y: t.clientY, t: e.timeStamp}]};
    }, {passive: true});
    sheet.addEventListener("touchmove", e => {
      if (!s || e.touches.length > 1){ if (s?.mode === "drag") finish(false); s = null; return; }
      const t = e.touches[0], dx = t.clientX - s.x0, dy = t.clientY - s.y0;
      if (!s.mode){
        const atTop = s.body.scrollTop <= 0 && s.top <= 0;
        const down = dy > 0 && Math.abs(dy) >= Math.abs(dx);
        if (atTop && down && e.cancelable) e.preventDefault();         // keep the content from bouncing while we decide
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (atTop && down){ s.mode = "drag"; s.y0 = t.clientY; sheet.classList.add("dragging"); }
        else { s.mode = "scroll"; return; }
      }
      if (s.mode !== "drag") return;
      if (e.cancelable) e.preventDefault();
      s.dy = Math.max(0, t.clientY - s.y0);
      sheet.style.transform = `translate(-50%, ${s.dy}px)`;
      s.last.push({y: t.clientY, t: e.timeStamp}); if (s.last.length > 5) s.last.shift();
    }, {passive: false});
    const finish = (allowClose = true) => {
      const d = s; s = null;
      sheet.classList.remove("dragging");
      sheet.style.transform = "";
      if (!allowClose || !d) return;
      const a = d.last[0], b = d.last[d.last.length - 1];
      const speed = (b.y - a.y) / Math.max(1, b.t - a.t);              // px per ms over the last few moves
      if (d.dy > Math.min(120, sheet.offsetHeight * 0.3) || (d.dy > 30 && speed > 0.5)) onClose();
    };
    const end = () => { if (s?.mode === "drag") finish(); else s = null; };
    sheet.addEventListener("touchend", end);
    sheet.addEventListener("touchcancel", () => { if (s?.mode === "drag") finish(false); s = null; });
  }
  window.SheetDrag = {attach};
})();

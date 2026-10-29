/* Feedback sheet: "Give Feedback" opens a sheet with a text field on top (focused, so the keyboard comes up at once) and
   everyone's anonymous feedback below; items the admin marked complete (/admin) show COMPLETED.
   Feedback.open() — call it straight from the tap (iPhone only shows the keyboard for focus() inside a tap).
   Needs assets/sheet-drag.js. */
(function(){
  const CSS = `  /* feedback sheet */
  #fbWrap .scrim{position:fixed;inset:0;background:#000000A6;opacity:0;pointer-events:none;transition:.2s;z-index:10}
  #fbWrap .sheet{position:fixed;left:50%;bottom:0;transform:translate(-50%,100%);width:100%;max-width:480px;background:var(--bg);border:1px solid var(--line);border-bottom:0;
         border-radius:24px 24px 0 0;display:flex;flex-direction:column;height:calc(100vh - env(safe-area-inset-top) - 16px);height:calc(100dvh - env(safe-area-inset-top) - 16px);
         transition:transform .25s ease,visibility .25s;visibility:hidden;z-index:11;overflow:hidden}
  #fbWrap.open .scrim{opacity:1;pointer-events:auto}
  #fbWrap.open .sheet{transform:translate(-50%,0);visibility:visible;transition:transform .25s ease,visibility 0s}   /* visible at once so the field can take focus in the same tap */
  #fbWrap .sheet.dragging{transition:none}
  #fbWrap .grab{flex:none;height:28px;display:grid;place-items:center;cursor:grab;touch-action:none}
  #fbWrap .grab::before{content:"";width:40px;height:4px;background:#3A3A40;border-radius:4px}
  #fbWrap .sh-head{flex:none;display:block;padding:0 16px 14px;border-bottom:1px solid var(--line);touch-action:none}
  #fbWrap .sh-head b{display:block;font-size:20px;font-weight:800}
  #fbWrap .sh-head small{display:block;color:var(--muted);font-size:12.5px;margin-top:2px}
  #fbWrap .fb-form{margin-top:12px}
  #fbWrap textarea{display:block;width:100%;min-height:96px;max-height:200px;resize:none;border:1.5px solid var(--line);border-radius:14px;background:var(--card);color:#fff;
         font:400 16px/1.4 Inter,system-ui,sans-serif;padding:12px 14px;outline:none}
  #fbWrap textarea:focus{border-color:var(--orange)}
  #fbWrap .fb-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px}
  #fbWrap .fb-row small{margin:0;color:var(--dim)}
  #fbWrap .fb-send{height:40px;padding:0 18px;border:0;border-radius:12px;background:var(--orange);color:#fff;font:700 14.5px Inter,system-ui,sans-serif;cursor:pointer}
  #fbWrap .fb-send:disabled{opacity:.4;cursor:default}
  #fbWrap .sh-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:4px 16px calc(24px + env(safe-area-inset-bottom))}
  #fbWrap .fb{padding:13px 2px;border-bottom:1px solid var(--line)}
  #fbWrap .fb p{font-size:14.5px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
  #fbWrap .fb small{display:flex;align-items:center;gap:8px;margin-top:5px;font-size:12px;color:var(--dim)}
  #fbWrap .fb .ok{font-weight:800;font-size:10.5px;letter-spacing:.06em;color:var(--win);background:#123B2A;border-radius:6px;padding:2px 6px}
  #fbWrap .fb.done p{color:var(--muted);text-decoration:line-through;text-decoration-color:#FFFFFF40}
  #fbWrap .fb-empty{color:var(--muted);text-align:center;padding:36px 10px;font-size:14px}
`;
  const HTML = `<div class="scrim" data-fbclose></div>
  <div class="sheet" role="dialog" aria-label="Give feedback">
    <div class="grab" aria-hidden="true"></div>
    <div class="sh-head">
      <b>Feedback</b><small>Anonymous · everyone sees the list</small>
      <form class="fb-form" id="fbForm">
        <textarea id="fbText" maxlength="1000" placeholder="What should be better, fixed or added?" aria-label="Your feedback"></textarea>
        <div class="fb-row"><small id="fbNote"></small><button class="fb-send" id="fbSend" type="submit" disabled>Send</button></div>
      </form>
    </div>
    <div class="sh-body" id="fbList"></div>
  </div>`;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  const fbWrap = document.createElement("div"); fbWrap.id = "fbWrap"; fbWrap.innerHTML = HTML; document.body.appendChild(fbWrap);
  const $ = s => fbWrap.querySelector(s);
  const fbText = $("#fbText"), fbSend = $("#fbSend");
  /* ───────── feedback sheet: write at the top (keyboard opens right away), everyone's past feedback below ───────── */

  let fbItems = null;
  const fbAgo = t => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString("en-GB", {day: "numeric", month: "short", year: "numeric"}); };
  function renderFb(){
    const l = $("#fbList");
    if (!fbItems){ l.innerHTML = `<div class="fb-empty">Loading…</div>`; return; }
    l.innerHTML = fbItems.length ? fbItems.map(f => `<div class="fb${f.done ? " done" : ""}"><p>${esc(f.text)}</p>
        <small>${f.done ? `<span class="ok">COMPLETED</span>` : ""}${esc(fbAgo(f.at))}</small></div>`).join("")
      : `<div class="fb-empty">No feedback yet — be the first.</div>`;
  }
  async function loadFb(){
    try{ const r = await fetch("/api/feedback", {cache: "no-store"}); if (r.ok){ fbItems = (await r.json()).items || []; renderFb(); return; } }catch{}
    if (!fbItems) $("#fbList").innerHTML = `<div class="fb-empty">Couldn't load feedback right now.</div>`;
  }
  function openFb(){
    fbWrap.classList.add("open");
    void fbWrap.offsetHeight;                         // apply "open" now…
    fbText.focus({preventScroll: true});              // in the same tap, so the iPhone keyboard comes up
    $("#fbList").scrollTop = 0; renderFb(); loadFb();
  }
  function closeFb(){ fbText.blur(); fbWrap.classList.remove("open"); }
  fbWrap.querySelector("[data-fbclose]").onclick = closeFb;
  document.addEventListener("keydown", e => { if (e.key === "Escape" && fbWrap.classList.contains("open")) closeFb(); });
  fbText.addEventListener("input", () => { fbSend.disabled = !fbText.value.trim(); $("#fbNote").textContent = fbText.value.length > 800 ? `${1000 - fbText.value.length} left` : ""; });
  $("#fbForm").addEventListener("submit", async e => {
    e.preventDefault();
    const text = fbText.value.trim(); if (!text) return;
    fbSend.disabled = true; $("#fbNote").textContent = "Sending…";
    try{
      const r = await fetch("/api/feedback", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({text})});
      if (!r.ok) throw 0;
      const {item} = await r.json();
      fbItems = [item, ...(fbItems || [])]; renderFb();
      fbText.value = ""; $("#fbNote").textContent = "Thanks! Sent."; fbText.blur();
    }catch{ $("#fbNote").textContent = "Couldn't send — try again."; fbSend.disabled = false; }
  });
  (function(){                                         // drag the grab bar down to close; swipe down on the list once it's at the top
    const sh = fbWrap.querySelector(".sheet"), h = fbWrap.querySelector(".grab");
    let y0 = 0, dy = 0, t0 = 0, id = null;
    const end = () => { if (id == null) return; id = null; sh.classList.remove("dragging");
      const fast = dy > 30 && dy / Math.max(1, Date.now() - t0) > 0.5; sh.style.transform = "";
      if (dy > Math.min(140, sh.offsetHeight * 0.25) || fast) closeFb(); };
    h.addEventListener("pointerdown", e => { id = e.pointerId; y0 = e.clientY; dy = 0; t0 = Date.now(); sh.classList.add("dragging"); h.setPointerCapture(id); });
    h.addEventListener("pointermove", e => { if (e.pointerId !== id) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translate(-50%, ${dy}px)`; });
    h.addEventListener("pointerup", end); h.addEventListener("pointercancel", end);
    SheetDrag.attach(sh, closeFb);
  })();
  window.Feedback = {open: openFb, close: closeFb};
})();

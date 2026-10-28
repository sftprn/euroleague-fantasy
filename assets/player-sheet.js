/* Player sheet — the bottom sheet that opens when you tap a player (team pages, League page → Players).
   Header (name, details, PIR + calculation, cut-out photo) and tabs: Game · Season.
   Game = score board, minutes (tap for each stint), stat grid, and Team stats + News buttons (each opens a second sheet on top).
   The sheet always opens at full height.
   Usage (each page passes what it knows):
     PlayerSheet.init({games: () => games, round: () => round, fantasy: () => Set of player codes on fantasy rosters});
     PlayerSheet.open(player, info)     info = {state, meta}   state = {kind:"up|soon|live|final|none", raw, win, base, share, val, q, t}
     PlayerSheet.update(info)           live refresh while it's open (header, Game tab, Team stats sheet)
     PlayerSheet.isOpen(), PlayerSheet.current(), PlayerSheet.close()
   Needs assets/data.js (ElData). */
(function(){
  const CSS = `#psWrap{--win:#3DDC84;--loss:#FF5A4E;--loss-soft:#3D1715;--orange-soft:#FF6B1A22}
#psWrap .scrim{position:fixed;inset:0;background:#000000A6;opacity:0;pointer-events:none;transition:.2s;z-index:10}
#psWrap .sheet{position:fixed;left:50%;bottom:0;transform:translate(-50%,100%);width:100%;max-width:480px;background:var(--bg);border:1px solid var(--line);border-bottom:0; border-radius:24px 24px 0 0;display:flex;flex-direction:column;max-height:calc(100vh - env(safe-area-inset-top) - 16px);max-height:calc(100dvh - env(safe-area-inset-top) - 16px); transition:transform .25s ease,visibility .25s;visibility:hidden;z-index:11;overflow:hidden}
#psWrap.open .scrim.pm{opacity:1;pointer-events:auto}
#psWrap.open .sheet.pm{transform:translate(-50%,0);visibility:visible}
#psWrap .sheet.pm{height:calc(100vh - env(safe-area-inset-top) - 16px);height:calc(100dvh - env(safe-area-inset-top) - 16px)}
#psWrap .scrim.ts{z-index:12}
#psWrap .sheet.ts{z-index:13}
#psWrap.ts-open .scrim.ts{opacity:1;pointer-events:auto}
#psWrap.ts-open .sheet.ts{transform:translate(-50%,0);visibility:visible}
#psWrap .sh-head.ts-head{justify-content:flex-start;gap:12px}
#psWrap .ts-head b{font-size:18px}
#psWrap .ts-head small{display:block;margin-top:2px}
#psWrap .ts-head img{width:36px;height:36px;object-fit:contain;flex:none}
#psWrap .ts .sh-body{padding-top:0}
#psWrap .sheet.dragging{transition:none}
#psWrap .grab{flex:none;height:30px;display:grid;place-items:center;cursor:grab;touch-action:none}
#psWrap .grab::before{content:"";width:40px;height:4px;background:#3A3A40;border-radius:4px}
#psWrap .sh-head{flex:none;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:0 20px 14px;border-bottom:1px solid var(--line);touch-action:none}
#psWrap .sh-head b{font-size:20px;font-weight:800;display:block}
#psWrap .sh-head small{color:var(--muted);font-size:12.5px}
#psWrap .sh-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:8px 16px calc(22px + env(safe-area-inset-bottom))}
#psWrap .ph-head{align-items:flex-end;padding:0 0 0 20px;min-height:0;gap:8px}
#psWrap .ph-txt{flex:1;min-width:0;padding:2px 0 14px}
#psWrap .ph-txt .big{display:block;font-size:21px;font-weight:800;line-height:1.2;letter-spacing:-.01em;color:#fff}
#psWrap .ph-txt .big.nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}          /* long names shrink to fit one line (fitName) */
#psWrap .ph-txt .sub{display:block;font-size:12px;font-weight:400;color:var(--muted);line-height:1.35;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#psWrap .ph-txt .big.pir{margin-top:10px}
#psWrap .ph-txt .big.pir.none{color:var(--dim)}
#psWrap .ph-pic{flex:none;width:140px;height:118px;margin:-22px 12px 0 0;align-self:flex-end;position:relative;overflow:hidden;pointer-events:none;user-select:none}
#psWrap .ph-pic[hidden]{display:none}
#psWrap .ph-img{position:absolute;top:0;left:50%;height:215%;width:auto;max-width:none;transform:translateX(-50%)}   /* head and shoulders: the rest is cut off at the header's edge */
#psWrap .tabs{position:sticky;top:-8px;z-index:2;display:flex;gap:4px;padding:4px;margin:-8px -16px 12px;background:var(--bg);border-bottom:1px solid var(--line);padding:8px 16px}
#psWrap .tabs button{flex:1;height:34px;border:0;border-radius:10px;background:transparent;color:var(--muted);font:700 13.5px Inter,system-ui,sans-serif;cursor:pointer;transition:background .15s,color .15s}
#psWrap .tabs button.on{background:var(--card-2);color:#fff}
#psWrap .pane{min-height:120px}
#psWrap .pane .empty{color:var(--muted);font-size:13.5px;text-align:center;padding:26px 10px}
#psWrap .pane .loading{color:var(--dim);font-size:13px;text-align:center;padding:26px 10px}
#psWrap .bd{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--card-2);border-radius:16px;padding:16px 12px 14px;margin-bottom:10px}
#psWrap .bd .side{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;text-align:center}
#psWrap .bd .side img{width:44px;height:44px;object-fit:contain}
#psWrap .bd .side b{font-size:13px;font-weight:700;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
#psWrap .bd .side.me b{color:#fff}
#psWrap .bd .mid{text-align:center;flex:none}
#psWrap .bd .mid .sc{font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.1}
#psWrap .bd .mid small{display:block;font-size:12px;font-weight:700;color:var(--muted);margin-top:3px;letter-spacing:.05em}
#psWrap .bd .mid small.lv{color:var(--orange)}
#psWrap .mn{background:var(--card-2);border-radius:16px;padding:12px 14px 4px;margin-bottom:10px;cursor:pointer;-webkit-tap-highlight-color:transparent}
#psWrap .mn-top{display:flex;align-items:center;gap:10px}
#psWrap .mn-top b{font-size:20px;font-weight:800}
#psWrap .mn-top .ct{color:var(--muted);font-size:12.5px;margin-left:auto;text-align:right}
#psWrap .mn-top .chev{flex:none;width:30px;height:30px;border-radius:50%;background:#2E2E33;display:grid;place-items:center;color:#fff}
#psWrap .mn-top .chev svg{width:16px;height:16px;transition:transform .2s}
#psWrap .mn.open .chev svg{transform:rotate(180deg)}
#psWrap .bd[data-game]{cursor:pointer;-webkit-tap-highlight-color:transparent}
#psWrap .bd[data-game]:active{background:#2E2E33}
#psWrap .mn .tl{background:#2E2E33}
#psWrap .mn .tl .q{background:var(--card-2)}
#psWrap .mn .stint:first-of-type{border-top:1px solid var(--line)}
#psWrap .mn .tl-lab{margin-bottom:8px}
#psWrap .btns{display:flex;gap:8px;margin-top:12px}
#psWrap .pane > .btns:first-child{margin-top:0}
#psWrap .tsb{display:block;flex:1;min-width:0;height:46px;border:0;border-radius:14px;background:var(--card-2);color:#fff;font:700 14.5px Inter,system-ui,sans-serif;cursor:pointer}
#psWrap .tsb:active{background:#2E2E33}
#psWrap .lc{display:block;margin:4px 0 14px;overflow:visible}
#psWrap .lc text{font:600 10.5px Inter,system-ui,sans-serif;fill:var(--dim)}
#psWrap .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
#psWrap .grid div{background:var(--card-2);border-radius:12px;padding:9px 6px 8px;text-align:center;min-width:0}
#psWrap .grid b{display:block;font-size:17px;font-weight:800}
#psWrap .grid small{display:block;font-size:10.5px;font-weight:700;color:var(--muted);letter-spacing:.06em;margin-top:2px}
#psWrap .grid em{display:block;font-style:normal;font-size:10.5px;color:var(--dim);margin-top:1px}
#psWrap .grid .wide{grid-column:span 2}
#psWrap .fouls{display:flex;gap:5px;justify-content:center;margin-top:5px}
#psWrap .fouls i{width:8px;height:8px;border-radius:50%;background:#3A3A40}
#psWrap .fouls i.on{background:#fff}
#psWrap .fouls.warn i.on{background:var(--loss)}
#psWrap .tl{position:relative;height:30px;border-radius:8px;background:var(--card-2);overflow:hidden;margin:6px 0 4px}
#psWrap .tl .sg{position:absolute;top:0;bottom:0;background:var(--orange);border-radius:3px}
#psWrap .tl .q{position:absolute;top:0;bottom:0;width:1px;background:var(--bg)}
#psWrap .tl .fut{position:absolute;top:0;bottom:0;right:0;background:repeating-linear-gradient(135deg,#0000 0 5px,#FFFFFF0D 5px 10px)}
#psWrap .tl .now{position:absolute;top:-2px;bottom:-2px;width:2px;background:#fff}
#psWrap .tl-lab{position:relative;height:14px;font-size:10.5px;font-weight:700;color:var(--dim);margin-bottom:12px}
#psWrap .tl-lab span{position:absolute;transform:translateX(-50%)}
#psWrap .mins-sum{display:flex;justify-content:space-between;align-items:baseline;margin:4px 2px 2px}
#psWrap .mins-sum b{font-size:20px;font-weight:800}
#psWrap .mins-sum small{color:var(--muted);font-size:12.5px}
#psWrap .stint{display:flex;justify-content:space-between;padding:10px 2px;border-top:1px solid var(--line);font-size:14px}
#psWrap .mn .stint:last-child{border-bottom:0}
#psWrap .stint span{color:var(--muted)}
#psWrap .avg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}
#psWrap .avg div{background:var(--card-2);border-radius:12px;padding:9px 6px 8px;text-align:center}
#psWrap .avg b{display:block;font-size:17px;font-weight:800}
#psWrap .avg small{display:block;font-size:10.5px;font-weight:700;color:var(--muted);letter-spacing:.06em;margin-top:2px}
#psWrap .chart{display:flex;align-items:stretch;justify-content:center;gap:3px;height:84px;margin:4px 0 14px;position:relative}
#psWrap .chart .col{flex:1;position:relative;min-width:0;max-width:22px}
#psWrap .chart .bar{position:absolute;left:0;right:0;border-radius:3px;background:var(--orange)}
#psWrap .chart .bar.neg{background:var(--loss)}
#psWrap .chart .bar.dnp{background:#3A3A40}
#psWrap .chart .zero{position:absolute;left:0;right:0;height:1px;background:var(--line)}
#psWrap .hist{width:100%;border-collapse:collapse;font-size:13.5px}
#psWrap .hist th{font-size:10.5px;font-weight:800;color:var(--muted);letter-spacing:.06em;text-align:right;padding:6px 4px;border-bottom:1px solid var(--line)}
#psWrap .hist td{text-align:right;padding:9px 4px;border-bottom:1px solid var(--line);white-space:nowrap}
#psWrap .hist th:nth-child(-n+2),#psWrap .hist td:nth-child(-n+2){text-align:left}
#psWrap .hist td.rd{color:var(--muted);width:30px}
#psWrap .hist td b{font-weight:800}
#psWrap .hist tr.cur td{background:var(--orange-soft)}
#psWrap .hist .w{color:var(--win)}
#psWrap .hist .l{color:var(--loss)}
#psWrap .hist-note{font-size:11.5px;color:var(--dim);padding:10px 2px 0}
#psWrap .tmw{overflow-x:auto;margin:0 -16px;padding:0;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
#psWrap .tmt{border-collapse:separate;border-spacing:0;font-size:13px;min-width:100%}
#psWrap .tmt th,#psWrap .tmt td{padding:9px 7px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--line)}
#psWrap .tmt th{font-size:10.5px;font-weight:800;color:var(--muted);letter-spacing:.05em;cursor:pointer;user-select:none}
#psWrap .tmt th.on{color:#fff}
#psWrap .tmt th.on::after{content:" ▾";font-size:9px}
#psWrap .tmt th.on.asc::after{content:" ▴"}
#psWrap .tmt th:last-child,#psWrap .tmt td:last-child{padding-right:16px}
#psWrap .tmt th:first-child,#psWrap .tmt td:first-child{position:sticky;left:0;z-index:1;background:var(--bg);text-align:left;max-width:150px;padding-left:16px;overflow:hidden;text-overflow:ellipsis; box-shadow:6px 0 8px -6px #00000099}
#psWrap .tmt td:first-child span{color:var(--dim);font-size:11px;margin-right:6px;display:inline-block;min-width:14px}
#psWrap .tmt td.pir{font-weight:800}
#psWrap .tmt tr.me td{background:#2A1A10}
#psWrap .tmt tr.me td:first-child{background:#2A1A10;color:var(--orange);font-weight:800}
#psWrap .tmt tr.dnp td{color:var(--dim)}
#psWrap .fan{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--orange);margin-left:5px;vertical-align:middle}
#psWrap .tm-note{font-size:11.5px;color:var(--dim);padding:10px 2px 0}
#psWrap .tabs{overflow-x:auto;scrollbar-width:none}
#psWrap .tabs::-webkit-scrollbar{display:none}
#psWrap .tabs button{flex:1 0 auto;padding:0 10px}
#psWrap .nw{display:block;padding:12px 2px;border-bottom:1px solid var(--line);color:inherit;text-decoration:none}
#psWrap .nw:active{background:#141417}
#psWrap .nw b{display:block;font-size:14.5px;font-weight:700;line-height:1.35}
#psWrap .nw small{display:flex;align-items:center;gap:6px;margin-top:5px;font-size:12px;color:var(--muted)}
#psWrap .nw .src{font-weight:700;color:#C9C9CF}
#psWrap .nw .nlg{font-size:10px;font-weight:800;letter-spacing:.06em;color:var(--dim);border:1px solid var(--line);border-radius:5px;padding:0 4px}
#psWrap .nw-note{font-size:11.5px;color:var(--dim);padding:10px 2px 0;line-height:1.45}`;
  const HTML = `<div class="scrim pm" data-psclose></div>
  <div class="sheet pm" data-own>
    <div class="grab" aria-hidden="true"></div>
    <div class="sh-head ph-head">
      <div class="ph-txt">
        <span class="big nm" data-ps="name" id="shName"></span>
        <span class="sub" data-ps="meta" id="shMeta"></span>
        <span class="big pir" data-ps="pir" id="shPir"></span>
        <span class="sub" data-ps="calc" id="shCalc"></span>
      </div>
      <div class="ph-pic" data-ps="pic" id="shPic"><img class="ph-img" data-ps="img" id="shImg" alt=""></div>
    </div>
    <div class="sh-body">
      <div class="tabs" data-ps="tabs" id="shTabs" role="tablist">
        <button data-tab="game" role="tab">Game</button>
        <button data-tab="season" role="tab">Season</button>
      </div>
      <div class="pane" data-ps="pane" id="shPane"></div>
    </div>
  </div>
  <div class="scrim ts" data-tsclose></div>
  <div class="sheet ts" data-own>
    <div class="grab" aria-hidden="true"></div>
    <div class="sh-head ts-head" data-ps="tshead"></div>
    <div class="sh-body" data-ps="tsbody"></div>
  </div>`;

  let ctx = {games: () => [], round: () => null, fantasy: () => new Set()};
  let wrap, el = {}, cur = null, info = {state: {kind: "none"}, meta: ""}, tab = "game", seq = 0, tmSort = {k: "pir", dir: -1}, minsOpen = false, tsOpen = false, tsSeq = 0, topMode = "team";
  const newsCache = {};

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const r1 = v => Math.round(v * 100) / 100;
  const fmtFull = v => r1(v).toFixed(2);
  const when = u => new Date(u).toLocaleString([], {weekday: "short", hour: "2-digit", minute: "2-digit"});
  const pct = (m, a) => a ? Math.round(m / a * 100) + "%" : "–";
  const sign = v => v > 0 ? "+" + v : String(v);
  const mmss = m => { const sec = Math.round(m * 60); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
  const clockOf = (m, len) => {                           // game minute → "Q2 07:00" / "OT1 03:00"
    const ot = m >= 40 && len > 40 ? Math.min(Math.floor((m - 40) / 5), (len - 40) / 5 - 1) : -1;
    const q = ot >= 0 ? "OT" + (ot + 1) : "Q" + Math.min(4, Math.floor(m / 10) + 1);
    const end = ot >= 0 ? 45 + ot * 5 : Math.min(4, Math.floor(m / 10) + 1) * 10;
    const left = Math.max(0, end - m), sec = Math.round(left * 60);
    return `${q} ${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  };
  const liveTxt = s => { const q = String(s.q || "").replace(/\D/g, ""); return (q ? (+q > 4 ? "OT" : "Q" + q) : "LIVE") + (s.t && s.t !== "00:00" ? " " + String(s.t).replace(/^0/, "") : ""); };
  const shortName = n => { const w = String(n || "").split(" "); return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(" ")}` : n; };
  const ago = t => { const m = Math.round((Date.now() - t) / 60e3); return m < 60 ? `${Math.max(1, m)} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  const store = {
    get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch{ return d; } },
    set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} }
  };
  const gameOf = p => ctx.games().find(g => g.r === ctx.round() && (g.h.c === p.club || g.a.c === p.club));

  function build(){
    if (wrap) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    wrap = document.createElement("div"); wrap.id = "psWrap"; wrap.innerHTML = HTML; document.body.appendChild(wrap);
    wrap.querySelectorAll("[data-ps]").forEach(n => el[n.dataset.ps] = n);
    el.sheet = wrap.querySelector(".sheet.pm"); el.body = el.sheet.querySelector(".sh-body");
    el.ts = wrap.querySelector(".sheet.ts");
    wrap.querySelector("[data-psclose]").onclick = close;
    wrap.querySelector("[data-tsclose]").onclick = closeTeam;
    document.addEventListener("keydown", e => { if (e.key === "Escape" && isOpen()) tsOpen ? closeTeam() : close(); });
    el.tabs.addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b){ tab = b.dataset.tab; renderTab(); } });
    el.pane.addEventListener("click", e => {
      if (e.target.closest(".mn")){ minsOpen = !minsOpen; renderTab(); return; }     // minutes: tap to show / hide each stint
      const tb = e.target.closest(".tsb"); if (tb) openTeam(tb.dataset.top);     // Team stats / News → a sheet on top
      const bd = e.target.closest(".bd[data-game]"); if (bd) GameSheet.open(+bd.dataset.game);   // score box → the game sheet on top
    });
    el.tsbody.addEventListener("click", e => {           // team stats: tap a column to sort
      const th = e.target.closest(".tmt th[data-sort]"); if (!th || th.dataset.sort === "name" || topMode !== "team") return;
      const k = th.dataset.sort; tmSort = tmSort.k === k ? {k, dir: -tmSort.dir} : {k, dir: -1};
      renderTeam();
    });
    // press the grab area (or header) and drag down to close; a short drag springs back
    const drag = (sheet, onClose) => {
      let y0 = 0, dy = 0, t0 = 0, id = null;
      const end = () => {
        if (id == null) return;
        id = null; sheet.classList.remove("dragging");
        const fast = dy > 30 && dy / Math.max(1, Date.now() - t0) > 0.5;
        sheet.style.transform = "";
        if (dy > Math.min(120, sheet.offsetHeight * 0.3) || fast) onClose();
      };
      sheet.querySelectorAll(".grab, .sh-head").forEach(h => {
        h.addEventListener("pointerdown", e => { id = e.pointerId; y0 = e.clientY; dy = 0; t0 = Date.now(); sheet.classList.add("dragging"); h.setPointerCapture(id); });
        h.addEventListener("pointermove", e => { if (e.pointerId !== id) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translate(-50%, ${dy}px)`; });
        h.addEventListener("pointerup", end);
        h.addEventListener("pointercancel", end);
      });
    };
    drag(el.sheet, close); drag(el.ts, closeTeam);
    window.SheetDrag?.attach(el.sheet, close); window.SheetDrag?.attach(el.ts, closeTeam);   // swipe down anywhere once scrolled to the top
  }

  /* header */
  function fitName(){                                     // shrink a long name until it fits on one line (21px → 14px)
    const n = el.name; if (!n) return;
    n.style.fontSize = "";
    for (let f = 21; f > 14 && n.scrollWidth > n.clientWidth + 1; f -= 0.5) n.style.fontSize = f - 0.5 + "px";
  }
  addEventListener("resize", () => { if (isOpen()) fitName(); });
  function fillHead(first){
    const p = cur; if (!p) return;
    const s = info.state || {kind: "none"};
    el.name.textContent = p.name; fitName();
    el.meta.textContent = info.meta || `${p.clubName || p.tv || ""} · ${p.pos || ""}`;
    // e.g. "20.00 −10% = 18.00 × 2" (final) or "live 14.00 × 1"
    const calc = s.kind === "final" ? `${fmtFull(s.raw)} ${s.win ? "+10%" : "−10%"} = ${fmtFull(s.base)} × ${s.share}`
               : s.kind === "live" ? `live ${fmtFull(s.raw)} × ${s.share}` : "";
    const has = s.kind === "final" || s.kind === "live";
    el.pir.textContent = has ? `${fmtFull(s.val)} PIR` : "– PIR";
    el.pir.classList.toggle("none", !has);
    el.calc.textContent = calc; el.calc.hidden = !calc;
    if (!first) return;
    const img = el.img, pic = el.pic;
    pic.hidden = !p.img; img.onerror = () => { pic.hidden = true; };
    if (p.img) img.src = p.img;
    else img.removeAttribute("src");
  }

  /* tabs */
  function paneSet(html){                                 // skip redraws when nothing changed; keep where you've scrolled
    const pane = el.pane;
    if (pane._html === html) return;
    const y = el.body.scrollTop, x = pane.querySelector(".tmw")?.scrollLeft || 0;
    pane.innerHTML = pane._html = html;
    const w = pane.querySelector(".tmw"); if (w) w.scrollLeft = x;
    el.body.scrollTop = y;
  }
  async function renderTab(){
    const p = cur; if (!p) return;
    const s = ++seq, pane = el.pane;
    el.tabs.querySelectorAll("[data-tab]").forEach(b => { b.classList.toggle("on", b.dataset.tab === tab); b.setAttribute("aria-selected", b.dataset.tab === tab); });
    const stale = () => s !== seq || !isOpen();
    if (pane.dataset.tab !== tab + p.code) paneSet(`<div class="loading">Loading…</div>`);
    pane.dataset.tab = tab + p.code;
    try{
      const html = tab === "game" ? await gamePane(p) : await seasonPane(p, h => { if (!stale()) paneSet(h); });
      if (!stale()) paneSet(html);
    }catch{ if (!stale()) paneSet(`<div class="empty">Couldn't load this right now. Try again in a moment.</div>`); }
  }
  /* Game tab: board (as in the League page's game sheet, but boxed) · minutes · stat grid · Team stats button */
  function board(g, b, p){
    const has = b && !b.pending && b.teams?.length === 2, started = Date.parse(g.u) <= Date.now();
    const side = t => `<div class="side${t.c === p.club ? " me" : ""}">${t.cr ? `<img src="${esc(t.cr)}" alt="">` : ""}<b>${esc(t.n || t.tv)}</b></div>`;
    const status = b?.live ? `<small class="lv">${esc(liveTxt(b.q ? b : info.state || {}))}</small>` : has ? `<small>FINAL</small>` : `<small>${started ? "STARTING" : esc(when(g.u))}</small>`;
    return `<div class="bd"${window.GameSheet ? ` data-game="${g.c}" role="button" tabindex="0" aria-label="Open the game"` : ""}>${side(g.h)}<div class="mid"><div class="sc">${has ? `${b.teams[0].pts} – ${b.teams[1].pts}` : "vs"}</div>${status}</div>${side(g.a)}</div>`;
  }
  const btns = (team = true) => `<div class="btns">${team ? `<button class="tsb" type="button" data-top="team">Team stats</button>` : ""}<button class="tsb" type="button" data-top="news">News</button></div>`;
  async function gamePane(p){
    const g = gameOf(p);
    if (!g) return btns(false) + `<div class="empty">No game this round.</div>`;
    if (Date.parse(g.u) > Date.now()) return board(g, null, p) + btns(false) + `<div class="empty">Stats show up once the game starts.</div>`;
    const [b, st] = await Promise.all([ElData.box(g.c), ElData.stretches(g.c).catch(() => null)]);
    if (b.pending) return board(g, b, p) + btns(false) + `<div class="empty">Waiting for the first stats…</div>`;
    const l = await ElData.line(g.c, p.code);
    if (!l || l.min === "DNP" || !l.mins) return board(g, b, p) + btns() + `<div class="empty">Did not play${b.live ? " yet" : ""}.</div>`;
    const pf = Math.min(5, l.pf || 0);
    const cell = (v, lab, extra = "") => `<div><b>${v}</b><small>${lab}</small>${extra}</div>`;
    return board(g, b, p) + minsBlock(st, l, p, b) + `<div class="grid">
      ${cell(l.pts, "PTS")}${cell(l.tr, "REB", `<em>${l.or} off · ${l.dr} def</em>`)}${cell(l.ast, "AST")}${cell(sign(l.pm), "+/−")}
      ${cell(`${l.fg2m}/${l.fg2a}`, "2PT", `<em>${pct(l.fg2m, l.fg2a)}</em>`)}${cell(`${l.fg3m}/${l.fg3a}`, "3PT", `<em>${pct(l.fg3m, l.fg3a)}</em>`)}
      ${cell(`${l.ftm}/${l.fta}`, "FT", `<em>${pct(l.ftm, l.fta)}</em>`)}${cell(l.stl, "STL")}
      ${cell(l.to, "TO")}${cell(l.blk, "BLK", `<em>${l.blka} against</em>`)}${cell(l.fd, "DRAWN", `<em>fouls on him</em>`)}
      <div><b>${l.pf}</b><small>FOULS</small><div class="fouls${pf >= 4 ? " warn" : ""}">${[1,2,3,4,5].map(i => `<i class="${i <= pf ? "on" : ""}"></i>`).join("")}</div></div>
    </div>` + btns();
  }
  function minsBlock(st, l, p, b){                        // boxed: minutes, stints and the on-court bar; tap to list each stint
    const mine = st && !st.pending ? st.pl[p.code] || [] : [];
    const len = st?.len || 40, x = m => (m / len * 100).toFixed(2) + "%";
    const total = mine.reduce((a, [f, t]) => a + t - f, 0);
    const onNow = !!st?.live && mine.length && Math.abs(mine[mine.length - 1][1] - st.now) < 0.01;
    const marks = []; for (let m = 10; m < len; m += m < 40 ? 10 : 5) marks.push(m);
    const labels = []; for (let q = 0; q < 4; q++) labels.push([q * 10 + 5, "Q" + (q + 1)]);
    for (let o = 0; 40 + o * 5 < len; o++) labels.push([42.5 + o * 5, "OT" + (o + 1)]);
    const extra = [mine.length ? `${mine.length} stint${mine.length > 1 ? "s" : ""}` : "", l.starter ? "starter" : "",
                   onNow || (l.on && b.live && !st) ? `<span style="color:var(--win)">on court</span>` : ""].filter(Boolean).join(" · ");
    return `<div class="mn${minsOpen && mine.length ? " open" : ""}" role="button" tabindex="0" aria-expanded="${minsOpen}">
      <div class="mn-top"><b>${esc(l.min && l.min !== "DNP" ? l.min : mmss(total))}</b><span class="ct">${extra}</span>${mine.length ? `<span class="chev"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg></span>` : ""}</div>
      <div class="tl">
        ${mine.map(([f, t]) => `<div class="sg" style="left:${x(f)};width:calc(${x(t - f)} - 1px)"></div>`).join("")}
        ${marks.map(m => `<div class="q" style="left:${x(m)}"></div>`).join("")}
        ${st?.live ? `<div class="fut" style="left:${x(st.now)}"></div><div class="now" style="left:${x(st.now)}"></div>` : ""}
      </div><div class="tl-lab">${labels.map(([m, t]) => `<span style="left:${x(m)}">${t}</span>`).join("")}</div>
      ${minsOpen ? mine.map(([f, t], i) => `<div class="stint">${clockOf(f, len)} → ${onNow && i === mine.length - 1 ? "now" : clockOf(t, len)}<span>${mmss(t - f)}</span></div>`).join("") : ""}
    </div>`;
  }

  /* Team stats: a second sheet over the player sheet with his club's box score */
  const TM_COLS = [["min", "MIN"], ["pts", "PTS"], ["fg2", "2FG"], ["fg3", "3FG"], ["ft", "FT"], ["tr", "REB"], ["ast", "AST"], ["stl", "STL"],
                   ["to", "TO"], ["blk", "BLK"], ["pf", "PF"], ["pm", "+/−"], ["pir", "PIR"]];
  async function teamTable(p){
    const g = gameOf(p);
    if (!g || Date.parse(g.u) > Date.now()) return `<div class="empty">The team's stats show up once the game starts.</div>`;
    const b = await ElData.box(g.c);
    if (b.pending) return `<div class="empty">Waiting for the first stats…</div>`;
    const t = b.teams.find(t => t.pl[p.code]) || b.teams[g.h.c === p.club ? 0 : 1];
    const fantasy = ctx.fantasy();
    const val = (l, k) => k === "min" ? l.mins : k === "fg2" ? l.fg2m : k === "fg3" ? l.fg3m : k === "ft" ? l.ftm : l[k];
    const rows = Object.entries(t.pl).map(([code, l]) => ({code, l, dnp: l.min === "DNP" || !l.mins}));
    rows.sort((a, c) => (a.dnp - c.dnp) || tmSort.dir * (val(a.l, tmSort.k) - val(c.l, tmSort.k)) || c.l.mins - a.l.mins);
    const cell = (l, k) => k === "min" ? esc(l.min) : k === "fg2" ? `${l.fg2m}/${l.fg2a}` : k === "fg3" ? `${l.fg3m}/${l.fg3a}` : k === "ft" ? `${l.ftm}/${l.fta}` : k === "pm" ? sign(l.pm) : l[k];
    return `<div class="tmw"><table class="tmt"><thead><tr><th data-sort="name">Player</th>
        ${TM_COLS.map(([k, lab]) => `<th data-sort="${k}" class="${tmSort.k === k ? "on" + (tmSort.dir > 0 ? " asc" : "") : ""}">${lab}</th>`).join("")}</tr></thead><tbody>
        ${rows.map(({code, l, dnp}) => `<tr class="${code === p.code ? "me" : ""}${dnp ? " dnp" : ""}">
          <td><span>${esc(l.no)}</span>${esc(shortName(l.name))}${fantasy.has(code) && code !== p.code ? '<i class="fan" title="On a fantasy roster"></i>' : ""}</td>
          ${dnp ? `<td colspan="${TM_COLS.length}" style="text-align:left">DNP</td>` : TM_COLS.map(([k]) => `<td class="${k}">${cell(l, k)}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div>
      <div class="tm-note">Tap a column to sort. <i class="fan"></i> on someone's fantasy roster.</div>`;
  }
  async function renderTeam(){
    const p = cur; if (!p || !tsOpen) return;
    const s = ++tsSeq, body = el.tsbody;
    if (topMode === "news"){
      el.tshead.innerHTML = `<div><b>News</b><small>Latest stories about ${esc(p.name)}</small></div>`;
      let html;
      try{ html = await newsPane(p); }catch{ html = `<div class="empty">Couldn't load news right now. Try again in a moment.</div>`; }
      if (s === tsSeq && tsOpen && body._html !== html) body.innerHTML = body._html = html;
      return;
    }
    const g = gameOf(p), t = g ? (g.h.c === p.club ? g.h : g.a) : null;
    el.tshead.innerHTML = `${t?.cr ? `<img src="${esc(t.cr)}" alt="">` : ""}<div><b>${esc(t?.n || p.clubName || p.tv || "")}</b><small>Team stats${g ? ` · vs ${esc((g.h.c === p.club ? g.a : g.h).n || (g.h.c === p.club ? g.a : g.h).tv)}` : ""}</small></div>`;
    let html;
    try{ html = await teamTable(p); }catch{ html = `<div class="empty">Couldn't load this right now. Try again in a moment.</div>`; }
    if (s !== tsSeq || !tsOpen || body._html === html) return;
    const y = body.scrollTop, x = body.querySelector(".tmw")?.scrollLeft || 0;
    body.innerHTML = body._html = html;
    const w = body.querySelector(".tmw"); if (w) w.scrollLeft = x;
    body.scrollTop = y;
  }
  function openTeam(mode = "team"){
    topMode = mode; el.tshead.innerHTML = "";
    tsOpen = true; el.tsbody._html = null; el.tsbody.innerHTML = `<div class="loading">Loading…</div>`; el.tsbody.scrollTop = 0;
    wrap.classList.add("ts-open"); renderTeam();
  }
  function closeTeam(){ tsOpen = false; wrap?.classList.remove("ts-open"); }

  /* Season chart: PIR per round as an orange line with a soft fill */
  function lineChart(rows){
    const pts = rows.map((r, i) => ({i, r, v: !r.loading && r.played && r.pir != null ? r.pir : null}));
    const vals = pts.filter(q => q.v != null).map(q => q.v);
    if (!vals.length) return "";
    const W = Math.max(260, Math.round((el.body.clientWidth || 400) - 32)), H = 180, L = 30, R = 10, T = 12, B = 24;
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 4){ lo -= 2; hi += 2; }
    const raw = (hi - lo) / 4, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => k >= raw);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const n = rows.length, X = i => L + (n > 1 ? i / (n - 1) : .5) * (W - L - R), Y = v => T + (hi - v) / (hi - lo) * (H - T - B);
    const ticks = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
    const on = pts.filter(q => q.v != null);
    const line = on.map((q, k) => `${k ? "L" : "M"}${X(q.i).toFixed(1)},${Y(q.v).toFixed(1)}`).join(" ");
    const base = Y(lo).toFixed(1);
    const area = on.length > 1 ? `${line} L${X(on[on.length - 1].i).toFixed(1)},${base} L${X(on[0].i).toFixed(1)},${base} Z` : "";
    const every = Math.ceil(n / Math.max(1, Math.floor((W - L - R) / 26)));
    return `<svg class="lc" width="100%" viewBox="0 0 ${W} ${H}" aria-label="PIR by round">
      <defs><linearGradient id="psFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF6B1A" stop-opacity=".5"/><stop offset="1" stop-color="#FF6B1A" stop-opacity=".04"/></linearGradient></defs>
      ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#2B2B30"/><text x="${L - 6}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end">${v}</text>`).join("")}
      ${lo < 0 && hi > 0 ? `<line x1="${L}" x2="${W - R}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="#5E5E66"/>` : ""}
      ${area ? `<path d="${area}" fill="url(#psFill)"/>` : ""}
      ${on.length > 1 ? `<path d="${line}" fill="none" stroke="#FF6B1A" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
      ${on.map(q => `<circle cx="${X(q.i).toFixed(1)}" cy="${Y(q.v).toFixed(1)}" r="4.5" fill="${q.r.live ? "#FF6B1A" : "#0A0A0B"}" stroke="#fff" stroke-width="2"><title>R${q.r.r}: ${q.v} PIR</title></circle>`).join("")}
      ${rows.map((r, i) => i % every && i !== n - 1 ? "" : `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${r.r}</text>`).join("")}
    </svg>`;
  }
  async function seasonPane(p, partial){
    const round = ctx.round();
    const draw = rows => {
      const done = rows.filter(r => !r.loading && r.pir != null);
      const played = done.filter(r => r.played);
      const avg = k => played.length ? (played.reduce((a, r) => a + r[k], 0) / played.length) : 0;
      const best = played.length ? Math.max(...played.map(r => r.pir)) : null;
      const chart = lineChart(rows);
      const res = r => r.pending || r.pts == null ? "–" : `<span class="${r.live ? "" : r.win ? "w" : "l"}">${r.live ? "LIVE" : r.win ? "W" : "L"}</span> ${r.pts}–${r.oppPts}`;
      return `<div class="avg">
          <div><b>${played.length}</b><small>GAMES</small></div>
          <div><b>${played.length ? avg("pir").toFixed(1) : "–"}</b><small>AVG PIR</small></div>
          <div><b>${played.length ? mmss(avg("mins")) : "–"}</b><small>AVG MIN</small></div>
          <div><b>${best ?? "–"}</b><small>BEST</small></div>
        </div>${chart}
        <table class="hist"><thead><tr><th>RD</th><th>OPP</th><th>RESULT</th><th>MIN</th><th>PIR</th><th>±10%</th></tr></thead><tbody>
        ${rows.slice().reverse().map(r => `<tr class="${r.r === round ? "cur" : ""}"><td class="rd">${r.r}</td><td>${r.home ? "vs" : "@"} ${esc(r.opp.tv)}</td>
          <td>${r.loading ? "…" : res(r)}</td><td>${r.loading ? "" : r.played ? esc(r.min) : r.pending ? "–" : "DNP"}</td>
          <td><b>${r.loading || r.pir == null ? "" : r.pir}</b></td><td>${r.loading || r.adj == null ? "" : fmtFull(r.adj)}</td></tr>`).join("")}
        </tbody></table>
        <div class="hist-note">Games for ${esc(p.clubName || p.tv)} this season. PIR is raw; ±10% adds the team result like the fantasy score.</div>`;
    };
    let pending = null;
    const rows = await ElData.history(p.code, p.club, ctx.games(), rs => {        // fill in rows as games arrive (at most ~5 redraws a second)
      if (pending) return; pending = setTimeout(() => { pending = null; partial(draw(rs)); }, 200);
    });
    clearTimeout(pending);
    return rows.length ? draw(rows) : `<div class="empty">No games played yet this season.</div>`;
  }
  /* News: latest stories naming the player from the chosen portals (worker/news.js; kept 30 min on the server) */
  async function newsPane(p){
    const key = p.name;
    if (!newsCache[key] || Date.now() - newsCache[key].t > 10 * 60e3){
      const r = await fetch(`/api/news?name=${encodeURIComponent(p.name)}`, {cache: "no-store"});
      if (!r.ok) return `<div class="empty">Couldn't load news right now. Try again in a moment.</div>`;
      newsCache[key] = {t: Date.now(), v: await r.json()};
    }
    const items = newsCache[key].v.items || [];
    const note = `<div class="nw-note">Stories naming ${esc(p.name)} from sportas.lt, lrt.lt, eurobasket.lt, 15min.lt, delfi.lt, krepsinis.net and euroleaguebasketball.net. Tap to read on the site.</div>`;
    return items.length ? items.map(i => `<a class="nw" href="${esc(i.link)}" target="_blank" rel="noopener">
        <b>${esc(i.title)}</b><small><span class="src">${esc(i.source || i.site)}</span>${i.at ? ` · ${ago(i.at)}` : ""}<span class="nlg">${i.lang === "lt" ? "LT" : "EN"}</span></small></a>`).join("") + note
      : `<div class="empty">No recent news about ${esc(p.name)} on these sites.</div>` + note;
  }

  /* public */
  const isOpen = () => !!wrap && wrap.classList.contains("open");
  function open(p, inf = {}){
    build();
    cur = p; info = {state: {kind: "none"}, meta: "", ...inf};
    fillHead(true);
    el.body.scrollTop = 0;
    const k = info.state.kind;
    tab = k === "live" || k === "final" ? "game" : "season";
    minsOpen = false; closeTeam();
    el.pane._html = null; el.pane.dataset.tab = "";
    renderTab();
    wrap.classList.add("open");
  }
  function update(inf = {}){
    if (!isOpen() || !cur) return;
    info = {...info, ...inf};
    fillHead(false);
    if (tab === "game") renderTab();
    if (tsOpen && topMode === "team") renderTeam();
  }
  function close(){ closeTeam(); if (wrap) wrap.classList.remove("open"); }
  window.PlayerSheet = {
    init(c){ ctx = {...ctx, ...c}; },
    open, update, close, isOpen,
    current: () => cur,
  };
})();

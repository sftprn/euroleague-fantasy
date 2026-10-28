/* Game sheet — one game over the page: score board, then a switch between the two teams; each team's tab shows
   its court (the five on court while live, else the starting five) and its full-width box score (sortable).
   Opens from the League page's Games tab and from the player sheet's score box (team pages and League page).
   Usage:
     GameSheet.init({games: () => games, owners: () => Map(player code → [fantasy team names]), people: async () => [{code, img, pos}]});
     GameSheet.open(gameCode, {club})   (club: open on that team's tab; default the home team)   GameSheet.update()   (live refresh while it's open)
     GameSheet.close()          GameSheet.isOpen()
   Needs assets/data.js (ElData). Sits above the player sheet. */
(function(){
  const CSS = `/* game sheet (tap a game in the Games tab): score, Box score / Court */
#gWrap .scrim{position:fixed;inset:0;background:#000000A6;opacity:0;pointer-events:none;transition:.2s;z-index:10}
#gWrap .sheet{position:fixed;left:50%;bottom:0;transform:translate(-50%,100%);width:100%;max-width:480px;background:var(--bg);border:1px solid var(--line);border-bottom:0;
border-radius:24px 24px 0 0;display:flex;flex-direction:column;max-height:calc(100vh - env(safe-area-inset-top) - 16px);max-height:calc(100dvh - env(safe-area-inset-top) - 16px);
height:calc(100dvh - env(safe-area-inset-top) - 16px);transition:transform .25s ease,visibility .25s;visibility:hidden;z-index:11;overflow:hidden}
#gWrap.open .scrim{opacity:1;pointer-events:auto}
#gWrap.open .sheet{transform:translate(-50%,0);visibility:visible}
#gWrap .sheet.dragging{transition:none}
#gWrap .sheet.fit{height:auto}                       /* game not started yet: only as tall as what's in it */
#gWrap .grab{flex:none;height:28px;display:grid;place-items:center;cursor:grab;touch-action:none}
#gWrap .grab::before{content:"";width:40px;height:4px;background:#3A3A40;border-radius:4px}
#gWrap .sh-head{flex:none;display:block;padding:4px 16px 0;border:0;touch-action:none}
#gWrap .sh-body{overflow-x:hidden;flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:0 16px calc(24px + env(safe-area-inset-bottom))}
#gWrap .board{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:16px 14px;margin-bottom:12px}
#gWrap .board .side{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;text-align:center}
#gWrap .board .side img{width:44px;height:44px;object-fit:contain}
#gWrap .board .side b{font-size:13px;font-weight:700;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
#gWrap .board .mid{text-align:center;flex:none}
#gWrap .board .mid .sc{font-size:34px;font-weight:800;letter-spacing:-.02em}
#gWrap .board .mid small{display:block;font-size:12px;font-weight:700;color:var(--muted);margin-top:2px;letter-spacing:.05em}
#gWrap .board .mid small.lv{color:var(--orange)}

/* box score tables */
#gWrap .bx{position:relative;z-index:1;margin:-5px -16px 0;background:var(--bg);border-top:1px solid var(--line)}   /* box score: full sheet width, on the sheet's background, right on the court (hides its last few px) */
#gWrap .bx h3{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;padding:12px 14px 4px}
#gWrap .bx h3 img{width:20px;height:20px;object-fit:contain}
#gWrap .bx h3 span{margin-left:auto;font-size:16px}
#gWrap .tmw{overflow-x:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
#gWrap .tmt{border-collapse:separate;border-spacing:0;font-size:13px;min-width:100%}
#gWrap .tmt th,#gWrap .tmt td{padding:9px 7px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--line)}
#gWrap .tmt tr:last-child td{border-bottom:0}
#gWrap .tmt th{font-size:10.5px;font-weight:800;color:var(--muted);letter-spacing:.05em;cursor:pointer;user-select:none}
#gWrap .tmt th.on{color:#fff}
#gWrap .tmt th.on::after{content:" ▾";font-size:9px}
#gWrap .tmt th.on.asc::after{content:" ▴"}
#gWrap .tmt th:last-child,#gWrap .tmt td:last-child{padding-right:14px}
#gWrap .tmt th:first-child,#gWrap .tmt td:first-child{position:sticky;left:0;z-index:1;background:var(--bg);text-align:left;max-width:160px;padding-left:16px;
overflow:hidden;text-overflow:ellipsis;box-shadow:6px 0 8px -6px #00000099}
#gWrap .tmt td:first-child .no{color:var(--dim);font-size:11px;margin-right:6px;display:inline-block;min-width:14px}
#gWrap .tmt td:first-child small{display:block;font-size:10.5px;color:var(--orange);font-weight:700;margin-top:1px;padding-left:20px;overflow:hidden;text-overflow:ellipsis}
#gWrap .tmt td.pir{font-weight:800}
#gWrap .tmt tr.fan td{background:#1E1712}
#gWrap .tmt tr.fan td:first-child{background:#1E1712}
#gWrap .tmt tr.dnp td{color:var(--dim)}
#gWrap .tmt .oc{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--win);margin-left:5px;vertical-align:middle}

/* court view */
#gWrap .court{position:relative;margin:0}
#gWrap .court h3{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;margin:4px 2px 8px}
#gWrap .court h3 img{width:20px;height:20px;object-fit:contain}
#gWrap .court h3 small{margin-left:auto;font-size:11.5px;color:var(--muted);font-weight:600}
#gWrap .floor{position:relative;width:calc(100% + 32px + 8%);margin:0 calc(-16px - 4%);aspect-ratio:828/551;   /* a little wider than the sheet: the drawing's side edges hide past it */
background:url("assets/court.svg") center/100% 100% no-repeat}
#gWrap .pc{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;width:84px;text-align:center}
#gWrap .pc .ph{width:46px;height:46px;border-radius:50%;background:var(--card-2);overflow:hidden;position:relative;display:grid;place-items:center;font-weight:700;font-size:14px;color:var(--muted);
border:2px solid #FFFFFF33}
#gWrap .pc .ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top}
#gWrap .pc.fan .ph{border-color:var(--orange);box-shadow:0 0 0 3px #FF6B1A40}
#gWrap .pc b{font-size:11.5px;font-weight:700;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-shadow:0 1px 3px #000}
#gWrap .pc .v{font-size:11px;font-weight:800;background:#0A0A0BCC;border-radius:6px;padding:1px 6px;margin-top:2px}
#gWrap .pc .own{position:absolute;top:-6px;right:12px;background:var(--orange);color:#fff;font-size:9.5px;font-weight:800;border-radius:6px;padding:1px 5px;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#gWrap .note{font-size:11.5px;color:var(--dim);padding:6px 2px 0}
#gWrap .sh-body .empty{color:var(--muted);text-align:center;padding:40px 10px;font-size:14px}

#gWrap .seg{display:flex;gap:4px;margin:0 -16px;padding:8px 16px;background:var(--bg);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}   /* team tabs: same look as the player sheet's tabs */
#gWrap .seg button{flex:1;min-width:0;height:34px;border:0;border-radius:10px;background:transparent;color:var(--muted);font:700 13.5px Inter,system-ui,sans-serif;cursor:pointer;transition:background .15s,color .15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 10px}
#gWrap .seg button.on{background:var(--card-2);color:#fff}
#gWrap .scrim{z-index:14}
#gWrap .sheet{z-index:15}
#gWrap h3{margin:0}
#gWrap .pc .ph{flex:none}
#gWrap .board{background:none;border:0;border-radius:0;padding:6px 4px 16px}   /* score sits on the sheet, not in a box */`;
  const HTML = `<div class="scrim" data-gclose></div>
  <div class="sheet" role="dialog" aria-label="Game">
    <div class="grab" aria-hidden="true"></div>
    <div class="sh-head">
      <div class="board" id="board"></div>
      <div class="seg" id="gSeg"></div>
    </div>
    <div class="sh-body" id="gBody"></div>
  </div>`;

  let ctx = {games: () => [], owners: () => new Map(), people: async () => []};
  let wrap, gOpen = null, gView = null, gSort = {k: "pir", dir: -1}, peopleMap = null, gSeq = 0;
  const $ = s => wrap.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const when = u => new Date(u).toLocaleString([], {weekday: "short", hour: "2-digit", minute: "2-digit"});
  const clockOf = b => { const q = String(b.q || "").replace(/\D/g, ""); return (q ? (+q > 4 ? "OT" : "Q" + q) : "LIVE") + (b.t && b.t !== "00:00" ? " " + String(b.t).replace(/^0/, "") : ""); };
  const sign = v => v > 0 ? "+" + v : String(v);
  const shortName = n => { const w = String(n || "").split(" "); return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(" ")}` : n; };
  const TM_COLS = [["min", "MIN"], ["pts", "PTS"], ["fg2", "2FG"], ["fg3", "3FG"], ["ft", "FT"], ["tr", "REB"], ["ast", "AST"], ["stl", "STL"],
                   ["to", "TO"], ["blk", "BLK"], ["pf", "PF"], ["pm", "+/−"], ["pir", "PIR"]];

  function build(){
    if (wrap) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    wrap = document.createElement("div"); wrap.id = "gWrap"; wrap.innerHTML = HTML; document.body.appendChild(wrap);
    wrap.querySelectorAll("[data-gclose]").forEach(x => x.onclick = close);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && gOpen){ e.stopImmediatePropagation(); close(); } }, true);
    $("#gSeg").addEventListener("click", e => { const x = e.target.closest("[data-v]"); if (!x || +x.dataset.v === gView) return; gView = +x.dataset.v; $("#gBody").scrollTop = 0; render(); });
    $("#gBody").addEventListener("click", e => {
      const th = e.target.closest(".tmt th[data-sort]"); if (!th) return;
      const k = th.dataset.sort; gSort = gSort.k === k ? {k, dir: -gSort.dir} : {k, dir: -1};
      render();
    });
    // drag the grab bar or the score down to close (a short drag springs back)
    const sh = $(".sheet");
    let y0 = 0, dy = 0, t0 = 0, id = null;
    const end = () => {
      if (id == null) return;
      id = null; sh.classList.remove("dragging");
      const fast = dy > 30 && dy / Math.max(1, Date.now() - t0) > 0.5;
      sh.style.transform = "";
      if (dy > Math.min(140, sh.offsetHeight * 0.25) || fast) close();
    };
    sh.querySelectorAll(".grab, .board").forEach(h => {
      h.addEventListener("pointerdown", e => { id = e.pointerId; y0 = e.clientY; dy = 0; t0 = Date.now(); sh.classList.add("dragging"); h.setPointerCapture(id); });
      h.addEventListener("pointermove", e => { if (e.pointerId !== id) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translate(-50%, ${dy}px)`; });
      h.addEventListener("pointerup", end);
      h.addEventListener("pointercancel", end);
    });
    window.SheetDrag?.attach(sh, close);                 // swipe down anywhere once scrolled to the top
  }

  function open(gc, opt = {}){                           // opt.club: open on that club's tab (from a player sheet); otherwise the home team
    build();
    gOpen = ctx.games().find(g => g.c === gc); if (!gOpen) return;
    gView = opt.club && opt.club === gOpen.a.c ? 1 : 0;   // 0 = home team, 1 = away team
    wrap.classList.add("open");
    const body = $("#gBody"); body.scrollTop = 0; body._html = null; body.innerHTML = "";
    if (!peopleMap) Promise.resolve(ctx.people()).then(l => { if (l?.length){ peopleMap = new Map(l.map(p => [p.code, p])); if (gOpen) render(); } }).catch(() => {});
    render();
  }
  function close(){ if (wrap) wrap.classList.remove("open"); gOpen = null; }

  async function render(){
    const g = gOpen; if (!g) return;
    const seq = ++gSeq, started = Date.parse(g.u) <= Date.now();
    let b = null;
    if (started){ try{ b = await ElData.box(g.c); }catch{} }
    if (seq !== gSeq || gOpen !== g) return;
    const has = b && !b.pending && b.teams?.length === 2;
    const side = t => `<div class="side">${t.cr ? `<img src="${esc(t.cr)}" alt="">` : ""}<b>${esc(t.n || t.tv)}</b></div>`;
    $("#board").innerHTML = `${side(g.h)}<div class="mid"><div class="sc">${has ? `${b.teams[0].pts} – ${b.teams[1].pts}` : "vs"}</div>
        <small class="${b?.live ? "lv" : ""}">${b?.live ? esc(clockOf(b)) : has ? "FINAL" : started ? "STARTING" : esc(when(g.u))}</small></div>${side(g.a)}`;
    const seg = [g.h, g.a].map((t, i) => `<button data-v="${i}" class="${i === gView ? "on" : ""}">${esc(t.n || t.tv)}</button>`).join("");
    if ($("#gSeg")._html !== seg) $("#gSeg").innerHTML = $("#gSeg")._html = seg;
    $(".sheet").classList.toggle("fit", !started);
    const body = $("#gBody"), y = body.scrollTop, xs = [...body.querySelectorAll(".tmw")].map(w => w.scrollLeft);
    let html;
    if (!started) html = `<div class="empty">Box scores show up once the game starts.</div>`;
    else if (!has) html = `<div class="empty">${b ? "Waiting for the first stats…" : "Couldn't load this game right now."}</div>`;
    else {
      const own = ctx.owners();
      html = courtHalf(b, gView, own) + boxTable(b, gView, own);      // the chosen team: its court, then its box score
    }
    if (body._html !== html){                           // live updates: redraw only on change, keep where you've scrolled
      body.innerHTML = body._html = html;
      body.querySelectorAll(".tmw").forEach((w, i) => w.scrollLeft = xs[i] || 0);
      body.scrollTop = y;
    }
  }
  function boxTable(b, i, own){
    const T = b.teams[i];
    const val = (l, k) => k === "min" ? l.mins : k === "fg2" ? l.fg2m : k === "fg3" ? l.fg3m : k === "ft" ? l.ftm : l[k];
    const rows = Object.entries(T.pl).map(([code, l]) => ({code, l, dnp: l.min === "DNP" || !l.mins}))
      .sort((x, y) => (x.dnp - y.dnp) || gSort.dir * (val(x.l, gSort.k) - val(y.l, gSort.k)) || y.l.mins - x.l.mins);
    const cell = (l, k) => k === "min" ? esc(l.min) : k === "fg2" ? `${l.fg2m}/${l.fg2a}` : k === "fg3" ? `${l.fg3m}/${l.fg3a}` : k === "ft" ? `${l.ftm}/${l.fta}` : k === "pm" ? sign(l.pm) : l[k];
    return `<div class="bx"><div class="tmw"><table class="tmt"><thead><tr><th>Player</th>
        ${TM_COLS.map(([k, lab]) => `<th data-sort="${k}" class="${gSort.k === k ? "on" + (gSort.dir > 0 ? " asc" : "") : ""}">${lab}</th>`).join("")}</tr></thead><tbody>
      ${rows.map(({code, l, dnp}) => { const o = own.get(code); return `<tr class="${o ? "fan" : ""}${dnp ? " dnp" : ""}">
        <td><span class="no">${esc(l.no)}</span>${esc(shortName(l.name))}${b.live && l.on ? '<i class="oc" title="On court"></i>' : ""}${o ? `<small>${esc(o.join(", "))}</small>` : ""}</td>
        ${dnp ? `<td colspan="${TM_COLS.length}" style="text-align:left">DNP</td>` : TM_COLS.map(([k]) => `<td class="${k}">${cell(l, k)}</td>`).join("")}</tr>`; }).join("")}
      </tbody></table></div></div>`;
  }
  // spots on the half court (basket at the top), two rows so the chips never overlap
  const SPOTS = [[50, 27], [17, 33], [83, 33], [31, 76], [69, 76]];
  const POS_RANK = {C: 0, F: 1, G: 2};
  function courtHalf(b, i, own){
    const T = b.teams[i], pp = code => peopleMap?.get(code) || {};
    const five = Object.entries(T.pl).filter(([, l]) => b.live ? l.on : l.starter)
      .sort(([a], [c]) => (POS_RANK[pp(a).pos] ?? 1) - (POS_RANK[pp(c).pos] ?? 1)).slice(0, 5);
    const chips = five.map(([code, l], k) => {
      const o = own.get(code), p = pp(code), [x, y] = SPOTS[k];
      const ini = esc((l.name || "").split(" ").map(w => w[0]).slice(0, 2).join(""));
      return `<div class="pc${o ? " fan" : ""}" style="left:${x}%;top:${y}%">
        <div class="ph">${ini}${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</div>
        ${o ? `<span class="own">${esc(o[0])}${o.length > 1 ? " +" + (o.length - 1) : ""}</span>` : ""}
        <b>${esc(shortName(l.name))}</b><span class="v">${l.pir} PIR</span></div>`;
    }).join("");
    return `<div class="court"><div class="floor">${chips}</div>${five.length ? "" : `<div class="note">No line-up yet.</div>`}</div>`;
  }

  window.GameSheet = {
    init(c){ ctx = {...ctx, ...c}; },
    open, close, isOpen: () => !!gOpen,
    update(){ if (gOpen) render(); },
  };
})();

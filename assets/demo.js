/* Demos for testing — nothing here ever reaches the real league.
   ?demo=live   the round in play: some games final, some live (PIR climbing), some about to tip off
   ?demo=round  every game of the round is final, so the Start Round button shows; a demo button plays "another phone"
   Add &new to start the demo over. The pages run their normal code: this file answers their server calls
   (/api/state, /api/round, schedule, box scores) from a pretend league that lives in this tab only. It starts
   from a copy of the real rosters, and anything changed during the demo stays in the demo.
   Must load before assets/sync.js and the page script. */
(function(){
  const qs = new URLSearchParams(location.search);
  const MODE = qs.get("demo");
  if (MODE !== "live" && MODE !== "round") return;           // plain ?demo = the older coach-page replay
  if (location.protocol === "file:") return;
  window.ELF_DEMO = MODE;

  /* ── keep demo data apart: everything the pages save goes under its own prefix ── */
  const PFX = `elfdemo.${MODE}.`;
  const map = k => (typeof k === "string" && k.startsWith("elf.")) ? PFX + k.slice(4) : k;
  const SP = Storage.prototype, get = SP.getItem, set = SP.setItem, del = SP.removeItem;
  SP.getItem = function(k){ return get.call(this, this === localStorage ? map(k) : k); };
  SP.setItem = function(k, v){ return set.call(this, this === localStorage ? map(k) : k, v); };
  SP.removeItem = function(k){ return del.call(this, this === localStorage ? map(k) : k); };

  const WKEY = PFX + "world";
  const wipe = () => {
    try{
      for (let i = localStorage.length - 1; i >= 0; i--){ const k = localStorage.key(i); if (k && k.startsWith(PFX)) del.call(localStorage, k); }
      sessionStorage.removeItem(WKEY);
    }catch{}
  };
  if (qs.has("new")){                                         // fresh start, then drop &new from the address
    wipe(); qs.delete("new");
    history.replaceState(null, "", location.pathname + "?" + qs.toString().replace(/=(&|$)/g, "$1") + location.hash);
  }

  /* ── tiny helpers ── */
  const realFetch = window.fetch.bind(window);
  const json = (d, status = 200) => new Response(status === 204 ? null : JSON.stringify(d), {status, headers:{"content-type":"application/json"}});
  const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
  const r2 = v => Math.round(v * 100) / 100;
  const GAME_MS = 400e3;                                      // a whole game plays in ~6.7 minutes (1 game minute ≈ 10 s)
  const mmss = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  /* ── the pretend world: built once per tab from the real schedule + rosters ── */
  let W = null;
  try{ W = JSON.parse(sessionStorage.getItem(WKEY) || "null"); }catch{}
  const saveW = () => { try{ sessionStorage.setItem(WKEY, JSON.stringify(W)); }catch{} };

  const ready = (async () => {
    if (W) return;
    const [st, gm, ppl] = await Promise.all([
      realFetch("/api/state", {cache:"no-store"}).then(r => r.json()),
      realFetch(location.origin + "/el-api/v2/competitions/E/seasons/" + season() + "/games").then(r => r.json()),
      realFetch(location.origin + "/el-api/v2/competitions/E/seasons/" + season() + "/people?personType=J").then(r => r.json()).catch(() => ({data: []})),
    ]);
    const all = gm.data || [];
    const R = st.league?.round || Math.max(...all.filter(g => Date.parse(g.utcDate) <= Date.now()).map(g => g.round));
    const now = Date.now();
    // demo round's games, in tip-off order, get fresh start times around "now"
    const mine = all.filter(g => g.round === R).sort((a, b) => Date.parse(a.utcDate) - Date.parse(b.utcDate));
    const start = {};
    mine.forEach((g, k) => {
      start[g.gameCode] = MODE === "round"
        ? now - 3 * 3600e3 + k * 60e3                          // all long finished
        : now + (-560 + k * 120) * 1000;                       // 2 final, 3 live, the rest tip off every 2 min
    });
    const coaches = {};
    for (const [n, d] of Object.entries(st.coaches || {})) coaches[n] = {...d, chips: {}};   // demo starts with no wild cards
    // real players of each club in the demo round, to fill out made-up teams of 10
    const people = {};
    const clubs = new Set(mine.flatMap(g => [g.local.club.code, g.road.club.code]));
    (ppl?.data || []).filter(x => x.active && clubs.has(x.club?.code)).forEach(x => {
      const l = people[x.club.code] = people[x.club.code] || [];
      if (l.length < 12) l.push({code: x.person.code, name: String(x.person.name || "").split(",").map(t => t.trim()).reverse().join(" ")});
    });
    W = {R, R0: R, start, games: all, people, state: {v: "d1", coaches, league: {round: R, votes: [], nextTip: now + 3 * 86400e3, history: {}}}};
    saveW();
  })();
  function season(){ const t = new Date(); return "E" + (t.getMonth() >= 6 ? t.getFullYear() : t.getFullYear() - 1); }
  const bump = () => { W.state.v = "d" + (parseInt(W.state.v.slice(1), 10) + 1); saveW(); };

  const progress = code => {                                  // 0 = not started … 1 = final
    const s = W.start[code];
    if (s == null) return null;                               // not a demo-round game
    return Math.max(0, Math.min(1, (Date.now() - s) / GAME_MS));
  };
  const gamesList = () => W.games.map(g => {
    const s = W.start[g.gameCode];
    if (s == null) return g;
    return {...g, utcDate: new Date(s).toISOString(), played: progress(g.gameCode) >= 1,
            local: {...g.local, score: 0}, road: {...g.road, score: 0}};
  });

  /* made-up games: each club plays 10 men (fantasy roster players first, then real club players).
     Five start; each starter shares every quarter with one bench partner, so exactly five are on court.
     A stat line is planned per player; the box score shows the part played so far, so box score,
     minutes and play-by-play always agree. */
  function lineup(club){
    const seen = new Set(), list = [];
    Object.values(W.state.coaches).forEach(d => (d.roster || []).forEach(x => { if (x.club === club && !seen.has(x.code)){ seen.add(x.code); list.push(x); } }));
    (W.people?.[club] || []).forEach(x => { if (!seen.has(x.code)){ seen.add(x.code); list.push(x); } });
    const order = list.slice(0, 12).sort((a, b) => hash("st" + a.code + W.R0) - hash("st" + b.code + W.R0));
    return order.map((x, j) => ({x, P: plan(x, j, Math.min(order.length, 10), club)}));
  }
  function plan(x, j, n, club){
    const k = x.code + W.R0, H = t => hash(t + k);
    if (j >= 10) return {dnp: true, no: String(1 + Math.floor(H("no") * 44))};
    const starter = j < 5, pair = j % 5, partner = starter ? j + 5 < n : true, st = [];
    for (let i = 0; i < 4; i++){
      const a = i * 10, b = a + 10, s = 4 + 4 * hash("q" + i + pair + club + W.R0);
      if (starter) st.push(partner ? [a, a + s] : [a, b]); else st.push([a + s, b]);
    }
    const M = st.reduce((t, [f, z]) => t + z - f, 0), sc = M / 25;   // more minutes → bigger line
    const r = t => Math.round(t * sc);
    const fg2a = r(2 + 9 * H("a2")), fg3a = r(6 * H("a3")), fta = r(6 * H("af"));
    const line = {fg2a, fg2m: Math.round(fg2a * (0.35 + 0.35 * H("p2"))), fg3a, fg3m: Math.round(fg3a * (0.2 + 0.3 * H("p3"))), fta, ftm: Math.round(fta * (0.6 + 0.35 * H("pf"))),
                  or: r(3 * H("or")), dr: r(7 * H("dr")), ast: r(7 * H("as")), stl: r(3 * H("st")), to: r(4 * H("to")),
                  blk: r(2.4 * H("bk")), blka: r(1.4 * H("ba")), pf: Math.min(5, r(5.4 * H("fo"))), fd: r(6 * H("fd"))};
    return {M, starter, st, line, no: String(1 + Math.floor(H("no") * 44))};
  }
  const playedBy = (st, now) => st.reduce((a, [f, t]) => a + Math.max(0, Math.min(t, now) - f), 0);
  function boxFor(code){
    const g = W.games.find(x => x.gameCode === code);
    const p = progress(code);
    if (!g || p == null) return null;
    if (p <= 0) return "";                                    // not started → empty answer, like the real API
    const now = p * 40;
    const side = club => {
      const pl = [];
      let team = 0;
      lineup(club).forEach(({x, P}) => {
        const base = {Player_ID: "P" + x.code + "   ", Team: club, Player: (x.name || "").split(" ").reverse().join(", ").toUpperCase(), Dorsal: P.no};
        if (P.dnp){ pl.push({...base, Minutes: "DNP", Valuation: 0, IsStarter: 0, IsPlaying: 0}); return; }
        const m = playedBy(P.st, now), f = m / P.M, L = {};
        for (const [k2, v] of Object.entries(P.line)) L[k2] = Math.round(v * f);
        L.fg2m = Math.min(L.fg2m, L.fg2a); L.fg3m = Math.min(L.fg3m, L.fg3a); L.ftm = Math.min(L.ftm, L.fta);
        const pts = 2 * L.fg2m + 3 * L.fg3m + L.ftm, tr = L.or + L.dr;
        team += pts;
        const pir = pts + tr + L.ast + L.stl + L.blk + L.fd - ((L.fg2a - L.fg2m) + (L.fg3a - L.fg3m) + (L.fta - L.ftm) + L.to + L.blka + L.pf);
        const on = p < 1 && P.st.some(([a, b2]) => now >= a && now < b2);
        pl.push({...base, IsStarter: P.starter ? 1 : 0, IsPlaying: on ? 1 : 0, Minutes: m ? mmss(m * 60) : "DNP",
                 Points: pts, FieldGoalsMade2: L.fg2m, FieldGoalsAttempted2: L.fg2a, FieldGoalsMade3: L.fg3m, FieldGoalsAttempted3: L.fg3a,
                 FreeThrowsMade: L.ftm, FreeThrowsAttempted: L.fta, OffensiveRebounds: L.or, DefensiveRebounds: L.dr, TotalRebounds: tr,
                 Assistances: L.ast, Steals: L.stl, Turnovers: L.to, BlocksFavour: L.blk, BlocksAgainst: L.blka, FoulsCommited: L.pf, FoulsReceived: L.fd,
                 Plusminus: Math.round((hash("pm" + x.code + W.R0) - 0.45) * 30 * f), Valuation: pir});
      });
      // team total: the players' points when it's a full team; otherwise a made-up total
      const pts = pl.length >= 8 ? team : Math.round((68 + 26 * hash("s" + club + W.R0)) * p);
      return {Team: club, totr: {Points: pts}, PlayersStats: pl};
    };
    const home = side(g.local.club.code), away = side(g.road.club.code);
    if (p >= 1 && home.totr.Points === away.totr.Points) home.totr.Points++;   // no ties at the end
    return {Live: p < 1, Stats: [home, away]};
  }
  function pbpFor(code){
    const g = W.games.find(x => x.gameCode === code);
    const p = progress(code);
    if (!g || p == null) return null;
    if (p <= 0) return "";
    const now = p * 40, Q = [[], [], [], []];
    let n = 0;
    const at = (t, type, x, club) => {
      if (t > now + 1e-9) return;
      const qq = t > 0 && t % 10 === 0 && type === "OUT" ? t / 10 - 1 : Math.min(3, Math.floor(t / 10));
      Q[qq].push({NUMBEROFPLAY: 0, PLAYTYPE: type, PLAYER_ID: x ? "P" + x.code + "   " : "", CODETEAM: club || "", MARKERTIME: mmss(Math.max(0, (qq + 1) * 10 - t) * 60), t});
    };
    for (let q = 0; q < 4; q++) if (q * 10 <= now) Q[q].push({NUMBEROFPLAY: 0, PLAYTYPE: "BP", PLAYER_ID: "", MARKERTIME: "", t: q * 10 - 1e-6});
    for (const club of [g.local.club.code, g.road.club.code]){
      lineup(club).forEach(({x, P}) => {
        if (P.dnp) return;
        P.st.forEach(([a, b2]) => { if (!(P.starter && a === 0)) at(a, "IN", x, club); if (b2 < 40) at(b2, "OUT", x, club); });
      });
    }
    const out = {Live: p < 1, ExtraTime: []};
    ["FirstQuarter", "SecondQuarter", "ThirdQuarter", "ForthQuarter"].forEach((k2, i) => {
      out[k2] = Q[i].sort((a, b) => a.t - b.t).map(e => { e.NUMBEROFPLAY = ++n; delete e.t; return e; });
    });
    return out;
  }
  function headerFor(code){
    const p = progress(code) || 0, played = p * 40;           // minutes of game time
    const q = Math.min(4, Math.floor(played / 10) + 1);
    return {Quarter: String(q), RemainingPartialTime: mmss(Math.max(0, q * 10 - played) * 60)};
  }

  /* same scoring as the server (worker/rounds.js) */
  function roundTotal(doc){
    const wc = doc?.chips?.[W.R] || {};
    let total = 0;
    for (const p of doc?.roster || []){
      const g = W.games.find(x => x.round === W.R && (x.local.club.code === p.club || x.road.club.code === p.club));
      const b = g && boxFor(g.gameCode); if (!b) continue;
      const home = g.local.club.code === p.club;
      const pl = i => Object.fromEntries(b.Stats[i].PlayersStats.map(s => [s.Player_ID.replace(/^P/, "").trim(), s]));
      const T = [pl(0), pl(1)];
      const ti = T[0][p.code] ? 0 : T[1][p.code] ? 1 : (home ? 0 : 1);
      const st = T[ti][p.code], raw = st && !/dnp/i.test(st.Minutes) ? st.Valuation : 0;
      const win = b.Stats[ti].totr.Points > b.Stats[1 - ti].totr.Points;
      const base = b.Live ? raw : r2(raw + (win ? 1 : -1) * Math.abs(raw) * 0.1);
      const slot = p.slot, full = slot === "full" || slot === "active";
      const share = (full ? 1 : (slot === "half" || slot === "bench") ? (wc.bb ? 1 : 0.5) : 0) * (p.captain && full ? (wc.tc ? 3 : 2) : 1);
      total += r2(base * share);
    }
    return r2(total);
  }
  function vote(device, round, on){
    const L = W.state.league;
    if (round !== L.round) return {league: L, stale: true};
    L.votes = L.votes.filter(d => d !== device);
    if (on) L.votes.push(device);
    if (L.votes.length >= 2){                                 // start the next round, just like the server
      const totals = {};
      for (const [n, d] of Object.entries(W.state.coaches)){ totals[n] = roundTotal(d); d.base = r2((+d.base || 0) + totals[n]); }
      W.state.league = {round: L.round + 1, votes: [], nextTip: L.nextTip, history: {...L.history, [L.round]: {totals, at: Date.now(), by: "votes"}}};
      W.R = L.round + 1;                                      // next round plays with the real (future) schedule
      bump();
      return {started: true, round: W.state.league.round};
    }
    bump();
    return {votes: L.votes.length};
  }
  function postState(body){
    const {coach, data} = body || {};
    if (!coach || !data) return json({error: "bad"}, 400);
    const d = W.state.coaches[coach] = W.state.coaches[coach] || {};
    for (const k of ["roster", "chips", "team", "base"]) if (k in data){ if (data[k] === "" || data[k] == null) delete d[k]; else d[k] = data[k]; }
    bump();
    return json({ok: true, v: W.state.v});
  }

  /* ── answer the pages' server calls ── */
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const path = url.pathname, method = (init.method || "GET").toUpperCase();
    const ours = url.origin === location.origin &&
      (path === "/api/state" || path === "/api/round" || /^\/el-api\/.*\/games$/.test(path) || /^\/el-live\/(Boxscore|Header|PlayByPlay)$/.test(path));
    if (!ours) return realFetch(input, init);
    await ready;
    if (path === "/api/state"){
      if (method === "POST") return postState(JSON.parse(init.body || "{}"));
      if (url.searchParams.get("since") === W.state.v) return json(null, 204);
      return json(W.state);
    }
    if (path === "/api/round"){
      const b = JSON.parse(init.body || "{}");
      const r = vote(b.device, b.round, !!b.vote);
      renderBar();
      return json(r);
    }
    if (path.endsWith("/games")) return json({data: gamesList()});
    const code = +url.searchParams.get("gamecode");
    if (path.endsWith("/Boxscore")){
      const b = boxFor(code);
      if (b === null) return realFetch(input, init);          // a game outside the demo round → real data
      return new Response(b === "" ? "" : JSON.stringify(b), {headers: {"content-type": "application/json"}});
    }
    if (path.endsWith("/PlayByPlay")){
      const d = pbpFor(code);
      if (d === null) return realFetch(input, init);
      return new Response(d === "" ? "" : JSON.stringify(d), {headers: {"content-type": "application/json"}});
    }
    if (path.endsWith("/Header")){
      if (progress(code) == null) return realFetch(input, init);
      return json(headerFor(code));
    }
    return realFetch(input, init);
  };

  /* ── keep ?demo=… on links between the pages ── */
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.dataset.demoExit != null) return;
    const u = new URL(a.getAttribute("href"), location.href);
    if (u.origin !== location.origin || u.searchParams.has("demo")) return;
    u.searchParams.set("demo", MODE);
    a.href = u.pathname + u.search + u.hash;
  }, true);

  /* ── demo bar: label, "another phone" vote, start over, exit ── */
  const OTHER = "demophone00000";
  let bar;
  function renderBar(){
    if (!bar) return;
    const L = W?.state?.league;
    const onLeague = /1-league/.test(location.pathname) || location.pathname === "/";
    const btnShown = onLeague && document.getElementById("startWrap") && !document.getElementById("startWrap").hidden;
    const other = L && L.votes.includes(OTHER);
    const html = `<b>DEMO</b><span>${MODE === "live" ? "Live games" : "Start round"}</span>
      ${btnShown ? `<button data-act="other">${other ? "Other phone: undo" : "Other phone: tap"}</button>` : ""}
      <button data-act="reset" aria-label="Start the demo over">↺</button>
      <a data-act="exit" data-demo-exit href="/1-league" aria-label="Leave the demo">✕</a>`;
    if (html !== bar._html) bar.innerHTML = bar._html = html;   // only touch it when something changed
  }
  function mountBar(){
    const css = document.createElement("style");
    css.textContent = `.demo-bar{position:fixed;left:12px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:9;display:flex;align-items:center;gap:6px;
      padding:6px 6px 6px 12px;border-radius:999px;background:#FFFFFF;color:#000;font:600 12px Inter,system-ui,sans-serif;box-shadow:0 6px 20px #00000080;max-width:calc(100% - 24px)}
      .demo-bar.up{bottom:calc(58px + env(safe-area-inset-bottom))}
      .app{padding-bottom:calc(70px + env(safe-area-inset-bottom))!important}
      .demo-bar b{font-weight:800;letter-spacing:.08em;font-size:11px}
      .demo-bar span{color:#555;white-space:nowrap}
      .demo-bar button,.demo-bar a{border:0;background:#EDEDED;color:#000;font:700 12px Inter,system-ui,sans-serif;height:28px;padding:0 10px;border-radius:999px;cursor:pointer;
      display:grid;place-items:center;text-decoration:none;white-space:nowrap}
      .demo-bar [data-act=other]{background:var(--orange,#FF6B1A);color:#fff}`;
    document.head.appendChild(css);
    bar = document.createElement("div");
    bar.className = "demo-bar" + (document.querySelector(".dots") ? " up" : "");   // coach page: sit above the page dots
    document.body.appendChild(bar);
    bar.addEventListener("click", async e => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      if (b.dataset.act === "reset"){ e.preventDefault(); wipe(); location.reload(); }
      if (b.dataset.act === "other"){
        await ready;
        vote(OTHER, W.state.league.round, !W.state.league.votes.includes(OTHER));
        window.Shared?.refresh?.();
        renderBar();
      }
    });
    renderBar();
    setInterval(renderBar, 1000);                             // follows the Start Round button showing / hiding
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountBar); else mountBar();
})();

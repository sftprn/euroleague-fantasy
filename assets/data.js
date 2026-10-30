/* Player data shared by the pages (chunk 3): full box-score lines, on-court stretches and season history.
   window.ElData:
     box(gameCode)            → {live, final, pending, q, t, teams:[{code, name, pts, pl:{personCode: line}}]}
                                 line = {min, mins, pts, fg2m, fg2a, fg3m, fg3a, ftm, fta, or, dr, tr, ast, stl, to,
                                         blk, blka, pf, fd, pm, pir, starter, on, no, name}
     line(gameCode, code)     → that player's line (or null)
     stretches(gameCode)      → {len, now, live, pl:{personCode: [[fromMin, toMin], …]}}   (game minutes, 0 … 40 + 5 per OT)
     history(code, club, games, onRow) → rows [{r, c, u, home, opp, pts, oppPts, win, live, played, min, mins, pir, adj}]
                                 games = the page's schedule list ({c, r, u, p, h:{c}, a:{c}}); onRow fires as each game arrives
   Finished games are kept on this phone (compact form) and re-checked once an hour, because Euroleague sometimes corrects
   a box score after the game (e.g. a foul added → PIR −1); about two days after a game ends its copy is kept for good.
   Live games are re-read at most every 15 s. */
(function(){
  const today = new Date();
  const SEASON = "E" + (today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1);
  const DIRECT = location.protocol === "file:";
  const LIVE_API = DIRECT ? "https://live.euroleague.net/api" : "/el-live";
  const LIVE_TTL = 15e3;
  const RECHECK = 3600e3, SETTLE = 48 * 3600e3;            // finished game: re-check hourly; settled 2 days after we first saw it final
  // a stored finished copy is still good if the game has settled or we checked it within the hour
  const keep = c => !!c && (Date.now() - (c.ff || 0) > SETTLE || Date.now() - (c.ck || 0) < RECHECK);
  const stamp = (c, v) => ({...v, ff: c?.ff || Date.now(), ck: Date.now()});      // ff = first seen final, ck = last checked
  try{ Object.keys(localStorage).filter(k => /^elf\.(fbox|stints|box)\.E\d{4}\./.test(k)).forEach(k => localStorage.removeItem(k)); }catch{}   // old copies that never re-checked

  const store = {
    get(k){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }catch{ return null; } },
    set(k, v){
      try{ localStorage.setItem(k, JSON.stringify(v)); }
      catch{                                   // phone storage full: drop old cached games and try once more
        try{ Object.keys(localStorage).filter(x => /^elf(demo\.[a-z]+)?\.(fbox|stints|box)2?\./.test(x)).slice(0, 80).forEach(x => localStorage.removeItem(x));
             localStorage.setItem(k, JSON.stringify(v)); }catch{}
      }
    }
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function getJSON(url, tries = 4){
    let r = await fetch(url, {cache: "no-store"}).catch(() => null);
    // Euroleague sometimes rate-limits our server (error 1015 / 429): then the phone asks Euroleague's live server itself
    if ((!r || !r.ok) && url.startsWith("/el-live/")){
      const d = await fetch("https://live.euroleague.net/api/" + url.slice(9), {cache: "no-store"}).catch(() => null);
      if (d && d.ok) r = d;
    }
    if (!r) throw new Error("network");
    if ((r.status === 429 || r.status >= 500) && tries > 1){ await wait((5 - tries) * 1500 + 800); return getJSON(url, tries - 1); }   // busy: back off and retry
    if (!r.ok) throw new Error(r.status);
    const t = await r.text();
    return t ? JSON.parse(t) : null;                  // live endpoints answer "" before tip-off
  }
  const mem = {};                                     // in-memory: key → {t, v, p (pending promise)}
  function once(key, ttl, load){
    const m = mem[key];
    if (m && m.p) return m.p;
    if (m && m.v && Date.now() - m.t < (m.v.final ? RECHECK : ttl)) return Promise.resolve(m.v);
    const p = load().then(v => { mem[key] = {t: Date.now(), v}; return v; }, e => { delete mem[key]; throw e; });
    mem[key] = {...(m || {}), p};
    return p;
  }
  const code = s => String(s || "").replace(/^P/, "").trim();
  const toMin = s => { const m = /^(\d+):(\d+)$/.exec(s || ""); return m ? +m[1] + +m[2] / 60 : 0; };

  /* ── box score ── */
  const F = ["min", "pts", "fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta", "or", "dr", "tr", "ast", "stl", "to", "blk", "blka", "pf", "fd", "pm", "pir", "starter", "on", "no", "name"];
  const SRC = ["Minutes", "Points", "FieldGoalsMade2", "FieldGoalsAttempted2", "FieldGoalsMade3", "FieldGoalsAttempted3", "FreeThrowsMade", "FreeThrowsAttempted",
               "OffensiveRebounds", "DefensiveRebounds", "TotalRebounds", "Assistances", "Steals", "Turnovers", "BlocksFavour", "BlocksAgainst",
               "FoulsCommited", "FoulsReceived", "Plusminus", "Valuation", "IsStarter", "IsPlaying", "Dorsal", "Player"];
  const pack = b => ({...b, teams: b.teams.map(t => ({...t, pl: Object.fromEntries(Object.entries(t.pl).map(([k, l]) => [k, F.map(f => l[f])]))}))});
  const unpack = b => ({...b, teams: b.teams.map(t => ({...t, pl: Object.fromEntries(Object.entries(t.pl).map(([k, a]) => [k, lineOf(a)]))}))});
  function lineOf(a){ const l = {}; F.forEach((f, i) => l[f] = a[i]); l.mins = toMin(l.min); return l; }
  const niceName = s => String(s || "").split(",").map(x => x.trim()).reverse().join(" ").toLowerCase().replace(/(^|[\s'-])\p{L}/gu, c => c.toUpperCase());

  function box(gc){
    const key = `elf.fbox2.${SEASON}.${gc}`;
    const c = store.get(key);
    if (keep(c)) return Promise.resolve(unpack(c));
    return once("box" + gc, LIVE_TTL, async () => {
      let d;
      try{ d = await getJSON(`${LIVE_API}/Boxscore?gamecode=${gc}&seasoncode=${SEASON}`); }
      catch(e){ if (c) return unpack(c); throw e; }                    // can't re-check right now: keep the copy we have
      if (!d || !d.Stats || d.Stats.length < 2) return {pending: true, teams: []};
      const teams = d.Stats.map(s => {
        const pl = {};
        (s.PlayersStats || []).forEach(p => {
          const l = {};
          F.forEach((f, i) => l[f] = p[SRC[i]] ?? 0);
          l.starter = !!p.IsStarter; l.on = !!p.IsPlaying; l.no = String(p.Dorsal ?? ""); l.name = niceName(p.Player);
          if (/dnp/i.test(l.min || "")) l.min = "DNP";
          l.mins = toMin(l.min);
          pl[code(p.Player_ID)] = l;
        });
        return {code: (s.PlayersStats?.[0]?.Team || "").trim(), name: s.Team || "", pts: +(s.totr?.Points || 0), pl};
      });
      const tot = teams[0].pts + teams[1].pts;
      const b = {live: !!d.Live, final: !d.Live && tot > 0, pending: !d.Live && tot === 0, teams};
      if (b.live){
        try{ const h = await getJSON(`${LIVE_API}/Header?gamecode=${gc}&seasoncode=${SEASON}`); b.q = h?.Quarter; b.t = h?.RemainingPartialTime; }catch{}
      }
      if (b.final) store.set(key, stamp(c, pack(b)));
      return b;
    });
  }
  async function line(gc, pc){
    const b = await box(gc);
    for (const t of b.teams || []) if (t.pl[pc]) return {...t.pl[pc], team: t.code};
    return null;
  }

  /* ── on-court stretches from the play-by-play ── */
  const PERIODS = ["FirstQuarter", "SecondQuarter", "ThirdQuarter", "ForthQuarter"];
  function buildStretches(pbp, b){
    const ev = [];
    let len = 40, last = 0;
    PERIODS.forEach((k, qi) => (pbp?.[k] || []).forEach(e => ev.push({e, start: qi * 10, plen: 10})));
    let ot = -1;
    (pbp?.ExtraTime || []).forEach(e => { if (e.PLAYTYPE === "BP") ot++; ev.push({e, start: 40 + Math.max(0, ot) * 5, plen: 5}); });
    if (ot >= 0) len = 40 + (ot + 1) * 5;
    const on = {}, pl = {};
    const add = (c, a, z) => { if (z - a < 0.005) return; const l = pl[c] = pl[c] || []; const p = l[l.length - 1];
      if (p && a - p[1] < 0.005) p[1] = z; else l.push([a, z]); };
    for (const t of b?.teams || []) for (const [c, l] of Object.entries(t.pl)) if (l.starter) on[c] = 0;
    // order by game clock (the feed sometimes appends late corrections with a high play number), then play number
    ev.forEach(x => x.t = x.e.MARKERTIME ? x.start + x.plen - toMin(x.e.MARKERTIME) : null);
    ev.sort((x, y) => (x.t ?? -1) - (y.t ?? -1) || x.e.NUMBEROFPLAY - y.e.NUMBEROFPLAY);
    for (const {e, t} of ev){
      if (t == null) continue;
      last = Math.max(last, t);
      const c = code(e.PLAYER_ID); if (!c) continue;
      if (e.PLAYTYPE === "IN"){ if (on[c] == null) on[c] = t; }
      else if (e.PLAYTYPE === "OUT"){ if (on[c] != null){ add(c, on[c], t); delete on[c]; } }
    }
    if (pbp?.Live && b?.q){                           // live: the game clock is more exact than the last logged play
      const q = +String(b.q).replace(/\D/g, "") || 0, left = toMin(b.t);
      const clock = q > 4 ? 40 + (q - 5) * 5 + 5 - left : (q - 1) * 10 + 10 - left;
      if (q && clock > last) last = clock;
      if (q > 4) len = Math.max(len, 40 + (q - 4) * 5);
    }
    const end = pbp?.Live ? last : len;
    for (const [c, a] of Object.entries(on)) add(c, a, end);
    for (const l of Object.values(pl)) l.forEach(s => { s[0] = Math.round(s[0] * 100) / 100; s[1] = Math.round(s[1] * 100) / 100; });
    return {len, now: pbp?.Live ? last : len, live: !!pbp?.Live, pl};
  }
  function stretches(gc){
    const key = `elf.stints2.${SEASON}.${gc}`;
    const c = store.get(key);
    if (keep(c)) return Promise.resolve(c);
    return once("pbp" + gc, LIVE_TTL, async () => {
      let pbp, b;
      try{ [pbp, b] = await Promise.all([getJSON(`${LIVE_API}/PlayByPlay?gamecode=${gc}&seasoncode=${SEASON}`), box(gc)]); }
      catch(e){ if (c) return c; throw e; }
      if (!pbp) return {len: 40, now: 0, live: false, pl: {}, pending: true};
      const s = buildStretches(pbp, b);
      if (!pbp.Live && b.final) store.set(key, stamp(c, s));
      return s;
    });
  }

  /* ── season history for one player (his current club's games) ── */
  const adjust = (raw, win) => Math.round((raw + (win ? 1 : -1) * Math.abs(raw) * 0.1) * 100) / 100;
  async function history(pc, club, games, onRow){
    const now = Date.now();
    const mine = (games || []).filter(g => (g.h.c === club || g.a.c === club) && (g.p || Date.parse(g.u) <= now))
                              .sort((a, b) => a.r - b.r || Date.parse(a.u) - Date.parse(b.u));
    const rows = mine.map(g => ({r: g.r, c: g.c, u: g.u, home: g.h.c === club, opp: g.h.c === club ? g.a : g.h, loading: true}));
    onRow?.(rows);
    let i = 0;                                         // a few at a time keeps it quick without flooding the server
    async function worker(){
      while (i < rows.length){
        const row = rows[i++];
        try{
          const b = await box(row.c);
          const ti = b.teams[0]?.pl[pc] ? 0 : b.teams[1]?.pl[pc] ? 1 : (row.home ? 0 : 1);
          const me = b.teams[ti], them = b.teams[1 - ti], l = me?.pl[pc];
          Object.assign(row, {loading: false, pending: !!b.pending, live: !!b.live, pts: me?.pts, oppPts: them?.pts,
                              win: me && them ? me.pts > them.pts : null, played: !!l && l.min !== "DNP" && l.mins > 0,
                              min: l?.min || "–", mins: l?.mins || 0, pir: l && l.min !== "DNP" ? l.pir : null});
          row.adj = row.pir == null ? null : b.live ? row.pir : adjust(row.pir, row.win);
        }catch{ Object.assign(row, {loading: false, error: true}); }
        onRow?.(rows);
      }
    }
    await Promise.all([worker(), worker()]);
    return rows;
  }

  window.ElData = {SEASON, box, line, stretches, history, buildStretches, keep, stamp};
})();

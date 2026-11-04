// Roster import from BasketNews Fantasy (fantasy.basketnews.com).
//
// One public team link (…/teams/<24-hex id>) is saved once. From it we find the draft league and all its teams, then,
// once each round's lineups unlock at the first tip-off ("Einamojo etapo rikiuotės yra paslėptos" until then), we copy
// every team's 13 players, captain and wild cards into the app, and set Total (`base`) to BasketNews's season total
// for the finished rounds. No BasketNews login is involved: these are the same requests the public team page makes.
//
//   GET  /api/bn                  → {url, last, done}
//   POST /api/bn {url}            → save the link (or clear it with ""), then import straight away
//   POST /api/bn {run:true}       → import now (also overwrites hand edits made since the last import)
//   POST /api/bn {prev:true}      → copy the previous (finished) round's lineups now, e.g. before this round unlocks
//   POST /api/bn {dry:9}          → rebuild a finished round and return it, saving nothing (a health check)
//   cron (every 10 min)           → from 3 h before the round's first tip-off, check every 10 min until its lineups are in
//                                   (BasketNews shows them at tip-off), then stop until the next round; nothing is asked earlier
//
// BasketNews ↔ app:
//   round:   BasketNews `fantasyRound` is 0-based → app round = fantasyRound + 1
//   groups:  5 starters (g-*, f-*, c-*) + first bench card b-1 → 100% · b-2…b-5 → 50% · reserves i-* → 0%
//   chips:   boost_bench → Bench Boost (bb) · triple_points_captain → Triple Captain (tc)
//   players: matched to Euroleague person codes by surname + club (first name breaks ties); unmatched ones are reported
// BasketNews has no official API, so if they change their site this stops working (the app itself keeps going).
import { COACHES, json, newVersion, setup, cleanRoster, cleanChips } from "./state.js";
import { loadGames, firstTip } from "./rounds.js";

const GQL = "https://fantasy.basketnews.com/backend/graphql";
const EL_PEOPLE = "https://api-live.euroleague.net/v2/competitions/E/seasons/";
const season = () => { const d = new Date(); return "E" + (d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1); };
const DEFAULT_TEAMS = { Justelis: "SPEEDsters", Darius: "SPERMOS VAIKAI", Deivis: "Kundžiai", Novikas: "Vilkmergė", Titas: "Geri Sprendimai 0.7", Saimonas: "KĖDAINIETIS" };
// BasketNews club abbreviations that differ from Euroleague's tvCode
const CLUB = { VAL: "VBC", VIRT: "VIR", FEN: "FBT", EA7: "MIL", ZAL: "ZAL", MON: "ASM", BKN: "KBA" };

const Q_FIND = `query($t:String!){ fantasyTeamLineupRecordFromClient(fantasyTeamId:$t, fantasyRound:0, editMode:false){ fantasyTeam { title leagueId fantasyLeagues { fantasyLeagueId } } } }`;
const Q_TEAMS = `query($l:String,$f:String,$r:Int){ allFantasyTeamScoreRecordsFromClient(offset:0, limit:25, sort:"position", leagueId:$l, fantasyLeagueId:$f, fantasyRound:$r, search:"", bnPlusOnly:false){ records { fantasyTeam { id title } pointsTotal } } }`;
const Q_LINEUP = `query($t:String!,$l:String!,$r:Int!){ fantasyTeamLineupRecordFromClient(fantasyTeamId:$t, fantasyRound:$r, editMode:false){ fantasyRound fantasyTeam { title wildcards { identifier fantasyRound } } players { cardIdentifier captain player { firstName lastName team(leagueId:$l, fantasyRound:$r){ team { abbreviation } } } } } }`;

async function gql(query, variables) {
  const r = await fetch(GQL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", origin: "https://fantasy.basketnews.com", referer: "https://fantasy.basketnews.com/lt" },
    body: JSON.stringify({ query, variables }),
  });
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { throw new Error(`BasketNews answered ${r.status} (not data)`); }
  if (d.errors?.length) throw new Error("BasketNews: " + String(d.errors[0].message).slice(0, 120));
  return d.data;
}

// ── names ──
export const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z' -]/g, " ").replace(/['’]/g, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const strip = s => norm(s).split(" ").filter(w => w && !SUFFIX.has(w)).join(" ");
const clubOf = abbr => { const a = norm(abbr).toUpperCase().replace(/\s/g, ""); return CLUB[a] || a; };

// Euroleague players in the same shape the pages store in rosters
async function loadPeople() {
  const r = await fetch(`${EL_PEOPLE}${season()}/people?personType=J`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Euroleague players ${r.status}`);
  const nice = s => String(s || "").split(",").map(x => x.trim()).reverse().join(" ").toLowerCase().replace(/(^|[\s'-])\p{L}/gu, c => c.toUpperCase());
  const seen = new Set(), out = [];
  for (const x of (await r.json()).data) {
    if (!x.active || seen.has(x.person.code)) continue;
    seen.add(x.person.code);
    const [last, first] = String(x.person.name || "").split(",").map(s => s.trim());
    out.push({
      code: x.person.code, name: nice(x.person.name), club: x.club.code, tv: x.club.tvCode || x.club.code,
      clubName: x.club.editorialName || x.club.name, crest: x.club.images?.crest || "", img: x.images?.headshot || "",
      pos: (x.positionName || "–").charAt(0), _last: strip(last), _first: strip(first),
    });
  }
  return out;
}
export function matchPlayer(people, bn) {
  const last = strip(bn.lastName), first = strip(bn.firstName), club = clubOf(bn.team);
  const flat = s => s.replace(/\s/g, "");
  const sameLast = p => p._last === last || flat(p._last) === flat(last);
  const pick = list => {
    if (list.length === 1) return list[0];
    if (list.length > 1){
      const f = list.filter(p => p._first === first); if (f.length === 1) return f[0];
      const i = list.filter(p => p._first[0] === first[0]); if (i.length === 1) return i[0];
    }
    return null;
  };
  const inClub = people.filter(p => p.tv === club || p.club === club);
  return pick(inClub.filter(sameLast))
    || pick(inClub.filter(p => (" " + p._last + " ").includes(" " + last.split(" ").pop() + " ")))     // "Hernangomez" ↔ "Hernangomez", double surnames
    || pick(people.filter(p => sameLast(p) && p._first === first))                                     // moved clubs since BasketNews updated
    || pick(people.filter(sameLast).filter(p => p._first[0] === first[0]));
}
const slotOf = card => /^[gfc]-/.test(card) ? "full" : card === "b-1" ? "full" : /^b-/.test(card) ? "half" : "zero";
const cardOrder = card => { const [k, n] = String(card).split("-"); return ({ g: 0, f: 10, c: 20, b: 30, i: 50 }[k] ?? 60) + (+n || 0); };

// ── config (D1 key "bn") ──
async function readCfg(DB) { const row = await DB.prepare("SELECT v FROM kv WHERE k = 'bn'").first(); return row ? JSON.parse(row.v) : {}; }
const writeCfg = (DB, cfg) => DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('bn', ?)").bind(JSON.stringify(cfg)).run();
const teamIdOf = url => (String(url || "").match(/teams\/([0-9a-f]{24})/i) || String(url || "").match(/^([0-9a-f]{24})$/i) || [])[1] || "";

// ── the import ──
let busy = null;
export async function importBn(env, { force = false, dry = 0, prev = false } = {}) {
  if (dry) return run(env, true, dry);
  if (busy) return busy;
  busy = run(env, force, 0, prev).finally(() => { busy = null; });
  return busy;
}
async function run(env, force, dry = 0, prev = false) {   // prev = copy the finished previous round's lineups (visible before this round unlocks)   // dry = a finished round to rebuild without saving (check that it still works)
  const DB = env.DB;
  await setup(DB);
  const cfg = await readCfg(DB);
  if (!cfg.team) return { ok: false, msg: "No BasketNews link saved" };
  const league = JSON.parse((await DB.prepare("SELECT v FROM kv WHERE k = 'league'").first())?.v || "null");
  const round = dry || league?.round;
  if (!round) return { ok: false, msg: "League round not known yet" };
  if (!force && cfg.done === round) return { ok: true, skipped: true };
  const idx = round - 1;                                   // BasketNews round index for the app's current round
  const from = prev ? round - 1 : round;                   // the round whose lineups are copied
  if (from < 1) return { ok: false, msg: "There is no previous round yet" };
  const result = { at: Date.now(), round: from, ...(prev ? { prev: true } : {}), ok: false, teams: 0, hidden: false, unmatched: [], missingTeams: [] };
  try {
    if (!cfg.league || !cfg.fleague) {
      const f = (await gql(Q_FIND, { t: cfg.team }))?.fantasyTeamLineupRecordFromClient?.fantasyTeam;
      if (!f?.leagueId || !f.fantasyLeagues?.[0]?.fantasyLeagueId) throw new Error("That team link wasn't found on BasketNews");
      cfg.league = f.leagueId; cfg.fleague = f.fantasyLeagues[0].fantasyLeagueId;
    }
    // the league's teams + season totals up to the finished round
    const recs = (await gql(Q_TEAMS, { l: cfg.league, f: cfg.fleague, r: Math.max(0, idx - 1) }))?.allFantasyTeamScoreRecordsFromClient?.records || [];
    const { results } = await DB.prepare("SELECT k, v FROM kv WHERE k LIKE 'coach/%'").all();
    const docs = Object.fromEntries(results.map(r => [r.k.slice(6), JSON.parse(r.v)]));
    cfg.teams = cfg.teams || {};                            // coach → BasketNews team id, kept once found (survives renames)
    for (const n of COACHES) {
      if (cfg.teams[n] && recs.some(x => x.fantasyTeam.id === cfg.teams[n])) continue;
      const want = norm(docs[n]?.team || DEFAULT_TEAMS[n]);
      const hit = recs.find(x => norm(x.fantasyTeam.title) === want);
      if (hit) cfg.teams[n] = hit.fantasyTeam.id; else delete cfg.teams[n];
    }
    result.missingTeams = COACHES.filter(n => !cfg.teams[n]).map(n => docs[n]?.team || DEFAULT_TEAMS[n]);
    let people = null;
    const writes = [];
    for (const n of COACHES) {
      const id = cfg.teams[n]; if (!id) continue;
      const rec = recs.find(x => x.fantasyTeam.id === id);
      const data = {};
      if (idx >= 1 && Number.isFinite(rec?.pointsTotal)) data.base = Math.round(rec.pointsTotal * 100) / 100;
      const L = (await gql(Q_LINEUP, { t: id, l: cfg.league, r: from - 1 }))?.fantasyTeamLineupRecordFromClient;
      if (L?.players?.length) {
        people = people || await loadPeople();
        const roster = [];
        for (const c of [...L.players].sort((a, b) => cardOrder(a.cardIdentifier) - cardOrder(b.cardIdentifier))) {
          const bn = { firstName: c.player.firstName, lastName: c.player.lastName, team: c.player.team?.team?.abbreviation };
          const p = matchPlayer(people, bn);
          if (!p) { result.unmatched.push(`${bn.firstName} ${bn.lastName} (${bn.team || "?"}) · ${rec?.fantasyTeam.title || n}`); continue; }
          const slot = slotOf(c.cardIdentifier);
          const { _last, _first, ...clean } = p;
          roster.push({ ...clean, slot, order: (roster.filter(x => x.slot === slot).length + 1) * 10, ...(c.captain && slot === "full" ? { captain: true } : {}) });
        }
        data.roster = roster;
        const chips = { ...(docs[n]?.chips || {}) };
        delete chips[from];                                 // that round: exactly what BasketNews says
        for (const w of L.fantasyTeam?.wildcards || []) {
          const r = String(w.fantasyRound + 1), k = w.identifier === "boost_bench" ? "bb" : w.identifier === "triple_points_captain" ? "tc" : null;
          if (k) chips[r] = { ...(chips[r] || {}), [k]: true };
        }
        data.chips = chips;
        result.teams++;
      } else result.hidden = true;
      if (Object.keys(data).length) writes.push([n, data]);
    }
    if (dry) return { ...result, ok: true, dry: true, rosters: writes.map(([n, d]) => ({ n, base: d.base, chips: d.chips?.[round], roster: (d.roster || []).map(p => `${p.slot}${p.captain ? "*" : ""} ${p.name} ${p.tv} ${p.code}`) })) };
    if (writes.length) {
      const stmts = [];
      for (const [n, d] of writes) {
        const sets = [], args = [];
        if (d.roster) { sets.push("'$.roster', json(?)"); args.push(JSON.stringify(cleanRoster(d.roster))); }
        if (d.chips) { sets.push("'$.chips', json(?)"); args.push(JSON.stringify(cleanChips(d.chips))); }
        if ("base" in d) { sets.push("'$.base', ?"); args.push(d.base); }
        stmts.push(DB.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES (?, '{}')").bind(`coach/${n}`));
        stmts.push(DB.prepare(`UPDATE kv SET v = json_set(v, ${sets.join(", ")}) WHERE k = ?`).bind(...args, `coach/${n}`));
      }
      stmts.push(DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('meta', ?)").bind(JSON.stringify({ v: newVersion() })));
      await DB.batch(stmts);
    }
    result.ok = true;
    const mapped = COACHES.filter(n => cfg.teams[n]).length;
    if (!prev && mapped && result.teams === mapped) cfg.done = round;          // every lineup in: leave it alone until the next round
  } catch (e) {
    result.msg = String(e.message || e).slice(0, 200);
  }
  cfg.last = result;
  await writeCfg(DB, cfg);
  return result;
}

const BEFORE = 3 * 3600e3, GIVE_UP = 24 * 3600e3;
export async function scheduledBn(env) {
  if (!env.DB) return;
  try {
    await setup(env.DB);
    const cfg = await readCfg(env.DB);
    if (!cfg.team) return;
    const round = JSON.parse((await env.DB.prepare("SELECT v FROM kv WHERE k = 'league'").first())?.v || "null")?.round;
    if (!round || cfg.done === round) return;                 // this round's lineups are already in
    cfg.tips = cfg.tips || {};
    if (!cfg.tips[round]) {                                    // first tip-off of the round, looked up once and kept
      const t = firstTip(await loadGames(), round);
      if (!t) return;
      cfg.tips = { [round]: t };
      await writeCfg(env.DB, cfg);
    }
    const now = Date.now(), tip = cfg.tips[round];
    if (now < tip - BEFORE || now > tip + GIVE_UP) return;      // only from 3 h before tip-off (and not forever after it)
    await importBn(env);
  } catch (e) { console.log("bn import failed", e); }
}

export async function handleBn(request, env) {
  if (!env.DB) return json({ error: "D1 database not bound as DB" }, { status: 500 });
  await setup(env.DB);
  if (request.method === "GET") {
    const cfg = await readCfg(env.DB);
    return json({ url: cfg.team ? `https://fantasy.basketnews.com/lt/teams/${cfg.team}` : "", last: cfg.last || null, done: cfg.done || null });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body; try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
  if ("url" in body) {
    const cfg = await readCfg(env.DB);
    const id = teamIdOf(body.url);
    if (body.url && !id) return json({ ok: false, msg: "That doesn't look like a BasketNews team link (…/teams/…)" }, { status: 400 });
    await writeCfg(env.DB, id ? { team: id, teams: cfg.team === id ? cfg.teams : {} } : {});
    if (!id) return json({ ok: true, cleared: true });
  }
  if (Number.isInteger(body.dry) && body.dry > 0) return json(await importBn(env, { dry: body.dry }));
  if (body.prev) return json(await importBn(env, { force: true, prev: true }));
  const res = await importBn(env, { force: true });
  return json(res);
}

// Rounds: which Euroleague round the league is on, and banking finished rounds.
//
// league record (D1 key "league"):
//   { round: 7, nextTip: <ms of next round's first game>, history: { "7": { totals:{coach:PIR}, at, by } } }
//
// A round starts by itself (banking each team's PIR for the finished round into its Total = `base`) 3 hours before the
// next round's first tip-off — checked on every /api/state read and by the cron (every minute). There's no manual start.
// Banking uses compare-and-swap on the league record, so it can only ever happen once per round.
import { COACHES, json, newVersion, setup } from "./state.js";

const EL_API = "https://api-live.euroleague.net/v2/competitions/E/seasons/";
const EL_LIVE = "https://live.euroleague.net/api/";
const AUTO_BEFORE = 3 * 3600e3;
const season = () => { const d = new Date(); return "E" + (d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1); };
const r2 = v => Math.round(v * 100) / 100;

export async function loadGames() {
  const r = await fetch(`${EL_API}${season()}/games`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`games ${r.status}`);
  return (await r.json()).data.map(x => ({ c: x.gameCode, r: x.round, u: Date.parse(x.utcDate), p: !!x.played, h: x.local.club.code, a: x.road.club.code }));
}
export const firstTip = (games, round) => { const t = games.filter(g => g.r === round).map(g => g.u); return t.length ? Math.min(...t) : null; };

async function loadBox(code) {
  const r = await fetch(`${EL_LIVE}Boxscore?gamecode=${code}&seasoncode=${season()}`, { headers: { accept: "application/json" } });
  const t = r.ok ? await r.text() : "";
  if (!t) return null;
  const d = JSON.parse(t);
  if (!d.Stats || d.Stats.length < 2) return null;
  const teams = d.Stats.map(s => {
    const pl = {};
    s.PlayersStats.forEach(p => pl[p.Player_ID.replace(/^P/, "").trim()] = { pir: p.Valuation, min: p.Minutes });
    return { pts: +(s.totr?.Points || 0), pl };
  });
  return { live: !!d.Live, teams };
}

// Same scoring as the pages: ±10% of |PIR| for the result, × group (Bench Boost lifts 50%), × captain (Triple Captain 3×).
function coachRoundTotal(doc, round, games, boxes) {
  const wc = doc?.chips?.[round] || {};
  let total = 0;
  for (const p of doc?.roster || []) {
    const g = games.find(g => g.r === round && (g.h === p.club || g.a === p.club));
    const b = g && boxes[g.c];
    if (!b) continue;
    const home = g.h === p.club;
    const ti = b.teams[0].pl[p.code] ? 0 : b.teams[1].pl[p.code] ? 1 : (home ? 0 : 1);
    const me = b.teams[ti], them = b.teams[1 - ti], st = me.pl[p.code];
    const raw = st && !/dnp/i.test(st.min || "") ? st.pir : 0;
    const win = me.pts > them.pts;
    const base = b.live ? raw : r2(raw + (win ? 1 : -1) * Math.abs(raw) * 0.1);
    const full = p.slot === "full";
    const share = (full ? 1 : p.slot === "half" ? (wc.bb ? 1 : 0.5) : 0) * (p.captain && full ? (wc.tc ? 3 : 2) : 1);
    total += r2(base * share);
  }
  return r2(total);
}

async function readLeague(DB) {
  const row = await DB.prepare("SELECT v FROM kv WHERE k = 'league'").first();
  return row ? { raw: row.v, L: JSON.parse(row.v) } : null;
}

// First use: start on the latest Euroleague round that has tipped off.
async function initLeague(DB) {
  const games = await loadGames(), now = Date.now();
  const started = games.filter(g => g.u <= now);
  const round = started.length ? Math.max(...started.map(g => g.r)) : Math.min(...games.map(g => g.r));
  const L = { round, nextTip: firstTip(games, round + 1), history: {} };
  await DB.batch([
    DB.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES ('league', ?)").bind(JSON.stringify(L)),
    DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('meta', ?)").bind(JSON.stringify({ v: newVersion() })),
  ]);
  return readLeague(DB);
}

// Bank the finished round and move to the next one. Returns true if this call did it.
async function startRound(env, cur, by) {
  const DB = env.DB, { L, raw } = cur, round = L.round;
  const games = await loadGames();
  const { results } = await DB.prepare("SELECT k, v FROM kv WHERE k LIKE 'coach/%'").all();
  const docs = Object.fromEntries(results.map(r => [r.k.slice(6), JSON.parse(r.v)]));
  const clubs = new Set(Object.values(docs).flatMap(d => (d.roster || []).map(p => p.club)));
  const boxes = {};
  await Promise.all(games.filter(g => g.r === round && (clubs.has(g.h) || clubs.has(g.a)))
    .map(async g => { try { boxes[g.c] = await loadBox(g.c); } catch {} }));
  const totals = Object.fromEntries(COACHES.map(n => [n, coachRoundTotal(docs[n], round, games, boxes)]));
  const next = { round: round + 1, nextTip: firstTip(games, round + 2),
                 history: { ...(L.history || {}), [round]: { totals, at: Date.now(), by, id: crypto.randomUUID() } } };   // id: two simultaneous starts never produce the same record
  const nextRaw = JSON.stringify(next);
  const onlyIfWon = "(SELECT v FROM kv WHERE k = 'league') = ?";
  const res = await DB.batch([
    DB.prepare("UPDATE kv SET v = ? WHERE k = 'league' AND v = ?").bind(nextRaw, raw),       // compare-and-swap: one winner
    ...COACHES.filter(n => docs[n]).map(n => DB.prepare(
      `UPDATE kv SET v = json_set(v, '$.base', round(coalesce(json_extract(v, '$.base'), 0) + ?, 2)) WHERE k = ? AND ${onlyIfWon}`)
      .bind(totals[n], `coach/${n}`, nextRaw)),
    DB.prepare(`UPDATE kv SET v = ? WHERE k = 'meta' AND ${onlyIfWon}`).bind(JSON.stringify({ v: newVersion() }), nextRaw),
  ]);
  return res[0].meta.changes === 1;
}

let autoBusy = null;
export async function maybeAutoStart(env) {
  const cur = (await readLeague(env.DB)) || (await initLeague(env.DB));
  if (!cur || !cur.L.nextTip || Date.now() < cur.L.nextTip - AUTO_BEFORE) return;
  if (!autoBusy) autoBusy = startRound(env, cur, "auto").finally(() => { autoBusy = null; });
  await autoBusy;
}

// Cron (every minute): start the round 3 h before the next one even if nobody has the app open.
export async function scheduledCheck(env) {
  if (!env.DB) return;
  await setup(env.DB);
  await maybeAutoStart(env);
}

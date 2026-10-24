// Shared league state for everyone who opens the site (Cloudflare Worker + D1).
// GET  /api/state[?since=<v>]  → {v, coaches:{name:{roster, chips, team, base}}, league:{round, votes, …}}  (204 if nothing changed)
// POST /api/state {coach, data:{roster?, chips?, team?, base?}}  → updates just those fields of that coach, bumps the version
// Round voting / banking lives in rounds.js.
// Needs a D1 database bound as `DB` (see wrangler.jsonc). The table is created on first use, and the
// data is copied once from the old Netlify site if the database is still empty.

export const COACHES = ["Justelis", "Darius", "Deivis", "Novikas", "Titas", "Saimonas"];
const SLOTS = new Set(["full", "half", "zero"]);
import { maybeAutoStart } from "./rounds.js";
const OLD_SITE = "https://euroleague-fantasy.netlify.app/api/state";
const NO_CACHE = { "cache-control": "no-store" };
export const json = (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json", ...NO_CACHE } });
const str = (v, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");

function cleanRoster(list) {
  if (!Array.isArray(list)) return undefined;
  const seen = new Set();
  return list.slice(0, 13).filter(p => p && typeof p.code === "string" && !seen.has(p.code) && seen.add(p.code)).map(p => ({
    code: str(p.code, 20), name: str(p.name), club: str(p.club, 10), tv: str(p.tv, 10), clubName: str(p.clubName),
    crest: str(p.crest, 300), img: str(p.img, 300), pos: str(p.pos, 3),
    slot: SLOTS.has(p.slot) ? p.slot : "zero", ...(p.captain ? { captain: true } : {}),
    ...(Number.isFinite(p.order) ? { order: Math.round(p.order) } : {}),   // manual position within the group
  }));
}
function cleanChips(c) {
  if (!c || typeof c !== "object") return undefined;
  const out = {};
  for (const [round, v] of Object.entries(c).slice(0, 60)) {
    if (!/^\d{1,3}$/.test(round) || !v || typeof v !== "object") continue;
    const r = {};
    if (v.tc) r.tc = true;
    if (v.bb) r.bb = true;
    if (Object.keys(r).length) out[round] = r;
  }
  return out;
}
function merge(cur, d) {
  const next = { ...cur };
  const roster = cleanRoster(d.roster); if (roster) next.roster = roster;
  const chips = cleanChips(d.chips);    if (chips) next.chips = chips;
  if ("base" in d) { const b = Number(d.base); if (Number.isFinite(b) && Math.abs(b) < 1e6) next.base = Math.round(b * 100) / 100; else delete next.base; }
  if ("team" in d) { const t = str(d.team, 40).trim(); if (t) next.team = t; else delete next.team; }
  return next;
}
export const newVersion = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

let ready = false;
export async function setup(DB) {
  if (ready) return;
  await DB.prepare("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)").run();
  const meta = await DB.prepare("SELECT v FROM kv WHERE k = 'meta'").first();
  if (!meta) {                                   // brand-new database: bring over the Netlify data once
    let coaches = {};
    try {
      const r = await fetch(OLD_SITE, { headers: { accept: "application/json" } });
      if (r.ok) coaches = (await r.json()).coaches || {};
    } catch {}
    const stmts = COACHES.filter(n => coaches[n]).map(n =>
      DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)").bind(`coach/${n}`, JSON.stringify(merge({}, coaches[n]))));
    stmts.push(DB.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES ('meta', ?)").bind(JSON.stringify({ v: newVersion(), importedFromNetlify: Object.keys(coaches).filter(n => coaches[n]).length })));
    await DB.batch(stmts);
  }
  ready = true;
}

export async function getState(request, env) {
  if (!env.DB) return json({ error: "D1 database not bound as DB" }, { status: 500 });
  await setup(env.DB);
  await maybeAutoStart(env).catch(e => console.log("auto-start check failed", e));
  const meta = JSON.parse((await env.DB.prepare("SELECT v FROM kv WHERE k = 'meta'").first())?.v || '{"v":"0"}');
  const since = new URL(request.url).searchParams.get("since");
  if (since && since === meta.v) return new Response(null, { status: 204, headers: NO_CACHE });
  const { results } = await env.DB.prepare("SELECT k, v FROM kv WHERE k LIKE 'coach/%' OR k = 'league'").all();
  const coaches = Object.fromEntries(COACHES.map(n => [n, null]));
  let league = null;
  for (const row of results) {
    if (row.k === "league") { league = JSON.parse(row.v); continue; }
    const n = row.k.slice(6); if (n in coaches) coaches[n] = JSON.parse(row.v);
  }
  return json({ v: meta.v, coaches, league });
}

// Each field is written on its own inside the database (json_set), so two saves at the same moment —
// e.g. a roster edit while a round is being banked into `base` — can't overwrite each other.
export async function postState(request, env) {
  if (!env.DB) return json({ error: "D1 database not bound as DB" }, { status: 500 });
  await setup(env.DB);
  let body;
  try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
  const coach = body?.coach;
  if (!COACHES.includes(coach)) return new Response("Unknown coach", { status: 400 });
  const d = body.data || {};
  const sets = [], args = [], removes = [];
  const roster = cleanRoster(d.roster); if (roster) { sets.push("'$.roster', json(?)"); args.push(JSON.stringify(roster)); }
  const chips = cleanChips(d.chips);    if (chips)  { sets.push("'$.chips', json(?)");  args.push(JSON.stringify(chips)); }
  if ("base" in d) { const b = Number(d.base); if (Number.isFinite(b) && Math.abs(b) < 1e6) { sets.push("'$.base', ?"); args.push(Math.round(b * 100) / 100); } else removes.push("'$.base'"); }
  if ("team" in d) { const t = str(d.team, 40).trim(); if (t) { sets.push("'$.team', ?"); args.push(t); } else removes.push("'$.team'"); }
  let expr = "v";
  if (sets.length) expr = `json_set(${expr}, ${sets.join(", ")})`;
  if (removes.length) expr = `json_remove(${expr}, ${removes.join(", ")})`;
  const v = newVersion();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES (?, '{}')").bind(`coach/${coach}`),
    env.DB.prepare(`UPDATE kv SET v = ${expr} WHERE k = ?`).bind(...args, `coach/${coach}`),
    env.DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('meta', ?)").bind(JSON.stringify({ v })),
  ]);
  return json({ v });
}

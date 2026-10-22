// Shared league state for everyone who opens the site.
// GET  /api/state[?since=<v>]  → {v, coaches:{name:{roster, chips, team, base}}}  (204 if nothing changed since <v>)
// POST /api/state {coach, data:{roster?, chips?, team?, base?}}  → merges into that coach, bumps the version
// base = custom PIR carried into the season total (set by hand on the League page)
import { getStore } from "@netlify/blobs";

const COACHES = ["Justelis", "Darius", "Deivis", "Novikas", "Titas", "Saimonas"];
const SLOTS = new Set(["full", "half", "zero"]);
const NO_CACHE = { "cache-control": "no-store" };
const store = () => getStore({ name: "league", consistency: "strong" });
const str = (v, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");

function cleanRoster(list) {
  if (!Array.isArray(list)) return undefined;
  const seen = new Set();
  return list.slice(0, 13).filter(p => p && typeof p.code === "string" && !seen.has(p.code) && seen.add(p.code)).map(p => ({
    code: str(p.code, 20), name: str(p.name), club: str(p.club, 10), tv: str(p.tv, 10), clubName: str(p.clubName),
    crest: str(p.crest, 300), img: str(p.img, 300), pos: str(p.pos, 3),
    slot: SLOTS.has(p.slot) ? p.slot : "zero", ...(p.captain ? { captain: true } : {}),
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

export default async (req) => {
  const s = store();
  if (req.method === "GET") {
    const meta = (await s.get("meta", { type: "json" })) || { v: "0" };
    const since = new URL(req.url).searchParams.get("since");
    if (since && since === meta.v) return new Response(null, { status: 204, headers: NO_CACHE });
    const coaches = {};
    await Promise.all(COACHES.map(async n => { coaches[n] = (await s.get(`coach/${n}`, { type: "json" })) || null; }));
    return Response.json({ v: meta.v, coaches }, { headers: NO_CACHE });
  }
  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
    const coach = body?.coach;
    if (!COACHES.includes(coach)) return new Response("Unknown coach", { status: 400 });
    const d = body.data || {};
    const cur = (await s.get(`coach/${coach}`, { type: "json" })) || {};
    const next = { ...cur };
    const roster = cleanRoster(d.roster); if (roster) next.roster = roster;
    const chips = cleanChips(d.chips);    if (chips) next.chips = chips;
    if ("base" in d) { const b = Number(d.base); if (Number.isFinite(b) && Math.abs(b) < 1e6) next.base = Math.round(b * 100) / 100; else delete next.base; }
    if ("team" in d) { const t = str(d.team, 40).trim(); if (t) next.team = t; else delete next.team; }
    await s.setJSON(`coach/${coach}`, next);
    const v = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await s.setJSON("meta", { v });
    return Response.json({ v }, { headers: NO_CACHE });
  }
  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/state" };

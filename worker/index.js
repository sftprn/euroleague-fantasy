// Cloudflare Worker for Euroleague Fantasy.
// Static pages/assets are served straight from the repo; only these paths run code (see wrangler.jsonc):
//   /api/state   shared league data (D1)
//   /api/round   "Start Round X" votes (rounds.js)
//   /el-api/*    → https://api-live.euroleague.net/*   (players, schedule)
//   /el-live/*   → https://live.euroleague.net/api/*   (live box scores, play-by-play, game clock)
// Euroleague's servers don't reliably allow browser calls from other sites, so the Worker fetches for the browser.
import { getState, postState } from "./state.js";
import { postRound, scheduledCheck } from "./rounds.js";

// Euroleague rate-limits bursts, so answers are kept and shared by all phones:
//   finished game box score / play-by-play → stored in D1 for good (never changes)
//   everything else → a short in-memory copy: live data / game clock 10 s, schedule 5 min, player list 6 h
// (Cloudflare's own cache API does nothing on *.workers.dev addresses.) Errors are never kept.
const mem = new Map();                       // url → {exp, type, body}
let tableReady = false;
function ttlFor(path, body) {
  if (/^\/el-live\/(Boxscore|PlayByPlay)$/i.test(path)) {
    if (!body) return 10;
    try {
      const d = JSON.parse(body);
      const scored = d.Stats ? (d.Stats[0]?.totr?.Points || 0) + (d.Stats[1]?.totr?.Points || 0) > 0 : !!(d.ForthQuarter || []).length;
      return d.Live === false && scored ? Infinity : 10;
    } catch { return 0; }
  }
  if (/^\/el-live\//.test(path)) return 10;
  if (/\/games$/.test(path)) return 300;
  if (/\/people$/.test(path)) return 6 * 3600;
  return 60;
}
const reply = (body, type, extra = {}) => new Response(body, { status: 200, headers: { "content-type": type, "cache-control": "no-store", ...extra } });
async function forward(url, prefix, base, env, ctx) {
  const target = base + url.pathname.slice(prefix.length) + url.search;
  const m = mem.get(target);
  if (m && m.exp > Date.now()) return reply(m.body, m.type, { "x-elf-cache": "mem" });
  const finalKind = /^\/el-live\/(Boxscore|PlayByPlay)$/i.test(url.pathname);
  if (finalKind && env.DB) {
    try {
      if (!tableReady) { await env.DB.prepare("CREATE TABLE IF NOT EXISTS elcache (k TEXT PRIMARY KEY, v TEXT NOT NULL)").run(); tableReady = true; }
      const row = await env.DB.prepare("SELECT v FROM elcache WHERE k = ?").bind(target).first();
      if (row) return reply(row.v, "application/json", { "x-elf-cache": "db" });
    } catch {}
  }
  const r = await fetch(target, { headers: { accept: "application/json" } });
  const body = await r.text();
  const type = r.headers.get("content-type") || "application/json";
  const looksRight = body === "" || body.trimStart().startsWith("{") || body.trimStart().startsWith("[");
  if (!r.ok || !looksRight) {   // e.g. Euroleague's "error code: 1015" rate-limit page → tell the app to retry shortly
    return new Response(body, { status: r.ok ? 503 : r.status, headers: { "content-type": "text/plain", "cache-control": "no-store", "retry-after": "5" } });
  }
  const ttl = ttlFor(url.pathname, body);
  if (ttl === Infinity && env.DB) ctx.waitUntil(env.DB.prepare("INSERT OR IGNORE INTO elcache (k, v) VALUES (?, ?)").bind(target, body).run().catch(() => {}));
  else if (ttl > 0) {
    mem.set(target, { exp: Date.now() + ttl * 1000, type, body });
    if (mem.size > 400) for (const [k, v] of mem) if (v.exp < Date.now() || mem.size > 300) mem.delete(k);
  }
  return reply(body, type);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/state") {
      if (request.method === "GET") return getState(request, env);
      if (request.method === "POST") return postState(request, env);
      return new Response("Method not allowed", { status: 405 });
    }
    if (url.pathname === "/api/round" && request.method === "POST") return postRound(request, env);
    if (request.method === "GET" && url.pathname.startsWith("/el-api/")) return forward(url, "/el-api/", "https://api-live.euroleague.net/", env, ctx);
    if (request.method === "GET" && url.pathname.startsWith("/el-live/")) return forward(url, "/el-live/", "https://live.euroleague.net/api/", env, ctx);
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(scheduledCheck(env));
  },
};

// Cloudflare Worker for Euroleague Fantasy.
// Static pages/assets are served straight from the repo; only these paths run code (see wrangler.jsonc):
//   /api/state   shared league data (D1)
//   /el-api/*    → https://api-live.euroleague.net/*   (players, schedule)
//   /el-live/*   → https://live.euroleague.net/api/*   (live box scores, game clock)
// Euroleague's servers don't reliably allow browser calls from other sites, so the Worker fetches for the browser.
import { getState, postState } from "./state.js";

async function forward(url, prefix, base) {
  const r = await fetch(base + url.pathname.slice(prefix.length) + url.search, { headers: { accept: "application/json" } });
  return new Response(r.body, {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/state") {
      if (request.method === "GET") return getState(request, env);
      if (request.method === "POST") return postState(request, env);
      return new Response("Method not allowed", { status: 405 });
    }
    if (request.method === "GET" && url.pathname.startsWith("/el-api/")) return forward(url, "/el-api/", "https://api-live.euroleague.net/");
    if (request.method === "GET" && url.pathname.startsWith("/el-live/")) return forward(url, "/el-live/", "https://live.euroleague.net/api/");
    return env.ASSETS.fetch(request);
  },
};

// /el-live/* → https://live.euroleague.net/api/*   (live box scores and game clock)
// Euroleague's servers don't reliably allow browser calls from other sites, so the site fetches for the browser.
export async function onRequestGet({ request, params }) {
  const path = [].concat(params.path || []).map(encodeURIComponent).join("/");
  const r = await fetch(`https://live.euroleague.net/api/${path}${new URL(request.url).search}`, { headers: { accept: "application/json" } });
  return new Response(r.body, {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" },
  });
}

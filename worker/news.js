// GET /api/news?name=Nikola%20Mirotic → latest headlines about one player from the chosen portals.
// Source: Google News search feeds (two searches: English edition with the full name; Lithuanian edition with the
// surname's Lithuanian forms, since LT portals decline foreign names: Mirotic → Mirotičius / Mirotičiaus).
// Only headlines that contain the player's name are kept. Answers are kept 30 min (D1 + memory) for everyone.

export const SITES = ["sportas.lt", "lrt.lt", "eurobasket.lt", "15min.lt", "delfi.lt", "euroleaguebasketball.net", "krepsinis.net"];
const TTL = 30 * 60e3;
const MAX_AGE = 120 * 86400e3;                 // ignore stories older than ~4 months
const mem = new Map();
let tableReady = false;

const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Lithuanian forms of a surname (nominative + genitive are what headlines use most)
export function ltForms(surname) {
  const s = String(surname || "").trim(), low = fold(s), out = new Set([s]);
  const add = (stem, ...ends) => ends.forEach(e => out.add(stem + e));
  if (/(ic|ich)$/.test(low)) add(s.replace(/(ch|ć|c)$/i, ""), "čius", "čiaus");                            // Mirotic → Mirotičius
  else if (/ius$/.test(low)) add(s.slice(0, -3), "iaus");                                                  // Lekavičius → Lekavičiaus
  else if (/tis$/.test(low)) add(s.slice(0, -3), "čio", "tis");                                             // Jokubaitis → Jokubaičio
  else if (/dis$/.test(low)) add(s.slice(0, -3), "džio");                                                   // Brazdeikis-like -dis → -džio
  else if (/[iy]s$/.test(low)) add(s.slice(0, -2), "io", "isas", "iso");                                    // Sedekerskis → Sedekerskio; Davis → Davisas
  else if (/us$/.test(low)) add(s.slice(0, -2), "aus");                                                     // Valančiūnas-like -us
  else if (/as$/.test(low)) add(s.slice(0, -2), "o", "aso");                                                // Lithuanian -as → -o; Thomas → Thomaso
  else if (/s$/.test(low)) add(s, "as", "o");                                                               // James → Jamesas, Jameso
  else if (/er$/.test(low)) add(s, "is", "io");                                                             // Punter → Punteris, Punterio
  else if (/a$/.test(low)) add(s.slice(0, -1), "os");                                                       // Hezonja → Hezonjos
  else if (/[bcdfghjklmnpqrtvwxz]$/.test(low)) add(s, "as", "o");                                           // Lessort → Lessortas, Lessorto
  return [...out];
}
// the part of the surname every form starts with (for the headline check)
const stemOf = surname => { const f = fold(surname).replace(/[^a-z'-]/g, ""); return f.length > 5 ? f.slice(0, f.length - 2) : f.slice(0, Math.max(3, f.length - 1)); };

const ent = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
function parse(xml, lang) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const x = m[1], tag = t => { const r = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(x); return r ? ent(r[1]) : ""; };
    const src = /<source url="([^"]*)">([\s\S]*?)<\/source>/.exec(x);
    let title = tag("title");
    const source = src ? ent(src[2]) : "";
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));   // Google adds " - Source"
    items.push({ title, link: tag("link"), at: Date.parse(tag("pubDate")) || 0, source, site: src ? src[1].replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "") : "", lang });
  }
  return items;
}
async function search(q, hl, gl, ceid, lang) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; EL-Fantasy/1.0)", accept: "application/rss+xml, text/xml" } });
  if (!r.ok) throw new Error(`news ${r.status} ${r.headers.get("location") || ""} ${(await r.text()).slice(0, 120)}`);
  return parse(await r.text(), lang);
}

export async function getNews(request, env, ctx) {
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!/^[\p{L}][\p{L}' .-]{1,59}$/u.test(name)) return json({ error: "bad name" }, 400);
  const key = "news:" + fold(name);
  const now = Date.now();
  const m = mem.get(key);
  if (m && now - m.t < TTL) return json(m.v);
  if (env.DB) {
    try {
      if (!tableReady) { await env.DB.prepare("CREATE TABLE IF NOT EXISTS elcache (k TEXT PRIMARY KEY, v TEXT NOT NULL)").run(); tableReady = true; }
      const row = await env.DB.prepare("SELECT v FROM elcache WHERE k = ?").bind(key).first();
      if (row) { const v = JSON.parse(row.v); if (now - v.t < TTL) { mem.set(key, { t: v.t, v }); return json(v); } }
    } catch {}
  }

  const parts = name.split(" "), surname = parts.slice(1).join(" ") || name;
  const sites = list => "(" + list.map(s => "site:" + s).join(" OR ") + ")";
  const forms = ltForms(parts[parts.length - 1]);
  const [en, lt] = await Promise.allSettled([
    search(`"${name}" ${sites(SITES)}`, "en-US", "US", "US:en", "en"),
    search(`(${forms.map(f => `"${f}"`).join(" OR ")}) ${sites(SITES.filter(s => s !== "euroleaguebasketball.net"))}`, "lt", "LT", "LT:lt", "lt"),
  ]);
  if (en.status === "rejected" && lt.status === "rejected") return json({ error: "news unavailable", why: String(en.reason?.message || en.reason).slice(0, 300) }, 503);

  const stem = stemOf(parts[parts.length - 1]);
  const seen = new Set();
  const items = [...(en.value || []), ...(lt.value || [])]
    .filter(i => i.title && fold(i.title).includes(stem))                      // the player is in the headline
    .filter(i => !i.at || now - i.at < MAX_AGE)
    .filter(i => SITES.some(s => i.site === s || i.site.endsWith("." + s)))   // only the chosen portals
    .sort((a, b) => b.at - a.at)
    .filter(i => { const k = fold(i.title).slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 25);
  const v = { t: now, name, items };
  mem.set(key, { t: now, v });
  if (mem.size > 300) for (const [k, x] of mem) if (now - x.t > TTL) mem.delete(k);
  if (env.DB) ctx.waitUntil(env.DB.prepare("INSERT OR REPLACE INTO elcache (k, v) VALUES (?, ?)").bind(key, JSON.stringify(v)).run().catch(() => {}));
  return json(v);
}
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// TEMPORARY (branch only): which news feeds can the Worker read? Fixed list, no user-supplied URLs.
const PROBE = [
  "https://www.bing.com/news/search?q=Mirotic&format=rss",
  "https://www.bing.com/news/search?q=Miroti%C4%8Dius&format=rss&setmkt=lt-LT",
  "https://www.15min.lt/rss", "https://www.15min.lt/rss/sportas", "https://www.15min.lt/rss/krepsinis",
  "https://www.delfi.lt/rss/feeds/sport.xml", "https://www.delfi.lt/rss/feeds/daily.xml", "https://www.delfi.lt/sportas/rss",
  "https://www.lrt.lt/rss", "https://www.lrt.lt/naujienos/sportas?rss", "https://www.lrt.lt/tema/krepsinis?rss",
  "https://www.krepsinis.net/rss", "https://www.krepsinis.net/rss.xml", "https://www.krepsinis.net/feed",
  "https://www.sportas.lt/rss", "https://www.sportas.lt/feed", "https://www.sportas.lt/rss.xml",
  "https://www.eurobasket.lt/rss", "https://www.eurobasket.lt/feed", "https://www.eurobasket.lt/rss.xml",
  "https://www.euroleaguebasketball.net/rssfeed", "https://www.euroleaguebasketball.net/euroleague/news/rss", "https://www.euroleaguebasketball.net/feed",
];
export async function probeNews() {
  const out = await Promise.all(PROBE.map(async u => {
    try {
      const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; EL-Fantasy/1.0)", accept: "application/rss+xml, text/xml, */*" }, redirect: "follow" });
      const t = await r.text();
      return { u, status: r.status, type: r.headers.get("content-type"), items: (t.match(/<item[\s>]/g) || []).length, head: t.slice(0, 90).replace(/\s+/g, " ") };
    } catch (e) { return { u, err: String(e.message || e) }; }
  }));
  return json(out);
}

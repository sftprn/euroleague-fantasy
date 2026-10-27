// GET /api/news?name=Nikola%20Mirotic → latest headlines about one player from the chosen portals.
// Sources (Google News blocks Cloudflare's servers, so it isn't used):
//   1. Bing News search feeds, limited to the chosen sites: English (full name) + Lithuanian (the surname's Lithuanian
//      forms, since LT portals decline foreign names: Mirotic → Mirotičius / Mirotičiaus)
//   2. the portals' own feeds (15min, Delfi, LRT, krepsinis.net), read directly and searched for the same name forms;
//      sportas.lt and eurobasket.lt have no feed, euroleaguebasketball.net refuses the server — those come via Bing only
// Only stories that name the player in the headline or the summary are kept. Answers are kept 30 min (D1 + memory) for everyone.

export const SITES = ["sportas.lt", "lrt.lt", "eurobasket.lt", "15min.lt", "delfi.lt", "euroleaguebasketball.net", "krepsinis.net"];
const TTL = 30 * 60e3;
const FEEDS = [
  ["https://www.15min.lt/rss/sportas", "15min.lt"],
  ["https://www.delfi.lt/rss/feeds/sport.xml", "delfi.lt"],
  ["https://www.lrt.lt/tema/krepsinis?rss", "lrt.lt"],
  ["https://www.krepsinis.net/rss", "krepsinis.net"],
];
const FEED_TTL = 10 * 60e3;
let feedCache = { t: 0, items: [] };
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
const siteOf = u => String(u || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/[\/?#].*$/, "").toLowerCase();
function parse(xml, lang, fixedSource) {
  const items = [];
  for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)) {
    const x = m[1], tag = t => { const r = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, "i").exec(x); return r ? ent(r[1]) : ""; };
    let link = tag("link"), title = tag("title");
    const real = /[?&]url=([^&]+)/.exec(link);                       // Bing wraps the article address
    if (/bing\.com\/news\/apiclick/i.test(link) && real) link = decodeURIComponent(real[1]);
    const site = siteOf(link);
    const source = fixedSource || tag("News:Source") || site;
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    const about = tag("description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
    items.push({ title, link, at: Date.parse(tag("pubDate")) || 0, source, site, lang, about });
  }
  return items;
}
const UA = { "user-agent": "Mozilla/5.0 (compatible; EL-Fantasy/1.0)", accept: "application/rss+xml, text/xml" };
async function search(q, mkt, lang) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setmkt=${mkt}&setlang=${lang}&count=50`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error("news " + r.status);
  return parse(await r.text(), lang);
}
// the portals' own feeds: read once per 10 min, shared by every player's search
async function feeds() {
  if (Date.now() - feedCache.t < FEED_TTL) return feedCache.items;
  const all = await Promise.allSettled(FEEDS.map(async ([u, site]) => {
    const r = await fetch(u, { headers: UA });
    if (!r.ok) throw new Error(r.status);
    return parse(await r.text(), "lt", site).map(i => ({ ...i, site: i.site || site }));
  }));
  feedCache = { t: Date.now(), items: all.flatMap(x => x.status === "fulfilled" ? x.value : []) };
  return feedCache.items;
}

export async function getNews(request, env, ctx) {
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!/^[\p{L}][\p{L}' .-]{1,59}$/u.test(name)) return json({ error: "bad name" }, 400);
  const key = "news2:" + fold(name);
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
  const ltq = `(${forms.map(f => `"${f}"`).join(" OR ")})`;
  // Lithuanian: searched with and without the site list (Bing ranks better without it); only the chosen sites are kept below
  const [en, lt, lt2, fd] = await Promise.allSettled([
    search(`"${name}" ${sites(SITES)}`, "en-US", "en"),
    search(`${ltq} ${sites(SITES.filter(s => s !== "euroleaguebasketball.net"))}`, "lt-LT", "lt"),
    search(`${ltq} krepšinis`, "lt-LT", "lt"),
    feeds(),
  ]);
  if ([en, lt, lt2, fd].every(x => x.status === "rejected")) return json({ error: "news unavailable" }, 503);

  const stem = stemOf(parts[parts.length - 1]);
  const hit = new RegExp(`(^|[^a-z])${stem.replace(/[-']/g, "[-' ]?")}`);    // the name has to start a word
  const named = i => hit.test(fold(i.title)) || hit.test(fold(i.about));
  const seen = new Set();
  const items = [...(en.value || []), ...(lt.value || []), ...(lt2.value || []), ...(fd.value || [])]
    .filter(i => i.title && named(i))                                          // the player is in the headline or the summary
    .map(i => ({ ...i, lang: /[ąčęėįšųūž]/i.test(i.title) || i.site.endsWith(".lt") || i.site === "krepsinis.net" ? "lt" : "en" }))
    .filter(i => !i.at || now - i.at < MAX_AGE)
    .filter(i => SITES.some(s => i.site === s || i.site.endsWith("." + s)))   // only the chosen portals
    .sort((a, b) => b.at - a.at)
    .filter(i => { const k = fold(i.title).slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 25)
    .map(({ about, ...i }) => ({ ...i, inTitle: hit.test(fold(i.title)) }));
  const v = { t: now, name, items };
  mem.set(key, { t: now, v });
  if (mem.size > 300) for (const [k, x] of mem) if (now - x.t > TTL) mem.delete(k);
  if (env.DB) ctx.waitUntil(env.DB.prepare("INSERT OR REPLACE INTO elcache (k, v) VALUES (?, ?)").bind(key, JSON.stringify(v)).run().catch(() => {}));
  return json(v);
}
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });


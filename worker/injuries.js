// Injury report: basketnews.com's EuroLeague injury report, read by the server and checked against the news.
//   GET /api/injuries → { fetchedAt, updated, entries: [{ name, team, club, pos, status, statusId, round, comment,
//                          next: {r, u, opp}, chance, severity: {level, label, typical, note}, verdict, signals, sources }] }
// Schedule (the 10-minute cron, see index.js): the report is re-read every 3 h, or every 10 min while any listed
// player's game is less than 3 h away. Each entry is then checked against the news (Bing News + basketball portals'
// feeds): whether other reports back it up, how serious the injury usually is, and a % chance he plays his next game.
// No AI is used: severity comes from a table of injury types; the % from the status, the expected return round and
// what the latest stories say. Everything is kept in D1 (kv 'injuries') and shared by every phone.
import { feeds, fold, ltForms, parse, search, UA } from "./news.js";

const REPORT = "https://basketnews.com/news-212393-euroleague-injury-report-updated.html";
const GAMES = "https://api-live.euroleague.net/v2/competitions/E/seasons/";
const EVERY = 3 * 3600e3, CLOSE = 3 * 3600e3, CLOSE_EVERY = 10 * 60e3;
const NEWS_VERSION = 3;                         // bump to re-check every entry with a new search method
const RESEARCH_EVERY = 12 * 3600e3, RESEARCH_CLOSE = 60 * 60e3, RESEARCH_PER_RUN = 10;
const NEWS_AGE = 21 * 86400e3;
// more sources than the News tab: international basketball sites' own feeds (read once per run, shared)
const EXTRA_FEEDS = [
  ["https://www.eurohoops.net/en/feed/", "eurohoops.net"],
  ["https://sportando.basketball/en/feed/", "sportando.basketball"],
  ["https://www.talkbasket.net/feed", "talkbasket.net"],
  ["https://basketnews.com/rss/news.xml", "basketnews.com"],
  ["https://www.eurohoops.net/en/category/euroleague/feed/", "eurohoops.net"],
];
const season = () => { const d = new Date(); return "E" + (d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1); };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const strip = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'")
  .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
const nameKey = s => fold(s).replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

/* ── the report page ── */
export function parseReport(html) {
  const updated = (/class="date[^"]*"[^>]*data-time="(\d+)"/.exec(html) || [])[1];
  const start = html.indexOf('id="injury-reports-table"');
  if (start < 0) return null;
  const end = html.indexOf("</table>", start);
  const body = html.slice(start, end > 0 ? end : undefined);
  const entries = [];
  let team = "";
  for (const tr of body.split(/<tr[\s>]/).slice(1)) {
    if (/injury_reports__team-row/.test(tr.slice(0, 200)) || /injury_reports__team-cell/.test(tr)) {
      team = strip((/<a [^>]*>([\s\S]*?)<\/a>/.exec(tr) || [])[1] || (/alt="([^"]+)"/.exec(tr) || [])[1] || "");
      continue;
    }
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    if (tds.length < 5) continue;
    const name = strip(tds[1]), st = /player-status__id-(\d+)[^>]*>([\s\S]*?)</.exec(tds[2]);
    if (!name || !st) continue;
    entries.push({ team, pos: strip(tds[0]), name, statusId: +st[1], status: strip(st[2]), round: strip(tds[3]), comment: strip(tds[4]),
                   link: (/href="([^"]+)"/.exec(tds[1]) || [])[1] || "" });
  }
  return { updated: updated ? +updated * 1000 : null, entries };
}

/* ── which Euroleague club a basketnews team name is ── */
const GENERIC = new Set(["basketball", "basket", "bc", "kk", "fc", "club", "the", "de", "cf"]);
const toks = s => fold(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter(w => w.length > 1 && !GENERIC.has(w));
function clubFor(team, clubs) {
  const t = new Set(toks(team));
  let best = null, score = 0;
  for (const c of clubs) {
    const o = new Set([...toks(c.n), ...toks(c.tv)]);
    const inter = [...t].filter(w => o.has(w)).length, sc = inter / Math.max(1, Math.min(t.size, o.size));
    if (sc > score){ score = sc; best = c; }
  }
  return score >= 0.5 ? best : null;
}

/* ── how serious: injury types and what they usually mean ── */
const KINDS = [
  [/coach'?s decision|\bdnp-cd\b|not in the rotation|\brest(ed|ing)?\b|personal reasons|family reasons|suspen|not included in (the )?(official )?(euroleague )?roster(?! \()/, 0, "Not an injury", "coach's decision / roster / other reasons"],
  [/achilles/, 3, "Achilles tendon", "6–12 months (when torn)"],
  [/\bacl\b|cruciate/, 3, "ACL (knee ligament)", "6–12 months"],
  [/season[- ]ending|out for (the )?season|for the rest of the season/, 3, "Season-ending", "rest of the season"],
  [/fractur|broken|break\b/, 3, "Fracture", "4–8 weeks or more"],
  [/surgery|operat/, 3, "Surgery", "usually 1–3 months"],
  [/menisc/, 2, "Meniscus (knee)", "2–8 weeks; longer if repaired"],
  [/concussion/, 2, "Concussion", "1–2 weeks (return protocol)"],
  [/hamstring/, 2, "Hamstring", "1–4 weeks; often recurs"],
  [/calf/, 2, "Calf", "1–4 weeks"],
  [/groin|adductor/, 2, "Groin", "1–3 weeks"],
  [/quad|thigh/, 2, "Thigh / quad", "1–3 weeks"],
  [/plantar|foot/, 2, "Foot", "2–6 weeks"],
  [/\bback (injury|pain|spasm|problem|issue|tightness)|lower back|spine|lumbar/, 2, "Back", "1–3 weeks; can linger"],
  [/shoulder/, 2, "Shoulder", "1–4 weeks"],
  [/knee/, 2, "Knee", "days to weeks — depends on the damage"],
  [/ankle/, 1, "Ankle", "1–3 weeks for a sprain"],
  [/hip/, 2, "Hip", "1–3 weeks"],
  [/muscle|strain|tear/, 2, "Muscle strain", "1–4 weeks"],
  [/wrist|hand|finger|thumb/, 1, "Hand / wrist", "days to 3 weeks"],
  [/bruise|contusion|knock/, 1, "Bruise / knock", "a few days"],
  [/\bill(ness)?\b|\bsick|\bflu\b|virus|fever|\bcold\b/, 1, "Illness", "a few days"],
  [/\bleg\b/, 2, "Leg", "days to a few weeks"],
];
const LT_KINDS = [[/achil/, "achilles"], [/kryžmin/, "acl"], [/lūž/, "fracture"], [/operac/, "surgery"], [/menisk/, "menisc"], [/smegenų sukrėt/, "concussion"],
  [/šlaunies|užpakalinio šlaunies/, "hamstring"], [/blauzd/, "calf"], [/kirkšn/, "groin"], [/pėd/, "foot"], [/nugar/, "lower back"], [/pet(ies|į|ys)/, "shoulder"],
  [/kel(io|is|į|iu)\b/, "knee"], [/čiurn/, "ankle"], [/raumen/, "muscle"], [/rieš|pirš|plašt/, "hand"], [/sumuš/, "bruise"], [/serga|liga|virus/, "ill"]];
const LEVEL = ["Not an injury", "Minor", "Moderate", "Serious"];
function kindOf(text) {
  const low = String(text || "").toLowerCase();               // Lithuanian words: matched with their letters, then mapped to English
  let t = fold(text);
  for (const [re, en] of LT_KINDS) if (re.test(low)) t += " " + en;
  for (const [re, level, label, typical] of KINDS) if (re.test(t)) return { level, label, typical };
  return null;
}
const POS = /\b(return(s|ed|ing)?|back (in|at|to) (practice|training)|cleared|available|will play|is expected to play|probable|full practice|good to go|in the lineup|grįž|sugrįž|treniruojasi|žais|bus pasiruoš)/;
const NEG = /\b(ruled out|will miss|to miss|sidelined|setback|out for|won'?t play|surgery|re-?injur|aggravat|praleis|nežais|neišvyks|trauma pasikartojo|operuot)/;

/* ── % chance to play the next game ── */
const BASE = { 1: 96, 2: 82, 3: 50, 4: 55, 7: 40, 5: 20, 6: 4 };      // Ready, Expected, Questionable, Game-time, Uncertain, Doubtful, Out
function chanceOf(e, nextRound, signals) {
  let p = BASE[e.statusId] ?? 45;
  const why = [`basketnews status “${e.status}”: ${p}%`];
  const r = fold(e.round);
  const nums = (r.match(/\d+/g) || []).map(Number);
  if (/long|indefinit|season|month/.test(r)) { p = Math.min(p, 2); why.push(`expected back: ${e.round} → ${p}%`); }
  else if (nums.length && nextRound) {
    const from = nums[0], to = nums[nums.length - 1];
    if (from > nextRound) { p = Math.min(p, 3); why.push(`expected back round ${from}, next game is round ${nextRound} → ${p}%`); }
    else if (to < nextRound && e.statusId >= 5) { p = Math.max(p, 45); why.push(`return was due by round ${to} → ${p}%`); }
    else if (from <= nextRound && nextRound <= to && from !== to && e.statusId === 6) { p = Math.max(p, 15); why.push(`return window rounds ${from}–${to} → ${p}%`); }
  }
  const k = kindOf(e.comment);
  if (k?.level === 0 && (e.statusId === 5 || e.statusId === 7)) { p = Math.max(p, 35); why.push(`reason isn't an injury (coach's decision / roster) → ${p}%`); }
  if (signals.pos && !signals.neg && p < 90) { p = Math.min(95, p + 12); why.push(`latest news sounds positive → ${p}%`); }
  if (signals.neg && !signals.pos && p > 3) { p = Math.max(1, p - 12); why.push(`latest news sounds negative → ${p}%`); }
  return { chance: Math.max(1, Math.min(97, Math.round(p))), why };
}

/* ── news about one player: Bing News (EN + LT forms) + the portals' feeds ── */
async function newsFor(e, shared) {
  // From Cloudflare's servers Bing returns little once extra words are added, so search the exact name and filter here
  const parts = e.name.split(" "), last = parts[parts.length - 1];
  const forms = ltForms(last);
  const [en, lt] = await Promise.allSettled([
    search(`"${e.name}"`, "en-US", "en"),
    search(`(${forms.map(f => `"${f}"`).join(" OR ")}) krepšinis`, "lt-LT", "lt"),
  ]);
  // the surname as a whole word: English spelling or one of its Lithuanian forms ("Warren" never matches "Warriors")
  const alts = [...new Set([last, ...forms].map(x => fold(x).replace(/[^a-z'-]/g, "")).filter(Boolean))].map(x => x.replace(/[-']/g, "[-' ]?")).join("|");
  const sur = new RegExp(`(^|[^a-z])(${alts})(?![a-z])`);
  const firstRaw = fold(parts[0]), first = firstRaw.replace(/[^a-z]/g, "");
  const initial = firstRaw.replace(/[^a-z.]/g, "").replace(/\./g, "\\.?");             // "T.J." → t\.?j\.?
  const full = new RegExp(`(^|[^a-z])(${first}[a-z']*|${initial}|${first[0]}\\.)\\s+(${alts})(?![a-z])`);   // "Mike James", "M. James", "TJ Warren", "Mike'as Jamesas"
  const club = toks(e.team).filter(w => w.length >= 4).map(w => w.slice(0, 5));         // "Barcelona" also matches "Barcelonos"
  const isHim = i => { const t = fold(i.title + " " + i.about); return full.test(t) || (sur.test(t) && club.some(c => t.includes(c))); };
  const now = Date.now(), seen = new Set();
  return [...(en.value || []), ...(lt.value || []), ...shared]
    .filter(i => i.title && isHim(i))
    .filter(i => !i.at || now - i.at < NEWS_AGE)
    .filter(i => !/basketnews\.com\/news-212393/.test(i.link))
    .sort((a, b) => b.at - a.at)
    .filter(i => { const k = fold(i.title).slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; });
}
async function research(e, nextRound, shared) {
  let items = [];
  try { items = await newsFor(e, shared); } catch {}
  // injury words in the languages these stories come in (EN, LT, IT, ES, FR, TR, EL, DE, SR/HR)
  const injuryWords = /injur|hurt|out\b|miss|return|sideline|doubtful|questionable|status|surgery|sprain|strain|pain|game-time|ruled|traum|praleis|grįž|serga|sveikat|nežais|infortun|in dubbio|stop\b|rientr|lesion|baja\b|duda|blessur|forfait|sakat|τραυμα|τραυματ|verletz|ausfall|povred|ozled/;
  const about = items.filter(i => injuryWords.test(fold(i.title + " " + i.about)));
  const recent = about.filter(i => !i.at || Date.now() - i.at < 7 * 86400e3);
  const text = recent.map(i => i.title + " " + i.about).join(" ");
  const signals = { pos: POS.test(fold(text)), neg: NEG.test(fold(text)) };
  const kind = kindOf(e.comment) || kindOf(text);
  const sevLevel = kind ? kind.level : e.statusId === 6 && /long|indefinit|season/.test(fold(e.round)) ? 3 : null;
  const severity = kind ? { level: kind.level, label: kind.label, typical: kind.typical, word: LEVEL[kind.level] }
                 : sevLevel != null ? { level: sevLevel, label: "Long-term absence", typical: e.round, word: LEVEL[sevLevel] } : null;
  const sites = [...new Set(about.map(i => i.source || i.site))];
  const verdict = about.length >= 2 ? `Backed by ${about.length} other reports (${sites.slice(0, 3).join(", ")}${sites.length > 3 ? "…" : ""})`
                : about.length === 1 ? `One other report mentions it (${sites[0]})` : "No other reports found yet — only the basketnews report";
  const { chance, why } = chanceOf(e, nextRound, signals);
  const sources = [{ title: "BasketNews EuroLeague injury report", link: REPORT, source: "basketnews.com", at: null },
                   ...about.slice(0, 6).map(i => ({ title: i.title, link: i.link, source: i.source || i.site, at: i.at || null }))];
  return { severity, verdict, signals, chance, why, sources, researchedAt: Date.now(), nv: NEWS_VERSION };
}

/* ── the scheduled job ── */
async function load(DB) {
  await DB.prepare("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)").run();
  const row = await DB.prepare("SELECT v FROM kv WHERE k = 'injuries'").first();
  return row ? JSON.parse(row.v) : null;
}
let busy = null;
export function injuryCheck(env, force = false) {
  if (!env.DB) return Promise.resolve();
  if (!busy) busy = run(env, force).catch(e => console.log("injury check failed", e?.message)).finally(() => { busy = null; });
  return busy;
}
async function run(env, force) {
  const DB = env.DB, now = Date.now();
  const cur = await load(DB);
  // the report: every 3 h, or every 10 min while a listed player's game is less than 3 h away
  const close = (cur?.entries || []).some(e => e.next && e.next.u - now < CLOSE && e.next.u > now - 30 * 60e3);
  const unmatched = (cur?.entries || []).some(e => !e.club);               // a team we couldn't place: try again sooner
  const reportDue = force || !cur || now - (cur.fetchedAt || 0) >= (close ? CLOSE_EVERY : unmatched ? 30 * 60e3 : EVERY);
  let doc = cur || { entries: [] };
  if (reportDue) doc = await readReport(cur, now);
  // news research: a few entries per run (the server may only make ~50 requests per run), most urgent first
  const entries = doc.entries;
  const queue = entries.filter(e => needsNews(e) && due(e, now) < 9).sort((a, b) => due(a, now) - due(b, now) || (a.next?.u || 9e15) - (b.next?.u || 9e15)).slice(0, RESEARCH_PER_RUN);
  if (!reportDue && !queue.length) return;
  if (queue.length) {
    const extra = await Promise.allSettled(EXTRA_FEEDS.map(async ([u, site]) => {
      const x = await fetch(u, { headers: UA });
      if (!x.ok) throw new Error(x.status);
      return parse(await x.text(), "en", site).map(i => ({ ...i, site: i.site || site }));
    }));
    let lt = [], elr = [];
    try { lt = await feeds(); } catch {}
    try { elr = await search(`"injury report" site:euroleaguebasketball.net`, "en-US", "en"); } catch {}   // Euroleague's own weekly injury report
    const shared = [...extra.flatMap(x => x.status === "fulfilled" ? x.value : []), ...lt, ...elr];
    await Promise.all(queue.map(async e => Object.assign(e, await research(e, e.next?.r, shared))));   // in parallel: a run must finish within ~30 s
  }
  for (const e of entries) if (e.chance == null || (!needsNews(e) && !e.researchedAt)) Object.assign(e, quick(e));
  await DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('injuries', ?)").bind(JSON.stringify(doc)).run();
}
// Ready players and not-an-injury entries (coach's decision, roster) don't need a news check
const needsNews = e => e.statusId !== 1 && kindOf(e.comment)?.level !== 0;
const due = (e, now) => !e.researchedAt || e.nv !== NEWS_VERSION ? 0 : e.next && e.next.u - now < CLOSE && now - e.researchedAt > RESEARCH_CLOSE ? 1 : now - e.researchedAt > RESEARCH_EVERY ? 2 : 9;
function quick(e) {                                          // status-based answer until (or instead of) the news check
  const k = kindOf(e.comment);
  return { ...chanceOf(e, e.next?.r, { pos: false, neg: false }),
    severity: k ? { level: k.level, label: k.label, typical: k.typical, word: LEVEL[k.level] } : null,
    verdict: e.statusId === 1 ? "Listed as ready to play" : k?.level === 0 ? "Not an injury — from the report's comment" : "Checking the news…",
    sources: [{ title: "BasketNews EuroLeague injury report", link: REPORT, source: "basketnews.com", at: null }],
    researchedAt: needsNews(e) ? null : Date.now() };
}
async function readReport(cur, now) {
  const games = await fetch(`${GAMES}${season()}/games`, { headers: { accept: "application/json" } }).then(r => r.json()).then(d => d.data || []).catch(() => []);
  const clubs = new Map();
  games.forEach(g => [g.local, g.road].forEach(s => s?.club?.code && clubs.set(s.club.code, { c: s.club.code, tv: s.club.tvCode || s.club.code,
    n: [s.club.name, s.club.editorialName, s.club.abbreviatedName, s.club.alias, s.club.city].filter(Boolean).join(" ") })));   // every name variant (e.g. "Barça" vs "FC Barcelona")
  const nextOf = code => {                                   // the club's next game not yet finished
    const g = games.filter(g => (g.local.club.code === code || g.road.club.code === code) && !g.played && Date.parse(g.utcDate) > now - 3 * 3600e3)
                   .sort((a, b) => Date.parse(a.utcDate) - Date.parse(b.utcDate))[0];
    if (!g) return null;
    const opp = g.local.club.code === code ? g.road.club : g.local.club;
    return { r: g.round, u: Date.parse(g.utcDate), opp: opp.tvCode || opp.code, home: g.local.club.code === code };
  };
  let r = null, html = "";
  try { r = await fetch(REPORT, { headers: { "user-agent": "Mozilla/5.0 (compatible; EL-Fantasy/1.0)", accept: "text/html" } }); html = r.ok ? await r.text() : ""; } catch {}
  const rep = parseReport(html);
  if (!rep || !rep.entries.length) return { ...(cur || { entries: [] }), fetchedAt: now, error: `report ${r ? r.status : "unreachable"}` };   // keep the last copy
  const prev = new Map((cur?.entries || []).map(e => [nameKey(e.name) + "|" + e.team, e]));
  const list = [...clubs.values()];
  const entries = rep.entries.map(e => {
    const club = clubFor(e.team, list), next = club ? nextOf(club.c) : null;
    const old = prev.get(nameKey(e.name) + "|" + e.team);
    const same = old && old.status === e.status && old.round === e.round && old.comment === e.comment && old.next?.r === next?.r;
    return { ...e, key: nameKey(e.name), club: club?.c || null, next, ...(same ? { severity: old.severity, verdict: old.verdict, signals: old.signals,
             chance: old.chance, why: old.why, sources: old.sources, researchedAt: old.researchedAt, nv: old.nv } : {}) };
  });
  return { fetchedAt: now, updated: rep.updated, entries };
}

export async function getInjuries(request, env, ctx) {
  if (!env.DB) return json({ error: "D1 database not bound as DB" }, 500);
  if (new URL(request.url).searchParams.get("feedprobe") === "1") {        // temporary: which feeds can the server read?
    const C = ["https://www.eurohoops.net/en/feed/", "https://sportando.basketball/en/feed/", "https://www.talkbasket.net/feed", "https://basketnews.com/rss/news.xml",
      "https://basketnews.com/rss.xml", "https://basketnews.com/rss/", "https://www.eurohoops.net/en/category/euroleague/feed/",
      "https://e00-marca.uecdn.es/rss/baloncesto.xml", "https://feeds.as.com/mrss-s/pages/as/site/as.com/section/baloncesto/portada/", "https://www.mundodeportivo.com/rss/baloncesto",
      "https://www.gazzetta.it/rss/basket.xml", "https://www.sportando.basketball/feed/", "https://www.sdna.gr/rss.xml", "https://www.gazzetta.gr/rss", "https://www.sport24.gr/rss",
      "https://www.fanatik.com.tr/rss/basketbol", "https://www.ntvspor.net/rss/basketbol", "https://www.sportal.rs/rss/kosarka", "https://www.mozzartsport.com/rss",
      "https://www.sport5.co.il/rss.aspx", "https://dwh.lequipe.fr/api/edito/rss?path=/Basket/", "https://www.basketinside.com/feed/", "https://www.euroleaguebasketball.net/rss",
      "https://www.eurohoops.net/gr/feed/", "https://www.eurohoops.net/es/feed/", "https://www.eurohoops.net/tr/feed/", "https://www.sportklub.rs/rss", "https://www.b92.net/info/rss/sport.xml",
      "https://www.15min.lt/rss/sportas", "https://www.delfi.lt/rss/feeds/sport.xml", "https://www.lrt.lt/tema/krepsinis?rss", "https://www.krepsinis.net/rss"];
    const out = await Promise.all(C.map(async u => { const t0 = Date.now(); try { const r = await fetch(u, { headers: UA, redirect: "follow" }); const x = await r.text();
      const items = parse(x, "en", "").length; const first = (/<item[\s>][\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/.exec(x) || [])[1] || "";
      return { u, status: r.status, items, ms: Date.now() - t0, first: first.replace(/<!\[CDATA\[|\]\]>/g, "").slice(0, 60) }; } catch (e) { return { u, err: String(e.message).slice(0, 60) }; } }));
    return json(out);
  }
  let cur = await load(env.DB);
  if (!cur) { await injuryCheck(env); cur = await load(env.DB); }      // very first time: wait for it
  else ctx.waitUntil(injuryCheck(env));                                  // otherwise refresh in the background when due
  return json(cur || { entries: [] });
}

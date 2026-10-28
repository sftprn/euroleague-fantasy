// Feedback: anyone can leave a note (anonymous); everyone sees the list; only the admin can mark items complete.
//   GET  /api/feedback                 → {items: [{id, text, at, done, doneAt}]}   newest first
//   POST /api/feedback        {text}   → add one (1–1000 characters)
//   POST /api/feedback/done   {id, done}   header x-admin: <password>   → mark complete / reopen
//   POST /api/feedback/delete {id}   header x-admin: <password>   → remove it for good
//   POST /api/feedback/login           header x-admin: <password>   → {ok} (the admin page checks the password)
//   POST /api/feedback/setup  {password}   → sets the admin password, only while none is set yet
// The admin password is never stored: only a random salt and a PBKDF2 hash of it, in the D1 kv table (not in the repo).
const NO_CACHE = { "cache-control": "no-store" };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json", ...NO_CACHE } });

let ready = false;
async function setup(DB) {
  if (ready) return;
  await DB.batch([
    DB.prepare("CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, at INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0, done_at INTEGER)"),
    DB.prepare("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)"),
  ]);
  ready = true;
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
async function hashPw(pw, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256);
  return hex(bits);
}
async function isAdmin(request, env) {
  const pw = request.headers.get("x-admin") || "";
  if (!pw) return false;
  const row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'admin'").first();
  if (!row) return false;
  const { salt, hash } = JSON.parse(row.v);
  const h = await hashPw(pw, salt);
  let diff = h.length ^ hash.length;                              // compare without stopping early
  for (let i = 0; i < Math.min(h.length, hash.length); i++) diff |= h.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export async function handleFeedback(request, env, path) {
  if (!env.DB) return json({ error: "D1 database not bound as DB" }, 500);
  await setup(env.DB);
  const DB = env.DB;
  if (path === "/api/feedback" && request.method === "GET") {
    const r = await DB.prepare("SELECT id, text, at, done, done_at FROM feedback ORDER BY at DESC LIMIT 500").all();
    return json({ items: (r.results || []).map(x => ({ id: x.id, text: x.text, at: x.at, done: !!x.done, doneAt: x.done_at || null })) });
  }
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body = {};
  try { body = await request.json(); } catch {}
  if (path === "/api/feedback") {
    const text = String(body.text || "").replace(/\r\n?/g, "\n").trim().slice(0, 1000);
    if (!text) return json({ error: "empty" }, 400);
    const at = Date.now();
    const r = await DB.prepare("INSERT INTO feedback (text, at) VALUES (?, ?)").bind(text, at).run();
    return json({ ok: true, item: { id: r.meta?.last_row_id, text, at, done: false, doneAt: null } });
  }
  if (path === "/api/feedback/setup") {
    const pw = String(body.password || "");
    if (pw.length < 4) return json({ error: "password too short" }, 400);
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const r = await DB.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES ('admin', ?)").bind(JSON.stringify({ salt, hash: await hashPw(pw, salt) })).run();
    return r.meta?.changes ? json({ ok: true }) : json({ error: "already set" }, 409);
  }
  if (!(await isAdmin(request, env))) return json({ error: "wrong password" }, 401);
  if (path === "/api/feedback/login") return json({ ok: true });
  if (path === "/api/feedback/done") {
    const id = Number(body.id), done = !!body.done;
    if (!Number.isInteger(id)) return json({ error: "bad id" }, 400);
    await DB.prepare("UPDATE feedback SET done = ?, done_at = ? WHERE id = ?").bind(done ? 1 : 0, done ? Date.now() : null, id).run();
    return json({ ok: true });
  }
  if (path === "/api/feedback/delete") {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return json({ error: "bad id" }, 400);
    await DB.prepare("DELETE FROM feedback WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}

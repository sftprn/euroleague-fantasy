/* Shared league state — keeps every open phone in sync through /api/state (Cloudflare Worker + D1).
   - poll(): asks the server every 2.5 s while the page is visible (cheap 204 when nothing changed)
   - push(coach, data): saves this coach's roster / chips / team right away; retried if offline
   Disabled for local files (no server) and the old ?demo replay. ?demo=live / ?demo=round talk to the
   pretend server in assets/demo.js instead, so nothing reaches the real league. */
(function(){
  const qs = new URLSearchParams(location.search);
  const enabled = location.protocol !== "file:" && (!qs.has("demo") || !!window.ELF_DEMO);
  const POLL = 2500;
  const S = {enabled, ready:!enabled, v:null, coaches:{}, league:null, online:true};
  const listeners = [];
  let timer = 0, editSeq = 0, inflight = 0, polling = false;
  const queue = {};                         // coach → data still waiting to be saved

  S.on = fn => listeners.push(fn);
  const emit = first => listeners.forEach(fn => { try{ fn(first); }catch(e){ console.error(e); } });

  async function flush(){
    for (const coach of Object.keys(queue)){
      const data = queue[coach]; delete queue[coach];
      inflight++;
      try{
        const r = await fetch("/api/state", {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({coach, data})});
        if (!r.ok) throw new Error(r.status);
        S.online = true;
      }catch{
        queue[coach] = {...data, ...(queue[coach] || {})};   // keep newest, retry on next poll
        S.online = false;
      }finally{ inflight--; }
    }
  }

  async function poll(){
    clearTimeout(timer);
    if (!enabled || document.hidden || polling) return;
    polling = true;
    await flush();
    const seq = editSeq;
    try{
      const r = await fetch("/api/state" + (S.v ? "?since=" + encodeURIComponent(S.v) : ""), {cache:"no-store"});
      if (r.status === 200){
        const d = await r.json();
        // ignore answers that started before a local edit (they'd briefly undo it)
        if (seq === editSeq && !inflight && !Object.keys(queue).length){
          const first = !S.ready;
          S.v = d.v; S.coaches = d.coaches || {}; S.league = d.league || null; S.ready = true; S.online = true;
          emit(first);
        }
      } else if (r.status === 204){ S.online = true; }
      else throw new Error(r.status);
    }catch{ S.online = false; }
    polling = false;
    timer = setTimeout(poll, POLL);
  }

  S.refresh = () => poll();
  S.start = () => { if (enabled) poll(); else emit(true); };
  S.push = (coach, data) => {
    if (!enabled) return;
    editSeq++;
    S.coaches[coach] = {...(S.coaches[coach] || {}), ...data};
    queue[coach] = {...(queue[coach] || {}), ...data};
    flush();
  };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  window.Shared = S;
})();

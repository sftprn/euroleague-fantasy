/* Bottom navigation (iOS-style tab bar): Teams · Games · Players.
   Teams = the team pages (2-coach, first slide = the league table); Games and Players = the league page (1-league).
   Nav.init({active: "teams" | "games" | "players", onTap(tab) → true if the page handled it itself (no page change)})
   Sets --navH on <html> so pages can keep their content above the bar. */
(function(){
  const DIRECT = location.protocol === "file:";
  const q = new URLSearchParams(location.search);
  const demo = q.has("demo") ? "&demo" + (q.get("demo") ? "=" + q.get("demo") : "") : "";      // stay in the demo league when switching
  const HREF = {
    teams: (DIRECT ? "2-coach.html" : "/2-coach") + "?coach=league" + demo,
    games: (DIRECT ? "1-league.html" : "/1-league") + "?view=games" + demo,
    players: (DIRECT ? "1-league.html" : "/1-league") + "?view=players" + demo,
  };
  const ICON = {
    teams: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>`,
    games: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c3.2 2.8 3.2 10 0 12.8M18.4 5.6c-3.2 2.8-3.2 10 0 12.8"/></svg>`,
    players: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
  };
  const LABEL = {teams: "Teams", games: "Games", players: "Players"};
  // "Liquid glass" (iOS 26 style): a floating frosted capsule with a bright rim and a glass pill behind the current tab
  const CSS = `:root{--navH:calc(84px + env(safe-area-inset-bottom))}
#elfNav{position:fixed;left:50%;bottom:calc(10px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:8;
  width:min(calc(100% - 28px), 380px);height:64px;border-radius:32px;isolation:isolate;
  background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.05) 55%,rgba(255,255,255,.07));      /* see-through glass */
  backdrop-filter:blur(16px) saturate(1.8);-webkit-backdrop-filter:blur(16px) saturate(1.8);
  box-shadow:0 10px 30px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.1)}
#elfNav::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;      /* specular sheen along the top */
  background:radial-gradient(120% 90% at 22% -20%,rgba(255,255,255,.12),transparent 55%),radial-gradient(90% 80% at 85% 130%,rgba(255,255,255,.05),transparent 60%)}
#elfNav::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;padding:1px;   /* rim: brighter at the top edge */
  background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.03) 45%,rgba(255,255,255,.05));   /* faint rim */
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
#elfNav .in{position:relative;height:100%;display:flex;padding:5px}
#elfNav .pill{position:absolute;top:5px;bottom:5px;left:5px;width:calc((100% - 10px) / 3);border-radius:27px;z-index:0;
  background:rgba(255,255,255,.16);                                 /* clear white, no rim or shadow */
  transition:transform .42s cubic-bezier(.3,1.35,.5,1),scale .18s ease}
#elfNav .pill.press{scale:1.06}
#elfNav a{position:relative;z-index:1;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-decoration:none;color:rgba(255,255,255,.72);
  font:600 10.5px Inter,system-ui,sans-serif;letter-spacing:.01em;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;
  transition:color .2s,transform .18s}
#elfNav a svg{width:24px;height:24px;display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))}
#elfNav a span{text-shadow:0 1px 1px rgba(0,0,0,.35)}
#elfNav a.on{color:#FF7A2E}
#elfNav a:active{transform:scale(.92)}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){#elfNav{background:rgba(28,28,32,.94)}}`;
  let opts = {active: "teams", onTap: null};
  function init(o){
    opts = {...opts, ...o};
    if (!document.getElementById("elfNav")){
      const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
      const n = document.createElement("nav"); n.id = "elfNav"; n.setAttribute("aria-label", "Sections");
      n.innerHTML = `<div class="in"><i class="pill" aria-hidden="true"></i>${["teams", "games", "players"].map(k => `<a href="${HREF[k]}" data-tab="${k}">${ICON[k]}<span>${LABEL[k]}</span></a>`).join("")}</div>`;
      document.body.appendChild(n);
      n.addEventListener("click", e => {
        const a = e.target.closest("[data-tab]"); if (!a) return;
        if (opts.onTap && opts.onTap(a.dataset.tab)){ e.preventDefault(); setActive(a.dataset.tab); return; }   // handled on this page
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault(); setActive(a.dataset.tab);                       // other page: let the glass pill slide over first
        setTimeout(() => { location.href = a.href; }, 200);
      });
    }
    setActive(opts.active);
  }
  function setActive(k){
    opts.active = k;
    const pill = document.querySelector("#elfNav .pill"), i = ["teams", "games", "players"].indexOf(k);
    if (pill && i >= 0){
      if (!pill._placed){ pill.style.transition = "none"; pill.style.transform = `translateX(${i * 100}%)`; void pill.offsetWidth; pill.style.transition = ""; pill._placed = true; }   // page load: already in place
      else { pill.style.transform = `translateX(${i * 100}%)`; pill.classList.add("press"); setTimeout(() => pill.classList.remove("press"), 180); }
    }
    document.querySelectorAll("#elfNav [data-tab]").forEach(a => { a.classList.toggle("on", a.dataset.tab === k); a.setAttribute("aria-current", a.dataset.tab === k ? "page" : "false"); });
  }
  window.Nav = {init, setActive, href: k => HREF[k]};
})();

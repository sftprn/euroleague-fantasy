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
  const CSS = `:root{--navH:calc(54px + env(safe-area-inset-bottom))}
#elfNav{position:fixed;left:0;right:0;bottom:0;z-index:8;height:var(--navH);padding-bottom:env(safe-area-inset-bottom);
  background:#0A0A0BEB;backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);border-top:1px solid #FFFFFF1A}
#elfNav .in{max-width:480px;margin:0 auto;height:54px;display:flex}
#elfNav a{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-decoration:none;color:#8E8E96;
  font:600 10.5px Inter,system-ui,sans-serif;letter-spacing:.01em;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
#elfNav a svg{width:25px;height:25px;display:block}
#elfNav a.on{color:#FF6B1A}
#elfNav a:active{opacity:.6}`;
  let opts = {active: "teams", onTap: null};
  function init(o){
    opts = {...opts, ...o};
    if (!document.getElementById("elfNav")){
      const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
      const n = document.createElement("nav"); n.id = "elfNav"; n.setAttribute("aria-label", "Sections");
      n.innerHTML = `<div class="in">${["teams", "games", "players"].map(k => `<a href="${HREF[k]}" data-tab="${k}">${ICON[k]}<span>${LABEL[k]}</span></a>`).join("")}</div>`;
      document.body.appendChild(n);
      n.addEventListener("click", e => {
        const a = e.target.closest("[data-tab]"); if (!a) return;
        if (opts.onTap && opts.onTap(a.dataset.tab)){ e.preventDefault(); setActive(a.dataset.tab); }   // handled on this page
      });
    }
    setActive(opts.active);
  }
  function setActive(k){
    opts.active = k;
    document.querySelectorAll("#elfNav [data-tab]").forEach(a => { a.classList.toggle("on", a.dataset.tab === k); a.setAttribute("aria-current", a.dataset.tab === k ? "page" : "false"); });
  }
  window.Nav = {init, setActive, href: k => HREF[k]};
})();

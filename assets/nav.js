/* Bottom navigation (Material 3 navigation bar): Teams · Games · Players.
   Teams = the team pages (2-coach, first slide = the league table); Games and Players = the league page (1-league).
   Nav.init({active: "teams" | "games" | "players", onTap(tab) → true if the page handled it itself (no page change)})
   Sets --navH on <html> so pages can keep their content above the bar. */
(function(){
  const DIRECT = location.protocol === "file:";
  const q = new URLSearchParams(location.search);
  const demo = q.has("demo") ? "&demo" + (q.get("demo") ? "=" + q.get("demo") : "") : "";      // stay in the demo league when switching
  const HREF = DIRECT ? {                                                   // opened as files: no shell, plain pages
    teams: "2-coach.html?coach=league" + demo, games: "1-league.html?view=games" + demo, players: "1-league.html?view=players" + demo,
  } : {                                                                      // otherwise into the app shell (/), which keeps the bar
    teams: "/?tab=teams" + demo, games: "/?tab=games" + demo, players: "/?tab=players" + demo,
  };
  const ICON = {
    teams: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>`,
    games: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c3.2 2.8 3.2 10 0 12.8M18.4 5.6c-3.2 2.8-3.2 10 0 12.8"/></svg>`,
    players: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
  };
  const LABEL = {teams: "Teams", games: "Games", players: "Players"};
  // Material 3 navigation bar: full-width, attached to the bottom, 80px tall; the current tab gets a 64×32 indicator pill behind its icon
  const CSS = `:root{--navH:calc(80px + var(--sab, env(safe-area-inset-bottom)))}
#elfNav{position:fixed;left:0;right:0;bottom:0;z-index:8;height:var(--navH);padding-bottom:var(--sab, env(safe-area-inset-bottom));box-sizing:border-box;
  background:#18181B;box-shadow:0 -1px 0 rgba(255,255,255,.04)}
#elfNav .in{height:80px;max-width:480px;margin:0 auto;display:flex}
#elfNav a{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:12px;gap:4px;text-decoration:none;color:#CAC4D0;
  font:500 12px/16px Inter,system-ui,sans-serif;letter-spacing:.5px;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
#elfNav .ind{position:relative;width:64px;height:32px;border-radius:16px;display:grid;place-items:center;overflow:hidden}
#elfNav .ind::before{content:"";position:absolute;inset:0;border-radius:inherit;background:rgba(255,122,46,.24);transform:scaleX(0);opacity:0;
  transition:transform .3s cubic-bezier(.2,0,0,1),opacity .15s linear}                                   /* the indicator grows out from the centre */
#elfNav .ind::after{content:"";position:absolute;inset:0;border-radius:inherit;background:#E6E0E9;opacity:0;transition:opacity .15s}   /* state layer */
#elfNav a:hover .ind::after{opacity:.08}
#elfNav a:active .ind::after{opacity:.12}
#elfNav a svg{position:relative;width:24px;height:24px;display:block}
#elfNav a.on{color:#E6E0E9;font-weight:700}
#elfNav a.on .ind{color:#FFB68F}
#elfNav a.on .ind::before{transform:scaleX(1);opacity:1}
#elfNav.still .ind::before{transition:none}`;
  let opts = {active: "teams", onTap: null};
  function init(o){
    opts = {...opts, ...o};
    if (window.ELF_EMBED){                                  // inside the app shell: the shell draws the bar; just keep room for it
      if (!document.getElementById("elfNavSpace")){ const st = document.createElement("style"); st.id = "elfNavSpace"; st.textContent = CSS.split("\n")[0]; document.head.appendChild(st); }
      return;
    }
    if (!document.getElementById("elfNav")){
      const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
      const n = document.createElement("nav"); n.id = "elfNav"; n.setAttribute("aria-label", "Sections");
      n.innerHTML = `<div class="in">${["teams", "games", "players"].map(k => `<a href="${HREF[k]}" data-tab="${k}"><i class="ind">${ICON[k]}</i><span>${LABEL[k]}</span></a>`).join("")}</div>`;
      document.body.appendChild(n);
      n.addEventListener("click", e => {
        const a = e.target.closest("[data-tab]"); if (!a) return;
        if (opts.onTap && opts.onTap(a.dataset.tab)){ e.preventDefault(); setActive(a.dataset.tab); return; }   // handled on this page
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault(); setActive(a.dataset.tab);                       // other page: let the indicator grow in first
        setTimeout(() => { location.href = a.href; }, 150);
      });
    }
    setActive(opts.active);
  }
  function setActive(k){
    opts.active = k;
    const n = document.getElementById("elfNav");
    if (n && !n._placed){ n.classList.add("still"); requestAnimationFrame(() => requestAnimationFrame(() => n.classList.remove("still"))); n._placed = true; }   // page load: no grow-in
    document.querySelectorAll("#elfNav [data-tab]").forEach(a => { a.classList.toggle("on", a.dataset.tab === k); a.setAttribute("aria-current", a.dataset.tab === k ? "page" : "false"); });
  }
  window.Nav = {init, setActive, href: k => HREF[k]};
})();

/* Bottom navigation (pinned bar over a black gradient): Teams · Games · Players · Watchlist.
   Teams = the team pages (2-coach, first slide = the league table); Games, Players and Watchlist = the league page (1-league).
   Nav.init({active: "teams" | "games" | "players" | "watchlist", onTap(tab) → true if the page handled it itself (no page change)})
   Sets --navH on <html> so pages can keep their content above the bar. */
(function(){
  const DIRECT = location.protocol === "file:";
  const q = new URLSearchParams(location.search);
  const demo = q.has("demo") ? "&demo" + (q.get("demo") ? "=" + q.get("demo") : "") : "";      // stay in the demo league when switching
  const HREF = DIRECT ? {                                                   // opened as files: no shell, plain pages
    teams: "2-coach.html?coach=league" + demo, games: "1-league.html?view=games" + demo, players: "1-league.html?view=players" + demo, watchlist: "1-league.html?view=watchlist" + demo,
  } : {                                                                      // otherwise into the app shell (/), which keeps the bar
    teams: "/?tab=teams" + demo, games: "/?tab=games" + demo, players: "/?tab=players" + demo, watchlist: "/?tab=watchlist" + demo,
  };
  const ICON = {                                       // Material Symbols (weight 400): outline when not selected, filled when selected
    teams: `<svg class="o" viewBox="0 0 24 24" fill="currentColor"><path d="M7,21V19h4V15.9q-1.22-0.28-2.19-1.04T7.4,12.95q-1.88-0.22-3.14-1.64T3,8V7Q3,6.18 3.59,5.59T5,5H7V3H17V5h2q0.83,0 1.41,0.59Q21,6.18 21,7V8q0,1.9-1.26,3.31T16.6,12.95q-0.45,1.15-1.41,1.91Q14.23,15.63 13,15.9V19h4v2H7ZM7,10.8V7H5V8Q5,8.95 5.55,9.71Q6.1,10.48 7,10.8Zm7.13,2.33Q15,12.25 15,11V5H9v6q0,1.25 0.88,2.13T12,14t2.13-0.88ZM17,10.8q0.9-0.32 1.45-1.09T19,8V7H17v3.8ZM12,9.5Z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path d="M7,21V19h4V15.9q-1.22-0.28-2.19-1.04T7.4,12.95q-1.88-0.22-3.14-1.64T3,8V7Q3,6.18 3.59,5.59T5,5H7V3H17V5h2q0.83,0 1.41,0.59Q21,6.18 21,7V8q0,1.9-1.26,3.31T16.6,12.95q-0.45,1.15-1.41,1.91Q14.23,15.63 13,15.9V19h4v2H7ZM7,10.8V7H5V8Q5,8.95 5.55,9.71Q6.1,10.48 7,10.8Zm10,0q0.9-0.32 1.45-1.09T19,8V7H17v3.8Z"/></svg>`,
    games: `<svg class="o" viewBox="0 0 24 24" fill="currentColor"><path d="M4.05,11H6.9Q6.75,10.05 6.33,9.23T5.25,7.75Q4.8,8.48 4.49,9.29Q4.18,10.1 4.05,11ZM17.1,11h2.85q-0.13-0.9-0.44-1.71T18.75,7.75Q18.1,8.4 17.68,9.23T17.1,11ZM5.25,16.25Q5.9,15.6 6.33,14.78T6.9,13H4.05q0.13,0.9 0.44,1.71t0.76,1.54Zm13.5,0q0.45-0.72 0.76-1.54T19.95,13H17.1q0.15,0.95 0.57,1.78t1.07,1.47ZM8.95,11H11V4.05Q9.68,4.25 8.54,4.79T6.5,6.2Q7.48,7.15 8.11,8.36T8.95,11ZM13,11h2.05q0.2-1.43 0.84-2.64T17.5,6.2q-0.9-0.88-2.04-1.41T13,4.05V11Zm-2,8.95V13H8.95q-0.2,1.42-0.84,2.64T6.5,17.8q0.9,0.88 2.04,1.41Q9.68,19.75 11,19.95Zm2,0q1.33-0.2 2.46-0.74q1.14-0.54 2.04-1.41q-0.97-0.95-1.61-2.16Q15.25,14.43 15.05,13H13v6.95ZM12,12Zm0,10q-2.07,0-3.9-0.79q-1.82-0.79-3.17-2.14Q3.58,17.73 2.79,15.9T2,12Q2,9.92 2.79,8.1Q3.58,6.27 4.93,4.93Q6.28,3.57 8.1,2.79Q9.93,2 12,2t3.9,0.79t3.17,2.14q1.35,1.35 2.14,3.17Q22,9.92 22,12t-0.79,3.9t-2.14,3.17q-1.35,1.35-3.17,2.14T12,22Z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path d="M2.05,10.98Q2.18,9.7 2.58,8.56t1.1-2.14q0.87,0.9 1.46,2.09T5.9,10.98H2.05Zm16.05,0q0.18-1.28 0.75-2.45t1.48-2.07q0.7,0.98 1.1,2.13q0.4,1.15 0.53,2.4H18.1ZM3.68,17.55q-0.7-0.98-1.1-2.11T2.05,13.02H5.9Q5.73,14.3 5.14,15.48T3.68,17.55Zm16.65,0q-0.9-0.9-1.48-2.08T18.1,13.02h3.85q-0.13,1.25-0.53,2.4t-1.1,2.13ZM7.93,10.98q-0.2-1.8-0.98-3.33Q6.18,6.13 4.93,4.9q1.2-1.2 2.74-1.93t3.31-0.93v8.93H7.93Zm5.1,0V2.05q1.78,0.2 3.31,0.93T19.08,4.9Q17.8,6.1 17.04,7.64q-0.76,1.54-0.96,3.34H13.03ZM10.98,21.95q-1.8-0.2-3.33-0.94T4.93,19.08q1.27-1.2 2.04-2.72t0.96-3.33h3.05v8.93Zm2.05,0V13.02h3.05q0.2,1.8 0.96,3.34t2.04,2.74q-1.2,1.2-2.74,1.92t-3.31,0.93Z"/></svg>`,
    players: `<svg class="o" viewBox="0 0 24 24" fill="currentColor"><path d="M4,19H8V11H4v8Zm6,0h4V5H10V19Zm6,0h4V13H16v6ZM2,21V9H8V3h8v8h6V21H2Z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path d="M2,21V9H7.5V21H2Zm7.25,0V3h5.5V21H9.25Zm7.25,0V11H22V21H16.5Z"/></svg>`,
    watchlist: `<svg class="o" viewBox="0 0 24 24" fill="currentColor"><path d="M9.73,14L12,12.63L14.28,14l-0.6-2.6l2-1.72L13.05,9.45L12,7L10.95,9.45L8.33,9.67l2,1.72L9.73,14ZM5,21V5Q5,4.17 5.59,3.59T7,3H17q0.82,0 1.41,0.59T19,5V21l-7-3L5,21Zm2-3.05l5-2.15l5,2.15V5H7V17.95ZM7,5H17H12H7Z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path d="M9.73,14L12,12.63L14.28,14l-0.6-2.6l2-1.72L13.05,9.45L12,7L10.95,9.45L8.33,9.67l2,1.72L9.73,14ZM5,21V5Q5,4.17 5.59,3.59T7,3H17q0.82,0 1.41,0.59T19,5V21l-7-3L5,21Z"/></svg>`,
  };
  const LABEL = {teams: "Teams", games: "Games", players: "Players", watchlist: "Watchlist"};
  // Bottom bar: pinned to the bottom, see-through black with a blur (like the round arrows on Games); the current tab is brand orange.
  // In the app shell it slides away while a bottom sheet is open in the page below (.cover).
  const CSS = `:root{--navH:calc(66px + var(--sab, env(safe-area-inset-bottom)))}
#elfNav{position:fixed;left:0;right:0;bottom:0;z-index:8;padding:8px 0 calc(6px + var(--sab, env(safe-area-inset-bottom)));pointer-events:none;
  background:rgba(0,0,0,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:transform .25s ease,opacity .2s ease}
#elfNav.cover{transform:translateY(100%);opacity:0}
#elfNav.cover .in{pointer-events:none}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){#elfNav{background:rgba(0,0,0,.9)}}
#elfNav .in{height:60px;max-width:480px;margin:0 auto;display:flex;pointer-events:auto}
#elfNav a{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;text-decoration:none;color:rgba(255,255,255,.58);
  font:600 11px/13px Inter,system-ui,sans-serif;letter-spacing:.01em;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;
  transition:color .15s,transform .12s}
#elfNav .ind{display:grid;place-items:center}
#elfNav a svg{width:28px;height:28px;display:block}
#elfNav a .f, #elfNav a.on .o{display:none}
#elfNav a.on .f{display:block}
#elfNav a.on{color:#FF6B1A;font-weight:700}
#elfNav a:active{transform:scale(.92)}`;
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
      n.innerHTML = `<div class="in">${["teams", "games", "players", "watchlist"].map(k => `<a href="${HREF[k]}" data-tab="${k}"><i class="ind">${ICON[k]}</i><span>${LABEL[k]}</span></a>`).join("")}</div>`;
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

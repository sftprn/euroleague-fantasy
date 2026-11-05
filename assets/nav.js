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
  const ICON = {                                       // Material Symbols (weight 300): outline when not selected, filled when selected
    teams: `<svg class="o" viewBox="0 0 24 24" fill="currentColor"><path d="M7.69,20.5V19h3.56V15.57Q9.98,15.32 9,14.5T7.61,12.47Q5.88,12.26 4.69,11T3.5,8V7q0-0.61 0.44-1.06T5,5.5H7.33v-2h9.35v2H19q0.61,0 1.06,0.44T20.5,7V8q0,1.74-1.19,3t-2.92,1.47Q15.98,13.69 15,14.5t-2.25,1.07V19h3.56v1.5H7.69ZM7.33,10.86V7H5V8Q5,9.05 5.66,9.84t1.67,1.02Zm6.91,2.36q0.92-0.92 0.92-2.24V5H8.85v5.98q0,1.32 0.92,2.24T12,14.13t2.24-0.92Zm2.44-2.36q1.02-0.23 1.67-1.02T19,8V7H16.67v3.86ZM12,9.57Z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path d="M7.69,20.5V19h3.56V15.57Q9.98,15.32 9,14.5T7.61,12.47Q5.88,12.26 4.69,11T3.5,8V7q0-0.61 0.44-1.06T5,5.5H7.33v-2h9.35v2H19q0.61,0 1.06,0.44T20.5,7V8q0,1.74-1.19,3t-2.92,1.47Q15.98,13.69 15,14.5t-2.25,1.07V19h3.56v1.5H7.69ZM7.33,10.86V7H5V8Q5,9.05 5.66,9.84t1.67,1.02Zm9.35,0q1.02-0.23 1.67-1.02T19,8V7H16.67v3.86Z"/></svg>`,
    games: `<svg class="o" viewBox="0 0 24 24" fill="currentColor"><path d="M4.03,11.25H7.19Q7.07,10.18 6.59,9.22T5.38,7.52Q4.83,8.33 4.48,9.27T4.03,11.25Zm12.78,0h3.16q-0.1-1.03-0.45-1.97T18.62,7.54q-0.77,0.75-1.22,1.7t-0.58,2.02ZM5.38,16.46q0.74-0.75 1.21-1.7t0.59-2.02H4.03q0.11,1.04 0.45,1.97t0.9,1.74Zm13.23,0q0.56-0.81 0.91-1.74t0.45-1.97H16.81q0.12,1.07 0.58,2.02t1.22,1.7Zm-9.9-5.21h2.53V4.03Q9.8,4.18 8.54,4.78T6.33,6.37Q7.32,7.35 7.94,8.59t0.77,2.66Zm4.03,0h2.53q0.15-1.43 0.77-2.67t1.62-2.21q-0.96-0.99-2.22-1.59T12.75,4.03v7.22Zm-1.5,8.72V12.75H8.72q-0.15,1.44-0.77,2.67T6.33,17.61q0.96,0.99 2.21,1.6t2.72,0.76Zm1.5,0q1.45-0.15 2.71-0.75t2.22-1.59q-1-0.96-1.62-2.2t-0.77-2.68H12.75v7.22ZM12,12Zm0,9.5q-1.97,0-3.7-0.75T5.28,18.72T3.25,15.7T2.5,12T3.25,8.3T5.28,5.28T8.3,3.25T12,2.5t3.7,0.75t3.02,2.03T20.75,8.3T21.5,12t-0.75,3.7t-2.03,3.02T15.7,20.75T12,21.5Z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path d="M2.54,11.23q0.1-1.32 0.52-2.5t1.16-2.2q0.9,0.93 1.5,2.16t0.73,2.54H2.54Zm15.02,0q0.14-1.3 0.7-2.51t1.52-2.15q0.74,1 1.16,2.19t0.52,2.47h-3.9ZM4.21,17.42q-0.74-1-1.15-2.17T2.54,12.77h3.9q-0.14,1.3-0.73,2.51t-1.5,2.15Zm15.57,0q-0.96-0.94-1.52-2.15t-0.7-2.51h3.9q-0.1,1.29-0.52,2.47t-1.16,2.19ZM7.96,11.23Q7.81,9.53 7.08,8.06T5.16,5.41Q6.34,4.18 7.89,3.44t3.34-0.9v8.69H7.96Zm4.8,0V2.54q1.78,0.15 3.34,0.9t2.74,1.97Q17.62,6.55 16.9,8.04t-0.87,3.19H12.77ZM11.23,21.46q-1.82-0.15-3.36-0.91T5.16,18.56Q6.38,17.4 7.1,15.94t0.87-3.18h3.27v8.69Zm1.53,0V12.77h3.27q0.15,1.71 0.87,3.2t1.94,2.63q-1.18,1.23-2.74,1.97t-3.34,0.9Z"/></svg>`,
    players: `<svg class="o" viewBox="0 0 24 24" fill="currentColor"><path d="M4,19H8.34V11H4v8Zm5.84,0h4.33V5H9.84V19Zm5.83,0H20V13H15.66v6ZM2.5,20.5V9.5H8.34v-6h7.33v8H21.5v9H2.5Z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path d="M2.88,20.5V9.5H7.71v11H2.88Zm6.61,0V3.5h5.02v17H9.49Zm6.8,0v-9h4.83v9H16.29Z"/></svg>`,
    watchlist: `<svg class="o" viewBox="0 0 24 24" fill="currentColor"><path d="M9.9,13.73L12,12.46l2.1,1.27l-0.56-2.4l1.86-1.6L12.96,9.53L12,7.27L11.04,9.53L8.6,9.73l1.86,1.6L9.9,13.73ZM5.5,20.25V5.31q0-0.76 0.52-1.28T7.31,3.5h9.38q0.76,0 1.28,0.52T18.5,5.31V20.25L12,17.46L5.5,20.25ZM7,17.95l5-2.15l5,2.15V5.31q0-0.12-0.1-0.21T16.69,5H7.31Q7.19,5 7.1,5.1T7,5.31V17.95ZM7,5Q7,5 7.1,5T7.31,5h9.38q0.12,0 0.21,0T17,5H12H7Z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path d="M9.9,13.73L12,12.46l2.1,1.27l-0.56-2.4l1.86-1.6L12.96,9.53L12,7.27L11.04,9.53L8.6,9.73l1.86,1.6L9.9,13.73ZM5.5,20.25V5.31q0-0.76 0.52-1.28T7.31,3.5h9.38q0.76,0 1.28,0.52T18.5,5.31V20.25L12,17.46L5.5,20.25Z"/></svg>`,
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

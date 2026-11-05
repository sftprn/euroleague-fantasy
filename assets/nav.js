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
  const ICON = {                                       // Material Symbols (weight 200): outline when not selected, filled when selected
    teams: `<svg class="o" viewBox="0 0 24 24" fill="currentColor"><path d="M8.38,20V19H11.5V15.25q-1.32-0.24-2.31-1.1T7.82,11.99q-1.59-0.19-2.7-1.3T4,8V7Q4,6.6 4.3,6.3T5,6H7.65V4h8.69V6H19q0.4,0 0.7,0.3T20,7V8q0,1.57-1.12,2.69t-2.7,1.3q-0.37,1.28-1.36,2.15t-2.31,1.1V19h3.12v1H8.38ZM7.65,10.92V7H5V8Q5,9.14 5.76,9.96t1.89,0.95Zm6.69,2.39q0.96-0.96 0.96-2.35V5H8.69v5.96q0,1.38 0.96,2.35T12,14.27t2.35-0.96Zm2-2.39q1.13-0.13 1.89-0.95T19,8V7H16.35v3.92ZM12,9.63Z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path d="M8.38,20V19H11.5V15.25q-1.32-0.24-2.31-1.1T7.82,11.99q-1.59-0.19-2.7-1.3T4,8V7Q4,6.6 4.3,6.3T5,6H7.65V4h8.69V6H19q0.4,0 0.7,0.3T20,7V8q0,1.57-1.12,2.69t-2.7,1.3q-0.37,1.28-1.36,2.15t-2.31,1.1V19h3.12v1H8.38ZM7.65,10.92V7H5V8Q5,9.14 5.76,9.96t1.89,0.95Zm8.69,0q1.13-0.13 1.89-0.95T19,8V7H16.35v3.92Z"/></svg>`,
    games: `<svg class="o" viewBox="0 0 24 24" fill="currentColor"><path d="M4.01,11.5H7.48Q7.38,10.32 6.86,9.22T5.52,7.29Q4.86,8.19 4.47,9.25T4.01,11.5Zm12.51,0h3.47q-0.07-1.17-0.46-2.22q-0.39-1.05-1.05-1.95Q17.6,8.17 17.11,9.24T16.52,11.5Zm-11,5.17q0.82-0.84 1.34-1.92T7.48,12.5H4.01q0.09,1.19 0.47,2.23t1.04,1.94Zm12.96,0q0.66-0.9 1.05-1.95t0.46-2.22H16.52q0.09,1.18 0.58,2.26t1.37,1.92ZM8.49,11.5H11.5V4.01Q9.92,4.12 8.55,4.78T6.15,6.55Q7.17,7.55 7.78,8.81T8.49,11.5Zm4.01,0h3.01q0.1-1.42 0.7-2.7t1.63-2.25q-1.02-1.11-2.39-1.77T12.5,4.01V11.5Zm-1,8.49V12.5H8.49q-0.1,1.46-0.7,2.7T6.15,17.42q1.02,1.11 2.37,1.79t2.97,0.79Zm1,0q1.57-0.1 2.95-0.77t2.39-1.77q-1.03-0.97-1.63-2.23t-0.7-2.72H12.5v7.49ZM12,12Zm0,9q-1.86,0-3.51-0.71T5.64,18.36T3.71,15.51T3,12T3.71,8.49T5.64,5.64T8.49,3.71T12,3t3.51,0.71t2.86,1.93t1.93,2.86T21,12t-0.71,3.51t-1.93,2.86t-2.86,1.93T12,21Z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path d="M3.03,11.49Q3.1,10.12 3.54,8.9T4.75,6.64Q5.68,7.59 6.28,8.88t0.7,2.62H3.03Zm13.99,0q0.1-1.33 0.65-2.57T19.25,6.7q0.78,1.03 1.22,2.25t0.51,2.54H17.02ZM4.75,17.3q-0.78-1.03-1.2-2.23T3.03,12.51H6.98q-0.1,1.33-0.7,2.57T4.75,17.3Zm14.5,0q-1.02-0.98-1.57-2.22t-0.65-2.57h3.95q-0.07,1.33-0.51,2.54T19.25,17.3ZM8,11.49Q7.9,9.89 7.22,8.48T5.39,5.92Q6.55,4.66 8.12,3.9t3.37-0.87v8.46H8Zm4.5,0V3.03q1.79,0.1 3.37,0.87t2.74,2.02Q17.43,7 16.77,8.45T16,11.49H12.51Zm-1.01,9.48q-1.84-0.1-3.39-0.89T5.39,18.04q1.18-1.1 1.85-2.5T8,12.51h3.49v8.46Zm1.01,0V12.51H16q0.1,1.63 0.77,3.06t1.85,2.52q-1.16,1.26-2.74,2.02t-3.37,0.87Z"/></svg>`,
    players: `<svg class="o" viewBox="0 0 24 24" fill="currentColor"><path d="M1,17.58V16.71q0-0.92 0.98-1.53t2.53-0.61q0.23,0 0.49,0.02t0.56,0.07q-0.23,0.41-0.34,0.84T5.12,16.38v1.2H1Zm6,0V16.45q0-0.6 0.35-1.11t1.04-0.87t1.6-0.55t2.01-0.18q1.12,0 2.03,0.18t1.6,0.55t1.03,0.87T17,16.45v1.13H7Zm11.88,0v-1.2q0-0.48-0.1-0.9t-0.31-0.81q0.31-0.05 0.56-0.07t0.47-0.02q1.55,0 2.53,0.6T23,16.71v0.86H18.88Zm-10.86-1h7.95V16.37q-0.06-0.71-1.17-1.16T12,14.75T9.19,15.2T8.03,16.37v0.21ZM4.51,13.63q-0.59,0-1-0.42T3.1,12.21q0-0.58 0.42-0.99t1.01-0.41q0.58,0 1,0.41t0.42,1q0,0.57-0.41,0.99T4.51,13.63Zm14.99,0q-0.58,0-1-0.42t-0.42-0.99q0-0.59 0.42-1t1-0.41q0.6,0 1.01,0.41t0.41,0.99q0,0.59-0.41,1.01T19.5,13.63ZM12.01,13q-0.91,0-1.55-0.64T9.81,10.81q0-0.93 0.64-1.56T12,8.62q0.93,0 1.56,0.63t0.63,1.56q0,0.91-0.63,1.55T12.01,13Zm0-1q0.49,0 0.84-0.35t0.35-0.85T12.85,9.96T12,9.62q-0.48,0-0.84,0.34t-0.35,0.85q0,0.48 0.35,0.84T12.01,12Zm-0,4.58ZM12,10.81Z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path d="M1,17.58V16.71q0-0.92 0.98-1.53t2.53-0.61q0.23,0 0.49,0.02t0.56,0.07q-0.23,0.41-0.34,0.84T5.12,16.38v1.2H1Zm6,0V16.45q0-0.6 0.35-1.11t1.04-0.87t1.6-0.55t2.01-0.18q1.12,0 2.03,0.18t1.6,0.55t1.03,0.87T17,16.45v1.13H7Zm11.88,0v-1.2q0-0.48-0.1-0.9t-0.31-0.81q0.31-0.05 0.56-0.07t0.47-0.02q1.55,0 2.53,0.6T23,16.71v0.86H18.88ZM4.51,13.63q-0.59,0-1-0.42T3.1,12.21q0-0.58 0.42-0.99t1.01-0.41q0.58,0 1,0.41t0.42,1q0,0.57-0.41,0.99T4.51,13.63Zm14.99,0q-0.58,0-1-0.42t-0.42-0.99q0-0.59 0.42-1t1-0.41q0.6,0 1.01,0.41t0.41,0.99q0,0.59-0.41,1.01T19.5,13.63ZM12.01,13q-0.91,0-1.55-0.64T9.81,10.81q0-0.93 0.64-1.56T12,8.62q0.93,0 1.56,0.63t0.63,1.56q0,0.91-0.63,1.55T12.01,13Z"/></svg>`,
  };
  ICON.watchlist = `<svg class="o" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>`;     // a star, like the Watchlist star in the player sheet
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

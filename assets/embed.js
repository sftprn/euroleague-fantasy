/* Runs inside the app shell (index.html), which keeps the bottom bar and shows Teams (2-coach) or Games/Players (1-league)
   in frames underneath it, so switching never reloads the bar. Load this first on both pages.
   window.ELF_EMBED   true when shown inside the shell (?embed and in a frame)
   elfHidden()        true when the page is hidden OR the shell is showing the other section (pause polling then)
   events: "elf-show" (this section is shown again → refresh), "elf-msg" (detail = message from the shell)
   The shell also sends the iPhone's safe areas as --sat / --sab, since env(safe-area-inset-*) is 0 inside a frame. */
// Page-switch slide animation (Teams / Games / Players): switched OFF for now. Set to true to turn it back on.
window.ELF_PAGE_SLIDE = false;
(function(){
  const EMBED = window.self !== window.top && new URLSearchParams(location.search).has("embed");
  window.ELF_EMBED = EMBED;
  window.ELF_HIDDEN = false;
  window.elfHidden = () => document.hidden || window.ELF_HIDDEN;
  if (!EMBED) return;
  // each page draws the same artwork in the same place, so switching pages instantly never shows the background change,
  // and the glass blurs (backdrop-filter) always have the artwork right behind them
  document.documentElement.classList.add("elf-embed");
  addEventListener("message", e => {
    if (e.origin !== location.origin) return;
    const d = e.data || {};
    if (d.elf === "insets"){
      const r = document.documentElement.style;
      r.setProperty("--sat", (d.top || 0) + "px"); r.setProperty("--sab", (d.bottom || 0) + "px");
      dispatchEvent(new Event("resize"));
    } else if (d.elf === "show"){
      const was = window.ELF_HIDDEN; window.ELF_HIDDEN = !d.on;
      if (was && d.on) dispatchEvent(new Event("elf-show"));
    }
    if (d.elf === "slide") slide(d.dir, d.enter);
    dispatchEvent(new CustomEvent("elf-msg", {detail: d}));
  });
  // switching sections: the new page's content slides in a little. Movement only, no fading (a fade would switch the
  // glass blurs off until it ends). The slide starts here first, and only then does the shell bring this page to the
  // front ("slid"), so the content is never seen in place for a moment before jumping aside to slide in (the jiggle).
  let anim = null;
  function slide(dir, enter){
    if (!window.ELF_PAGE_SLIDE) enter = false;          // switched off for now: the page just appears
    if (!enter){ try{ parent.postMessage({elf: "slid"}, location.origin); }catch{} return; }
    const el = window.ELF_SLIDE_TARGET?.() || document.querySelector("[data-slide]");   // Teams: just the page in view
    if (el?.animate){
      anim?.cancel();
      anim = el.animate([{transform: `translateX(${dir * 12}px)`}, {transform: "none"}], {duration: 180, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards"});
    }
    try{ parent.postMessage({elf: "slid"}, location.origin); }catch{}
  }
  try{ parent.postMessage({elf: "ready", page: location.pathname}, location.origin); }catch{}
  // a bottom sheet / the player search is open → ask the shell to move its bar out of the way (it sits above this frame)
  const OPEN = "#psWrap.open, #gWrap.open, #wcWrap.open, #tfWrap.open, #finder.open";
  let covered = false;
  const check = () => { const on = !!document.querySelector(OPEN); if (on !== covered){ covered = on; try{ parent.postMessage({elf: "cover", on}, location.origin); }catch{} } };
  new MutationObserver(check).observe(document.documentElement, {subtree: true, attributes: true, attributeFilter: ["class"], childList: true});
})();

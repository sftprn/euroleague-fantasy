/* Runs inside the app shell (index.html), which keeps the bottom bar and shows Teams (2-coach) or Games/Players (1-league)
   in frames underneath it, so switching never reloads the bar. Load this first on both pages.
   window.ELF_EMBED   true when shown inside the shell (?embed and in a frame)
   elfHidden()        true when the page is hidden OR the shell is showing the other section (pause polling then)
   events: "elf-show" (this section is shown again → refresh), "elf-msg" (detail = message from the shell)
   The shell also sends the iPhone's safe areas as --sat / --sab, since env(safe-area-inset-*) is 0 inside a frame. */
(function(){
  const EMBED = window.self !== window.top && new URLSearchParams(location.search).has("embed");
  window.ELF_EMBED = EMBED;
  window.ELF_HIDDEN = false;
  window.elfHidden = () => document.hidden || window.ELF_HIDDEN;
  if (!EMBED) return;
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
  // switching sections: only the content ([data-slide]) moves sideways, a little; the header artwork stays where it is
  let anim = null;
  function slide(dir, enter){
    const el = document.querySelector("[data-slide]"); if (!el || !el.animate) return;
    anim?.cancel();
    const off = {transform: `translateX(${(enter ? dir : -dir) * 40}px)`, opacity: 0}, on = {transform: "none", opacity: 1};
    anim = el.animate(enter ? [off, on] : [on, off], {duration: 200, easing: "cubic-bezier(.2,.8,.2,1)", fill: enter ? "none" : "forwards"});
    if (enter) anim.onfinish = () => { anim = null; };
  }
  try{ parent.postMessage({elf: "ready", page: location.pathname}, location.origin); }catch{}
  // a bottom sheet / the player search is open → ask the shell to move its bar out of the way (it sits above this frame)
  const OPEN = "#psWrap.open, #gWrap.open, #wcWrap.open, #finder.open";
  let covered = false;
  const check = () => { const on = !!document.querySelector(OPEN); if (on !== covered){ covered = on; try{ parent.postMessage({elf: "cover", on}, location.origin); }catch{} } };
  new MutationObserver(check).observe(document.documentElement, {subtree: true, attributes: true, attributeFilter: ["class"], childList: true});
})();

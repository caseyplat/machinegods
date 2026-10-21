/* Machine Gods — newsletter signup popup.
   Loaded on every page (the homepage gets it via tools/patch-signup.js). Signups go
   to beehiiv through the embeddable "machinegods.fm modal" subscribe form (beehiiv →
   Audience → Subscribe forms), so styling of the email field and button lives there.

   Opens when:
     - anything with a data-newsletter attribute (or an href of "#newsletter") is clicked
     - the URL ends in #newsletter (shareable: machinegods.fm/#newsletter)
     - automatically, once, after AUTO_DELAY_MS or once the reader scrolls halfway,
       on pages that set <body data-newsletter-auto> or on the homepage
   Closing it keeps the automatic popup away for SNOOZE_DAYS on that browser. */
(function () {
  "use strict";

  var BEEHIIV_FORM_ID = "534ab274-bec0-47db-af9c-07572e366853";
  // The form's iframe, loaded directly. beehiiv's own loader.js snippet sizes the
  // iframe through a postMessage handshake that never completed in testing, which
  // left the form collapsed to 0px. A fixed-height iframe doesn't depend on it.
  var BEEHIIV_FORM_URL = "https://subscribe-forms.beehiiv.com/v3/forms/" + BEEHIIV_FORM_ID;
  var EMBED_HEIGHT = 96;
  var AUTO_DELAY_MS = 15000;
  var SNOOZE_DAYS = 30;
  var STORE_KEY = "mg-newsletter-dismissed-at";

  if (window.mgNewsletter) return; // loaded twice
  var modal, lastFocus, embedded = false;

  function store(get, value) {
    try {
      if (get) return Number(localStorage.getItem(STORE_KEY) || 0);
      localStorage.setItem(STORE_KEY, String(value));
    } catch (_) { return 0; }
  }

  function injectStyles() {
    var css =
      ".mgnl-backdrop{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;" +
        "background:rgba(13,7,7,.78);opacity:0;transition:opacity .2s ease}" +
      ".mgnl-backdrop[hidden]{display:none}" +
      ".mgnl-backdrop.is-open{opacity:1}" +
      ".mgnl-dialog{position:relative;width:min(520px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#1B0F0E;color:#F6F3F3;" +
        "border:1px solid #8A6A2D;border-radius:6px;padding:36px 28px 26px;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;" +
        "transform:translateY(10px);transition:transform .25s cubic-bezier(.2,.8,.2,1);text-align:center}" +
      ".mgnl-backdrop.is-open .mgnl-dialog{transform:none}" +
      ".mgnl-close{position:absolute;top:10px;right:10px;width:40px;height:40px;border:0;border-radius:6px;background:transparent;color:#B7B6C1;" +
        "font:400 24px/1 Inter,system-ui,sans-serif;cursor:pointer}" +
      ".mgnl-close:hover{color:#F9CE6D}" +
      ".mgnl-close:focus-visible,.mgnl-dialog a:focus-visible{outline:2px solid #F9CE6D;outline-offset:2px}" +
      ".mgnl-kicker{margin:0 0 12px;font:500 11px/1.4 'IBM Plex Mono',ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:#B7B6C1}" +
      ".mgnl-title{margin:0 0 14px;font-family:Archivo,'Archivo Black','Arial Black',Impact,sans-serif;font-stretch:125%;font-weight:900;" +
        "font-size:clamp(26px,6vw,34px);line-height:1;text-transform:uppercase;color:#F9CE6D;text-wrap:balance}" +
      ".mgnl-lede{margin:0 auto 22px;max-width:400px;font-size:16px;line-height:1.55;text-wrap:pretty}" +
      ".mgnl-embed iframe{display:block;width:100%;border:0;background:transparent;color-scheme:normal}" +
      ".mgnl-fine{margin:16px 0 0;font:400 11px/1.5 'IBM Plex Mono',ui-monospace,Menlo,monospace;letter-spacing:.06em;color:#8A8781}" +
      ".mgnl-fine a{color:#B7B6C1}" +
      "@media (prefers-reduced-motion:reduce){.mgnl-backdrop,.mgnl-dialog{transition:none}}";
    var s = document.createElement("style");
    s.id = "mgnl-styles";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function build() {
    injectStyles();
    modal = document.createElement("div");
    modal.className = "mgnl-backdrop";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="mgnl-dialog" role="dialog" aria-modal="true" aria-labelledby="mgnl-title">' +
        '<button type="button" class="mgnl-close" aria-label="Close">×</button>' +
        '<p class="mgnl-kicker">The Machine Gods newsletter</p>' +
        '<h2 class="mgnl-title" id="mgnl-title">Don’t miss an episode</h2>' +
        '<p class="mgnl-lede">Get every new episode of Machine Gods, plus news from Kevin and Casey, in your inbox.</p>' +
        '<div class="mgnl-embed" id="mgnl-embed"></div>' +
        '<p class="mgnl-fine">Free. Unsubscribe anytime. Powered by <a href="https://machinegods.beehiiv.com/" target="_blank" rel="noopener">beehiiv</a>.</p>' +
      "</div>";
    document.body.appendChild(modal);
    modal.querySelector(".mgnl-close").addEventListener("click", close);
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
  }

  function embed() {
    if (embedded) return;
    embedded = true;
    var f = document.createElement("iframe");
    f.src = BEEHIIV_FORM_URL + "?referrer=" + encodeURIComponent(location.href);
    f.title = "Subscribe to the Machine Gods newsletter";
    f.height = String(EMBED_HEIGHT);
    f.setAttribute("scrolling", "no");
    f.setAttribute("frameborder", "0");
    document.getElementById("mgnl-embed").appendChild(f);
  }

  function onKey(e) {
    if (e.key === "Escape") { close(); return; }
    if (e.key !== "Tab") return;
    // Keep focus inside the dialog. The beehiiv iframe is one stop in the cycle.
    var f = modal.querySelectorAll('button, a[href], iframe, input, [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open() {
    if (!modal) build();
    if (!modal.hidden) return;
    lastFocus = document.activeElement;
    modal.hidden = false;
    embed();
    requestAnimationFrame(function () { modal.classList.add("is-open"); });
    document.addEventListener("keydown", onKey, true);
    document.documentElement.style.overflow = "hidden";
    modal.querySelector(".mgnl-close").focus();
  }

  function close() {
    if (!modal || modal.hidden) return;
    modal.classList.remove("is-open");
    modal.hidden = true;
    document.removeEventListener("keydown", onKey, true);
    document.documentElement.style.overflow = "";
    store(false, Date.now());
    if (location.hash === "#newsletter") history.replaceState(null, "", location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // Delegated so it also catches buttons the homepage renders after this script runs.
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest('[data-newsletter], a[href="#newsletter"], a[href="/#newsletter"]');
    if (!t) return;
    e.preventDefault();
    open();
  });
  window.addEventListener("hashchange", function () { if (location.hash === "#newsletter") open(); });

  function autoOpen() {
    var isHome = location.pathname === "/" || location.pathname === "/index.html";
    if (!isHome && !document.body.hasAttribute("data-newsletter-auto")) return;
    if (Date.now() - store(true) < SNOOZE_DAYS * 864e5) return;
    var fired = false;
    function fire() {
      if (fired) return;
      var a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; // don't interrupt typing
      fired = true;
      window.removeEventListener("scroll", onScroll);
      open();
    }
    function onScroll() {
      var max = document.documentElement.scrollHeight - innerHeight;
      if (max > 0 && scrollY / max >= 0.5) fire();
    }
    setTimeout(fire, AUTO_DELAY_MS);
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function start() {
    if (location.hash === "#newsletter") open();
    else autoOpen();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.mgNewsletter = { open: open, close: close };
})();

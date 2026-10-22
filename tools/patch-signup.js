#!/usr/bin/env node
/**
 * Wires the Machine Gods teaser-site signup widget to a collector endpoint.
 *
 *   node patch-signup.js <path/to/index.html> <ENDPOINT_URL> [--out out.html]
 *                        [--photo assets/hosts.jpg] [--links tools/links.json]
 *                        [--launched] [--playlist <YouTube playlist ID>]
 *
 * index.html is a Claude Design export: the page template lives as a JSON string
 * inside <script type="__bundler/template">. This script pulls that string out,
 * edits the signup form template + its logic, and writes it back with the same
 * escaping the exporter uses (so the file round-trips byte-for-byte otherwise).
 *
 * Re-running on an already-patched file just updates the endpoint URL (and the
 * listen links / photo, if those flags are passed). Every step is idempotent, so
 * the same command works on a fresh export and on an already-patched file.
 */
const fs = require('fs');

const [,, file, endpoint, ...rest] = process.argv;
if (!file || !endpoint) {
  console.error('usage: node patch-signup.js <index.html> <ENDPOINT_URL> [--out out.html]');
  process.exit(1);
}
const outIdx = rest.indexOf('--out');
const outFile = outIdx !== -1 ? rest[outIdx + 1] : file;

const src = fs.readFileSync(file, 'utf8');
const TAG = '<script type="__bundler/template">';
const s = src.indexOf(TAG);
if (s === -1) throw new Error('No __bundler/template block found — is this the exported index.html?');
const bodyStart = s + TAG.length;
const e = src.indexOf('</script>', bodyStart);
const rawBlock = src.slice(bodyStart, e);
const lead = rawBlock.match(/^\s*/)[0];
const trail = rawBlock.match(/\s*$/)[0];
let tpl = JSON.parse(rawBlock.trim());

// ---------------------------------------------------------------- logic
const LOGIC_START = '<script type="text/x-dc" data-dc-script="" data-props="{}">';
const ls = tpl.indexOf(LOGIC_START);
const le = tpl.indexOf('</script>', ls);
if (ls === -1 || le === -1) throw new Error('Could not find the x-dc logic script in the template');

const newLogic = `
// Signup collector endpoint (Google Apps Script web app, or any URL that accepts
// a JSON POST and answers {"ok":true}). Swap this one line to change providers.
const SIGNUP_ENDPOINT = ${JSON.stringify(endpoint)};
const CONSENT_TEXT = "Be the first to learn more — Machine Gods teaser site signup";

class Component extends DCLogic {
  state = { email: "", done: false, busy: false, error: "" };
  renderVals() {
    const { email, done, busy, error } = this.state;
    return {
      email, done, notDone: !done, busy, error, hasError: !!error,
      buttonLabel: busy ? "Sending…" : "Subscribe",
      onEmail: e => this.setState({ email: e.target.value, error: "" }),
      submit: async e => {
        e.preventDefault();
        if (this.state.busy) return;
        const email = this.state.email.trim();
        if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) { this.setState({ error: "Please enter a valid email address." }); return; }
        this.setState({ busy: true, error: "" });
        try {
          const res = await fetch(SIGNUP_ENDPOINT, {
            method: "POST",
            // text/plain keeps this a "simple" request: no CORS preflight, which
            // Apps Script web apps can't answer.
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              email,
              source: location.href,
              referrer: document.referrer || "",
              userAgent: navigator.userAgent,
              consent: CONSENT_TEXT,
              website: "",
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.ok === false) throw new Error(data.error || ("http_" + res.status));
          this.setState({ done: true, busy: false });
        } catch (err) {
          console.error("[signup] failed:", err);
          this.setState({ busy: false, error: "Something went wrong. Please try again in a moment." });
        }
      },
    };
  }
}
`;
tpl = tpl.slice(0, ls + LOGIC_START.length) + newLogic + tpl.slice(le);

// ---------------------------------------------------------------- template
// Steps 1–2 touch the export's own signup form. The newsletter step further down
// replaces that form with a beehiiv popup button, so on an already-patched page
// there's no form left and these two steps are skipped.
const hasSignupForm = tpl.includes('<form sc-camel-on-submit="{{ submit }}"');

// 1. Button: label reflects busy state, disabled while sending.
// Matches both a fresh export and an already-patched page (which has the disabled attr).
const oldButton = /<button type="submit" (?:disabled="\{\{ busy \}\}" )?(style="[^"]*") (style-hover="[^"]*")>(?:Subscribe|\{\{ buttonLabel \}\})<\/button>/;
if (hasSignupForm) {
  if (!oldButton.test(tpl)) throw new Error('Could not find the Subscribe button');
  tpl = tpl.replace(oldButton, (m, style, hover) =>
    `<button type="submit" disabled="{{ busy }}" ${style} ${hover}>{{ buttonLabel }}</button>`);
}

// 2. Error line under the input (only when hasError). Idempotent.
const ERROR_BLOCK =
  `<sc-if value="{{ hasError }}" hint-placeholder-val="{{ false }}">\n` +
  `<div role="alert" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;color:#F9CE6D;text-align:center">{{ error }}</div>\n` +
  `</sc-if>\n`;
if (hasSignupForm && !tpl.includes('{{ hasError }}')) {
  // Insert just before the closing </sc-if> of the notDone block.
  const notDoneStart = tpl.indexOf('<sc-if value="{{ notDone }}"');
  const notDoneEnd = tpl.indexOf('</sc-if>', notDoneStart);
  if (notDoneStart === -1 || notDoneEnd === -1) throw new Error('Could not find the notDone block');
  tpl = tpl.slice(0, notDoneEnd) + ERROR_BLOCK + tpl.slice(notDoneEnd);
}

// ---------------------------------------------------------------- hosts photo (optional)
// --photo assets/hosts.jpg  → inserts a photo of the hosts between the wordmark and
// the "with Kevin Roose and Casey Newton" line. Idempotent: re-running replaces it.
const photoIdx = rest.indexOf('--photo');
if (photoIdx !== -1) {
  const photoSrc = rest[photoIdx + 1];
  if (!photoSrc) throw new Error('--photo needs a path, e.g. --photo assets/hosts.jpg');
  const PHOTO_RE = /\n<img id="mg-hosts-photo"[^>]*>/;
  const photoTag =
    `\n<img id="mg-hosts-photo" src="${photoSrc}" alt="Casey Newton and Kevin Roose" width="1600" height="1200" loading="lazy" ` +
    `style="width:min(560px,86%);height:auto;aspect-ratio:4/3;object-fit:cover;flex-shrink:0;display:block;margin-top:clamp(28px,5vw,44px);border:1px solid #8A6A2D;border-radius:6px;` +
    `box-shadow:0 24px 60px rgba(0,0,0,.45);animation:mgRise .9s var(--ease-out) 1.1s both">`;
  tpl = tpl.replace(PHOTO_RE, '');
  // Anchor: the wordmark image, which is the element right before the "with ..." line.
  const wordmark = tpl.match(/<img [^>]*alt="Machine Gods"[^>]*>/);
  if (!wordmark) throw new Error('Could not find the wordmark <img alt="Machine Gods">');
  const at = tpl.indexOf(wordmark[0]) + wordmark[0].length;
  tpl = tpl.slice(0, at) + photoTag + tpl.slice(at);
  // Name order under the photo should match left-to-right in the frame (Casey, then Kevin).
  tpl = tpl.replace('>with Kevin Roose and Casey Newton<', '>with Casey Newton and Kevin Roose<');
}

// ---------------------------------------------------------------- listen links (optional)
// --links tools/links.json  → sets the href of each button in the "Listen" nav by its
// label, or removes the button when the value is null. Keys starting with "_" are
// ignored (comments). Idempotent. Warns about any button still pointing at a TODO URL,
// since a fresh export ships with placeholder links.
const linksIdx = rest.indexOf('--links');
if (linksIdx !== -1) {
  const linksFile = rest[linksIdx + 1];
  if (!linksFile) throw new Error('--links needs a path, e.g. --links tools/links.json');
  const links = JSON.parse(fs.readFileSync(linksFile, 'utf8'));
  const navStart = tpl.indexOf('<nav aria-label="Listen"');
  const navEnd = tpl.indexOf('</nav>', navStart);
  if (navStart === -1 || navEnd === -1) throw new Error('Could not find the <nav aria-label="Listen"> block');
  let nav = tpl.slice(navStart, navEnd);
  const esc = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [label, url] of Object.entries(links)) {
    if (label.startsWith('_')) continue;
    // Anchor + its trailing newline, so removing one leaves no blank line behind.
    const re = new RegExp(`(<a href=")[^"]*("(?: [^>]*)?>${esc(label)}</a>)\\n?`);
    if (!re.test(nav)) {
      // A null entry whose button is already gone is the desired end state; stay quiet.
      if (url !== null) console.warn(`links: no "${label}" button found in the Listen nav — skipped`);
      continue;
    }
    nav = url === null
      ? nav.replace(re, '')
      : nav.replace(re, (m, pre, post) => `${pre}${url}${post}\n`);
  }
  tpl = tpl.slice(0, navStart) + nav + tpl.slice(navEnd);
  // Anything left on a placeholder URL after applying links.json.
  for (const m of nav.matchAll(/<a href="([^"]*TODO[^"]*)"[^>]*>([^<]*)<\/a>/g)) {
    console.warn(`links: "${m[2]}" still points at a placeholder URL: ${m[1]}`);
  }
}

// ---------------------------------------------------------------- newsletter (beehiiv)
// Always applied. Replaces the export's email form (which posted to the Google Sheet)
// with a button that opens the beehiiv signup popup in assets/newsletter.js, and loads
// that script. Idempotent: re-running replaces the block and leaves one script tag.
const NEWSLETTER_RE = /<div id="mg-newsletter"[\s\S]*?<!--\/mg-newsletter-->/;
const newsletterBlock =
  `<div id="mg-newsletter" style="display:flex;flex-direction:column;align-items:center;gap:14px;margin-top:56px">\n` +
  `<span style="font-family:var(--font-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#B7B6C1">Get the Machine Gods newsletter</span>\n` +
  `<button type="button" data-newsletter="" style="height:48px;padding:0 26px;background:#F9CE6D;color:#0D0707;border:1px solid #F9CE6D;border-radius:6px;font-family:var(--font-mono);font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;cursor:pointer" style-hover="background:#F6F3F3;border-color:#F6F3F3">Subscribe</button>\n` +
  `</div><!--/mg-newsletter-->`;
if (NEWSLETTER_RE.test(tpl)) {
  tpl = tpl.replace(NEWSLETTER_RE, newsletterBlock);
} else {
  const FORM_RE = /<form sc-camel-on-submit="\{\{ submit \}\}"[\s\S]*?<\/form>/;
  if (!FORM_RE.test(tpl)) throw new Error('Could not find the signup <form> to replace with the newsletter button');
  tpl = tpl.replace(FORM_RE, newsletterBlock);
}
const NEWSLETTER_SCRIPT = '<script src="assets/newsletter.js"></script>';
if (!tpl.includes(NEWSLETTER_SCRIPT)) {
  const bodyEnd = tpl.lastIndexOf('</body>');
  if (bodyEnd === -1) throw new Error('Could not find </body> to load the newsletter script');
  tpl = tpl.slice(0, bodyEnd) + NEWSLETTER_SCRIPT + '\n' + tpl.slice(bodyEnd);
}

// ---------------------------------------------------------------- transcripts + questions links
// Always applied. Adds a "Read the transcripts / Ask a question" row above the bottom
// divider and the same links in the footer, pointing at the plain-HTML pages in
// /transcripts and /ask. Idempotent: re-running replaces both blocks.
const SITE_LINKS_RE = /\n<nav id="mg-site-links"[\s\S]*?<\/nav>/;
const pillStyle = 'font-family:var(--font-mono);font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;' +
  'color:#0D0707;background:#F9CE6D;border:1px solid #F9CE6D;border-radius:6px;padding:0 22px;min-height:48px;display:inline-flex;align-items:center';
const pillHover = 'background:#F6F3F3;border-color:#F6F3F3;color:#0D0707';
const siteLinks =
  `\n<nav id="mg-site-links" aria-label="More from the show" style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:56px">\n` +
  `<a href="/ask/" style="${pillStyle}" style-hover="${pillHover}">Ask Kevin and Casey a question</a>\n` +
  `<a href="/transcripts/" style="${pillStyle.replace('color:#0D0707;background:#F9CE6D', 'color:#F9CE6D;background:transparent').replace('border:1px solid #F9CE6D', 'border:1px solid #8A6A2D')}" style-hover="border-color:#F9CE6D;color:#F6F3F3">Read the transcripts</a>\n` +
  `</nav>`;
tpl = tpl.replace(SITE_LINKS_RE, '');
const NL_END = '<!--/mg-newsletter-->';
const nlEnd = tpl.indexOf(NL_END);
tpl = tpl.slice(0, nlEnd + NL_END.length) + siteLinks + tpl.slice(nlEnd + NL_END.length);

const FOOTER_RE = /(<footer [^>]*>)[\s\S]*?(<\/footer>)/;
if (!FOOTER_RE.test(tpl)) throw new Error('Could not find the <footer>');
const footLink = 'color:#F9CE6D;text-decoration:none';
tpl = tpl.replace(FOOTER_RE, (m, open, close) => open + '\n' +
  `<span style="color:#B7B6C1;font-size:11px">© 2026 Machine Gods</span>\n` +
  `<a href="/transcripts/" style="${footLink};font-size:11px" style-hover="color:#F6F3F3">Transcripts</a>\n` +
  `<a href="/ask/" style="${footLink};font-size:11px" style-hover="color:#F6F3F3">Ask a question</a>\n` +
  `<a href="#newsletter" data-newsletter="" style="${footLink};font-size:11px" style-hover="color:#F6F3F3">Newsletter</a>\n` +
  `<a href="mailto:hey@machinegods.fm" style="${footLink};font-size:11px;text-transform:none;letter-spacing:.04em" style-hover="color:#F6F3F3">hey@machinegods.fm</a>` +
  close);

// ---------------------------------------------------------------- metadata + post-launch copy
// Always applied. The export's share tags point at machinegods.com and an image that
// isn't in this repo, and several lines still say "the week of October 19".
const SITE = 'https://machinegods.fm/';
tpl = tpl
  .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${SITE}$2`)
  .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${SITE}assets/hosts.jpg$2`)
  .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${SITE}assets/hosts.jpg$2`)
  .replace(/(<meta property="og:image:width" content=")[^"]*(")/, '$11600$2')
  .replace(/(<meta property="og:image:height" content=")[^"]*(")/, '$11200$2')
  .replace(/ Starting the week of October 19\./g, ' New episodes twice a week.')
  .replace("You're on the list. See you the week of October 19.", "You're on the list.");
if (!tpl.includes('<link rel="canonical"')) {
  tpl = tpl.replace('<meta property="og:type"', `<link rel="canonical" href="${SITE}"><meta property="og:type"`);
}

// --launched → swap the "First episode drops / October 21" countdown block for an
// evergreen "Twice a week" line. Leave the flag off until Episode 1 is actually out.
if (rest.includes('--launched')) {
  tpl = tpl
    .replace(/(color:#B7B6C1">)First episode drops(<\/span>)/, '$1New episodes$2')
    .replace(/(color:#F9CE6D;text-align:center">)October 21(<\/span>)/, '$1Twice a week$2');
}

// ---------------------------------------------------------------- latest-episode player
// --playlist <YouTube playlist ID> → swaps the "New episodes / Twice a week" block for
// a YouTube player that embeds the whole playlist. YouTube starts a playlist embed on
// its FIRST video, so the playlist has to keep the newest episode at the top for this
// to always show the latest one. Re-running with a different ID just swaps the ID.
const playlistIdx = rest.indexOf('--playlist');
if (playlistIdx !== -1) {
  const playlist = rest[playlistIdx + 1];
  if (!playlist || !/^[A-Za-z0-9_-]{10,64}$/.test(playlist)) {
    throw new Error('--playlist needs a YouTube playlist ID, e.g. --playlist PLxxxxxxxxxxxxxxxx (the part after "list=")');
  }
  const src = `https://www.youtube.com/embed/videoseries?list=${playlist}&amp;rel=0`;
  const player =
    `<div id="mg-latest-episode" style="width:min(720px,calc(100vw - 32px));aspect-ratio:16/9;margin-top:10px;border:1px solid #8A6A2D;border-radius:12px;overflow:hidden;background:#1B0F0E">` +
    `<iframe src="${src}" title="Machine Gods: latest episode" style="width:100%;height:100%;border:0;display:block" ` +
    `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ` +
    `referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe></div>`;
  const PLAYER_RE = /<div id="mg-latest-episode"[^>]*>[\s\S]*?<\/iframe><\/div>/;
  const BIG_LINE_RE = /<span style="font-family:var\(--font-display\);font-stretch:125%;font-weight:900;font-size:clamp\(40px,7vw,64px\);line-height:1;text-transform:uppercase;color:#F9CE6D;text-align:center">(?:Twice a week|October 21)<\/span>/;
  if (PLAYER_RE.test(tpl)) tpl = tpl.replace(PLAYER_RE, player);
  else if (BIG_LINE_RE.test(tpl)) tpl = tpl.replace(BIG_LINE_RE, player);
  else throw new Error('Could not find the "Twice a week" line to replace with the episode player');
  tpl = tpl.replace(/(color:#B7B6C1">)(?:First episode drops|New episodes)(<\/span>)/, '$1Latest episode$2');
}

// ---------------------------------------------------------------- favicon
// Always applied. The export inlines its own favicon as a bundle asset; point it at
// the shared icon set in assets/brand/ (also used by /ask and /transcripts) instead.
const ICON_TAGS =
  '<link rel="icon" href="/favicon.ico" sizes="32x32">' +
  '<link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml">' +
  '<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">';
tpl = tpl.replace(/(<link rel="(?:icon|apple-touch-icon)"[^>]*>)+/, ICON_TAGS);
if (!tpl.includes(ICON_TAGS)) tpl = tpl.replace('</head>', ICON_TAGS + '</head>');

// ---------------------------------------------------------------- write back
const reencoded = JSON.stringify(tpl).replace(/<\//g, '<\\u002F');
let out = src.slice(0, bodyStart) + lead + reencoded + trail + src.slice(e);
// The loader shell's own <head> (shown while the bundle unpacks) gets the same tags.
const shellHeadEnd = out.indexOf('</head>');
const shellHead = out.slice(0, shellHeadEnd);
const SHELL_ICON_TAGS = '  ' + ICON_TAGS.replace(/></g, '>\n  <') + '\n';
if (!shellHead.endsWith('\n' + SHELL_ICON_TAGS)) {
  out = shellHead.replace(/\n *<link rel="(?:icon|apple-touch-icon)"[^>]*>/g, '').replace(/\n*$/, '\n') +
        SHELL_ICON_TAGS + out.slice(shellHeadEnd);
}
fs.writeFileSync(outFile, out);
console.log(`patched ${outFile} → endpoint ${endpoint}`);

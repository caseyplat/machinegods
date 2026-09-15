#!/usr/bin/env node
/**
 * Wires the Machine Gods teaser-site signup widget to a collector endpoint.
 *
 *   node patch-signup.js <path/to/index.html> <ENDPOINT_URL> [--out out.html]
 *
 * index.html is a Claude Design export: the page template lives as a JSON string
 * inside <script type="__bundler/template">. This script pulls that string out,
 * edits the signup form template + its logic, and writes it back with the same
 * escaping the exporter uses (so the file round-trips byte-for-byte otherwise).
 *
 * Re-running on an already-patched file just updates the endpoint URL.
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
  state = { email: "", done: false, busy: false, error: "", now: Date.now() };
  launch = new Date("2026-10-19T09:00:00-04:00").getTime();
  componentDidMount() { this.t = setInterval(() => this.setState({ now: Date.now() }), 1000); }
  componentWillUnmount() { clearInterval(this.t); }
  renderVals() {
    const { email, done, busy, error, now } = this.state;
    const ms = Math.max(0, this.launch - now), p = n => String(n).padStart(2, "0");
    const cd = { d: p(Math.floor(ms / 864e5)), h: p(Math.floor(ms / 36e5) % 24), m: p(Math.floor(ms / 6e4) % 60), s: p(Math.floor(ms / 1e3) % 60) };
    return {
      email, done, notDone: !done, busy, error, hasError: !!error, cd,
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
// 1. Button: label reflects busy state, disabled while sending.
const oldButton = /<button type="submit" (style="[^"]*") (style-hover="[^"]*")>(?:Subscribe|\{\{ buttonLabel \}\})<\/button>/;
if (!oldButton.test(tpl)) throw new Error('Could not find the Subscribe button');
tpl = tpl.replace(oldButton, (m, style, hover) =>
  `<button type="submit" disabled="{{ busy }}" ${style} ${hover}>{{ buttonLabel }}</button>`);

// 2. Error line under the input (only when hasError). Idempotent.
const ERROR_BLOCK =
  `<sc-if value="{{ hasError }}" hint-placeholder-val="{{ false }}">\n` +
  `<div role="alert" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;color:#F9CE6D;text-align:center">{{ error }}</div>\n` +
  `</sc-if>\n`;
if (!tpl.includes('{{ hasError }}')) {
  // Insert just before the closing </sc-if> of the notDone block.
  const notDoneStart = tpl.indexOf('<sc-if value="{{ notDone }}"');
  const notDoneEnd = tpl.indexOf('</sc-if>', notDoneStart);
  if (notDoneStart === -1 || notDoneEnd === -1) throw new Error('Could not find the notDone block');
  tpl = tpl.slice(0, notDoneEnd) + ERROR_BLOCK + tpl.slice(notDoneEnd);
}

// ---------------------------------------------------------------- write back
const reencoded = JSON.stringify(tpl).replace(/<\//g, '<\\u002F');
const out = src.slice(0, bodyStart) + lead + reencoded + trail + src.slice(e);
fs.writeFileSync(outFile, out);
console.log(`patched ${outFile} → endpoint ${endpoint}`);

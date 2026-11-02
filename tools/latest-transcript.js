#!/usr/bin/env node
/**
 * Points the homepage's "Read the Ep. N transcript" link at the newest transcript.
 *
 *   node tools/latest-transcript.js [index.html]
 *
 * The newest transcript is the highest episode number in transcripts/src/*.md. The link
 * sits right under the latest-episode player (or, on a page without the player, just
 * above the "Ask a question / Read the transcripts" buttons). Idempotent.
 *
 * patch-signup.js applies the same step after every fresh Claude Design export, and the
 * transcriber's scheduled publish runs this script after adding a new transcript.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Highest-numbered transcript source: { episode, title, slug } or null. */
function latestTranscript(root = ROOT) {
  const dir = path.join(root, 'transcripts', 'src');
  let best = null;
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!name.endsWith('.md')) continue;
    const fm = (fs.readFileSync(path.join(dir, name), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || '';
    const get = k => ((fm.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) || [])[1] || '').trim();
    const episode = Number(get('episode'));
    if (!episode) continue;
    if (!best || episode > best.episode) best = { episode, title: get('title'), slug: get('slug') || String(episode) };
  }
  return best;
}

const LINK_RE = /\n?<a id="mg-latest-transcript"[^>]*>[^<]*<\/a>/;

/** Returns the template with the link added or updated (or removed, if there are no transcripts). */
function applyLatestTranscript(tpl, root = ROOT) {
  tpl = tpl.replace(LINK_RE, '');
  const latest = latestTranscript(root);
  if (!latest) return tpl;
  const link =
    `\n<a id="mg-latest-transcript" href="/transcripts/${latest.slug}/" ` +
    `style="margin-top:14px;font-family:var(--font-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;color:#F9CE6D;border-bottom:1px solid #8A6A2D;padding-bottom:3px" ` +
    `style-hover="color:#F6F3F3;border-color:#F6F3F3">Read the Ep. ${latest.episode} transcript →</a>`;
  const player = tpl.match(/<div id="mg-latest-episode"[^>]*>[\s\S]*?<\/iframe><\/div>/);
  if (player) {
    const at = tpl.indexOf(player[0]) + player[0].length;
    return tpl.slice(0, at) + link + tpl.slice(at);
  }
  const nav = tpl.indexOf('\n<nav id="mg-site-links"');
  if (nav === -1) throw new Error('latest-transcript: found neither the episode player nor the site-links row to anchor on');
  return tpl.slice(0, nav) + link + tpl.slice(nav);
}

module.exports = { latestTranscript, applyLatestTranscript };

if (require.main === module) {
  const file = process.argv[2] || path.join(ROOT, 'index.html');
  const src = fs.readFileSync(file, 'utf8');
  const TAG = '<script type="__bundler/template">';
  const s = src.indexOf(TAG);
  if (s === -1) throw new Error('No __bundler/template block found — is this the exported index.html?');
  const bodyStart = s + TAG.length;
  const e = src.indexOf('</script>', bodyStart);
  const rawBlock = src.slice(bodyStart, e);
  const lead = rawBlock.match(/^\s*/)[0];
  const trail = rawBlock.match(/\s*$/)[0];
  const tpl = applyLatestTranscript(JSON.parse(rawBlock.trim()));
  // Same escaping as the exporter (and patch-signup.js), so nothing else in the file changes.
  const reencoded = JSON.stringify(tpl).replace(/<\//g, '<\\u002F');
  fs.writeFileSync(file, src.slice(0, bodyStart) + lead + reencoded + trail + src.slice(e));
  const latest = latestTranscript();
  console.log(latest ? `homepage → Ep. ${latest.episode} transcript` : 'homepage → no transcripts, link removed');
}

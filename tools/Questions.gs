/**
 * Machine Gods — listener questions collector
 * ------------------------------------------------
 * A Google Apps Script web app that accepts POSTs from the form at
 * https://machinegods.fm/ask/, emails each question to hey@machinegods.fm
 * (Reply-To set to the listener, so hitting Reply answers them directly), and
 * appends it to the "Questions" tab of the spreadsheet this script is bound to.
 *
 * SETUP (one time, ~5 minutes, signed in as the Machine Gods Google account)
 *   1. Create a new Google Sheet. Name it something like "Machine Gods listener questions".
 *   2. Extensions → Apps Script. Delete the sample code, paste this whole file, save (⌘S).
 *   3. Deploy → New deployment → gear icon → "Web app".
 *        Description:   questions collector
 *        Execute as:    Me
 *        Who has access: Anyone            ← required; the site posts anonymously
 *      Click Deploy. Approve the permissions prompt (Sheets + "send email as you").
 *   4. Copy the "Web app URL" (ends in /exec). Paste it into QUESTIONS_ENDPOINT in ask/index.html.
 *   5. Open the URL in a browser tab. You should see {"ok":true,"service":"machine-gods-questions"}.
 *   6. Run → testEmail once from the editor to confirm a message lands in hey@machinegods.fm.
 *
 * IMPORTANT when editing later: after any code change, Deploy → Manage deployments →
 * pencil icon → Version: "New version" → Deploy. The /exec URL stays the same, but
 * without a new version the live site keeps running the old code.
 *
 * Email is sent by the account that deployed the script, so it counts against that
 * account's Apps Script quota (1,500 recipients/day on Workspace). If a big on-air
 * call for questions ever blows past that, rows still land in the sheet; only the
 * email copy is skipped, and the "emailed" column says so.
 */

const TO_EMAIL = 'hey@machinegods.fm';
const SHEET_NAME = 'Questions';
const HEADERS = ['received_at', 'name', 'location', 'email', 'question', 'ok_on_air', 'emailed', 'source', 'referrer', 'user_agent', 'consent_text'];
const MAX_PER_EMAIL_PER_HOUR = 5;
// Note: Apps Script web apps can't see the request's Origin header, so the endpoint
// is technically callable by anyone. The honeypot + per-address rate limit keep
// junk down; if spam ever shows up, rotate the deployment URL.

function doGet() {
  return json_({ ok: true, service: 'machine-gods-questions' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const data = parseBody_(e);

    // Honeypot: the form includes a hidden "website" field that humans never fill.
    if (data.website) return json_({ ok: true, ignored: true });

    const email = String(data.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
      return json_({ ok: false, error: 'invalid_email' });
    }
    const question = String(data.question || '').trim().slice(0, 3000);
    if (question.length < 10) return json_({ ok: false, error: 'empty_question' });

    const cache = CacheService.getScriptCache();
    const key = 'q:' + email;
    const sent = Number(cache.get(key) || 0);
    if (sent >= MAX_PER_EMAIL_PER_HOUR) return json_({ ok: false, error: 'rate_limited' });
    cache.put(key, String(sent + 1), 3600);

    const name = clean_(data.name, 120);
    const location = clean_(data.location, 120);
    const onAir = data.onAir === true || data.onAir === 'true';

    let emailed = 'yes';
    try {
      MailApp.sendEmail({
        to: TO_EMAIL,
        replyTo: email,
        name: 'Machine Gods question form',
        subject: 'Listener question' + (name ? ' from ' + name : '') + (location ? ' (' + location + ')' : ''),
        body:
          question + '\n\n' +
          '—\n' +
          'From: ' + (name || '(no name)') + ' <' + email + '>\n' +
          'Location: ' + (location || '(not given)') + '\n' +
          'OK to use on the show: ' + (onAir ? 'yes' : 'NO') + '\n' +
          'Sent from: ' + clean_(data.source, 500) + '\n',
      });
    } catch (err) {
      emailed = 'failed: ' + String(err).slice(0, 200);
    }

    getSheet_().appendRow([
      new Date().toISOString(),
      name,
      location,
      email,
      /^[=+\-@]/.test(question) ? "'" + question : question,
      onAir ? 'yes' : 'no',
      emailed,
      clean_(data.source, 500),
      clean_(data.referrer, 500),
      clean_(data.userAgent, 500),
      clean_(data.onAirText, 500),
    ]);

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'server_error', detail: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/** Accepts JSON (sent as text/plain to avoid a CORS preflight) or a normal form post. */
function parseBody_(e) {
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (_) {}
  }
  return (e && e.parameter) || {};
}

/** Single line, trimmed, length-capped; a leading = + - @ is defused so Sheets doesn't run it as a formula. */
function clean_(s, max) {
  const v = String(s || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run this from the editor (Run → testEmail) to confirm mail reaches the inbox. */
function testEmail() {
  MailApp.sendEmail(TO_EMAIL, 'Machine Gods question form: test', 'If you can read this, the form can email you.');
  Logger.log('Sent. Remaining daily quota: ' + MailApp.getRemainingDailyQuota());
}

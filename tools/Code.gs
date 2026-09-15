/**
 * Machine Gods — teaser-site signup collector
 * ------------------------------------------------
 * A Google Apps Script web app that accepts POSTs from the signup widget on
 * https://caseyplat.github.io/machinegods/ and appends each address to the
 * "Signups" tab of the spreadsheet this script is bound to.
 *
 * SETUP (one time, ~5 minutes, do this signed in as the Machine Gods Google account)
 *   1. Create a new Google Sheet. Name it something like "Machine Gods signups".
 *   2. Extensions → Apps Script. Delete the sample code, paste this whole file, save (⌘S).
 *   3. Deploy → New deployment → gear icon → "Web app".
 *        Description:   signup collector
 *        Execute as:    Me
 *        Who has access: Anyone            ← required; the site posts anonymously
 *      Click Deploy. Approve the permissions prompt (it only needs your Sheets access).
 *   4. Copy the "Web app URL" (ends in /exec). Paste it into SIGNUP_ENDPOINT in index.html.
 *   5. Open the URL in a browser tab. You should see {"ok":true,"service":"machine-gods-signups"}.
 *
 * IMPORTANT when editing later: after any code change, Deploy → Manage deployments →
 * pencil icon → Version: "New version" → Deploy. The /exec URL stays the same, but
 * without a new version the live site keeps running the old code.
 *
 * EXPORT: File → Download → Comma Separated Values (.csv). That's your import file
 * for whichever newsletter platform gets picked. Columns are chosen so the CSV drops
 * straight into Ghost, beehiiv, Kit, or Buttondown with at most a column rename.
 */

const SHEET_NAME = 'Signups';
const HEADERS = ['email', 'signed_up_at', 'source', 'referrer', 'user_agent', 'consent_text', 'status'];
// Note: Apps Script web apps can't see the request's Origin header, so the endpoint
// is technically callable by anyone. The honeypot + dedupe keep the sheet tidy; if
// spam ever shows up, filter by the "source" column or rotate the deployment URL.

// Public-ish sanity check so Casey can confirm the deployment in a browser tab.
function doGet() {
  return json_({ ok: true, service: 'machine-gods-signups' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const data = parseBody_(e);

    // Honeypot: the widget includes a hidden "website" field that humans never fill.
    if (data.website) return json_({ ok: true, ignored: true });

    const email = String(data.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
      return json_({ ok: false, error: 'invalid_email' });
    }

    const sheet = getSheet_();
    const existing = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat().map(v => String(v).toLowerCase())
      : [];
    if (existing.includes(email)) return json_({ ok: true, duplicate: true });

    sheet.appendRow([
      email,
      new Date().toISOString(),
      String(data.source || '').slice(0, 500),
      String(data.referrer || '').slice(0, 500),
      String(data.userAgent || '').slice(0, 500),
      String(data.consent || '').slice(0, 500),
      'subscribed',
    ]);

    return json_({ ok: true, duplicate: false });
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

/** Run this from the editor (Run → count) to see the current total in the log. */
function count() {
  const sheet = getSheet_();
  Logger.log('Signups: ' + Math.max(0, sheet.getLastRow() - 1));
}

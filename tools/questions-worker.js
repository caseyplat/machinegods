// Cloudflare Worker: machinegods.fm/ask question form -> Resend -> hey@machinegods.fm
//
// Same setup as the kevinroose.com contact form (kevinroose-form worker), as its own
// Worker so the two sites can't break each other.
//
// Deploy (Cloudflare dashboard, Kevin's account):
//   1. Workers & Pages -> Create -> Worker. Name it exactly "machinegods-form"
//      (ask/index.html posts to https://machinegods-form.kbroose.workers.dev/).
//   2. Edit code, replace everything with this file, Deploy.
//   3. Settings -> Variables and Secrets -> add a Secret named RESEND_API_KEY
//      (create a new key at resend.com/api-keys, "Sending access" is enough). Deploy.
//   4. Visit the URL in a browser: you should see {"ok":true,"service":"machinegods-form"}.
//
// Mail is sent from form@kevinroose.com because that domain is already verified in
// Resend. To send from @machinegods.fm instead, verify machinegods.fm in Resend (adds
// DNS records at Namecheap; leave the Google Workspace MX/SPF records alone) and
// change FROM_EMAIL.

const TO_EMAIL = "hey@machinegods.fm";
const FROM_EMAIL = "form@kevinroose.com"; // must be on a Resend-verified domain
const ALLOWED_ORIGINS = [
  "https://machinegods.fm",
  "https://www.machinegods.fm",
  "https://caseyplat.github.io",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

// Strip anything that could break the From header or inject extra headers.
function cleanLine(s, max = 120) {
  return String(s || "")
    .replace(/[\r\n<>"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method === "GET") {
      return json({ ok: true, service: "machinegods-form" }, 200, origin);
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405, origin);
    }
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return json({ ok: false, error: "Forbidden" }, 403, origin);
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid request" }, 400, origin);
    }

    // Honeypot: real users never fill this. Pretend success, send nothing.
    if (data.website) return json({ ok: true }, 200, origin);

    const name = cleanLine(data.name);
    const location = cleanLine(data.location);
    const email = String(data.email || "").trim();
    const question = String(data.question || "").trim();
    const onAir = data.onAir === true;

    if (!EMAIL_RE.test(email) || email.length > 254) {
      return json({ ok: false, error: "invalid_email" }, 422, origin);
    }
    if (question.length < 10) {
      return json({ ok: false, error: "empty_question" }, 422, origin);
    }
    if (question.length > 3000) {
      return json({ ok: false, error: "too_long" }, 422, origin);
    }

    const who = name || "A listener";
    const subject = `Listener question from ${who}${location ? ` (${location})` : ""}`;
    const onAirLine = onAir ? "yes" : "NO, don't use on air";
    const text =
      `${question}\n\n` +
      `—\n` +
      `Name: ${name || "(not given)"}\n` +
      `Email: ${email}\n` +
      `Location: ${location || "(not given)"}\n` +
      `OK to use on the show: ${onAirLine}\n`;
    const html =
      `<p style="white-space:pre-wrap">${escapeHtml(question)}</p>` +
      `<hr>` +
      `<p><strong>Name:</strong> ${escapeHtml(name || "(not given)")}<br>` +
      `<strong>Email:</strong> ${escapeHtml(email)}<br>` +
      `<strong>Location:</strong> ${escapeHtml(location || "(not given)")}<br>` +
      `<strong>OK to use on the show:</strong> ${escapeHtml(onAirLine)}</p>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${who} via Machine Gods <${FROM_EMAIL}>`, // inbox shows the listener's name
        to: [TO_EMAIL],
        reply_to: email,                                // hit Reply -> goes to the listener
        subject,
        text,
        html,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.log("Resend error", resp.status, detail);
      return json({ ok: false, error: "send_failed" }, 502, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};

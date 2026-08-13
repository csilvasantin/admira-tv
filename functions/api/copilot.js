// POST /api/copilot — cerebro same-origin del avatar del CMS.
// Las preguntas de flota se responden con latidos reales (admira-fleet).
// El resto va a api.yokup.com/copilot si hay Bearer; si no, se dice la causa.

import {
  looksLikeFleetQuestion, fleetSummary, formatFleetAnswer, honestError,
} from "./copilot-lib.js";

const FLEET = "https://admira-fleet.csilvasantin.workers.dev/machines";
const YOKUP = "https://api.yokup.com/copilot";
const UA = "Mozilla/5.0 (compatible; AdmiraCopilot/1.0; +https://admira.tv)";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

async function readFleet() {
  const r = await fetch(FLEET, { headers: { accept: "application/json", "user-agent": UA } });
  if (!r.ok) throw new Error("fleet " + r.status);
  const d = await r.json();
  return d.machines || d || [];
}

export async function onRequestPost({ request }) {
  let body;
  try { body = await request.json(); } catch (_) {
    return json({ ok: false, error: "bad_json", text: honestError("bad_json") }, 400);
  }
  const question = String((body && (body.question || body.text)) || "").trim();
  if (!question) return json({ ok: false, error: "bad_json", text: honestError("bad_json") }, 400);

  if (looksLikeFleetQuestion(question)) {
    try {
      const machines = await readFleet();
      const summary = fleetSummary(machines, Date.now());
      return json({ ok: true, text: formatFleetAnswer(summary), source: "fleet" });
    } catch (_) {
      return json({ ok: false, error: "fleet", text: honestError("fleet") }, 502);
    }
  }

  const auth = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) {
    return json({ ok: false, error: "unauthorized", text: honestError("unauthorized") }, 401);
  }

  try {
    const r = await fetch(YOKUP, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify({ question, lang: (body && body.lang) || "es-ES" }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 || d.error === "unauthorized") {
      return json({ ok: false, error: "unauthorized", text: honestError("unauthorized") }, 401);
    }
    if (!r.ok) {
      return json({ ok: false, error: "brain", text: d.text || d.answer || honestError("brain") }, 502);
    }
    const text = d.text || d.answer || honestError("brain");
    return json({ ok: true, text, source: "yokup" });
  } catch (_) {
    return json({ ok: false, error: "network", text: honestError("network") }, 502);
  }
}

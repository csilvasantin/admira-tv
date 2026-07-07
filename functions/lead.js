// POST /lead — captura de leads del formulario de ADcelerate (admira.tv/adcelerate).
// Guarda en KV (LEADS) y notifica al grupo AgoraMatrix por Bot API de Telegram.
// Mismo dominio que la página (Pages Function) → no depende de *.workers.dev
// (que está bloqueado desde redes de España).
// Portado de admira-adstack (functions/lead.js) — mismo KV, mismo contrato.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const s = (v, n) => (v == null ? "" : String(v)).slice(0, n).trim();

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  // Honeypot: los bots rellenan el campo oculto "website" → los aceptamos en silencio.
  if (s(d.website, 100)) return json({ ok: true }, 200);

  const lead = {
    name: s(d.name, 120),
    company: s(d.company, 160),
    email: s(d.email, 160),
    phone: s(d.phone, 60),
    role: s(d.role, 90),
    message: s(d.message, 2000),
    source: s(d.source, 80) || "admira.tv/adcelerate",
    ts: new Date().toISOString(),
    ref: request.headers.get("referer") || "",
    ua: (request.headers.get("user-agent") || "").slice(0, 200),
    ip: request.headers.get("cf-connecting-ip") || "",
  };
  if (!lead.name || !lead.email || !/.+@.+\..+/.test(lead.email)) {
    return json({ error: "missing_fields" }, 400);
  }

  // Guardar (durable). Clave ordenable por tiempo.
  const id = "lead:" + Date.now() + ":" + Math.random().toString(36).slice(2, 8);
  try { await env.LEADS && env.LEADS.put(id, JSON.stringify(lead)); } catch (e) { /* no romper el UX */ }

  // Notificar al grupo (si hay bot configurado).
  if (env.TG_TOKEN && env.TG_CHAT) {
    const txt =
      "🟢 *Nuevo lead — ADcelerate (admira.tv)*\n" +
      `👤 ${lead.name} · *${lead.company || "—"}*\n` +
      `✉️ ${lead.email}   📞 ${lead.phone || "—"}\n` +
      `🏷️ ${lead.role || "—"}\n` +
      `📝 ${lead.message || "—"}`;
    try {
      await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: env.TG_CHAT, text: txt, parse_mode: "Markdown", disable_web_page_preview: true }),
      });
    } catch (e) { /* la captura ya está guardada; el aviso es best-effort */ }
  }

  return json({ ok: true }, 200);
}

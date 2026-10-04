import { authHeaders, createSession, safeReturnPath, sessionCookie } from "../_auth-session.js";

// Entrada de agentes sin Google. Mismo contrato que admira.app /auth/agente:
// token bueno → 200 y cookie; token malo → 401. X-Agente es opcional.
const AGENT_EMAIL = "agentes@silicio.admiranext.com";
const TOKEN_MIN = 32;

function sameSecret(given, expected) {
  const left = String(given || "");
  const right = String(expected || "");
  const length = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0 && left.length > 0;
}

function agentName(request, form) {
  const raw = String(request.headers.get("X-Agente") || (form && form.get("agente")) || "");
  const clean = raw.replace(/[^\p{L}\p{N} ._·@-]/gu, "").slice(0, 80);
  return clean || "agente";
}

function page(error) {
  const notice = error ? `<p class="error">${error}</p>` : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>admira.tv · Entrada de agentes</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#070b14;color:#e8eef8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.box{width:100%;max-width:430px;padding:32px 26px;border:1px solid #2a3c55;border-radius:16px;background:#101826}h1{margin:0 0 8px;font-size:22px}p{margin:0 0 18px;color:#9aafc6;line-height:1.5;font-size:14px}label{display:block;margin:0 0 6px;font:600 12px ui-monospace,monospace;color:#9aafc6}input{width:100%;padding:10px;border-radius:8px;border:1px solid #2a3c55;background:#070b14;color:#fff;font-size:14px;margin-bottom:14px}button{width:100%;padding:11px;border-radius:8px;border:1px solid #7eb6ff;background:transparent;color:#7eb6ff;font:700 13px ui-monospace,monospace;cursor:pointer}.error{color:#ff8f7a}
  </style></head><body><main class="box"><h1>Entrada de agentes</h1><p>Para los agentes de silicio. Las personas entran con Google.</p><form method="post" action="/auth/agente" autocomplete="off"><label for="agente">Agente y máquina</label><input id="agente" name="agente" maxlength="80" placeholder="SmithMacMini"><label for="token">Token</label><input id="token" name="token" type="password" required><button>Entrar</button></form>${notice}</main></body></html>`;
}

async function readForm(request) {
  const type = String(request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  const raw = await request.text();
  if (raw.length > 4096) return new URLSearchParams();
  if (type === "application/x-www-form-urlencoded") return new URLSearchParams(raw);
  if (type === "application/json") {
    try {
      const body = JSON.parse(raw);
      return new URLSearchParams({
        token: String(body.token || ""),
        agente: String(body.agente || ""),
        return_to: String(body.return_to || "/"),
      });
    } catch (_) { return new URLSearchParams(); }
  }
  return new URLSearchParams();
}

export async function onRequest({ request, env }) {
  const expected = String((env && env.ADMIRA_AGENT_LOGIN_TOKEN) || "");
  if (expected.length < TOKEN_MIN) return new Response("Not found", { status: 404, headers: authHeaders() });
  if (request.method === "GET") {
    return new Response(page(""), { status: 200, headers: { ...authHeaders(), "content-type": "text/html; charset=utf-8" } });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: authHeaders({ Allow: "GET, POST" }) });
  }
  const origin = request.headers.get("Origin");
  if (origin && origin !== "null" && origin !== "https://admira.tv" && origin !== "https://www.admira.tv") {
    return Response.json({ ok: false, error: "origin_not_allowed" }, { status: 403, headers: authHeaders() });
  }
  const bearer = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  const form = bearer ? new URLSearchParams() : await readForm(request);
  const given = bearer ? bearer[1] : String(form.get("token") || "");
  const who = agentName(request, form);
  const ok = given.length > 0 && given.length <= 512 && sameSecret(given, expected);
  if (!ok) {
    if (bearer) return Response.json({ ok: false, error: "token no válido" }, { status: 401, headers: authHeaders() });
    return new Response(page("Token no válido."), { status: 401, headers: { ...authHeaders(), "content-type": "text/html; charset=utf-8" } });
  }
  const session = await createSession(env, { email: AGENT_EMAIL, name: who, sub: "agente" });
  const headers = authHeaders({ "Set-Cookie": sessionCookie(session) });
  if (bearer) {
    return Response.json({ ok: true, email: AGENT_EMAIL, name: who, agent: true }, { status: 200, headers });
  }
  const dest = safeReturnPath(request.headers.get("X-Return-To") || form.get("return_to") || "/");
  return new Response(null, { status: 303, headers: { ...headers, Location: dest } });
}

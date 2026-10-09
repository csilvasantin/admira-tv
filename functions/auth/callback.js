import { authHeaders, clearChallengeCookie, consumeChallenge, createSession, googleCsrfValid, hasAnyAccess, PUBLIC_ORIGIN, sessionCookie, verifyGoogleCredential } from "../_auth-session.js";

function fail(message, status = 400) {
  const safe = String(message || "No se pudo completar el acceso").replace(/[<>&]/g, "");
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Acceso · Admira.tv</title><main style="font:16px system-ui;max-width:42rem;margin:12vh auto;padding:2rem"><h1>Acceso no completado</h1><p>${safe}</p><p><a href="/">Volver a Admira.tv</a></p></main>`, {
    status,
    headers: authHeaders({ "Content-Type": "text/html; charset=utf-8", "Set-Cookie": clearChallengeCookie() }),
  });
}

export async function onRequestPost({ request, env }) {
  const type = String(request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") return fail("La respuesta de Google no tiene el formato esperado.", 415);
  if (Number(request.headers.get("Content-Length") || 0) > 20000) return fail("La respuesta de Google es demasiado grande.", 413);
  let form;
  try {
    const raw = await request.text();
    if (raw.length > 20000) return fail("La respuesta de Google es demasiado grande.", 413);
    form = Object.fromEntries(new URLSearchParams(raw));
  } catch (_) { return fail("La respuesta de Google no se pudo leer."); }
  if (!googleCsrfValid(request, form)) return fail("La comprobación de seguridad de Google ha caducado.", 403);
  const challenge = await consumeChallenge(env, request, form.state);
  if (!challenge) return fail("El intento de acceso ha caducado. Vuelve a intentarlo.", 403);
  const identity = await verifyGoogleCredential(form.credential, challenge.nonce);
  if (!identity) return fail("Google no ha podido validar esta cuenta.", 401);
  if (!(await hasAnyAccess(env, identity.email))) return fail("Esta cuenta no tiene acceso a Admira.tv.", 403);
  const token = await createSession(env, identity);
  // El token de Google viaja al navegador en el FRAGMENTO de la vuelta (#admira_gcred=…): el fragmento no se envía a
  // ningún servidor ni queda en registros. auth-gate.js lo recoge, lo guarda como hacía el acceso por ventana emergente
  // y lo borra de la dirección antes que cualquier otro script. Lo necesitan las páginas que hablan con brain (el mando
  // de /remotecontrol/), que sólo acepta el token de Google; la sesión de admira.tv sigue en su cookie (9-oct-2026).
  const vuelta = challenge.returnPath + (challenge.returnPath.includes("#") ? "&" : "#") +
    "admira_gcred=" + encodeURIComponent(String(form.credential || ""));
  const headers = new Headers(authHeaders({ Location: PUBLIC_ORIGIN + vuelta }));
  headers.append("Set-Cookie", sessionCookie(token));
  headers.append("Set-Cookie", clearChallengeCookie());
  return new Response(null, { status: 303, headers });
}

export function onRequest() {
  return new Response(null, { status: 405, headers: authHeaders({ Allow: "POST" }) });
}

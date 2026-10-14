// Token de admira.tv para la API común (encargo #5979, camino A de Carlos, 14-oct-2026).
//
// admira.tv firma sus propios tokens con ADMIRA_TV_API_KEY, una clave suya (no la de Pixeria): {v:1, aud,
// iss:'admira.tv', email, iat, exp}, firmado HMAC-SHA256 sobre «api:<payload>», el mismo formato que Pixeria.
// La API no conoce esta clave: cuando le llega un token con iss 'admira.tv' lo comprueba llamando a
// POST https://admira.tv/auth/verify, igual que ya hace con admira.studio y pixeria.com. Quién es
// superusuario lo sigue decidiendo la API con la whitelist.

export const ISSUER = "admira.tv";
export const AUDIENCE = "api.admira.store";
export const API_TOKEN_TTL_SECONDS = 15 * 60;
const encoder = new TextEncoder();

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64url(value) {
  const raw = String(value).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(raw + "=".repeat((4 - raw.length % 4) % 4)), (c) => c.charCodeAt(0));
}
async function hmac(secret, message) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}
function sameValue(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createApiToken(secret, email, now = Math.floor(Date.now() / 1000)) {
  const exp = now + API_TOKEN_TTL_SECONDS;
  const payload = base64url(encoder.encode(JSON.stringify({ v: 1, aud: AUDIENCE, iss: ISSUER, email, iat: now, exp })));
  return { token: `${payload}.${await hmac(secret, `api:${payload}`)}`, exp };
}

/** → {email, exp} si el token es de admira.tv, está bien firmado y no ha caducado; si no, null. */
export async function verifyApiToken(secret, token, now = Math.floor(Date.now() / 1000)) {
  try {
    if (!secret || !token || String(token).length > 4096) return null;
    const sep = String(token).lastIndexOf(".");
    if (sep < 1) return null;
    const payloadPart = String(token).slice(0, sep);
    if (!sameValue(String(token).slice(sep + 1), await hmac(secret, `api:${payloadPart}`))) return null;
    const p = JSON.parse(new TextDecoder().decode(fromBase64url(payloadPart)));
    if (p.v !== 1 || p.aud !== AUDIENCE || p.iss !== ISSUER) return null;
    if (!(Number(p.exp) > now) || Number(p.iat) > now + 60) return null;
    const email = String(p.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return null;
    return { email, exp: Number(p.exp) };
  } catch (_) { return null; }
}

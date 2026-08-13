const CLIENT_ID = "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";
const PUBLIC_ORIGIN = "https://admira.tv";
const CHALLENGE_COOKIE = "__Host-atv_challenge";
const SESSION_COOKIE = "__Host-atv_session";
const CHALLENGE_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const OWNERS = new Set(["csilva@admira.com", "csilvasantin@gmail.com"]);
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

const norm = (value) => String(value == null ? "" : value).trim().toLowerCase();
const challengeKey = (state) => `admira-tv:auth:challenge:${state}`;
const sessionKey = (token) => `admira-tv:auth:session:${token}`;

function randomToken(bytes = 24) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  let raw = "";
  for (const byte of value) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function parseCookies(header) {
  const result = Object.create(null);
  for (const part of String(header || "").split(";")) {
    const at = part.indexOf("=");
    if (at < 1) continue;
    try { result[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim()); } catch (_) {}
  }
  return result;
}

export function safeReturnPath(value) {
  const candidate = String(value || "/");
  if (!candidate.startsWith("/") || candidate.startsWith("//") || /[\u0000-\u001f\u007f]/.test(candidate)) return "/";
  try {
    const parsed = new URL(candidate, PUBLIC_ORIGIN);
    return parsed.origin === PUBLIC_ORIGIN ? parsed.pathname + parsed.search + parsed.hash : "/";
  } catch (_) { return "/"; }
}

export function challengeCookie(state, maxAge = CHALLENGE_TTL_SECONDS) {
  return `${CHALLENGE_COOKIE}=${encodeURIComponent(state)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`;
}

export function clearChallengeCookie() {
  return `${CHALLENGE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`;
}

export function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function issueChallenge(env, returnTo, now = Date.now()) {
  if (!env.ACCESS) throw new Error("ACCESS KV unavailable");
  const state = randomToken();
  const nonce = randomToken();
  const record = { state, nonce, returnPath: safeReturnPath(returnTo), expiresAt: now + CHALLENGE_TTL_SECONDS * 1000 };
  await env.ACCESS.put(challengeKey(state), JSON.stringify(record), { expirationTtl: CHALLENGE_TTL_SECONDS });
  return record;
}

export async function consumeChallenge(env, request, state, now = Date.now()) {
  const cookieState = parseCookies(request.headers.get("Cookie"))[CHALLENGE_COOKIE] || "";
  if (!state || state !== cookieState || !env.ACCESS) return null;
  const key = challengeKey(state);
  const raw = await env.ACCESS.get(key);
  if (!raw) return null;
  await env.ACCESS.delete(key);
  try {
    const record = JSON.parse(raw);
    if (record.state !== state || Number(record.expiresAt) < now) return null;
    return { nonce: String(record.nonce || ""), returnPath: safeReturnPath(record.returnPath) };
  } catch (_) { return null; }
}

function constantTimeEqual(left, right) {
  const a = String(left || ""), b = String(right || "");
  if (!a || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

export function googleCsrfValid(request, form) {
  const cookie = parseCookies(request.headers.get("Cookie")).g_csrf_token || "";
  return constantTimeEqual(cookie, form && form.g_csrf_token);
}

export async function verifyGoogleCredential(credential, expectedNonce, fetchImpl = fetch, now = Date.now()) {
  if (!credential || credential.length > 16384 || !expectedNonce) return null;
  try {
    const response = await fetchImpl("https://oauth2.googleapis.com/tokeninfo", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: credential }).toString(),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const exp = Number(data.exp) * 1000;
    const iat = Number(data.iat) * 1000;
    if (!GOOGLE_ISSUERS.has(String(data.iss || ""))) return null;
    if (String(data.aud || "") !== CLIENT_ID) return null;
    if (!Number.isFinite(exp) || exp <= now || !Number.isFinite(iat) || iat > now + 5 * 60 * 1000 || iat < now - 2 * 60 * 60 * 1000) return null;
    if (!(data.email_verified === true || data.email_verified === "true")) return null;
    if (String(data.nonce || "") !== expectedNonce || !data.email) return null;
    return { email: norm(data.email), name: String(data.name || ""), sub: String(data.sub || "") };
  } catch (_) { return null; }
}

function projectFor(doc, id) {
  return (doc.projects || []).find((project) => project.id === id);
}

export function effectiveRole(doc, email, projectId) {
  if (OWNERS.has(norm(email))) return "owner";
  const user = (doc.users || []).find((candidate) => norm(candidate.email) === norm(email));
  if (!user || user.status !== "active") return null;
  let project = projectFor(doc, projectId);
  const seen = new Set();
  while (project && !seen.has(project.id)) {
    const role = user.roles && user.roles[project.id];
    if (role) return role;
    seen.add(project.id);
    project = projectFor(doc, project.parent);
  }
  return null;
}

export async function accessFor(env, email, projectId = "admira-tv", manage = false) {
  if (OWNERS.has(norm(email))) return { allowed: true, role: "owner" };
  if (!env.ACCESS) return { allowed: false, role: null };
  let doc;
  try { doc = JSON.parse(await env.ACCESS.get("admira-tv:users:v3") || "null"); } catch (_) { doc = null; }
  if (!doc || doc.v !== 3) return { allowed: false, role: null };
  const role = effectiveRole(doc, email, projectId);
  const rootRole = effectiveRole(doc, email, "admira-tv");
  const allowed = manage ? ["owner", "admin"].includes(rootRole) : Boolean(role);
  return { allowed, role };
}

export async function hasAnyAccess(env, email) {
  if (OWNERS.has(norm(email))) return true;
  if (!env.ACCESS) return false;
  try {
    const doc = JSON.parse(await env.ACCESS.get("admira-tv:users:v3") || "null");
    const user = doc && (doc.users || []).find((candidate) => norm(candidate.email) === norm(email));
    return Boolean(user && user.status === "active" && Object.keys(user.roles || {}).length);
  } catch (_) { return false; }
}

export async function createSession(env, identity, now = Date.now()) {
  const token = randomToken(32);
  const record = { email: norm(identity.email), name: String(identity.name || ""), sub: String(identity.sub || ""), expiresAt: now + SESSION_TTL_SECONDS * 1000 };
  await env.ACCESS.put(sessionKey(token), JSON.stringify(record), { expirationTtl: SESSION_TTL_SECONDS });
  return token;
}

export async function readSession(request, env, now = Date.now()) {
  const token = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE] || "";
  if (!token || !env.ACCESS) return null;
  try {
    const record = JSON.parse(await env.ACCESS.get(sessionKey(token)) || "null");
    if (!record || Number(record.expiresAt) <= now || !record.email) return null;
    return { ...record, token };
  } catch (_) { return null; }
}

export async function sessionEmail(request, env) {
  const session = await readSession(request, env);
  return session && norm(session.email);
}

export async function destroySession(request, env) {
  const token = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE] || "";
  if (token && env.ACCESS) await env.ACCESS.delete(sessionKey(token));
}

export function authHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store, private",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
}

export { CLIENT_ID, PUBLIC_ORIGIN };

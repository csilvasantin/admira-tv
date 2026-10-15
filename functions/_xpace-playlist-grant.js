// Short-lived server-to-server authorization. Read-context tokens are unrelated.
export const PLAYLIST_PERMISSION_PATH = '/pruebas/api/xpace/playlist-permission';
export const PLAYLIST_PERMISSION_RELEASE = 'v.15.10.2026.r1.13:07';
export const PLAYLIST_GRANT_ISSUER = 'admiranext-playlist-permission';
export const PLAYLIST_GRANT_AUDIENCE = 'admira.tv:xpace-playlist';
export const PLAYLIST_GRANT_TTL = 60;
export const PLAYLIST_SERVICE_ORIGINS = new Set(['https://www.admira.store', 'https://admira.store']);
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
const slug = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{1,79}$/.test(value);
export const validPlaylistChannel = value => value === 'music' || typeof value === 'string' && /^screen-[a-z0-9][a-z0-9-]{0,47}$/.test(value);
export function validPlaylistScope(scope) {
  return !!scope && !Array.isArray(scope) && Object.keys(scope).length === 3 &&
    slug(scope.projectId) && slug(scope.venueId) && validPlaylistChannel(scope.channelId);
}
export function validPlaylistContext(context) {
  if (!context || Array.isArray(context) || Object.keys(context).length !== 4 ||
      ![null, 'starbucks', 'xtanco', 'cafeteria', 'sneakers-store', 'office', 'lab'].includes(context.renderer) ||
      typeof context.venueName !== 'string' || !context.venueName.length || context.venueName.length > 160 ||
      !slug(context.circuitId) || typeof context.xpaceUrl !== 'string' || context.xpaceUrl.length > 1500) return false;
  try {
    const url = new URL(context.xpaceUrl);
    return url.origin === 'https://www.admira.store' && !url.username && !url.password && !url.hash &&
      (url.pathname === '/admira-xp/' || /^\/xpacios\/[a-z0-9-]+\/$/.test(url.pathname));
  } catch { return false; }
}
const contextMatchesScope = (context, scope) => {
  const url = new URL(context.xpaceUrl);
  return url.searchParams.get('project') === scope.projectId && url.searchParams.get('loc') === scope.venueId && url.searchParams.get('circuit') === context.circuitId;
};
const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function decode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('invalid_grant');
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
const jsonPart = value => encode(enc.encode(JSON.stringify(value)));
const keyFor = (secret, usages) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);
const validSecret = secret => typeof secret === 'string' && secret.length >= 32 && secret.length <= 4096;

export async function playlistServiceAuthorized(request, env) {
  if (request.method !== 'POST' || new URL(request.url).pathname !== PLAYLIST_PERMISSION_PATH ||
      !PLAYLIST_SERVICE_ORIGINS.has(request.headers.get('Origin'))) return false;
  const expected = env.XPACE_PLAYLIST_SERVICE_KEY;
  const supplied = request.headers.get('X-Admira-Playlist-Service-Key');
  if (!validSecret(expected) || !validSecret(supplied)) return false;
  const [a, b] = await Promise.all([expected, supplied].map(v => crypto.subtle.digest('SHA-256', enc.encode(v))));
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

export async function issuePlaylistGrant({ secret, subject, scope, context, operations, sessionVersion, now = Date.now() }) {
  if (!validSecret(secret) || !validPlaylistScope(scope) || !validPlaylistContext(context) || !contextMatchesScope(context, scope) ||
      typeof subject !== 'string' || !/^[^\s<>@]+@[^\s<>@]+$/.test(subject) || !Number.isSafeInteger(sessionVersion) || sessionVersion < 1 ||
      !Array.isArray(operations) || !operations.includes('read') ||
      operations.some(op => !['read', 'add', 'remove'].includes(op))) throw Error('invalid_grant_configuration');
  const iat = Math.floor(now / 1000);
  const payload = { iss: PLAYLIST_GRANT_ISSUER, aud: PLAYLIST_GRANT_AUDIENCE, sub: subject,
    scope, context, operations: [...new Set(operations)], sv: sessionVersion, iat, exp: iat + PLAYLIST_GRANT_TTL, jti: crypto.randomUUID() };
  const content = jsonPart({ alg: 'HS256', typ: 'JWT' }) + '.' + jsonPart(payload);
  const signature = await crypto.subtle.sign('HMAC', await keyFor(secret, ['sign']), enc.encode(content));
  return { grant: content + '.' + encode(new Uint8Array(signature)), expiresAt: payload.exp * 1000, payload };
}

// TV additionally resolves the binding and its surface from its own trusted inventory.
export async function verifyPlaylistGrant(token, secret, { scope, operation = 'read', now = Date.now() } = {}) {
  try {
    if (!validSecret(secret) || typeof token !== 'string' || token.length > 4096 || !validPlaylistScope(scope)) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(dec.decode(decode(parts[0])));
    if (header.alg !== 'HS256' || header.typ !== 'JWT' || Object.keys(header).some(k => !['alg', 'typ'].includes(k))) return null;
    const signature = decode(parts[2]);
    if (signature.length !== 32 || !await crypto.subtle.verify('HMAC', await keyFor(secret, ['verify']), signature, enc.encode(parts[0] + '.' + parts[1]))) return null;
    const p = JSON.parse(dec.decode(decode(parts[1]))), seconds = Math.floor(now / 1000);
    if (p.iss !== PLAYLIST_GRANT_ISSUER || p.aud !== PLAYLIST_GRANT_AUDIENCE ||
        !Number.isSafeInteger(p.iat) || !Number.isSafeInteger(p.exp) || p.iat > seconds + 5 ||
        p.exp <= seconds || p.exp <= p.iat || p.exp - p.iat > PLAYLIST_GRANT_TTL ||
        typeof p.sub !== 'string' || !/^[^\s<>@]+@[^\s<>@]+$/.test(p.sub) ||
        !Number.isSafeInteger(p.sv) || p.sv < 1 || typeof p.jti !== 'string' || !p.jti.length || p.jti.length > 128 ||
        !validPlaylistScope(p.scope) || !validPlaylistContext(p.context) || !Array.isArray(p.operations) ||
        !contextMatchesScope(p.context, p.scope) || !p.operations.includes('read') ||
        p.operations.some(op => !['read', 'add', 'remove'].includes(op)) || !p.operations.includes(operation)) return null;
    if (['projectId', 'venueId', 'channelId'].some(k => p.scope[k] !== scope[k])) return null;
    return p;
  } catch { return null; }
}

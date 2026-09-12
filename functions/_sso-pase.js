// Pase SSO de un solo uso entre admira.tv y el creador de admiranext.com (Yokup #3165).
//
// Contrato FIJO (lo verifica el otro lado con el mismo secreto):
//   payload = base64url(JSON.stringify({v:1, email, iat, exp (iat+120 s), nonce (16 hex),
//                                       iss:"admira.tv", aud:"admiranext.com", origen:"contentcatalogue"}))
//   firma   = base64url(HMAC-SHA256(ADMIRA_SSO_SECRET, payload))
//   pase    = payload + "." + firma
// iat/exp en SEGUNDOS Unix. El secreto es un hex de 64 chars y se usa como bytes UTF-8 tal cual
// (la clave HMAC son los 64 caracteres, no los 32 bytes decodificados): así lo lee admiranext.
// Lo emite /api/sso/pase (functions/api/sso/pase.js) solo con sesión del portal y email en la lista.

export const PASE_TTL_S = 120;
export const ISS = 'admira.tv';
export const AUD_DEFECTO = 'admiranext.com';
export const ORIGEN = 'contentcatalogue';
export const EMAILS_DEFECTO = 'csilva@admira.com,csilvasantin@gmail.com';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes){
  let raw = '';
  for(const b of new Uint8Array(bytes)) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(text){
  const s = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function nonceHex(bytes = 8){
  const v = new Uint8Array(bytes);
  crypto.getRandomValues(v);
  return Array.from(v, (b) => ('0' + b.toString(16)).slice(-2)).join('');
}

async function claveHmac(secret){
  return crypto.subtle.importKey('raw', enc.encode(String(secret)), {name:'HMAC', hash:'SHA-256'}, false, ['sign', 'verify']);
}

export async function firmar(secret, payload){
  const key = await claveHmac(secret);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}

export function normEmail(v){ return String(v == null ? '' : v).trim().toLowerCase(); }

/** Lista blanca: env.ADMIRA_SSO_EMAILS (coma) o la de defecto. */
export function emailsPermitidos(env){
  const raw = env && typeof env.ADMIRA_SSO_EMAILS === 'string' && env.ADMIRA_SSO_EMAILS.trim() ? env.ADMIRA_SSO_EMAILS : EMAILS_DEFECTO;
  return new Set(raw.split(/[,\s;]+/).map(normEmail).filter(Boolean));
}

export function emailEnmascarado(email){
  const e = normEmail(email);
  const at = e.indexOf('@');
  if(at < 1) return '';
  const local = e.slice(0, at), dom = e.slice(at + 1);
  return local.charAt(0) + '***' + (local.length > 1 ? local.charAt(local.length - 1) : '') + '@' + dom;
}

/** Emite el pase. Devuelve {pase, exp, iat, nonce}. */
export async function emitirPase(secret, {email, aud = AUD_DEFECTO, now = Date.now(), ttl = PASE_TTL_S} = {}){
  if(!secret) throw new Error('sso_secret_missing');
  const iat = Math.floor(now / 1000);
  const cuerpo = {v:1, email:normEmail(email), iat, exp:iat + ttl, nonce:nonceHex(8), iss:ISS, aud:String(aud), origen:ORIGEN};
  const payload = b64url(enc.encode(JSON.stringify(cuerpo)));
  const firma = await firmar(secret, payload);
  return {pase:payload + '.' + firma, exp:cuerpo.exp, iat, nonce:cuerpo.nonce};
}

function igualConstante(a, b){
  a = String(a || ''); b = String(b || '');
  if(!a || a.length !== b.length) return false;
  let d = 0;
  for(let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Verifica un pase. Devuelve {ok:true, claims} o {ok:false, error}. No consume el nonce
 *  (eso lo hace quien acepta el pase, admiranext, con su propio registro de un solo uso). */
export async function verificarPase(secret, pase, {aud = AUD_DEFECTO, now = Date.now(), tolerancia = 30} = {}){
  if(!secret) return {ok:false, error:'sso_secret_missing'};
  const partes = String(pase || '').split('.');
  if(partes.length !== 2 || !partes[0] || !partes[1]) return {ok:false, error:'formato'};
  const [payload, firma] = partes;
  const esperada = await firmar(secret, payload);
  if(!igualConstante(esperada, firma)) return {ok:false, error:'firma'};
  let claims;
  try{ claims = JSON.parse(dec.decode(b64urlDecode(payload))); }catch(_){ return {ok:false, error:'payload'}; }
  const t = Math.floor(now / 1000);
  if(claims.v !== 1) return {ok:false, error:'version'};
  if(claims.iss !== ISS) return {ok:false, error:'iss'};
  if(claims.aud !== aud) return {ok:false, error:'aud'};
  if(!/^[0-9a-f]{16}$/.test(String(claims.nonce || ''))) return {ok:false, error:'nonce'};
  if(!Number.isFinite(claims.iat) || !Number.isFinite(claims.exp)) return {ok:false, error:'tiempo'};
  if(claims.exp - claims.iat > PASE_TTL_S) return {ok:false, error:'ttl'};
  if(claims.iat > t + tolerancia) return {ok:false, error:'futuro'};
  if(claims.exp <= t) return {ok:false, error:'caducado'};
  if(!/^[^@\s]+@[^@\s]+$/.test(String(claims.email || ''))) return {ok:false, error:'email'};
  return {ok:true, claims};
}

// Pase de KIOSCO para elementos URL de una playlist (Carlos, 20-nov-2026: «incluir urls para que se abran en el
// player de admira.tv, por ejemplo admiranext.com/analytics, con un token si tiene bloqueo»).
//
// Mismo secreto compartido que el SSO (ADMIRA_SSO_SECRET, Yokup #3165) y mismo formato payload.firma, pero:
//   · origen "kiosko" y email vacío → ningún verificador de SSO de personas lo acepta;
//   · lleva {screen, ruta}: admiranext.com lo canjea en /kiosko/entrar por una sesión de solo lectura de
//     15 min y SOLO para esa ruta (functions/_kiosko.js de admira-next-web).
// Lo emite /api/kiosko/pase solo si la URL está en la playlist publicada de esa pantalla.
import { b64url, firmar, nonceHex, ISS, AUD_DEFECTO, PASE_TTL_S } from './_sso-pase.js';

export const ORIGEN_KIOSKO = 'kiosko';
// Hosts nuestros con kiosco y rutas abiertas a los players (el otro lado tiene la misma lista).
export const HOSTS_KIOSKO = new Set(['www.admiranext.com', 'admiranext.com']);
export const RUTAS_KIOSKO = new Set(['/analytics']);
export const ENTRADA_KIOSKO = 'https://www.admiranext.com/kiosko/entrar';

/** ¿Esta URL se abre con kiosco? Devuelve la ruta canónica o ''. */
export function rutaKioskoDe(url){
  let u; try{ u = new URL(String(url || '')); }catch(_){ return ''; }
  if(u.protocol !== 'https:' || u.username || u.password || !HOSTS_KIOSKO.has(u.hostname.toLowerCase())) return '';
  const ruta = u.pathname.replace(/\/index\.html$/i, '').replace(/\/+$/, '').toLowerCase() || '/';
  return RUTAS_KIOSKO.has(ruta) ? ruta : '';
}

const enc = new TextEncoder();
export async function emitirPaseKiosko(secret, {screen, ruta, now = Date.now()} = {}){
  if(!secret) throw new Error('sso_secret_missing');
  if(!/^[a-z0-9][a-z0-9._-]{1,99}$/i.test(String(screen || '')) || !RUTAS_KIOSKO.has(ruta)) throw new Error('alcance');
  const iat = Math.floor(now / 1000);
  const cuerpo = {v:1, email:'', iat, exp:iat + PASE_TTL_S, nonce:nonceHex(8), iss:ISS, aud:AUD_DEFECTO, origen:ORIGEN_KIOSKO, screen:String(screen), ruta};
  const payload = b64url(enc.encode(JSON.stringify(cuerpo)));
  return {pase:payload + '.' + await firmar(secret, payload), exp:cuerpo.exp};
}

/** Busca el elemento en la playlist publicada y decide si merece pase. */
export function elementoConKiosko(items, {item = '', url = ''} = {}){
  const id = String(item || ''), wanted = String(url || '');
  for(const it of Array.isArray(items) ? items : []){
    if(!it || typeof it !== 'object') continue;
    const asset = String(it.asset || it.url || '');
    if(id && id !== String(it.id || '') && id !== String(it.stockId || '')) continue;
    if(wanted && wanted !== asset) continue;
    if(!id && !wanted) continue;
    if(String(it.auth || '').toLowerCase() === 'none') continue;
    const ruta = rutaKioskoDe(asset);
    if(ruta) return {asset, ruta};
  }
  return null;
}

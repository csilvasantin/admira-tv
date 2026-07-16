/*
 * Protección DÉBIL (candado ligero) para /presenta/* en admira.tv — el cockpit
 * "Clear Channel × Admira". Password ÚNICA compartida vía HTTP Basic Auth contra el
 * secret PRESENTA_PASS.
 *
 * La password NUNCA está en el código: se fija sin verla, canalizando el portapapeles
 * directo al secret de Cloudflare:
 *   pbpaste | npx wrangler pages secret put PRESENTA_PASS --project-name admira-tv
 *
 * Es un candado BLANDO: disuade el vistazo casual. No es seguridad fuerte (el cockpit
 * llama a /locations/cmd y a canal.html, que tienen su propia lógica aparte).
 */
function ctEq(a, b){
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const HDRS = {
  'WWW-Authenticate': 'Basic realm="Clear Channel × Admira", charset="UTF-8"',
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store'
};
const PAGE = '<!doctype html><html lang="es"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<meta name="robots" content="noindex, nofollow"><title>Acceso · Clear Channel × Admira</title></head>'
  + '<body style="background:#05080c;color:#7db8ff;font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px">'
  + '<div>🔒<p>Contenido protegido.<br>Introduce la contraseña para ver la presentación.</p></div></body></html>';

export async function onRequest(context){
  const { request, env, next } = context;
  const expected = env.PRESENTA_PASS;
  // Sin password configurada → candado cerrado (nunca público por accidente).
  if (!expected) return new Response(PAGE, { status: 401, headers: HDRS });

  const m = /^Basic\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
  if (m){
    let decoded = '';
    try { decoded = atob(m[1].trim()); } catch (_) {}
    const i = decoded.indexOf(':');          // usuario:password (password = tras el 1er ':')
    const pass = i >= 0 ? decoded.slice(i + 1) : '';
    if (ctEq(pass, expected)) return next(); // correcto → sirve el cockpit
  }
  return new Response(PAGE, { status: 401, headers: HDRS });
}

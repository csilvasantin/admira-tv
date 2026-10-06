import { authHeaders } from "./_auth-session.js";
import { lecturaBlocksWrite } from "./_lectura-guard.js";

// La sesión de solo lectura (encargo #5261) puede ver. No puede escribir en
// ninguna ruta: playlist, usuarios, mando ni catálogo.
//
// EXCEPTO el propio circuito de identificación (06-10-2026). Un navegador que había
// canjeado el enlace de lectura llevaba la cookie visor y este guarda le respondía
// 403 «solo_lectura» también a POST /auth/challenge: la verja de /apps/ (fuera de los
// proyectos de lectura) decía «no se pudo iniciar el acceso seguro · HTTP 403 ·
// solo_lectura», sin botón de Google, y no había forma de salir ni con /auth/logout
// hasta que caducaba la cookie (8 h). Entrar con Google o cerrar sesión no escribe
// datos de nadie: el reto solo guarda un nonce, el callback exige una credencial de
// Google válida y SUSTITUYE la sesión visor por la real, y logout la destruye.
export const AUTH_FLOW = new Set(["/auth/challenge", "/auth/callback", "/auth/logout"]);

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  if (!AUTH_FLOW.has(path) && await lecturaBlocksWrite(context.request, context.env)) {
    return Response.json({ ok: false, error: "solo_lectura" }, { status: 403, headers: authHeaders() });
  }
  return context.next();
}

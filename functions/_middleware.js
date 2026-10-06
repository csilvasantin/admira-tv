import { authHeaders } from "./_auth-session.js";
import { lecturaBlocksWrite } from "./_lectura-guard.js";

// La sesión de solo lectura (encargo #5261) puede ver. No puede escribir en
// ninguna ruta: playlist, usuarios, mando ni catálogo.
export async function onRequest(context) {
  if (await lecturaBlocksWrite(context.request, context.env)) {
    return Response.json({ ok: false, error: "solo_lectura" }, { status: 403, headers: authHeaders() });
  }
  return context.next();
}

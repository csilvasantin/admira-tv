import { publicMediaFile } from "../_public-media.js";

// GET /apps/pdf/<slug>.pdf — sirve dosieres de la allowlist pública
// (admira.tv/apps) desde el MISMO bucket R2 "admira-app-videos" (binding VIDEOS):
// las claves <slug>.pdf conviven con las <slug>.mp4 sin colisión.
//
// Same-origin (Pages Function, NO *.workers.dev) por el bloqueo de los ISP
// españoles a workers.dev — misma lección que /apps/video/[file].js.
//
// Siempre con Content-Disposition: attachment (el botón de la lanzadera es de
// DESCARGA). El manifest apps/videos.json decide qué slugs tienen pdf; aquí
// solo servimos bytes. Sube cada dosier con:
//   wrangler r2 object put admira-app-videos/<slug>.pdf --file <slug>.pdf --remote

const CACHE = "public, max-age=3600";

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function onRequestGet({ params, env }) {
  const bucket = env.VIDEOS;
  if (!bucket) return new Response("PDF storage not configured", { status: 500 });

  let file = params.file;
  if (Array.isArray(file)) file = file[0];
  file = decodeURIComponent(String(file || ""));
  // La existencia en R2 no concede acceso: el slug debe estar publicado.
  file = publicMediaFile(file, "pdf");
  if (!file) return notFound();

  const obj = await bucket.get(file);
  if (!obj) return notFound();

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Length", String(obj.size));
  headers.set("Content-Disposition", `attachment; filename="admira-${file}"`);
  headers.set("Cache-Control", CACHE);
  return new Response(obj.body, { status: 200, headers });
}

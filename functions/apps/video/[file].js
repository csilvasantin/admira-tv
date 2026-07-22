import { publicMediaFile } from "../_public-media.js";

// GET /apps/video/<slug>.mp4 — sirve los vídeos explicativos de la allowlist pública
// lanzadera (admira.tv/apps) desde el bucket R2 "admira-app-videos" (binding VIDEOS).
//
// Same-origin (Pages Function, NO *.workers.dev) porque los ISP españoles bloquean
// 188.114.96.0/22 → workers.dev inaccesible (lección del equipo).
//
// Soporta Range requests: los elementos <video> piden trozos (bytes=…). Sin Range
// devolvemos 200 con el objeto completo; con Range válido, 206 con Content-Range.
// El manifest apps/videos.json decide qué slugs existen; aquí solo servimos bytes.
//
// Clave en el bucket = "<slug>.mp4" (el mismo nombre de fichero de la URL).

const CACHE = "public, max-age=3600";

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function baseHeaders(total) {
  const h = new Headers();
  h.set("Content-Type", "video/mp4");
  h.set("Accept-Ranges", "bytes");
  h.set("Cache-Control", CACHE);
  if (typeof total === "number") h.set("Content-Length", String(total)); // se sobreescribe en 206
  return h;
}

export async function onRequestGet({ params, env, request }) {
  const bucket = env.VIDEOS;
  if (!bucket) return new Response("Video storage not configured", { status: 500 });

  // params.file es el segmento capturado por [file].js (p.ej. "dashboard.mp4").
  let file = params.file;
  if (Array.isArray(file)) file = file[0];
  file = decodeURIComponent(String(file || ""));
  // La existencia en R2 no concede acceso: el slug debe estar publicado.
  const key = publicMediaFile(file, "mp4");
  if (!key) return notFound();

  const rangeHeader = request.headers.get("Range");

  // --- Petición con Range → 206 (parcial) ---
  if (rangeHeader) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (m && (m[1] !== "" || m[2] !== "")) {
      let getOpts;
      if (m[1] === "") {
        // sufijo: últimos N bytes (bytes=-N)
        getOpts = { range: { suffix: parseInt(m[2], 10) } };
      } else {
        const start = parseInt(m[1], 10);
        const r = { offset: start };
        if (m[2] !== "") r.length = parseInt(m[2], 10) - start + 1;
        getOpts = { range: r };
      }

      const obj = await bucket.get(key, getOpts);
      if (!obj) return notFound();

      const total = obj.size; // tamaño TOTAL del objeto
      // R2 devuelve el tramo realmente servido en obj.range {offset,length}.
      const rr = obj.range || {};
      const offset = typeof rr.offset === "number" ? rr.offset : 0;
      const length =
        typeof rr.length === "number"
          ? rr.length
          : total - offset; // hasta el final si no hay length
      const end = offset + length - 1;

      const headers = baseHeaders();
      headers.set("Content-Range", `bytes ${offset}-${end}/${total}`);
      headers.set("Content-Length", String(length));
      return new Response(obj.body, { status: 206, headers });
    }
    // Range presente pero no parseable → servimos completo (200), es válido.
  }

  // --- Sin Range → 200 (completo) ---
  const obj = await bucket.get(key);
  if (!obj) return notFound();
  const headers = baseHeaders(obj.size);
  return new Response(obj.body, { status: 200, headers });
}

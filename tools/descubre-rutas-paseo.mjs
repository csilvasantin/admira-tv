// Paseo del Tour DooH (adcelerate/demo): vuelve a buscar las rutas dirigidas entre quioscos con los
// enlaces ACTUALES de Street View y reescribe js/urban-route.js y data/urban-route-evidence.json.
// Google renueva fotos y caduca IDs de panorama: el 21-oct-2026 el Paseo Vila → Jardinets se rompía
// en el paso 9, la llegada a Vila (xyBUN…) ya no existía y las tres fotos calibradas de los quioscos
// habían quedado como islas: la red enlazada llega a 1–7 m de cada una, pero por otra captura.
// Por eso una ruta puede empezar o acabar con un RELEVO: cambio explícito de foto en el mismo punto
// (≤ HANDOFF_METRES), como «jesus-2023» en el cruce de Mozart. Nunca cuenta como paso a pie.
// Solo consulta METADATOS (StreetViewService.getPanorama: posición, fecha y enlaces). No descarga,
// precarga ni guarda fotos ni teselas: las condiciones de Google Maps Platform lo prohíben.
// Corre dentro de admira.tv porque la clave de navegador solo admite sus referrers. Carlos, 21-oct-2026.
// Uso:  PLAYWRIGHT_PATH=/ruta/a/node_modules/playwright node tools/descubre-rutas-paseo.mjs
//       … --check   no escribe nada; sale con 1 si algún tramo catalogado ya no vale.
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../adcelerate/demo/", import.meta.url));
const ROUTES_JS = ROOT + "js/urban-route.js", EVIDENCE = ROOT + "data/urban-route-evidence.json";
const PAGE = "https://admira.tv/adcelerate/demo/?view=human&site=vila";
const CHECK = process.argv.includes("--check");
const MISSION = "Paseo al día y Destino a pie a Starbucks · Carlos, 21-oct-2026";

// El circuito del Tour DooH es Vila → Jardinets → Lesseps → Vila; Jardinets → Vila cubre arrancar
// el tour desde Jardinets. Cada ruta va de la foto calibrada de un quiosco a la del siguiente.
// Starbucks (Passeig de Gràcia 103) no tiene pantalla y no entra en el circuito, pero «Destino» va a
// pie hasta su foto de entrada desde Jardinets y desde Vila, y vuelve (Carlos, 21-oct-2026).
const RUTAS = [
  { id: "vila-jardinets", from: "vila", to: "jardinets" },
  { id: "jardinets-lesseps", from: "jardinets", to: "lesseps" },
  { id: "lesseps-vila", from: "lesseps", to: "vila" },
  { id: "jardinets-vila", from: "jardinets", to: "vila" },
  { id: "jardinets-starbucks", from: "jardinets", to: "starbucks" },
  { id: "starbucks-jardinets", from: "starbucks", to: "jardinets" },
  { id: "vila-starbucks", from: "vila", to: "starbucks" },
  { id: "starbucks-vila", from: "starbucks", to: "vila" },
];
const LIMITS = { MAX_STEP_METRES: 35, HANDOFF_METRES: 10, HANDOFF_PENALTY: 40, MIN_DATE: "2022-01",
  DATE_CHANGE_PENALTY: 12, CORRIDOR_SLACK: 600, MAX_CALLS: 4000 };

// Se instala en la página: metadatos con memoria y distancia en metros.
async function installStreetViewHelpers() {
  const { StreetViewService } = await google.maps.importLibrary("streetView"), svc = new StreetViewService();
  const cache = new Map(), stats = { calls: 0 };
  const node = (requested, d, status) => {
    if (status !== "OK" || !d?.location?.pano) return { requested, status, observedAt: new Date().toISOString() };
    const p = d.location.latLng;
    return { requested, status: "OK", observedAt: new Date().toISOString(), pano: d.location.pano, position: { lat: p.lat(), lng: p.lng() },
      date: /^\d{4}-\d{2}$/.test(d.imageDate || "") ? d.imageDate : "", description: d.location.description || "",
      links: (d.links || []).filter(l => l?.pano && Number.isFinite(l.heading)).map(l => ({ description: l.description || "", heading: l.heading, pano: l.pano })) };
  };
  const meta = pano => {
    if (!cache.has(pano)) cache.set(pano, new Promise(res => { stats.calls++; svc.getPanorama({ pano }, (d, s) => {
      const n = node(pano, d, s); res(n.status === "OK" && n.pano !== pano ? { requested: pano, status: "MOVED", observedAt: n.observedAt } : n);
    }); }));
    return cache.get(pano);
  };
  const at = location => new Promise(res => { stats.calls++; svc.getPanorama({ location, radius: 10, source: google.maps.StreetViewSource.OUTDOOR }, (d, s) => res(node("@" + location.lat + "," + location.lng, d, s))); });
  const rad = Math.PI / 180;
  const metres = (a, b) => Math.hypot((b.lng - a.lng) * rad * Math.cos((a.lat + b.lat) / 2 * rad), (b.lat - a.lat) * rad) * 6371008.8;
  globalThis.__paseoRutas = { meta, at, metres, stats };
}

const pw = process.env.PLAYWRIGHT_PATH ? require(process.env.PLAYWRIGHT_PATH) : await import("playwright");
const browser = await pw.chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  let frame = null;
  for (let i = 0; i < 240 && !frame; i++) {
    const f = page.frames().find(f => /\/best\//.test(f.url()));
    if (f) { try { if (await f.evaluate(() => !!(globalThis.google?.maps?.importLibrary && globalThis.OutdoorSites))) frame = f; } catch {} }
    if (!frame) await page.waitForTimeout(250);
  }
  if (!frame) throw Error("No cargó el motor de Street View de admira.tv");
  await frame.evaluate(installStreetViewHelpers);

  if (CHECK) {
    const routes = require(ROUTES_JS).all.map(r => ({ id: r.id, panos: r.panos, handoffs: r.handoffs || [] }));
    const rotos = await frame.evaluate(async ({ routes, LIMITS }) => {
      const { meta, metres } = globalThis.__paseoRutas, out = [];
      for (const r of routes) for (let i = 0; i < r.panos.length - 1; i++) {
        const a = await meta(r.panos[i]), b = await meta(r.panos[i + 1]);
        if (a.status !== "OK" || b.status !== "OK") out.push(`${r.id} ${i}→${i + 1} (panorama sin datos)`);
        else if (r.handoffs.includes(i) ? metres(a.position, b.position) > LIMITS.HANDOFF_METRES : !a.links.some(l => l.pano === b.pano)) out.push(`${r.id} ${i}→${i + 1}`);
      }
      return out;
    }, { routes, LIMITS });
    console.log(rotos.length ? "Tramos que ya no valen:\n  " + rotos.join("\n  ") : "Todas las rutas del Paseo siguen enlazadas.");
    process.exitCode = rotos.length ? 1 : 0;
  } else {
    const found = await frame.evaluate(async ({ rutas, LIMITS }) => {
      const { meta, at, metres, stats } = globalThis.__paseoRutas;
      const L = LIMITS;
      // A* sobre enlaces dirigidos. Aristas extra, solo en los extremos: relevo de la foto calibrada de
      // salida a la foto que Google sirve hoy en ese punto, y de cualquier foto a ≤ HANDOFF_METRES de la
      // de llegada a esta. Penalizan para que, si existe, gane siempre un enlace real.
      async function search(start, goal) {
        const s = await meta(start), g = await meta(goal);
        if (s.status !== "OK" || g.status !== "OK") throw Error(`Foto calibrada sin datos: ${s.status !== "OK" ? start : goal}`);
        const budget = metres(s.position, g.position) + L.CORRIDOR_SLACK, callsBefore = stats.calls;
        const best = new Map([[start, 0]]), prev = new Map(), closed = new Set();
        const open = [{ pano: start, f: metres(s.position, g.position) }];
        const relax = (from, to, n, cost, handoff, link) => {
          if (closed.has(to) || cost >= (best.get(to) ?? Infinity)) return;
          best.set(to, cost); prev.set(to, { from, handoff, link }); open.push({ pano: to, f: cost + metres(n.position, g.position) });
        };
        const here = await at(s.position);
        if (here.status === "OK" && here.pano !== start && metres(s.position, here.position) <= L.HANDOFF_METRES && here.date >= L.MIN_DATE)
          relax(start, here.pano, await meta(here.pano), L.HANDOFF_PENALTY, true);
        while (open.length) {
          open.sort((a, b) => a.f - b.f);
          const { pano } = open.shift();
          if (closed.has(pano)) continue;
          if (pano === goal) break;
          closed.add(pano);
          if (stats.calls - callsBefore > L.MAX_CALLS) throw Error(`Búsqueda demasiado larga hacia ${goal}`);
          const n = await meta(pano), cost = best.get(pano);
          const next = await Promise.all(n.links.map(async link => ({ link, m: await meta(link.pano) })));
          for (const { link, m } of next) {
            if (m.status !== "OK" || !m.date || m.date < L.MIN_DATE) continue;
            const step = metres(n.position, m.position);
            if (!(step > 0 && step < L.MAX_STEP_METRES)) continue;
            if (metres(s.position, m.position) + metres(m.position, g.position) > budget) continue;
            relax(pano, m.pano, m, cost + step + (m.date !== n.date ? L.DATE_CHANGE_PENALTY : 0), false, link);
          }
          if (pano !== start && metres(n.position, g.position) <= L.HANDOFF_METRES && !n.links.some(l => l.pano === goal))
            relax(pano, goal, g, cost + L.HANDOFF_PENALTY, true);
        }
        if (!prev.has(goal)) throw Error(`Sin camino de ${start} a ${goal}`);
        const panos = [goal];
        for (let p = goal; p !== start; p = prev.get(p).from) panos.unshift(prev.get(p).from);
        const steps = [], handoffs = [];
        for (let i = 0; i < panos.length - 1; i++) {
          const a = await meta(panos[i]), b = await meta(panos[i + 1]), how = prev.get(b.pano);
          const step = { from: a.pano, to: b.pano, metres: metres(a.position, b.position), date: b.date, position: b.position };
          if (how.handoff) { handoffs.push(i); steps.push({ ...step, handoff: true, description: "Relevo de foto en el mismo punto" }); }
          else steps.push({ ...step, heading: how.link.heading, description: how.link.description });
        }
        return { panos, steps, handoffs };
      }
      const routes = [];
      for (const r of rutas) {
        const from = OutdoorSites.get(r.from), to = OutdoorSites.get(r.to);
        const { panos, steps, handoffs } = await search(from.entry.pano, to.entry.pano);
        const walking = steps.filter(s => !s.handoff);
        routes.push({ id: r.id, fromSiteId: r.from, toSiteId: r.to, metres: walking.reduce((n, s) => n + s.metres, 0),
          maxStepMetres: Math.max(...walking.map(s => s.metres)), handoffs, panos, steps });
      }
      const nodes = {};
      for (const r of routes) for (const p of r.panos) nodes[p] = await meta(p);
      return { routes, nodes, calls: stats.calls };
    }, { rutas: RUTAS, LIMITS });

    const observedAt = new Date().toISOString();
    const evidence = {
      mission: MISSION,
      observedAt,
      source: "Google Maps JavaScript StreetViewService current directed links; validate again at runtime",
      routes: found.routes,
      observations: [{ mission: MISSION, observedAt, routeIds: found.routes.map(r => r.id),
        checkedNodes: Object.keys(found.nodes).length, checkedEdges: found.routes.reduce((n, r) => n + r.steps.length, 0),
        metadataRequests: found.calls, errors: [] }],
      nodes: found.nodes,
      notes: [
        "Paths are searched again with tools/descubre-rutas-paseo.mjs over the current directed links of StreetViewService.",
        `Every walking step is a link Google returns from its source panorama, shorter than ${LIMITS.MAX_STEP_METRES} m, towards imagery dated ${LIMITS.MIN_DATE} or later.`,
        `A handoff is an explicit photograph change at the same spot (≤ ${LIMITS.HANDOFF_METRES} m), only at either end of a route, because the calibrated kiosk photographs are no longer linked from the current network. It never counts as a walking step.`,
        "Only metadata is requested. Photographs and tiles are always served live by Google; nothing is prefetched or stored.",
      ],
    };
    await writeFile(EVIDENCE, JSON.stringify(evidence, null, 2) + "\n");
    const records = found.routes.map(({ id, fromSiteId, toSiteId, metres, handoffs, panos }) => ({ id, fromSiteId, toSiteId, metres, handoffs, panos }));
    const js = await readFile(ROUTES_JS, "utf8");
    const start = js.indexOf("  const records=["), end = js.indexOf("\n];\n", start);
    if (start < 0 || end < 0) throw Error("No encuentro el bloque records de urban-route.js");
    await writeFile(ROUTES_JS, js.slice(0, start) + "  const records=" + JSON.stringify(records, null, 2) + js.slice(end + 2));
    for (const r of found.routes) console.log(`${r.id}: ${r.steps.length - r.handoffs.length} pasos · ${Math.round(r.metres)} m · paso máx ${r.maxStepMetres.toFixed(1)} m · relevos en ${JSON.stringify(r.handoffs)}`);
    console.log(`${found.calls} consultas de metadatos a Street View.`);
  }
} finally {
  await browser.close();
}

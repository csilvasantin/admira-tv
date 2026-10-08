// RESOLVER DEL MODELO ÚNICO DE PLAYLISTS (E2 · 8-oct-2026): ¿qué emite ESTA pantalla en ESTE instante?
//
// Puro y sin red: todo lo que necesita llega como entrada ya leída —
//   facts        identidad de la pantalla YA completada (hintFacts + enrichFacts de playlist.js los pone quien llama)
//   screenTags   opcional: si llegan, mandan; si no, deduceScreenTags(facts) + applyCircuits(circuitos)
//   asignaciones normalizadas (modelo.limpiarAsignacion o filas del almacén) y playlists (array o mapa por id)
//   stock        índice del Stock (stock.admira.store/stock/index.json)
//   parrilla     respuesta de /grid/day de pixer-worker para la pantalla (capa de venta aparte, decisión 1)
//   mando        {tipo:'hashtag'|'id'|'directo', valor, desde}: el mando en vivo del operador (decisión 2)
//
// Algoritmo (diseño aprobado por Carlos el 8-oct-2026):
//   1. Etiquetas de la pantalla.  2. Hora local (Intl, Europe/Madrid).
//   3. Candidatas: asignaciones activas que cubren el instante y casan con el destino, más las implícitas: el hashtag
//      dirigido (por_defecto · anade) y la parrilla de la franja (pagado → pagada · intercala; propio → propia ·
//      intercala; rundown municipal-50-50 → propia · sustituye · exacta).
//   4. Si hay emergencia: la fusión de todas las de emergencia, exacta y sin spots.
//   5. Base: la capa más alta con sustituye o fusiona; dentro, el orden K. Gana lo directo; lo que llega por grupos se
//      fusiona. Si la base sale vacía (regla sin piezas), se cae a la siguiente.
//   6. Reglas vivas y huecos contra el Stock con resolveContent: sin stockId repetido entre playlists, máx. 200.
//   7. Las que añaden, de capa igual o superior a la base, detrás y sin repetir.
//   8. Spots tejidos cada `cadencia` piezas (la mínima declarada o 4): pagados primero, después propios.
//   9. Sin base ni añadidos: items vacío y capa relleno (el player teje los spots sobre su propio relleno).
//  10. validoHasta (próximo borde de programación, de franja de parrilla o de caducidad del mando; ≤ 48 h) y siguiente.
// Mando en vivo: gana sobre la base hasta 2 h o el siguiente borde de franja; lo pagado se sigue intercalando.

import { addressedContent, applyCircuits, deduceScreenTags, norm, resolveContent, targetMatches } from "../_playlist-live.js";
import { CADENCIA_DEFECTO, CAPAS, MAX_ITEMS, esDirecta, ordenK } from "./modelo.js";
import { HORA_MS, HORIZONTE_MS, ZONA, aMinutos, aUtc, cubre, esFecha, partesLocales, proximoBorde, sumarDias } from "./horario.js";

export const MANDO_MAX_MS = 2 * HORA_MS;
export const RUNDOWN_EXACTO = "municipal-50-50";
const PAGADO = new Set(["paid", "sold", "accepted"]);

const tipoAsset = t => { t = String(t || "").toLowerCase(); return t === "video" || t === "animation" ? "video" : ["audio", "music", "locucion"].includes(t) ? "audio" : "image"; };
const clave = it => (it.stockId ? "s:" + it.stockId : "a:" + (it.asset || it.id));
const sinTipo = it => { const { tipo, ...resto } = it; return resto; };

/** Teje los spots en la base cada `cada` piezas, en ciclo, y ninguno se queda sin salir en la vuelta. */
export function intercalar(base, spots, cada = CADENCIA_DEFECTO) {
  if (!spots.length) return base.slice();
  if (!base.length) return spots.slice();
  const out = [];
  let gi = 0;
  for (let i = 0; i < base.length; i += 1) {
    out.push(base[i]);
    if ((i + 1) % cada === 0) { out.push(spots[gi % spots.length]); gi += 1; }
  }
  for (; gi < spots.length; gi += 1) out.push(spots[gi]);
  return out;
}

// ── Contexto: lo que no depende del instante ────────────────────────────────────────────────────────────────────
function leerParrilla(p, ahora, zona) {
  if (!p || !Array.isArray(p.bands)) return { bandas: [], segundos: 10 };
  const fecha = esFecha(String(p.date || "")) ? String(p.date) : partesLocales(ahora, zona).fecha;
  const segundos = Math.max(2, Math.min(120, Number(p.config && p.config.slotSeconds) || 10)), bandas = [];
  for (const b of p.bands) {
    const desde = aMinutos(b && b.from, 1439), hasta = aMinutos(b && b.to);
    if (desde == null || hasta == null) continue;
    const inicio = aUtc(fecha, desde, zona), fin = hasta > desde ? aUtc(fecha, hasta, zona) : aUtc(sumarDias(fecha, 1), hasta, zona);
    if (fin > inicio) bandas.push({ id: String(b.id || ""), label: String(b.label || b.id || ""), inicio, fin, slots: Array.isArray(b.slots) ? b.slots : [] });
  }
  return { fecha, bandas, segundos };
}
function contexto(entrada, ahora) {
  const zona = entrada.zona || ZONA, facts = entrada.facts && typeof entrada.facts === "object" ? entrada.facts : {};
  // Circuitos en la forma de cleanCircuit (KV de hoy) o en la del almacén (nombre/destino/activo).
  const circuitos = (Array.isArray(entrada.circuitos) ? entrada.circuitos : []).filter(Boolean)
    .map(c => ({ id: c.id, enabled: c.enabled ?? c.activo, target: c.target || c.destino }));
  const screenTags = Array.isArray(entrada.screenTags) ? [...new Set(entrada.screenTags.map(String))].sort()
    : applyCircuits(deduceScreenTags(facts), circuitos);
  const playlists = new Map();
  const fuente = entrada.playlists instanceof Map ? [...entrada.playlists.values()] : Array.isArray(entrada.playlists) ? entrada.playlists : Object.values(entrada.playlists || {});
  for (const p of fuente) if (p && p.id) playlists.set(String(p.id), p);
  const relevantes = (Array.isArray(entrada.asignaciones) ? entrada.asignaciones : [])
    .filter(a => a && (a.estado == null ? "activa" : a.estado) === "activa" && targetMatches(a.destino, screenTags));
  return { zona, facts, screenTags, playlists, relevantes, parrilla: leerParrilla(entrada.parrilla, ahora, zona),
    stock: Array.isArray(entrada.stock) ? entrada.stock : [], mando: entrada.mando && typeof entrada.mando === "object" ? entrada.mando : null };
}

// ── Candidatas ──────────────────────────────────────────────────────────────────────────────────────────────────
const implicita = (id, capa, mezcla, nombre, items, extra = {}) =>
  ({ id, capa, prioridad: CAPAS[capa], mezcla, directa: true, peso: 0, fecha_desde: null, actualizado_en: 0, nombre, items, implicita: true, exacta: false, cadencia: null, ...extra });
function itemDeSlot(s, banda, segundos) {
  return { id: "grid:" + String(s.bookingId || s.creative.url).slice(0, 150), stockId: String(s.stockId || "").slice(0, 160),
    title: String(s.title || s.advertiser || "Parrilla").slice(0, 240), sub: ("parrilla · " + banda.label + (s.advertiser ? " · " + s.advertiser : "")).slice(0, 300),
    lane: s.lane === "municipal" ? "municipal" : "publicidad", seconds: segundos, asset: String(s.creative.url), assetType: tipoAsset(s.creative.type), tags: [],
    bookingId: String(s.bookingId || "") };
}
function implicitas(ctx, t) {
  const out = [], dirigidas = addressedContent(ctx.stock, ctx.facts, t);
  if (dirigidas.length) out.push(implicita("implicita:hashtag", "por_defecto", "anade", "Dirigido por hashtag", dirigidas));
  const banda = ctx.parrilla.bandas.find(b => b.inicio <= t && t < b.fin);
  if (!banda) return out;
  const rundown = [], pagadas = [], propias = [], vistos = new Set();
  for (const s of banda.slots) {
    if (!s || !s.creative || !/^https?:\/\//i.test(String(s.creative.url || ""))) continue;
    const kind = String(s.kind || ""), status = String(s.status || "");
    const capa = kind === "own" || (!kind && status === "own") ? "propia" : PAGADO.has(kind) || PAGADO.has(status) ? "pagada" : "";
    const id = String(s.bookingId || s.creative.url);
    if (!capa || vistos.has(id)) continue;           // un booking de varios slots sale una vez por vuelta, como hoy
    vistos.add(id);
    const it = itemDeSlot(s, banda, ctx.parrilla.segundos);
    if (s.playlistId === RUNDOWN_EXACTO) rundown.push({ it, pos: Number.isFinite(s.position) ? s.position : 9999 });
    else (capa === "pagada" ? pagadas : propias).push(it);
  }
  if (rundown.length) out.push(implicita(`parrilla:${banda.id}:rundown`, "propia", "sustituye", `Parrilla ${banda.label} · municipal 50/50`,
    rundown.sort((a, b) => a.pos - b.pos).map(r => r.it), { exacta: true }));
  if (pagadas.length) out.push(implicita(`parrilla:${banda.id}:pagada`, "pagada", "intercala", `Parrilla ${banda.label} · vendido`, pagadas));
  if (propias.length) out.push(implicita(`parrilla:${banda.id}:propia`, "propia", "intercala", `Parrilla ${banda.label} · propio`, propias));
  return out;
}

// ── Piezas de una candidata ─────────────────────────────────────────────────────────────────────────────────────
function desplegar(pl, ctx, t) {
  const reglas = Array.isArray(pl.reglas) ? pl.reglas : [], items = Array.isArray(pl.items) ? pl.items : [];
  const de = regla => resolveContent(regla, ctx.stock, ctx.facts, t, pl.nombre);
  if (pl.tipo === "viva") {
    const out = [], vistos = new Set();
    for (const r of reglas) for (const it of de(r)) {
      if (out.length >= MAX_ITEMS) return out;
      if (!vistos.has(it.stockId)) { vistos.add(it.stockId); out.push(it); }
    }
    return out;
  }
  // Fija o mixta: las piezas, en su orden (una fija puede repetir pieza a propósito); cada hueco toma la siguiente
  // pieza de su regla que no esté ya en la lista.
  const out = [], usados = new Set(items.filter(i => i.tipo !== "hueco" && i.stockId).map(i => String(i.stockId))), cursores = new Map();
  for (const it of items) {
    if (out.length >= MAX_ITEMS) break;
    if (it.tipo !== "hueco") { out.push(sinTipo(it)); continue; }
    const regla = typeof it.regla === "number" ? reglas[it.regla] : it.regla;
    if (!regla) continue;
    const k = typeof it.regla === "number" ? "#" + it.regla : JSON.stringify(regla);
    let cur = cursores.get(k);
    if (!cur) { cur = { lista: de(regla), i: 0 }; cursores.set(k, cur); }
    for (let n = 0; n < (it.cuantas || 1) && out.length < MAX_ITEMS && cur.i < cur.lista.length;) {
      const p = cur.lista[cur.i++];
      if (usados.has(p.stockId)) continue;
      usados.add(p.stockId); out.push(p); n += 1;
    }
  }
  return out;
}
function piezas(c, ctx, t, cache) {
  if (!cache.has(c.id)) cache.set(c.id, c.implicita ? c.items : desplegar(c.playlist, ctx, t));
  return cache.get(c.id);
}
/** Fusión en orden: lo de una playlist que ya trajo otra anterior no se repite; dentro de una fija, sí vale. */
function fusionar(grupo, ctx, t, cache) {
  const out = [], vistos = new Set();
  for (const c of grupo) {
    const propias = new Set();
    for (const it of piezas(c, ctx, t, cache)) {
      if (out.length >= MAX_ITEMS) break;
      const k = clave(it);
      if (vistos.has(k)) continue;
      propias.add(k); out.push(it);
    }
    for (const k of propias) vistos.add(k);
  }
  return out;
}
function anadir(lista, extra) {
  const vistos = new Set(lista.map(clave));
  let n = 0;
  for (const it of extra) {
    if (lista.length >= MAX_ITEMS) break;
    const k = clave(it);
    if (vistos.has(k)) continue;
    vistos.add(k); lista.push(it); n += 1;
  }
  return n;
}
const rangoSpot = c => (c.capa === "pagada" ? 0 : c.capa === "propia" ? 1 : 2);
const ordenSpots = (a, b) => rangoSpot(a) - rangoSpot(b) || b.prioridad - a.prioridad || ordenK(a, b);
function listaSpots(cands, ctx, t, cache) {
  const out = [], vistos = new Set();
  for (const c of cands) for (const it of piezas(c, ctx, t, cache)) {
    if (vistos.has(it.id)) continue;
    vistos.add(it.id); out.push({ ...it, spot: true, capa: c.capa });
  }
  return out;
}
const cadenciaDe = cands => { const d = cands.map(c => Number(c.cadencia)).filter(n => Number.isInteger(n) && n >= 1); return d.length ? Math.min(...d) : CADENCIA_DEFECTO; };

/** Base: capa más alta con sustituye/fusiona; orden K; directa gana; si sale vacía, se baja a la siguiente. */
function elegirBase(cands, ctx, t, cache, nota) {
  let pool = cands.filter(c => c.mezcla === "sustituye" || c.mezcla === "fusiona");
  while (pool.length) {
    const top = Math.max(...pool.map(c => c.prioridad));
    const enCapa = pool.filter(c => c.prioridad === top).sort(ordenK), ganadora = enCapa[0];
    const grupo = ganadora.mezcla === "sustituye" ? [ganadora] : enCapa.filter(c => c.mezcla === "fusiona" && c.directa === ganadora.directa);
    const items = fusionar(grupo, ctx, t, cache);
    if (items.length) {
      for (const c of grupo) nota(c, "base", { piezas: piezas(c, ctx, t, cache).length });
      for (const c of pool) if (!grupo.includes(c)) nota(c, "eclipsada");
      return { grupo, capa: ganadora.capa, prioridad: top, items, exacta: grupo.some(c => c.exacta) };
    }
    for (const c of grupo) nota(c, "vacia");
    pool = pool.filter(c => !grupo.includes(c));
  }
  return null;
}

// ── Mando en vivo (decisión 2) ──────────────────────────────────────────────────────────────────────────────────
function primerBorde(ctx, desde, limite) {
  let mejor = null;
  const toma = b => { if (b !== null && b > desde && b <= limite && (mejor === null || b < mejor)) mejor = b; };
  for (const a of ctx.relevantes) toma(proximoBorde(a, desde, limite, ctx.zona));
  for (const b of ctx.parrilla.bandas) { toma(b.inicio); toma(b.fin); }
  return mejor;
}
const TIPOS_MANDO = { hashtag: "hashtag", tag: "hashtag", id: "id", contenido: "id", pieza: "id", directo: "directo", live: "directo" };
function estadoMando(ctx, t) {
  const m = ctx.mando;
  if (!m) return null;
  const tipo = TIPOS_MANDO[String(m.tipo || "").toLowerCase()];
  if (!tipo) return { activo: false, tipo: String(m.tipo || ""), motivo: "tipo_invalido" };
  const desde = Math.min(Number(m.desde) || t, t);
  let caduca = desde + MANDO_MAX_MS, motivo = "2h";
  const b = primerBorde(ctx, desde, caduca);
  if (b !== null && b < caduca) { caduca = b; motivo = "franja"; }
  return { activo: t < caduca, tipo, valor: m.valor, desde, caduca, motivo };
}
function piezaDeStock(p, sub) {
  return { id: "stock-" + p.id, stockId: String(p.id), title: String(p.title || "Pieza del Stock").slice(0, 240), sub: String(sub).slice(0, 300),
    lane: "publicidad", seconds: 10, asset: String(p.url), assetType: tipoAsset(p.type),
    tags: (Array.isArray(p.tags) ? p.tags : []).map(x => String(x || "").slice(0, 80)).filter(Boolean).slice(0, 32) };
}
function itemsDeMando(m, ctx, t) {
  if (m.tipo === "hashtag") {
    const tag = norm(m.valor);
    return tag ? resolveContent({ all: [], any: [tag], none: [], type: "visual", limit: MAX_ITEMS, seconds: 10, matchOrientation: true }, ctx.stock, ctx.facts, t, "mando #" + tag) : [];
  }
  if (m.tipo === "id") {
    const v = String(m.valor == null ? "" : m.valor).replace(/^#/, "").trim();
    const p = v && ctx.stock.find(x => x && !x.oculto && (String(x.id) === v || String(x.num) === v) && /^https:\/\//i.test(String(x.url || "")));
    return p ? [piezaDeStock(p, "mando · #" + v)] : [];
  }
  const v = typeof m.valor === "string" ? { url: m.valor } : m.valor || {}, url = String(v.url || "");
  if (!/^https:\/\//i.test(url)) return [];
  return [{ id: "directo", stockId: "", title: String(v.titulo || v.title || "Directo").slice(0, 240), sub: "mando · directo", lane: "publicidad",
    seconds: 600, asset: url.slice(0, 1000), assetType: tipoAsset(v.tipo || v.type || "video"), tags: [], directo: true }];
}

// ── Un instante ─────────────────────────────────────────────────────────────────────────────────────────────────
function firma(capa, items) {
  let h = 5381;
  for (const ch of capa + "|" + items.map(i => clave(i) + "~" + i.seconds).join("|")) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return h || 1;
}
function validez(ctx, t, mando) {
  let borde = primerBorde(ctx, t, t + HORIZONTE_MS);
  if (mando && mando.activo && mando.caduca > t && (borde === null || mando.caduca < borde)) borde = mando.caduca;
  return borde === null ? t + HORIZONTE_MS : borde;
}
function resolverEn(ctx, t) {
  const cache = new Map(), fuentes = [];
  const nota = (c, papel, extra = {}) => fuentes.push({ id: c.id, capa: c.capa, mezcla: c.mezcla, papel, nombre: c.nombre || "", playlist: c.playlist ? c.playlist.id : null, ...extra });
  const cands = [];
  for (const a of ctx.relevantes) {
    if (!cubre(a, t, ctx.zona)) continue;
    const pl = ctx.playlists.get(String(a.playlist_id));
    if (!pl) { fuentes.push({ id: a.id, capa: a.capa, mezcla: a.mezcla, papel: "sin_playlist", nombre: a.nombre || "", playlist: a.playlist_id }); continue; }
    cands.push({ ...a, prioridad: CAPAS[a.capa] || 0, directa: esDirecta(a.destino), exacta: !!(pl.opciones && pl.opciones.exacta), playlist: pl, nombre: a.nombre || pl.nombre });
  }
  cands.push(...implicitas(ctx, t));
  const mando = estadoMando(ctx, t), validoHasta = validez(ctx, t, mando);
  const local = partesLocales(t, ctx.zona);
  const salida = (capa, items, extra) => ({ instante: t, local: local.fecha + " " + local.hhmm, capa, items, ...extra, mando, fuentes, validoHasta, rev: firma(capa, items) });

  // 4. Emergencia: todas fundidas, exactas, sin spots ni mando.
  const emergencias = cands.filter(c => c.capa === "emergencia").sort(ordenK);
  if (emergencias.length) {
    const items = fusionar(emergencias, ctx, t, cache);
    if (items.length) {
      for (const c of emergencias) nota(c, "base", { piezas: piezas(c, ctx, t, cache).length });
      for (const c of cands) if (c.capa !== "emergencia") nota(c, "ignorada_por_emergencia");
      if (mando && mando.activo) mando.ignorado = "emergencia";
      return salida("emergencia", items, { exacta: true, nombre: emergencias.map(c => c.nombre).join(" + ").slice(0, 80), base: emergencias.map(c => c.id), spots: [], cadencia: null });
    }
    for (const c of emergencias) nota(c, "vacia");
  }
  const normales = cands.filter(c => c.capa !== "emergencia");

  // Mando en vivo con piezas: hashtag y directo sustituyen la base (lo pagado se sigue intercalando); #ID va primero.
  const deMando = mando && mando.activo ? itemsDeMando(mando, ctx, t) : [];
  if (mando && mando.activo && !deMando.length) mando.vacio = true;
  if (deMando.length && mando.tipo !== "id") {
    const pagadas = normales.filter(c => c.capa === "pagada").sort(ordenSpots), spots = listaSpots(pagadas, ctx, t, cache), cadencia = cadenciaDe(pagadas);
    for (const c of normales) nota(c, c.capa === "pagada" ? "spot" : "ignorada_por_mando");
    return salida("mando", intercalar(deMando, spots, cadencia), { exacta: false, nombre: (mando.tipo === "directo" ? "Mando · directo" : "Mando · #" + norm(mando.valor)).slice(0, 80), base: [], spots, cadencia });
  }

  // 5–6. Base.
  const base = elegirBase(normales, ctx, t, cache, nota);
  let capa = base ? base.capa : "relleno", items = base ? base.items.slice() : [];
  const exacta = !!(base && base.exacta), nombres = base ? base.grupo.map(c => c.nombre) : [];
  // 7. Añadidos de capa igual o superior.
  for (const c of normales.filter(x => x.mezcla === "anade").sort((a, b) => b.prioridad - a.prioridad || ordenK(a, b))) {
    if (exacta) { nota(c, "omitida_por_base_exacta"); continue; }
    if (base && c.prioridad < base.prioridad) { nota(c, "por_debajo_de_la_base"); continue; }
    const n = anadir(items, piezas(c, ctx, t, cache));
    nota(c, "anade", { piezas: n });
    if (n) { nombres.push(c.nombre); if (!base && CAPAS[c.capa] > CAPAS[capa]) capa = c.capa; }
  }
  // 8. Spots: pagados, después propios. Sobre una base exacta no se teje nada (su orden es contrato).
  const intercalan = normales.filter(c => c.mezcla === "intercala").sort(ordenSpots);
  const spots = listaSpots(intercalan, ctx, t, cache), cadencia = cadenciaDe(intercalan);
  for (const c of intercalan) nota(c, exacta ? "omitida_por_base_exacta" : "spot", { piezas: piezas(c, ctx, t, cache).length });
  // 9. Sin base ni añadidos, items queda vacío: el player teje `spots` sobre su propio relleno.
  if (!exacta && items.length) items = intercalar(items, spots, cadencia);
  if (deMando.length) {   // #ID: la pieza va la primera y lo demás sigue detrás
    items = [deMando[0], ...items.filter(it => clave(it) !== clave(deMando[0]))];
    capa = "mando"; nombres.unshift("Mando · #" + String(mando.valor).replace(/^#/, ""));
  }
  return salida(capa, items, { exacta: exacta && !deMando.length, nombre: (nombres.join(" + ") || "Relleno").slice(0, 80), base: base ? base.grupo.map(c => c.id) : [], spots: exacta ? [] : spots, cadencia });
}

/**
 * Resuelve la emisión de una pantalla en `entrada.ahora` (por defecto, ya). Devuelve {capa, items, spots, cadencia,
 * exacta, nombre, base, mando, fuentes, validoHasta, rev, siguiente, screenTags}. `siguiente` es lo que saldrá en
 * validoHasta (para precargar), o null si no cambia nada en 48 h.
 */
export function resolver(entrada = {}) {
  const ahora = Number.isFinite(Number(entrada.ahora)) && entrada.ahora !== null && entrada.ahora !== "" ? Number(entrada.ahora) : Date.now();
  const ctx = contexto(entrada, ahora), r = resolverEn(ctx, ahora);
  let siguiente = null;
  if (entrada.siguiente !== false && r.validoHasta < ahora + HORIZONTE_MS) {
    const s = resolverEn(ctx, r.validoHasta);
    siguiente = { en: r.validoHasta, capa: s.capa, nombre: s.nombre, base: s.base, rev: s.rev,
      items: s.items.map(i => ({ id: i.id, stockId: i.stockId, asset: i.asset, assetType: i.assetType })) };
  }
  return { ...r, screenTags: ctx.screenTags, siguiente };
}

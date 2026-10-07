// Playlists VIVAS por metatags (Carlos, 7-oct-2026: «poner foco en admira.tv y la creación de playlist con
// metatags para que sea muy fácil distribuir contenidos» · «viva, y las etiquetas de pantalla que se deduzcan solas»).
//
// Una playlist viva es una REGLA, no una lista congelada:
//   · contenido → qué piezas del Stock entran (por sus tags de pixeria.com); se resuelve en cada consulta,
//     así que una pieza que gana o pierde el tag entra o sale sola de antena.
//   · destino   → a qué pantallas va, por las etiquetas que cada pantalla se deduce sola al pedir su playlist
//     (circuito, proyecto, orientación, idioma…). Nadie etiqueta pantallas a mano.
// Viaja por el carril «Por defecto» de cada pantalla (/api/playlist?screen=): si la pantalla tiene piezas
// puestas a mano, mandan ellas; si no, recibe lo que digan las playlists vivas que le toquen.
// Lógica pura (sin red ni KV) para poder probarla; playlist.js pone el almacenamiento y la sesión.

export const LIVE_KEY = "admira-tv:playlist:live:v1";
export const TAGS_PREFIX = "admira-tv:screen:tags:v1:";
export const STOCK_INDEX = "https://stock.admira.store/stock/index.json";
export const MAX_LIVE = 100;

// Equivalencias del vocabulario (7-oct-2026): sinónimos en inglés y plurales apuntan a UNA forma, la misma tabla
// que canal.html y /parrilla/ (tags-alias.test.mjs comprueba que coinciden). El Stock ya guarda la forma buena;
// esto es para que una regla o una consulta escrita con la antigua siga encontrando lo mismo.
export const TAG_ALIAS = {music:"musica",muscia:"musica",technology:"tecnologia",tech:"tecnologia",business:"negocio",creativity:"creatividad",ai:"ia",gaming:"videojuego",videojuegos:"videojuego",robotics:"robotica",historias:"historia",bebida:"bebidas",canciones:"cancion",robot:"robots",comics:"comic",curiosidad:"curiosidades",oferta:"ofertas",artistas:"artista",pelicula:"peliculas",personaje:"personajes",herramienta:"herramientas"};
const fold = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/^#+/, "").replace(/[_\-\s]+/g, " ").trim();
/** Misma normalización que /parrilla/ (plNorm): sin tildes, minúsculas, sin # y separadores → espacio, y equivalencias. */
export const norm = t => { const n = fold(t); return TAG_ALIAS[n] || n; };
const slug = t => fold(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Etiqueta de pantalla «clave:valor» (o suelta, como «todas»), siempre en la misma forma. */
export function screenTag(raw) {
  const s = String(raw || "").trim();
  const i = s.indexOf(":");
  if (i < 0) return slug(s);
  const k = slug(s.slice(0, i)), v = slug(s.slice(i + 1));
  return k && v ? k + ":" + v : "";
}

export function orientationOf(w, h, hint) {
  const o = String(hint || "").toLowerCase();
  if (/^(portrait|vertical)/.test(o)) return "vertical";
  if (/^(landscape|horizontal)/.test(o)) return "horizontal";
  w = Number(w) || 0; h = Number(h) || 0;
  if (!(w > 0 && h > 0)) return "";
  const ar = w / h;
  return ar < 0.8 ? "vertical" : ar > 1.25 ? "horizontal" : "cuadrada";
}

// IDENTIFICADORES ÚNICOS (Carlos, 7-oct-2026: «lo más importante»): cada proyecto, cada Xpacio (centro) y cada
// pantalla tiene UNA etiqueta que lo identifica —proyecto:starbucks · xpacio:alsea-sbux-021 · pantalla:<id>— y es
// con ella con lo que se dice a dónde va una playlist. El resto (circuito, orientación, idioma) son atributos:
// describen a muchas pantallas a la vez. Los tres niveles únicos, de mayor a menor:
export const UNIQUE_LEVELS = ["proyecto", "xpacio", "pantalla"];

/** Lo que una pantalla dice de sí misma (más lo que el servidor sabe de ella) → sus etiquetas. */
export function deduceScreenTags(facts = {}) {
  const tags = new Set(["todas"]);
  const add = (k, v) => { const t = screenTag(k + ":" + (v == null ? "" : v)); if (t) tags.add(t); };
  if (facts.screen) add("pantalla", facts.screen);
  // idIoT: el nombre único guardado en la ficha del Xpacio (Starbucks_PaseodeGracia_103_Pantalla_1). Es otro
  // identificador de la MISMA pantalla: una playlist puede apuntar al player o al idIoT, y casa igual.
  if (facts.iot) add("pantalla", facts.iot);
  if (facts.xpace) add("xpacio", facts.xpace);
  if (facts.circuit) add("circuito", facts.circuit);
  if (facts.project) add("proyecto", facts.project);
  const o = facts.orientation || orientationOf(facts.w, facts.h);
  if (o) add("orientacion", o);
  const lang = String(facts.lang || "").toLowerCase().slice(0, 2);
  if (/^[a-z]{2}$/.test(lang)) add("idioma", lang);
  return [...tags].sort();
}

const tagList = (raw, clean, max) => [...new Set((Array.isArray(raw) ? raw : []).map(clean).filter(Boolean))].slice(0, max);

/** Valida y normaliza una playlist viva recibida del editor. Lanza Error con el motivo. */
export function cleanLive(raw, actor = "", now = Date.now()) {
  if (!raw || typeof raw !== "object") throw new Error("invalid_live");
  const name = String(raw.name || "").trim().slice(0, 80);
  if (!name) throw new Error("live_name_required");
  const c = raw.content || {}, t = raw.target || {};
  const content = {
    all: tagList(c.all, norm, 12), any: tagList(c.any, norm, 24), none: tagList(c.none, norm, 12),
    type: ["image", "video", "audio"].includes(c.type) ? c.type : "visual",
    limit: Math.max(1, Math.min(100, Math.round(Number(c.limit)) || 20)),
    seconds: Math.max(2, Math.min(600, Math.round(Number(c.seconds)) || 10)),
    matchOrientation: c.matchOrientation !== false,
  };
  if (!content.all.length && !content.any.length) throw new Error("live_content_required");
  const target = { all: tagList(t.all, screenTag, 12), any: tagList(t.any, screenTag, 24) };
  // Sin destino no va a ninguna pantalla: para «todas» hay que decirlo con la etiqueta «todas».
  if (!target.all.length && !target.any.length) throw new Error("live_target_required");
  const id = slug(raw.id || name) || "viva";
  return { id, name, enabled: raw.enabled !== false, content, target, updatedAt: now, updatedBy: String(actor || "").slice(0, 120) };
}

// El destino se lee por FACETAS: dentro de una misma clave vale cualquiera de las marcadas (pantalla:a o
// pantalla:b; idioma:es o idioma:ca) y entre claves distintas tienen que cumplirse todas (proyecto:x Y
// orientacion:vertical). Así «estas tres pantallas» y «las verticales de este Xpacio» se dicen igual.
const facet = t => { const i = String(t).indexOf(":"); return i < 0 ? String(t) : String(t).slice(0, i); };
export function targetMatches(target, screenTags) {
  const has = new Set(screenTags || []);
  const all = (target && target.all) || [], any = (target && target.any) || [];
  if (!all.length && !any.length) return false;
  const groups = new Map();
  for (const t of all) { const k = facet(t); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  for (const tags of groups.values()) if (!tags.some(t => has.has(t))) return false;
  return !any.length || any.some(t => has.has(t));
}

// Un tag pedido casa con el idéntico y con los que lo contienen como palabra entera («musica» trae
// también «listas música»), igual que el editor: lo que se previsualiza es lo que sale.
function tagHits(pieceTags, wanted) {
  const w = norm(wanted);
  if (!w) return false;
  const re = new RegExp("(^| )" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "( |$)");
  return pieceTags.some(t => t === w || re.test(t));
}

const TYPES = { visual: ["image", "video"], image: ["image"], video: ["video"], audio: ["audio", "music", "locucion"] };
const AUDIO_TYPES = new Set(["audio", "music", "locucion"]), VISUAL_TYPES = new Set(["image", "video", "animation"]);
const assetTypeOf = type => (type === "video" || type === "animation") ? "video" : AUDIO_TYPES.has(type) ? "audio" : "image";
const pieceOrientation = p => orientationOf(p.ancho, p.alto, p.orientacion);
const stamp = p => { const n = Number(p.createdAt); return Number.isFinite(n) && n > 0 ? n : (Date.parse(p.createdAt) || Number(String(p.id || "").split("-")[0]) || 0); };

function vigente(p, now) {
  const c = p && p.catalogo;
  if (!c) return true;
  const desde = c.desde ? Date.parse(c.desde) : NaN, hasta = c.hasta ? Date.parse(c.hasta) : NaN;
  if (Number.isFinite(desde) && now < desde) return false;
  if (Number.isFinite(hasta) && now > hasta + 86399000) return false; // «hasta» incluye ese día entero
  return true;
}

/** Piezas del Stock que cumplen la regla de contenido, ya en el formato de la playlist por defecto. */
export function resolveContent(content, stock, facts = {}, now = Date.now(), from = "") {
  const kinds = TYPES[content.type] || TYPES.visual, orient = facts.orientation || orientationOf(facts.w, facts.h);
  const out = [];
  for (const p of Array.isArray(stock) ? stock : []) {
    if (!p || !p.id || p.oculto || !kinds.includes(String(p.type || "").toLowerCase())) continue;
    if (!/^https:\/\//i.test(String(p.url || ""))) continue;
    const tags = (Array.isArray(p.tags) ? p.tags : []).map(norm).filter(Boolean);
    if (!content.all.every(t => tagHits(tags, t))) continue;
    if (content.any.length && !content.any.some(t => tagHits(tags, t))) continue;
    if (content.none.some(t => tagHits(tags, t))) continue;
    if (!vigente(p, now)) continue;
    // Una pieza que declara su orientación no se manda a una pantalla de la contraria.
    const po = pieceOrientation(p);
    if (content.matchOrientation && orient && po && po !== "cuadrada" && orient !== "cuadrada" && po !== orient) continue;
    out.push(p);
  }
  out.sort((a, b) => stamp(b) - stamp(a));
  return out.slice(0, content.limit).map(p => {
    const type = String(p.type || "").toLowerCase();
    return { id: "stock-" + p.id, stockId: String(p.id), title: String(p.title || "Pieza del Stock").slice(0, 240),
      sub: ("viva" + (from ? " · " + from : "")).slice(0, 300), lane: "publicidad", seconds: content.seconds,
      asset: String(p.url), assetType: assetTypeOf(type),
      tags: (Array.isArray(p.tags) ? p.tags : []).map(t => String(t || "").slice(0, 80)).filter(Boolean).slice(0, 32) };
  });
}

/** Todas las playlists vivas activas que le tocan a una pantalla, fundidas sin repetir pieza (máx. 200). */
export function resolveForScreen(playlists, screenTags, stock, facts = {}, now = Date.now()) {
  const hits = (playlists || []).filter(p => p && p.enabled !== false && targetMatches(p.target, screenTags));
  const seen = new Set(), items = [];
  for (const p of hits) for (const it of resolveContent(p.content, stock, facts, now, p.name)) {
    if (seen.has(it.stockId) || items.length >= 200) continue;
    seen.add(it.stockId); items.push(it);
  }
  return { hits, items };
}

// CONTENIDO DIRIGIDO POR HASHTAG (Carlos, 7-oct-2026): una pieza del Stock etiquetada con el nombre único de una
// pantalla —#starbucks_paseodegracia_103_pantalla1— o de su centro —#starbucks_paseodegracia_103— se emite sola en
// su destino, sin crear ninguna playlist. Vale para vídeos, imágenes, locuciones y música, importados o creados con
// IA. La etiqueta del cliente sola (#starbucks) NO emite nada: sólo dice de quién es la pieza.
// Etiqueta y nombre se comparan sin mayúsculas, tildes ni separadores: «pantalla1» es «Pantalla_1».
export const destKey = v => String(v == null ? "" : v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
/** Nombres por los que esta pantalla es destino: exactos (su idIoT, su id de player) y de centro (su Xpacio). */
export function addressKeys(facts = {}) {
  const exact = new Set(), centre = new Set(), add = (set, v) => { const k = destKey(v); if (k.length >= 8) set.add(k); };
  if (facts.iot) { add(exact, facts.iot); add(centre, String(facts.iot).replace(/_[A-Za-z0-9]+_\d+$/, "")); }
  if (facts.screen) add(exact, facts.screen);
  if (facts.xpace) add(centre, facts.xpace);
  for (const k of exact) centre.delete(k);
  return { exact, centre, audioElement: /_(?:Altavoz|Audio)_\d+$/i.test(String(facts.iot || "")) };
}
/**
 * Piezas dirigidas a esta pantalla. Dirigida a la pantalla, entra tal cual. Dirigida al centro, cada cosa va a su
 * sitio: el audio a los altavoces, lo visual a las pantallas y sólo en su orientación.
 */
export function addressedContent(stock, facts = {}, now = Date.now(), limit = 60) {
  const keys = addressKeys(facts);
  if (!keys.exact.size && !keys.centre.size) return [];
  const orient = facts.orientation || orientationOf(facts.w, facts.h), out = [];
  for (const p of Array.isArray(stock) ? stock : []) {
    const type = String((p && p.type) || "").toLowerCase(), audio = AUDIO_TYPES.has(type);
    if (!p || p.oculto || (!audio && !VISUAL_TYPES.has(type)) || !/^https:\/\//.test(String(p.url || "")) || !vigente(p, now)) continue;
    const tags = Array.isArray(p.tags) ? p.tags : [];
    let via = tags.find(t => keys.exact.has(destKey(t))), exact = !!via;
    if (!via) via = tags.find(t => keys.centre.has(destKey(t)));
    if (!via) continue;
    if (!exact) {
      if (audio !== keys.audioElement) continue;
      const po = pieceOrientation(p);
      if (!audio && orient && po && po !== "cuadrada" && orient !== "cuadrada" && po !== orient) continue;
    }
    out.push({ p, via, type });
  }
  out.sort((a, b) => stamp(b.p) - stamp(a.p));
  return out.slice(0, limit).map(({ p, via, type }) => ({ id: "stock-" + p.id, stockId: String(p.id), title: String(p.title || "Pieza del Stock").slice(0, 240),
    sub: ("destino · #" + via).slice(0, 300), lane: "publicidad", seconds: 10, asset: String(p.url), assetType: assetTypeOf(type),
    tags: tags32(p) }));
}
const tags32 = p => (Array.isArray(p.tags) ? p.tags : []).map(t => String(t || "").slice(0, 80)).filter(Boolean).slice(0, 32);

// Índice pantalla → Xpacio a partir del catálogo de Xpacios (api.admira.store/locations): un Xpacio declara
// sus pantallas en `screen` (alta de un equipo) o en `surfaces[].screen`. De 9.000 fichas sólo unas decenas las
// declaran, así que se guarda compacto. La marca del Xpacio sirve de proyecto cuando la parrilla no le da uno.
export const xpaceEntry = loc => ({ x: String(loc.id), n: String(loc.name || "").slice(0, 80), c: String(loc.circuit || ""), b: String(loc.project || (loc.external && loc.external.brand) || loc.client || "") });
export const IDIOT_RE = /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+){2,7}$/;
export const cleanIdIot = v => { const t = String(v || "").trim(); return t.length <= 140 && IDIOT_RE.test(t) ? t : ""; };
/** idIoT guardado en la ficha para el player `screen`: en su superficie, o en el registro fino iot[]. */
export function idIotOfScreen(loc, screen) {
  const surfaces = Array.isArray(loc && loc.surfaces) ? loc.surfaces.filter(Boolean) : [], id = String(screen || "").toLowerCase();
  const hit = (Array.isArray(loc && loc.iot) ? loc.iot : []).find(e => e && String(e.player || "").toLowerCase() === id)
    || surfaces.find(x => String(x.screen || "").toLowerCase() === id)
    || (String((loc && loc.screen) || "").toLowerCase() === id && surfaces.length === 1 ? surfaces[0] : null);
  return cleanIdIot(hit && hit.idIoT);
}
export function buildXpaceIndex(locations) {
  const index = {};
  for (const loc of Array.isArray(locations) ? locations : []) {
    if (!loc || !loc.id) continue;
    const entry = xpaceEntry(loc);
    const screens = [loc.screen, ...((Array.isArray(loc.surfaces) ? loc.surfaces : []).map(s => s && s.screen)), ...((Array.isArray(loc.iot) ? loc.iot : []).map(e => e && e.player))];
    for (const s of screens) {
      const id = String(s || "").trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id) || index[id]) continue;
      const i = idIotOfScreen(loc, id);
      index[id] = i ? { ...entry, i } : entry;
    }
  }
  return index;
}

/** Identidad completa de una pantalla: lo que ella declara manda; lo que falta lo ponen el índice y la parrilla. */
export function completeFacts(facts, { xpaceIndex = {}, projects = [], gridCircuit = "", registry = {}, xpaceRecord = null, iotRecord = null } = {}) {
  const out = { ...facts }, reg = registry[out.screen] || null;
  // ?iot= declarado por el player: sólo vale si el catálogo lo conoce (iotRecord viene de /locations/iot/<idIoT>)
  // y no contradice el Xpacio que la pantalla diga. Da el idIoT canónico y, si falta, el Xpacio.
  delete out.iot;
  if (out.iotDeclared && iotRecord && iotRecord.location && String(iotRecord.idIoT || "").toLowerCase() === String(out.iotDeclared).toLowerCase()
    && (!out.xpace || out.xpace === String(iotRecord.location.id))) {
    out.iot = String(iotRecord.idIoT);
    if (!out.xpace) out.xpace = String(iotRecord.location.id);
    if (!xpaceRecord) xpaceRecord = { id: iotRecord.location.id, name: iotRecord.location.name, circuit: iotRecord.location.circuit, project: iotRecord.location.project, external: { brand: iotRecord.location.brand } };
  }
  // Si la pantalla declara su Xpacio (?xpace= / ?loc=), la ficha de ESE Xpacio vale más que el índice.
  const declared = xpaceRecord && out.xpace && String(xpaceRecord.id || "") === out.xpace ? xpaceEntry(xpaceRecord) : null;
  const known = declared || xpaceIndex[out.screen] || null;
  // Orden de autoridad: lo que declara el player › el registro de identidad (la jerarquía Proyecto → Xpacio →
  // Dispositivo de la parrilla) › el catálogo de Xpacios › la parrilla por circuito › la marca del Xpacio.
  if (reg) { if (!out.project && reg.p) out.project = reg.p; if (!out.xpace && reg.x) out.xpace = reg.x; }
  // El circuito de la ficha del Xpacio DECLARADO vale más que el que la parrilla supone por el nombre de la pantalla.
  if (!out.circuit) out.circuit = (declared && declared.c) || gridCircuit || (known && known.c) || "";
  if (!out.xpace && known) out.xpace = known.x;
  if (!out.project && out.circuit) {
    const hit = (projects || []).find(p => Array.isArray(p.circuits) && p.circuits.map(String).includes(out.circuit));
    if (hit && hit.id) out.project = String(hit.id);
  }
  if (!out.project && known && known.b) out.project = known.b;
  // La pantalla dada de alta en una ficha trae su idIoT del índice; la que declara su Xpacio, de esa ficha.
  if (!out.iot) out.iot = (xpaceIndex[out.screen] && xpaceIndex[out.screen].i) || (xpaceRecord && out.xpace === String(xpaceRecord.id) && Array.isArray(xpaceRecord.surfaces) ? idIotOfScreen(xpaceRecord, out.screen) : "") || "";
  if (!out.iot) delete out.iot;
  return out;
}

/** Entrada saneada del registro de identidad: {p: proyecto, x: xpacio, n: nombre de la pantalla, xn: nombre del Xpacio}. */
export function cleanIdentity(raw) {
  const id = v => { const s = String(v || "").trim().toLowerCase(); return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(s) ? s : ""; };
  const screen = id(raw && raw.screen);
  if (!screen) return null;
  return { screen, p: id(raw.project), x: id(raw.xpace), n: String(raw.name || "").trim().slice(0, 80), xn: String(raw.xpaceName || "").trim().slice(0, 80) };
}

// CIRCUITOS DEFINIDOS (Carlos, 7-oct-2026): un circuito es un grupo de pantallas con nombre —«Starbucks
// verticales», «Estancos de Gràcia»— definido con los mismos identificadores y atributos que un destino. Toda
// pantalla que cumpla la definición gana la etiqueta circuito:<id>, y una playlist se envía al circuito por esa
// etiqueta. La definición se evalúa sobre las etiquetas propias de la pantalla: un circuito no se define con otro
// circuito definido (sí con el circuito que declara el player).
export const MAX_CIRCUITS = 200;
export function cleanCircuit(raw, actor = "", now = Date.now()) {
  if (!raw || typeof raw !== "object") throw new Error("invalid_circuit");
  const name = String(raw.name || "").trim().slice(0, 60);
  if (!name) throw new Error("circuit_name_required");
  const id = slug(raw.id || name);
  if (!id) throw new Error("circuit_name_required");
  const t = raw.target || {}, self = "circuito:" + id;
  const target = { all: tagList(t.all, screenTag, 200).filter(x => x !== self), any: tagList(t.any, screenTag, 200).filter(x => x !== self) };
  if (!target.all.length && !target.any.length) throw new Error("circuit_target_required");
  return { id, name, enabled: raw.enabled !== false, target, updatedAt: now, updatedBy: String(actor || "").slice(0, 120) };
}
/** Etiquetas de la pantalla más circuito:<id> de cada circuito definido que la incluya. */
export function applyCircuits(tags, circuits) {
  const base = Array.isArray(tags) ? tags : [], out = new Set(base);
  for (const c of Array.isArray(circuits) ? circuits : []) if (c && c.id && c.enabled !== false && targetMatches(c.target, base)) out.add("circuito:" + c.id);
  return [...out].sort();
}

/** Revisión estable: cambia sólo cuando cambia lo que sale por antena. */
export function liveRev(items) {
  let h = 5381;
  for (const it of items) for (const ch of it.stockId + "|" + it.seconds + "~") h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return h || 1;
}

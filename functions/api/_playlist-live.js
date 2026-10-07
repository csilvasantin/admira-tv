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

/** Lo que una pantalla dice de sí misma (más lo que el servidor sabe de ella) → sus etiquetas. */
export function deduceScreenTags(facts = {}) {
  const tags = new Set(["todas"]);
  const add = (k, v) => { const t = screenTag(k + ":" + (v == null ? "" : v)); if (t) tags.add(t); };
  if (facts.screen) add("pantalla", facts.screen);
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

export function targetMatches(target, screenTags) {
  const has = new Set(screenTags || []);
  const all = (target && target.all) || [], any = (target && target.any) || [];
  if (!all.length && !any.length) return false;
  return all.every(t => has.has(t)) && (!any.length || any.some(t => has.has(t)));
}

// Un tag pedido casa con el idéntico y con los que lo contienen como palabra entera («musica» trae
// también «listas música»), igual que el editor: lo que se previsualiza es lo que sale.
function tagHits(pieceTags, wanted) {
  const w = norm(wanted);
  if (!w) return false;
  const re = new RegExp("(^| )" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "( |$)");
  return pieceTags.some(t => t === w || re.test(t));
}

const TYPES = { visual: ["image", "video"], image: ["image"], video: ["video"], audio: ["audio", "music"] };
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
      asset: String(p.url), assetType: type === "video" ? "video" : (type === "audio" || type === "music") ? "audio" : "image",
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

/** Revisión estable: cambia sólo cuando cambia lo que sale por antena. */
export function liveRev(items) {
  let h = 5381;
  for (const it of items) for (const ch of it.stockId + "|" + it.seconds + "~") h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return h || 1;
}

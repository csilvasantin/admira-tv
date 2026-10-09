import { accessFor, authHeaders, sessionEmail } from "../_auth-session.js";
import { lecturaBlocksWrite } from "../_lectura-guard.js";
import { LIVE_KEY, TAGS_PREFIX, STOCK_INDEX, MAX_LIVE, MAX_CIRCUITS, addressedContent, addressKeys, applyCircuits, cleanCircuit, cleanIdIot, buildXpaceIndex, cleanIdentity, xpaceEntry, cleanLive, completeFacts, deduceScreenTags, liveRev, orientationOf, resolveContent, resolveForScreen, targetMatches } from "./_playlist-live.js";
import { sombraTrasRespuesta } from "./_programacion/gancho-sombra.js";

// Exportado para el importador del legado (E5, _programacion/importar.js): lee las mismas claves, sin escribirlas.
export const DRAFT_PREFIX = "admira-tv:playlist:default:v1:";
const PREFIX = DRAFT_PREFIX;

// Escritura server-to-server desde el Stock de Pixeria (Yokup #3183, NeoMBA16, 12-sep-2026):
// pixeria.com/stock.html «Asignar al circuito…» escribe la playlist por defecto de cada
// pantalla de un circuito con las piezas de un catálogo. La sesión del portal (cookie
// __Host-atv_session, SameSite=Lax) no viaja entre orígenes, así que desde pixeria.com se
// autentica con la MISMA clave que ya usa el Stock para borrar (NOTIFY_KEY de
// api.admira.store), instalada aquí como secreto STOCK_NOTIFY_KEY. Va en el body {secret}
// o en X-Notify-Key; nunca en la URL. Solo estos orígenes reciben CORS (sin credenciales).
const STOCK_ORIGINS = new Set(["https://www.pixeria.com", "https://pixeria.com", "https://pixeria.pages.dev"]);
const isStockOrigin = origin => STOCK_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");
function corsFor(request) {
  const origin = request.headers.get("Origin") || "";
  if (!isStockOrigin(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Notify-Key", "Access-Control-Max-Age": "600" };
}
function sameSecret(left, right) {
  const a = String(left || ""), b = String(right || "");
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function stockActor(request, env, body) {
  if (!env.STOCK_NOTIFY_KEY) return null;
  const secret = request.headers.get("X-Notify-Key") || (body && body.secret) || "";
  if (!sameSecret(secret, env.STOCK_NOTIFY_KEY)) return null;
  const source = String((body && body.source) || "").replace(/[^a-z0-9._:#\- ]/gi, "").trim().slice(0, 80);
  return "pixeria-stock" + (source ? " · " + source : "");
}

function json(value, status = 200, cors = {}) {
  return Response.json(value, { status, headers: authHeaders(cors) });
}

export async function onRequestOptions({ request }) {
  const cors = corsFor(request);
  if (!cors["Access-Control-Allow-Origin"]) return new Response(null, { status: 204, headers: authHeaders() });
  return new Response(null, { status: 204, headers: authHeaders(cors) });
}

const cleanScreen = value => {
  const screen = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,79}$/.test(screen) ? screen : "";
};

async function actorWithAccess(request, env) {
  const actor = await sessionEmail(request, env);
  if (!actor) return null;
  const access = await accessFor(env, actor, "digitalsignage-player", false);
  return access.allowed ? actor : null;
}

function cleanItem(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const asset = String(raw.asset || raw.url || "").trim().slice(0, 1000);
  if (!/^https:\/\//i.test(asset)) return null;
  const sourceType = String(raw.assetType || raw.type || "image").toLowerCase();
  const assetType = ["video", "animation"].includes(sourceType) ? "video" :
    ["audio", "music", "locucion"].includes(sourceType) ? "audio" : "image";
  const id = String(raw.id || raw.stockId || `item-${index + 1}`).trim().slice(0, 160);
  const tags = Array.isArray(raw.tags) ? raw.tags.map(tag => String(tag || "").trim().slice(0, 80)).filter(Boolean).slice(0, 32) : [];
  return { id, stockId: String(raw.stockId || "").trim().slice(0, 160), title: String(raw.title || `Contenido ${index + 1}`).trim().slice(0, 240),
    sub: String(raw.sub || "").trim().slice(0, 300), lane: raw.lane === "municipal" ? "municipal" : "publicidad",
    seconds: Math.max(2, Math.min(600, Number(raw.seconds) || 10)), asset, assetType, tags };
}

async function readDraft(env, screen) {
  try {
    const raw = env.ACCESS && await env.ACCESS.get(PREFIX + screen);
    const draft = raw && JSON.parse(raw);
    if (draft && Array.isArray(draft.items)) return draft;
  } catch (_) {}
  return { screen, playlist: "default", name: "Por defecto", items: [], rev: 0, updatedAt: 0 };
}

// ── Playlists vivas por metatags (ver _playlist-live.js) ─────────────────────────────────────────
async function readLive(env) {
  try {
    const doc = JSON.parse((env.ACCESS && await env.ACCESS.get(LIVE_KEY)) || "null");
    if (doc && Array.isArray(doc.playlists)) { if (!Array.isArray(doc.circuits)) doc.circuits = []; return doc; }
  } catch (_) {}
  return { rev: 0, updatedAt: 0, playlists: [], circuits: [] };
}
// Memoria corta por instancia: cada player pregunta cada 30 s y todos necesitan lo mismo (el índice del Stock, el
// índice de pantallas, el registro de identidad). Sin ella, 180 pantallas son un millón de lecturas de KV al día.
const memo = new Map();
async function remember(key, ms, load) {
  const hit = memo.get(key), now = Date.now();
  if (hit && now - hit.at < ms) return hit.value;
  const value = await load();
  memo.set(key, { at: now, value });
  return value;
}
export function forgetMemo(key) { if (key) memo.delete(key); else memo.clear(); }
const fetchJson = (url, ttl) => fetch(url, { cf: { cacheTtl: ttl, cacheEverything: true }, signal: AbortSignal.timeout(3500) }).then(r => r.ok ? r.json() : null).catch(() => null);
// Las consultas de identidad (parrilla, fichas del catálogo) se recuerdan hasta 5 min; un fallo no se recuerda.
const quick = async (url, ttl) => { const hit = memo.get("q:" + url); if (hit && Date.now() - hit.at < Math.min(ttl, 300) * 1000) return hit.value; const value = await fetchJson(url, ttl); if (value != null) memo.set("q:" + url, { at: Date.now(), value }); return value; };
// Un idIoT declarado por el player se comprueba contra el catálogo: sólo cuenta si existe.
const iotFicha = id => id ? quick("https://api.admira.store/locations/iot/" + encodeURIComponent(id), 600).then(d => (d && d.idIoT && d.location ? d : null)) : Promise.resolve(null);
const xpaceFicha = id => id ? quick("https://api.admira.store/locations/" + encodeURIComponent(id), 600).then(d => (d && d.id ? d : d && d.location && d.location.id ? d.location : null)) : Promise.resolve(null);
// loadStock, hintFacts y enrichFacts se exportan (E3 del modelo único, docs/playlists-modelo-unico.md) para que
// /api/programacion los reutilice tal cual: mismo comportamiento y la misma memoria por instancia.
export async function loadStock() {
  return remember("stock", 45_000, async () => {
    const d = await fetchJson(STOCK_INDEX, 60);
    return Array.isArray(d) ? d : (d && (d.items || d.assets)) || [];
  });
}
// Lo que la pantalla dice de sí misma al pedir su playlist (circuito, tamaño, idioma) y, sólo si hay
// playlists vivas que resolver, lo que la parrilla sabe de ella (circuito y proyecto).
export function hintFacts(screen, q) {
  const circuit = cleanScreen(q.get("circuit")), w = Number(q.get("w")) || 0, h = Number(q.get("h")) || 0;
  // Identificadores únicos que el propio player puede declarar en su URL: ?project= y ?xpace= (o ?loc=).
  return { screen, circuit: circuit && circuit !== screen ? circuit : "", project: cleanScreen(q.get("project")), xpace: cleanScreen(q.get("xpace") || q.get("xpacio") || q.get("loc")), iotDeclared: cleanIdIot(q.get("iot") || q.get("idiot")),
    w, h, orientation: orientationOf(w, h, q.get("o")), lang: String(q.get("lang") || "").slice(0, 2) };
}
// ¿Pregunta el player? canal.html manda siempre &w=…&h=… (y &lang= si lo sabe); otro player puede decir player=1.
// La parrilla, Pixeria y el Adaptador piden sólo ?screen=: leen, pero no hablan por la pantalla.
export const fromPlayer = q => ["w", "h", "lang"].some(k => q.has(k)) || q.get("player") === "1";
// Índice pantalla → Xpacio, compacto y guardado 30 min. El catálogo de Xpacios pesa 9 MB: NUNCA se espera a él
// en la consulta de un player ni del editor; se sirve lo guardado y se rehace por detrás, como mucho un intento
// cada 10 min por instancia. Mientras no exista, la identidad la pone el registro que sube la parrilla.
const XPACE_INDEX_KEY = "admira-tv:screen:xpacio:v1";
let xpaceTryAt = 0;
async function xpaceIndex(env, waitUntil) {
  let cached = await remember("xpace-index", 60_000, async () => { try { return JSON.parse((env.ACCESS && await env.ACCESS.get(XPACE_INDEX_KEY)) || "null"); } catch (_) { return null; } });
  const fresh = cached && Date.now() - (Number(cached.builtAt) || 0) < 30 * 60_000;
  if (!fresh && env.ACCESS && Date.now() - xpaceTryAt > 10 * 60_000) {
    xpaceTryAt = Date.now();
    const rebuild = (async () => {
      const d = await fetch("https://api.admira.store/locations", { cf: { cacheTtl: 600, cacheEverything: true }, signal: AbortSignal.timeout(12000) }).then(r => r.ok ? r.json() : null).catch(() => null);
      const list = d && (d.locations || d);
      if (!Array.isArray(list)) return null;
      const doc = { builtAt: Date.now(), map: buildXpaceIndex(list) };
      try { await env.ACCESS.put(XPACE_INDEX_KEY, JSON.stringify(doc)); } catch (_) {}
      memo.set("xpace-index", { at: Date.now(), value: doc });
      return doc;
    })();
    if (typeof waitUntil === "function") { try { waitUntil(rebuild); } catch (_) {} }
    else cached = (await rebuild) || cached; // sin waitUntil (pruebas) sí se espera
  }
  return (cached && cached.map) || {};
}
// Registro de identidad: la jerarquía Proyecto → Xpacio → Dispositivo que ve el operador en la parrilla, subida
// por el propio editor. Es lo que da a cada pantalla sus identificadores únicos sin que nadie los escriba.
const IDENTITY_KEY = "admira-tv:screen:identity:v1";
async function readIdentity(env) {
  return remember("identity", 60_000, async () => {
    try { const d = JSON.parse((env.ACCESS && await env.ACCESS.get(IDENTITY_KEY)) || "null"); if (d && d.map && typeof d.map === "object") return d; } catch (_) {}
    return { updatedAt: 0, map: {} };
  });
}
export async function enrichFacts(facts, env, waitUntil) {
  let gridCircuit = "";
  if (!facts.circuit) {
    const cfg = await quick("https://api.admira.store/grid/config?screen=" + encodeURIComponent(facts.screen), 300);
    gridCircuit = cleanScreen(cfg && cfg.config && cfg.config.circuit);
  }
  // Una pantalla que sólo declara su Xpacio (?loc=alsea-sbux-021) recibe de la ficha de ese Xpacio su circuito
  // y su proyecto (la marca): no hace falta escribirle los tres identificadores.
  const iotRecord = await iotFicha(facts.iotDeclared);
  const xpaceId = facts.xpace || (iotRecord && String(iotRecord.location.id)) || "";
  const [pr, index, identity, xpaceRecord] = await Promise.all([quick("https://api.admira.store/grid/projects", 600), xpaceIndex(env, waitUntil), readIdentity(env), xpaceFicha(xpaceId)]);
  const full = completeFacts(facts, { xpaceIndex: index, projects: (pr && pr.projects) || [], gridCircuit, registry: identity.map, xpaceRecord, iotRecord });
  if (xpaceRecord && full.xpace === String(xpaceRecord.id)) full.xpaceName = xpaceEntry(xpaceRecord).n;
  return Object.assign(facts, full);
}
// Censo para el editor: TODAS las pantallas de la parrilla con su identidad, aunque su player aún no haya pedido
// nada, fundidas con las que sí se han visto (que además traen orientación e idioma).
async function fleetIdentities(env, seen, waitUntil, circuits = []) {
  const lento = url => fetch(url, { cf: { cacheTtl: 300, cacheEverything: true }, signal: AbortSignal.timeout(9000) }).then(r => r.ok ? r.json() : null).catch(() => null);
  const [gs, pr, index, identity] = await Promise.all([lento("https://api.admira.store/grid/screens"), lento("https://api.admira.store/grid/projects"), xpaceIndex(env, waitUntil), readIdentity(env)]);
  const projects = (pr && pr.projects) || [], out = new Map(), registry = identity.map;
  const alta = (screen, circuit, name) => {
    if (!screen || out.has(screen)) return;
    const facts = completeFacts({ screen, circuit }, { xpaceIndex: index, projects, registry });
    out.set(screen, { screen, name: String((registry[screen] && registry[screen].n) || name || screen).slice(0, 80), tags: deduceScreenTags(facts), seenAt: 0 });
  };
  for (const s of (gs && (gs.screens || gs)) || []) alta(cleanScreen(s && s.screen), cleanScreen(s && s.circuit), s && s.name);
  for (const [screen, e] of Object.entries(index)) alta(screen, cleanScreen(e.c), "");       // equipos dados de alta en un Xpacio
  for (const screen of Object.keys(registry)) alta(screen, "", "");                           // pantallas que sólo conoce la parrilla
  const xpaces = {}, val = (tags, k) => { const t = (tags || []).find(x => String(x).startsWith(k + ":")); return t ? t.slice(k.length + 1) : ""; };
  for (const s of seen) {
    const prev = out.get(s.screen);
    // Lo que el player declaró (circuito, Xpacio) se completa igual que lo de la parrilla: proyecto incluido.
    const extra = prev ? [] : deduceScreenTags(completeFacts({ screen: s.screen, circuit: val(s.tags, "circuito"), xpace: val(s.tags, "xpacio"), project: val(s.tags, "proyecto") }, { xpaceIndex: index, projects, registry })).filter(t => !/^(orientacion|idioma):/.test(t));
    out.set(s.screen, { screen: s.screen, name: (prev && prev.name) || s.screen, tags: [...new Set([...(prev ? prev.tags : []), ...extra, ...s.tags])].sort(), seenAt: s.seenAt });
    const x = val(s.tags, "xpacio"); if (x && s.xn) xpaces[x] = s.xn;
  }
  for (const e of Object.values(index)) xpaces[e.x] = e.n;
  for (const e of Object.values(registry)) if (e.x && e.xn) xpaces[e.x] = e.xn;
  // Los circuitos definidos se aplican AQUÍ, sobre las etiquetas propias: al borrar o cambiar uno, el censo lo refleja al momento.
  for (const e of out.values()) e.tags = applyCircuits(e.tags, circuits);
  return { screens: [...out.values()].sort((a, b) => a.screen.localeCompare(b.screen)), projects: projects.map(p => ({ id: String(p.id), name: String(p.name || p.id) })), xpaces };
}
// Registro de etiquetas deducidas, para que el editor enseñe a qué pantallas llega una regla. Las etiquetas
// van en los metadatos de la clave: se listan sin leer pantalla a pantalla. Sólo se escribe si cambian o caducan.
async function rememberTags(env, screen, tags, facts) {
  if (!env.ACCESS || typeof env.ACCESS.getWithMetadata !== "function") return;
  try {
    const prev = await env.ACCESS.getWithMetadata(TAGS_PREFIX + screen);
    const meta = prev && prev.metadata, same = meta && Array.isArray(meta.tags) && meta.tags.join("|") === tags.join("|");
    if (same && Date.now() - (Number(meta.seenAt) || 0) < 6 * 3600_000) return;
    await env.ACCESS.put(TAGS_PREFIX + screen, "1", { metadata: { tags, seenAt: Date.now(), w: facts.w || 0, h: facts.h || 0, xn: String(facts.xpaceName || "").slice(0, 80) }, expirationTtl: 45 * 86400 });
  } catch (_) {}
}
async function knownScreens(env) {
  if (!env.ACCESS || typeof env.ACCESS.list !== "function") return [];
  const out = [];
  let cursor;
  for (let i = 0; i < 5; i += 1) {
    const page = await env.ACCESS.list({ prefix: TAGS_PREFIX, cursor, limit: 1000 });
    for (const k of page.keys || []) out.push({ screen: k.name.slice(TAGS_PREFIX.length), tags: (k.metadata && k.metadata.tags) || [], seenAt: (k.metadata && k.metadata.seenAt) || 0, xn: (k.metadata && k.metadata.xn) || "" });
    if (page.list_complete || !page.cursor) break;
    cursor = page.cursor;
  }
  return out.sort((a, b) => a.screen.localeCompare(b.screen));
}
// Vista de administración: reglas guardadas, pantallas conocidas con sus etiquetas y, con ?preview=, a qué
// llegaría una regla sin guardarla. Sólo con sesión del portal.
async function adminGet(request, env, q, cors, waitUntil) {
  const actor = await actorWithAccess(request, env);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401, cors);
  const [live, seen] = await Promise.all([readLive(env), knownScreens(env)]);
  const fleet = await fleetIdentities(env, seen, waitUntil, live.circuits), screens = fleet.screens;
  if (q.get("preview") !== "1") return json({ ok: true, live, circuits: live.circuits, screens, projects: fleet.projects, xpaces: fleet.xpaces }, 200, cors);
  let rule;
  try { rule = cleanLive(JSON.parse(q.get("rule") || "{}"), actor); } catch (e) { return json({ ok: false, error: String(e.message || e) }, 400, cors); }
  const stock = await loadStock(), matched = screens.filter(s => targetMatches(rule.target, s.tags));
  const withManual = [];
  for (const s of matched.slice(0, 60)) if ((await readDraft(env, s.screen)).items.length) withManual.push(s.screen);
  const pieces = resolveContent(rule.content, stock, {}, Date.now(), rule.name);
  return json({ ok: true, rule, pieces: pieces.slice(0, 12), total: pieces.length, screens: matched.map(s => s.screen), manual: withManual }, 200, cors);
}

export async function onRequestGet({ request, env, waitUntil }) {
  const cors = corsFor(request), q = new URL(request.url).searchParams;
  if (q.get("live") === "1" || q.get("preview") === "1") return adminGet(request, env, q, cors, waitUntil);
  const screen = cleanScreen(q.get("screen"));
  if (!screen) return json({ ok: false, error: "bad_screen" }, 400, cors);
  // Public virtual playlists are also read by Xtore on www/localhost through
  // its bounded parent bridge. Never enable cross-origin credentialed writes.
  if (/^(?:xtore-)?virtual-[a-z0-9-]+$/.test(screen)) {
    const draft = await readDraft(env, screen);
    return Response.json({ ok: true, draft: { screen, playlist: 'default', items: draft.items, rev: draft.rev } }, {
      headers: authHeaders({ 'Access-Control-Allow-Origin': '*' }),
    });
  }
  let draft = await readDraft(env, screen);
  // Revisión de lo GUARDADO (0 si nada): es la que vale para escribir, también cuando la lista que se ve la
  // componen las playlists vivas o el hashtag (8-oct-2026: el hash de esa lista provocaba un 409 falso).
  const savedRev = Number(draft.rev) || 0;
  draft.synthetic = false;
  // La pantalla se deduce sus etiquetas en cada consulta. Si no tiene piezas puestas a mano, recibe las de
  // las playlists vivas que le toquen, resueltas ahora mismo contra el Stock.
  const facts = hintFacts(screen, q), live = await readLive(env);
  const activas = live.playlists.filter(p => p && p.enabled !== false);
  // Con playlists vivas se completa siempre; sin ellas, sólo si la pantalla declara su Xpacio: así el editor ya la
  // ve con su proyecto y su circuito ANTES de que exista la primera regla, y lo que enseña es lo que casará.
  // La identidad se completa SIEMPRE: una pieza del Stock puede ir dirigida a esta pantalla por su nombre único
  // aunque no exista ninguna playlist viva.
  await enrichFacts(facts, env, waitUntil);
  // Se recuerdan las etiquetas PROPIAS; los circuitos definidos se añaden al vuelo, aquí y en el censo del editor.
  const propias = deduceScreenTags(facts), screenTags = applyCircuits(propias, live.circuits);
  // El censo de etiquetas lo escribe SÓLO el player, que declara sus pistas (w/h/lang, o player=1). Si grabaran
  // también las lecturas de la parrilla, Pixeria o el Adaptador —sin orientación ni idioma—, pisarían el censo con
  // etiquetas pobres (8-oct-2026). Para ellos, leer no tiene efectos.
  if (fromPlayer(q)) {
    const recordar = rememberTags(env, screen, propias, facts);
    try { if (typeof waitUntil === "function") waitUntil(recordar); else await recordar; } catch (_) { await recordar; }
  }
  // Contenido dirigido a esta pantalla o a su centro por hashtag (#starbucks_paseodegracia_103_pantalla1): se
  // AÑADE a lo que ya tenga, puesto a mano o por playlists vivas, sin repetir pieza.
  const keys = addressKeys(facts), dirigidas = (keys.exact.size || keys.centre.size) ? addressedContent(await loadStock(), facts) : [];
  let auto = dirigidas;
  if (!draft.items.length) {
    const viva = activas.length ? resolveForScreen(activas, screenTags, await loadStock(), facts) : { hits: [], items: [] };
    const ya = new Set(viva.items.map(i => i.stockId)), items = [...viva.items, ...dirigidas.filter(i => !ya.has(i.stockId))].slice(0, 200);
    if (items.length) {
      // Borrador SINTÉTICO: nadie lo ha guardado, lo componen las reglas en esta consulta. Se dice explícitamente
      // (synthetic + origin) para que ningún editor lo tome por una lista manual; `rev` es la de lo guardado (0 si
      // nada) y `liveRev` es la huella de lo que sale, que cambia cuando entra o sale una pieza.
      const vivas = viva.hits.map(p => ({ id: p.id, name: p.name })), hashtag = items.length - viva.items.length;
      draft = { screen, playlist: "default", name: (viva.hits.map(p => p.name).concat(hashtag ? ["Dirigido por hashtag"] : [])).join(" + ").slice(0, 80), items, rev: savedRev,
        liveRev: liveRev(items), synthetic: true, origin: { live: vivas, hashtag },
        updatedAt: Math.max(0, ...viva.hits.map(p => Number(p.updatedAt) || 0)), live: vivas };
      auto = [];   // ya van dentro de la lista
    }
  } else {
    const ya = new Set(draft.items.map(i => String(i.stockId || "")));
    auto = dirigidas.filter(i => !ya.has(i.stockId));
  }
  const respuesta = { ok: true, draft, screenTags, auto };
  // Modo sombra (E6, docs/playlists-modelo-unico.md): si pregunta el player, compara por detrás (waitUntil, después de
  // responder) con el motor nuevo. Nunca retrasa, cambia ni rompe esta respuesta; con la bandera apagada, no hace nada.
  if (fromPlayer(q)) sombraTrasRespuesta({ env, waitUntil, screen, q, respuesta });
  return json(respuesta, 200, cors);
}

// Guardar, pausar o borrar una playlist viva. Sólo con sesión del portal (la clave del Stock no vale aquí:
// una regla puede llegar a muchas pantallas a la vez).
async function liveWrite(request, env, body, cors) {
  const actor = await actorWithAccess(request, env);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401, cors);
  if (!env.ACCESS) return json({ ok: false, error: "storage_unavailable" }, 503, cors);
  const live = await readLive(env), expected = Number(body.rev) || 0;
  if (expected && expected !== Number(live.rev || 0)) return json({ ok: false, error: "revision_conflict", live }, 409, cors);
  let playlists = live.playlists.slice();
  if (body.action === "identity-sync") {
    const list = Array.isArray(body.screens) ? body.screens.slice(0, 500).map(cleanIdentity).filter(Boolean) : [];
    if (!list.length) return json({ ok: false, error: "identity_empty" }, 400, cors);
    const doc = await readIdentity(env); let changed = 0;
    for (const e of list) {
      const prev = doc.map[e.screen], next = { p: e.p, x: e.x, n: e.n, xn: e.xn };
      if (!prev || prev.p !== next.p || prev.x !== next.x || prev.n !== next.n || prev.xn !== next.xn) { doc.map[e.screen] = next; changed += 1; }
    }
    if (changed) { doc.updatedAt = Date.now(); doc.updatedBy = actor; await env.ACCESS.put(IDENTITY_KEY, JSON.stringify(doc)); forgetMemo("identity"); }
    return json({ ok: true, changed, total: Object.keys(doc.map).length }, 200, cors);
  }
  let circuits = live.circuits.slice();
  if (body.action === "circuit-delete") {
    const id = String(body.id || "");
    if (!circuits.some(c => c.id === id)) return json({ ok: false, error: "circuit_not_found" }, 404, cors);
    circuits = circuits.filter(c => c.id !== id);
  } else if (body.action === "circuit-save") {
    let item;
    try { item = cleanCircuit(body.circuit, actor); } catch (e) { return json({ ok: false, error: String(e.message || e) }, 400, cors); }
    const at = circuits.findIndex(c => c.id === item.id);
    if (at >= 0) circuits[at] = { ...item, createdAt: circuits[at].createdAt || item.updatedAt };
    else { if (circuits.length >= MAX_CIRCUITS) return json({ ok: false, error: "circuit_limit" }, 400, cors); circuits.push({ ...item, createdAt: item.updatedAt }); }
  } else
  if (body.action === "live-delete") {
    const id = String(body.id || "");
    if (!playlists.some(p => p.id === id)) return json({ ok: false, error: "live_not_found" }, 404, cors);
    playlists = playlists.filter(p => p.id !== id);
  } else {
    let item;
    try { item = cleanLive(body.playlist, actor); } catch (e) { return json({ ok: false, error: String(e.message || e) }, 400, cors); }
    const at = playlists.findIndex(p => p.id === item.id);
    if (at >= 0) playlists[at] = { ...item, createdAt: playlists[at].createdAt || item.updatedAt };
    else { if (playlists.length >= MAX_LIVE) return json({ ok: false, error: "live_limit" }, 400, cors); playlists.push({ ...item, createdAt: item.updatedAt }); }
  }
  const updatedAt = Date.now(), next = { rev: Math.max(Number(live.rev) || 0, updatedAt - 1) + 1, updatedAt, updatedBy: actor, playlists, circuits };
  await env.ACCESS.put(LIVE_KEY, JSON.stringify(next));
  return json({ ok: true, live: next }, 200, cors);
}

export async function onRequestPost({ request, env }) {
  const cors = corsFor(request);
  if (await lecturaBlocksWrite(request, env)) return json({ ok: false, error: "solo_lectura" }, 403, cors);
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: "invalid_json" }, 400, cors); }
  if (body && ["live-save", "live-delete", "identity-sync", "circuit-save", "circuit-delete"].includes(body.action)) return liveWrite(request, env, body, cors);
  // Sesión del portal (admira.tv) o clave del Stock (pixeria.com, server-to-server).
  const actor = await actorWithAccess(request, env) || stockActor(request, env, body);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401, cors);
  if (!env.ACCESS) return json({ ok: false, error: "storage_unavailable" }, 503, cors);
  const screen = cleanScreen(body && body.screen);
  if (!screen || !Array.isArray(body && body.items) || body.items.length > 200) return json({ ok: false, error: "invalid_playlist" }, 400, cors);
  const items = body.items.map(cleanItem).filter(Boolean);
  if (items.length !== body.items.length) return json({ ok: false, error: "invalid_item" }, 400, cors);
  const previous = await readDraft(env, screen), expected = Number(body.rev) || 0, stored = Number(previous.rev) || 0;
  // Sólo hay conflicto si había algo guardado (rev > 0) y quien escribe trae otra revisión. Con nada guardado no
  // hay a quién pisar: un rev que no sea número, o el de un borrador sintético de un cliente antiguo, no es un 409.
  if (stored && expected && expected !== stored) return json({ ok: false, error: "revision_conflict", draft: previous }, 409, cors);
  const updatedAt = Date.now(), rev = Math.max(Number(previous.rev) || 0, updatedAt - 1) + 1;
  const name = String((body && body.name) || "").trim().slice(0, 80) || "Por defecto";
  const draft = { screen, playlist: "default", name, items, rev, updatedAt, updatedBy: actor };
  await env.ACCESS.put(PREFIX + screen, JSON.stringify(draft));
  return json({ ok: true, draft, rev, updatedAt }, 200, cors);
}

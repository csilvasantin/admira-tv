// GET /api/emision?screen=<id>[&at=<ISO>][&tag=<hashtag>][&resumen=1]
//
// ¿Qué emite AHORA la pantalla X? (Carlos, 8-oct-2026). Reúne lo mismo que lee el player —«Por defecto»
// (/api/playlist), el modo de orquestación (/api/playout), la parrilla del día (/grid/day), el modo remoto del
// circuito (/locations/mode), la sincro (brain /sync/state) y el Stock (/stock/list)— y se lo pasa a decide()
// (functions/api/_emision.js), que replica rebuild() de canal.html. Responde la fuente que gana, el motivo en
// ES/EN, el estado de cada capa, las piezas en orden con su procedencia y duración, y avisos de formato.
//
// SIN EFECTOS. Nada de lo que hace esta ruta escribe:
//   · /api/playlist y /api/playout se llaman EN PROCESO con un ACCESS de solo lectura (put/delete descartados):
//     ni se graban las etiquetas de la pantalla ni el índice de Xpacios, haga lo que haga playlist.js mañana.
//     Las pistas que el player manda al pedir su playlist (w, h, lang…) salen de lo que la propia pantalla dejó
//     registrado (admira-tv:screen:tags:v1:<screen>), así que la respuesta es la que recibe el player.
//   · El resto son GET de lectura a api.admira.store y brain.digitalavatar.ai (nunca /locations/cmd: sondear la
//     cola de órdenes como si fuéramos la pantalla podría consumir o acusar órdenes del mando).
//
// LECTURA. Pública para pantallas virtuales (virtual-*, xtore-virtual-*), igual que su /api/playlist. Para el
// resto, la sesión del portal con permiso digitalsignage-player (el mismo que /api/playlist y /api/playout) o la
// sesión de lectura viva (el visor, que /auth/session admite en digitalsignage-player).
import { accessFor, authHeaders, readSession } from "../_auth-session.js";
import { lecturaStillLive } from "../_lectura-guard.js";
import { onRequestGet as playlistGet } from "./playlist.js";
import { onRequestGet as playoutGet } from "./playout.js";
import { TAGS_PREFIX } from "./_playlist-live.js";
import { decide, VIRTUAL_RE, XTORE_MUSIC_SCREEN, madridClock, bandAt, canonicalPlayTag } from "./_emision.js";

export const PROYECTO = "digitalsignage-player";
const API = "https://api.admira.store";
const BRAIN = "https://brain.digitalavatar.ai";
const STOCK_LIST = API + "/stock/list?limit=300";   // el MISMO índice que lee canal.html (const INDEX)
const FRESCO_MS = 5 * 60_000;

const json = (value, status = 200) => Response.json(value, { status, headers: authHeaders() });
const cleanScreen = value => { const s = String(value || "").trim().toLowerCase(); return /^[a-z0-9][a-z0-9-]{1,79}$/.test(s) ? s : ""; };
const T = (es, en) => ({ es, en });

/** KV de solo lectura: lee como el original y descarta cualquier escritura. */
export function soloLectura(kv) {
  if (!kv) return kv;
  const ro = { get: (...a) => kv.get(...a), put: async () => {}, delete: async () => {} };
  if (typeof kv.getWithMetadata === "function") ro.getWithMetadata = (...a) => kv.getWithMetadata(...a);
  if (typeof kv.list === "function") ro.list = (...a) => kv.list(...a);
  return ro;
}

export async function autorizar(request, env, screen) {
  if (VIRTUAL_RE.test(screen)) return { ok: true, publico: true };
  const session = await readSession(request, env).catch(() => null);
  if (!session) return { ok: false, status: 401, error: "unauthorized" };
  if (session.lectura) return (await lecturaStillLive(session)) ? { ok: true, lectura: true } : { ok: false, status: 401, error: "unauthorized" };
  const access = await accessFor(env, session.email, PROYECTO, false);
  return access.allowed ? { ok: true } : { ok: false, status: 403, error: "forbidden" };
}

const getJson = (url, ms = 4500) => fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(ms) })
  .then(r => r.ok ? r.json() : null).catch(() => null);
const resJson = r => r && typeof r.json === "function" ? r.json().catch(() => null) : null;
const canonMode = v => { const m = String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (["sync", "sincro", "sincronizado", "admiratvsincro"].includes(m)) return "sync";
  if (["conditional", "condicional", "xpl", "admiratvcondicional"].includes(m)) return "conditional";
  return "local"; };
const tagVal = (tags, k) => { const t = (tags || []).find(x => String(x).startsWith(k + ":")); return t ? String(t).slice(k.length + 1) : ""; };

/** Lo que la pantalla dejó dicho de sí misma la última vez que pidió su playlist (sólo lectura). */
async function autorretrato(env, screen) {
  try {
    if (!env.ACCESS || typeof env.ACCESS.getWithMetadata !== "function") return null;
    const r = await env.ACCESS.getWithMetadata(TAGS_PREFIX + screen);
    return r && r.metadata ? r.metadata : null;
  } catch (_) { return null; }
}

/** fetchSyncState() de canal.html: tema propio del kiosko › playlist del líder del grupo › máster global. */
async function sincro(screen, leader, temaPedido) {
  const state = await getJson(BRAIN + "/sync/state");
  if (!(state && Array.isArray(state.items) && state.items.length)) return { remote: null };
  let items = state.items, own = false, leaderList = false;
  const tema = temaPedido || (screen + "-tema");
  const propia = await getJson(BRAIN + "/control/playlist?screen=" + encodeURIComponent(tema));
  if (propia && Array.isArray(propia.items) && propia.items.length) {
    items = propia.items.map(i => Object.assign({}, i, { thumbnail: i.thumbnail || i.thumb || "", _dur: Number(i._dur || i.dur) || 0 })); own = true;
  } else if (leader) {
    const p = await getJson(BRAIN + "/control/playlist?screen=" + encodeURIComponent(leader));
    if (p && Array.isArray(p.items) && p.items.length) { items = p.items.map(i => Object.assign({}, i, { thumbnail: i.thumbnail || i.thumb || "", _dur: Number(i._dur || i.dur) || 0 })); leaderList = true; }
  }
  items = items.map(i => { const dur = Number(i._dur || i.dur) || 0; return Object.assign({}, i, { _dur: dur > 0 ? dur : 0 }); });
  return { remote: { items, slotMs: state.slotMs || 20000 }, own, leaderList };
}

/** De qué tipo parece la lista que la pantalla publicó al mando (control/playlist), por los prefijos de sus ids. */
function pareceFuente(ids, sinc) {
  if (!ids.length) return "";
  if (ids.some(id => id.startsWith("preview:"))) return "previo";
  if (sinc && sinc.modo === "extended") return "mural";
  if (sinc && sinc.on && sinc.modo === "sync") return "sincro";
  if (ids.every(id => id.startsWith("default:"))) return "defecto";
  if (ids.some(id => id.startsWith("grid:"))) return "stock";
  return "stock-o-hashtag";
}

export async function onRequestGet({ request, env = {}, waitUntil }) {
  const url = new URL(request.url), q = url.searchParams;
  const screen = cleanScreen(q.get("screen"));
  if (!screen) return json({ ok: false, error: "bad_screen" }, 400);
  let at = Date.now();
  if (q.get("at")) {
    const raw = q.get("at"), parsed = /^\d{10,14}$/.test(raw) ? Number(raw) : Date.parse(raw);
    if (!Number.isFinite(parsed)) return json({ ok: false, error: "bad_at" }, 400);
    at = parsed;
  }
  const auth = await autorizar(request, env, screen);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const ahora = Math.abs(at - Date.now()) < 120_000;
  const ro = { ...env, ACCESS: soloLectura(env.ACCESS) };
  const swallow = p => { try { if (typeof waitUntil === "function") waitUntil(Promise.resolve(p).catch(() => {})); } catch (_) {} };
  const clock = madridClock(at), hoy = madridClock(Date.now()).date;

  // Pistas del player: su tamaño, su idioma y su identidad, tal y como las dejó registradas.
  const meta = await autorretrato(env, screen);
  const tags = (meta && Array.isArray(meta.tags)) ? meta.tags : [];
  const hints = new URLSearchParams({ screen });
  const w = Number(q.get("w")) || Number(meta && meta.w) || 0, h = Number(q.get("h")) || Number(meta && meta.h) || 0;
  if (w && h) { hints.set("w", String(w)); hints.set("h", String(h)); }
  const lang = tagVal(tags, "idioma"); if (lang) hints.set("lang", lang);
  for (const [k, tk] of [["xpace", "xpacio"], ["project", "proyecto"], ["circuit", "circuito"]]) { const v = tagVal(tags, tk); if (v && v !== screen) hints.set(k, v); }

  const [playlistResp, plan, day, stockResp, now, mirror, cache] = await Promise.all([
    playlistGet({ request: new Request("https://admira.tv/api/playlist?" + hints.toString()), env: ro, waitUntil: swallow }).then(resJson).catch(() => null),
    playoutGet({ request: new Request("https://admira.tv/api/playout?screen=" + encodeURIComponent(screen)), env: ro }).then(resJson).catch(() => null),
    getJson(API + "/grid/day?screen=" + encodeURIComponent(screen) + (clock.date !== hoy ? "&date=" + clock.date.replace(/-/g, "") : "")),
    getJson(STOCK_LIST, 6000),
    ahora ? getJson(API + "/signage/now?screen=" + encodeURIComponent(screen)) : null,
    ahora ? getJson(BRAIN + "/control/playlist?screen=" + encodeURIComponent(screen)) : null,
    getJson(API + "/screen/cache?screen=" + encodeURIComponent(screen)),
  ]);
  const circuit = String((day && day.config && day.config.circuit) || tagVal(tags, "circuito") || "");
  const supuestos = [], avisos = [];

  // ── Modo: orquestación (/api/playout) › modo remoto del circuito (/locations/mode) › lo que la pantalla informa ──
  const modeId = cleanScreen(q.get("circuit")) || screen;   // el player sondea su ?circuit= o, sin él, su propio id
  const configured = !!(plan && plan.configured), planMode = String((plan && plan.mode) || "autonomous");
  let syncOn = false, why = "", leader = "", mode = "local";
  if (configured && planMode === "synchronized") { syncOn = true; why = "grupo"; leader = String((plan.group && plan.group.leader) || ""); }
  else if (!(configured && planMode === "extended")) {
    const remoto = await getJson(API + "/locations/mode?id=" + encodeURIComponent(modeId));
    const m = canonMode(remoto && remoto.mode);
    if (m === "sync") { syncOn = true; why = "remoto"; }
    else if (!(configured && planMode === "autonomous") && remoto && remoto.mode) mode = m;
  }
  const item = now && now.item, sinc = item && item.sinc;
  const vivo = !!(now && now.lastSeen && Date.now() - Number(now.lastSeen) < FRESCO_MS);
  if (ahora && vivo && sinc && sinc.on && sinc.modo === "sync" && !syncOn) {
    syncOn = true; why = "observado";
    supuestos.push(T("La pantalla informa que está en sincro aunque ni su grupo ni su circuito la piden: se toma lo que dice la pantalla (sincro pedida en su URL).", "The screen reports it is in sync although neither its group nor its circuit asks for it: the screen's word is taken (sync requested in its URL)."));
  }
  if (syncOn) mode = "sync";
  if (ahora && vivo && sinc && syncOn && why !== "observado" && sinc.modo && sinc.modo !== "sync") {
    avisos.push({ nivel: "aviso", ...T(`La configuración pide sincro, pero la pantalla informa modo «${sinc.modo}»: puede tener un tag o un modo puesto a mano.`, `The configuration asks for sync, but the screen reports «${sinc.modo}» mode: it may have a hand-set tag or mode.`) });
  }
  const sync = syncOn ? { on: true, why, leader, ...(await sincro(screen, leader, cleanScreen(q.get("leader")))) } : { on: false };

  // ── Inventario técnico que la propia pantalla midió (duración y medidas por pieza) ──
  const tech = {};
  for (const c of (cache && cache.cache && Array.isArray(cache.cache.contents)) ? cache.cache.contents : []) {
    if (c && c.id) tech[String(c.id)] = { duration: Number(c.duration) || 0, width: Number(c.width) || 0, height: Number(c.height) || 0 };
  }
  const screenDims = (w && h) ? { w, h, source: q.get("w") ? "consulta" : "player" }
    : tagVal(tags, "orientacion") ? { orientation: tagVal(tags, "orientacion"), source: "player" } : {};

  const tagPedido = canonicalPlayTag(q.get("tag") || "");
  const decision = decide({
    screen, at, circuit, xtoreMusic: screen === XTORE_MUSIC_SCREEN, playout: plan, liveTag: tagPedido, liveTagSource: tagPedido ? "simulado" : "desconocido",
    draft: playlistResp && playlistResp.ok ? playlistResp : null, grid: day && day.ok ? day : null, stock: (stockResp && (stockResp.items || stockResp)) || [],
    sync, mode, tech, screenDims,
  });

  // ── Lo que la pantalla dice que está emitiendo (sólo para «ahora») ──
  let observado = null;
  if (ahora) {
    const ids = (mirror && Array.isArray(mirror.items)) ? mirror.items.map(i => String(i && i.id || "")) : [];
    const predichos = decision.piezas.map(p => p.id);
    const coincide = ids.length ? ids.length === Math.min(predichos.length, 120) && ids.every((id, i) => id === predichos[i]) : null;
    observado = {
      vivo, standby: !!(now && now.standby), ultimaSenal: now && now.lastSeen ? Number(now.lastSeen) : null,
      ahora: item ? { id: String(item.id || ""), titulo: String(item.title || ""), tipo: String(item.type || ""), url: String(item.url || ""), desde: Number(item.startedAt) || null, duracion: Number(item.dur) || null } : null,
      modo: sinc ? (sinc.modo || "") : "",
      publicada: ids.length ? { n: ids.length, parece: pareceFuente(ids, sinc), coincide } : null,
    };
    if (ids.length && coincide === false) {
      avisos.push({ nivel: "aviso", ...T(`La pantalla publicó otra lista (${ids.length} piezas): puede llevar un hashtag o un #ID del mando, un orden manual o un segmento local que el servidor no ve.`,
        `The screen published a different list (${ids.length} pieces): it may carry a remote hashtag or #ID, a manual order or a local segment the server cannot see.`) });
    }
  }

  supuestos.push(T("Se supone el segmento de casa del player (medio, categoría y audiencia «todo») y sin orden manual ni #ID del mando.", "The player's home segment is assumed (media, category and audience «all») with no manual order or remote #ID."));
  if (!tagPedido) supuestos.push(T("El hashtag del mando vive en el propio player y no se publica: si alguien lo ha puesto, manda sobre todo esto. Añade ?tag= para simularlo.", "The remote hashtag lives in the player itself and is not published: if someone set it, it overrides all of this. Add ?tag= to simulate it."));
  if (!meta) supuestos.push(T("La pantalla no ha pedido su playlist todavía (o hace más de 45 días): sin su tamaño ni su idioma, las playlists vivas por orientación o idioma pueden no casar.", "The screen has not asked for its playlist yet (or not for 45 days): without its size or language, live playlists by orientation or language may not match."));
  if (!(playlistResp && playlistResp.ok)) avisos.push({ nivel: "aviso", ...T("No se pudo leer «Por defecto»: se trata como vacía.", "Could not read the default playlist: treated as empty.") });
  if (!(day && day.ok)) avisos.push({ nivel: "aviso", ...T("No se pudo leer la parrilla del día: se trata como sin reservas.", "Could not read today's bookings: treated as none.") });
  if (!stockResp) avisos.push({ nivel: "aviso", ...T("No se pudo leer el Stock: las capas que dependen de él salen vacías.", "Could not read the Stock: layers that depend on it come out empty.") });

  const band = day && day.ok ? bandAt(day, at) : null;
  const franjas = day && day.ok ? (day.bands || []).map(b => ({ id: b.id, label: b.label, from: b.from, to: b.to, own: b.own || 0, paid: b.paid || 0,
    conCreatividad: (b.slots || []).filter(s => (s.kind === "own" || s.kind === "paid") && s.creative && s.creative.url).length, activa: !!band && band.id === b.id })) : [];

  const out = {
    ok: true, screen, at: new Date(at).toISOString(), ahora, madrid: { fecha: clock.date, hora: clock.hhmm }, publico: !!auth.publico,
    nombre: String((day && day.config && day.config.name) || screen), circuito: circuit,
    ...decision,
    avisos: [...decision.avisos, ...avisos], supuestos: [...decision.supuestos, ...supuestos],
    franjas, observado,
    lecturas: { playlist: !!(playlistResp && playlistResp.ok), playout: !!plan, parrilla: !!(day && day.ok), stock: !!stockResp, modo: mode, sincro: sync.on ? (sync.remote ? "maestro" : "sin-maestro") : "no" },
  };
  if (q.get("resumen") === "1") { out.total = out.piezas.length; delete out.piezas; }
  return json(out);
}

// Mismo patrón que functions/auth/session.js: GET lo atiende onRequestGet; cualquier otro método, 405.
export function onRequest() {
  return new Response(null, { status: 405, headers: authHeaders({ Allow: "GET" }) });
}

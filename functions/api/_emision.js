// ¿QUÉ EMITE LA PANTALLA X? (Carlos, 8-oct-2026: «ver qué emite cada pantalla» y saber cuándo algo de más
// prioridad le anula su playlist).
//
// Lógica PURA, sin red ni KV: recibe la foto de los datos que el player también lee (playout, «Por defecto»,
// parrilla del día, sincro, Stock…) y responde qué fuente gana, por qué, qué capas quedan anuladas y la lista de
// piezas en el orden en que sonarían. functions/api/emision.js reúne los datos; esto sólo decide.
//
// ES UNA RÉPLICA de rebuild() de canal.html (≈L2536) y de los mapeos de loadGrid()/loadDefaultDraft()/loadFeed().
// No se extrajo a un módulo compartido porque canal.html es el player de toda la flota y rebuild() vive entre
// estado global (localStorage, DOM, temporizadores): sacarlo sin cambiar su comportamiento era más riesgo que
// beneficio. A cambio, emision-canal-equivalencia.test.mjs ejecuta el rebuild() REAL de canal.html en una caja
// (node:vm) con los mismos datos de entrada y exige que la fuente y el orden de piezas coincidan con decide().
// Si alguien toca rebuild(), ese test le avisa de que esto también hay que tocarlo.
//
// Orden de mando de rebuild(), gana el primero que se cumple:
//   0. modo música de Xtore (xtore-virtual-zapatillas)
//   1. mural extendido (/api/playout, modo extended)
//   2. previo de borrador (?rundown=…) — sólo en la pestaña de previo de la parrilla, nunca en antena
//   3. playlist alternativa por hashtag del mando (tag-<x>)
//   4. «Por defecto» (/api/playlist) — sólo si NO hay sincro y NO hay reservas own/paid con creatividad en la
//      franja actual de /grid/day, propias o heredadas del canal
//   5. sincro con el máster (grupo de /api/playout o modo remoto del circuito)
//   6. Stock: #default › cortafuegos por procedencia › todo (máx. 50), con la parrilla entrelazada cada 4
import { TAG_ALIAS, orientationOf } from "./_playlist-live.js";

// ── Constantes copiadas de canal.html (el test de equivalencia comprueba que siguen siendo las mismas) ──────────
export const MEDIA = ["video", "animation", "image", "digital-twin", "audio", "music", "locucion", "interactive"];
export const KIND = { video: "video", animation: "video", image: "image", "digital-twin": "image", "twin-npc": "image", audio: "audio", music: "audio", locucion: "audio", interactive: "interactive", xperiencia: "interactive" };
export const CFG = Object.freeze({ imgSec: 9, audioSec: 18, interSec: 60, max: 50 });
export const TAG_DEFAULT = "default";
export const MOTOR_REFERENCIA = /^(yt-dlp|telegram import|smith\s*·\s*grok|site capsule)/i;
export const CORTAFUEGOS_MIN = 6;
export const SYNC_MASTER_MAX = 50;
export const GRID_EVERY = 4;
export const XTORE_MUSIC_SCREEN = "xtore-virtual-zapatillas";
export const VIRTUAL_RE = /^(?:xtore-)?virtual-[a-z0-9-]+$/;

export const normTag = v => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
export function canonicalPlayTag(v) { const t = normTag(v).replace(/^#/, "").replace(/\s+/g, "-"); return TAG_ALIAS[t] || t; }
export function tagNeedles(v) { const t = canonicalPlayTag(v); return [t].concat(Object.keys(TAG_ALIAS).filter(k => TAG_ALIAS[k] === t)); }
export const tieneTagDefault = it => (it && Array.isArray(it.tags) ? it.tags : []).some(t => String(t).toLowerCase().trim() === TAG_DEFAULT);

/** Segmento «de casa» del player: lo que tiene una pantalla que nadie ha segmentado a mano. */
export const SEG_CASA = Object.freeze({ medio: "all", audience: "all", category: "all", age: "all", slot: "all", tag: "", format: "" });

/** matchesSeg() de canal.html. `madridSlot` sólo se usa con slot 'auto'. */
export function matchesSeg(it, s, madridSlot = "") {
  if (s.ids && s.ids.length) return s.ids.indexOf(it.id) >= 0;
  const k = KIND[it.type];
  if (s.medio !== "all" && k !== s.medio) return false;
  if (s.audience !== "all") { const a = it.audience; if (a && a !== "all" && a !== s.audience) return false; }
  if (s.category !== "all") { if (it.category && it.category !== s.category) return false; }
  if (s.age !== "all") { const g = it.ageBucket; if (g && g !== s.age) return false; }
  if (s.slot !== "all") { const want = s.slot === "auto" ? madridSlot : s.slot; const ts = it.timeSlot; if (ts && ts !== want) return false; }
  if (s.tag) {
    const tg = (it.tags || []).map(canonicalPlayTag);
    for (const w of String(s.tag).split(/[,+]/).map(x => x.trim()).filter(Boolean)) {
      const needles = tagNeedles(w);
      if (!tg.some(t => needles.includes(t))) return false;
    }
  }
  if (s.format) { const tg = (it.tags || []).map(normTag); if (!tg.includes(normTag(s.format))) return false; }
  return true;
}

/** defaultOrder() de canal.html: por categoría (la del import más nuevo primero) y, dentro, lo más nuevo primero. */
export function defaultOrder(arr) {
  const catNewest = {};
  for (const it of arr) { const c = it.category || "~"; const d = String(it.createdAt || ""); if (!catNewest[c] || d > catNewest[c]) catNewest[c] = d; }
  return arr.slice().sort((a, b) => {
    const ca = a.category || "~", cb = b.category || "~";
    if (ca !== cb) return (catNewest[cb] || "").localeCompare(catNewest[ca] || "");
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

/** El catálogo tal y como lo deja loadFeed(): sólo medios emitibles con URL, de lo más nuevo a lo más viejo. */
export function stockPool(items) {
  return (Array.isArray(items) ? items : []).filter(i => i && MEDIA.includes(i.type) && i.url)
    .map(i => ({ ...i, _num: i.num }))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

/** editorialSec() de canal.html: segundos que ocupa la pieza en el bucle local (0 = vídeo de duración desconocida). */
export function editorialSec(it, cfg = CFG) {
  const k = KIND[(it && it.type) || "image"] || "image";
  if (k === "video") return Math.max(0, Number(it && it._dur) || 0);
  if (k === "image") return Math.max(2, Number(it._previewSec || cfg.imgSec) || 0);
  if (k === "interactive") return Math.max(5, Number(it._previewSec || it._interSec || it.dur || it.seconds || cfg.interSec) || 0);
  const slot = Math.max(3, Number(it._previewSec || cfg.audioSec) || 0), real = Number(it._dur) || 0;
  return (real > 0 && real < slot) ? Math.max(1, Math.ceil(real)) : slot;
}
/** syncItemDurationMs() de canal.html, en segundos. */
export function syncItemSec(it, cfg = CFG, slotMs = 20000) {
  let sec = Number(it._dur || it.dur || it._previewSec || it.seconds) || 0;
  const kind = KIND[it.type] || "image";
  if (sec <= 0 && kind === "image") sec = Math.max(2, Number(cfg.imgSec) || 0);
  if (sec <= 0 && kind === "audio") sec = Math.max(3, Number(cfg.audioSec) || 0);
  if (sec <= 0 && kind === "interactive") sec = Math.max(5, Number(cfg.interSec) || 0);
  return sec > 0 ? Math.max(1, Math.ceil(sec)) : Math.round(slotMs / 1000);
}

// ── Reloj de Madrid (la parrilla vive en hora de Madrid, igual que el worker) ──────────────────────────────
export function madridClock(at) {
  const d = new Date(at);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { date, hhmm, min: hhmmMin(hhmm) };
}
export function hhmmMin(s) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
/** gridBandIsNow() del worker: una franja [from, to) que puede cruzar la medianoche. */
export function bandContains(b, nowMin) { let f = hhmmMin(b.from), t = hhmmMin(b.to); if (t <= f) t += 1440; let n = nowMin; if (n < f) n += 1440; return n >= f && n < t; }
/** La franja de /grid/day que manda en `at`: la que contiene esa hora si el día es el de `at`. */
export function bandAt(day, at) {
  const bands = (day && Array.isArray(day.bands)) ? day.bands : [];
  if (!bands.length) return null;
  const clock = madridClock(at);
  if (day.date && day.date !== clock.date) return null;
  if (bands.every(b => b.from && b.to)) return bands.find(b => bandContains(b, clock.min)) || null;
  return bands.find(b => b.isNow) || null;
}
const corto = hhmm => { const [h, m] = String(hhmm || "").split(":"); return m && m !== "00" ? `${+h}:${m}` : String(+h || 0); };
export const bandLabel = b => b ? `${corto(b.from)}-${corto(b.to)}` : "";

/** loadGrid() de canal.html: los creativos own/paid de la franja, como piezas del loop. */
export function gridInjectedFrom(day, at) {
  const cur = bandAt(day, at), out = [], seen = new Set(), sinCreatividad = [];
  const gsec = Math.max(2, Math.min(120, Number(day && day.config && day.config.slotSeconds) || 10));
  if (cur) for (const s of cur.slots || []) {
    if (s.kind !== "own" && s.kind !== "paid") continue;
    if (!(s.creative && s.creative.url)) { sinCreatividad.push(s); continue; }
    if (seen.has(s.bookingId)) continue;
    seen.add(s.bookingId);
    out.push({ id: "grid:" + s.bookingId, url: s.creative.url, type: (s.creative.type === "audio" ? "audio" : s.creative.type === "video" ? "video" : "image"),
      title: s.title || s.advertiser || "Parrilla", motor: "parrilla", category: "parrilla", _previewSec: gsec, _grid: true, _gridKind: s.kind,
      _playlistId: s.playlistId || "", _position: Number.isFinite(s.position) ? s.position : null, _lane: s.lane || "", createdAt: "9" + Date.now(),
      _slot: s });
  }
  const exact = out.length > 0 && out.every(x => x._playlistId === "municipal-50-50");
  if (exact) out.sort((a, b) => (a._position ?? 9999) - (b._position ?? 9999));
  return { band: cur, items: out, exact, sinCreatividad };
}
/** Una reserva servida por /grid/day es heredada cuando su id viene prefijado def-<circuito|global>-. */
export function herencia(bookingId, circuit = "") {
  const id = String(bookingId || "");
  if (!id.startsWith("def-")) return "";
  if (circuit && id.startsWith("def-" + circuit + "-")) return circuit;
  if (id.startsWith("def-global-")) return "global";
  return id.slice(4).split("-")[0] || "canal";
}

/** loadDefaultDraft() de canal.html: piezas de «Por defecto» (puestas a mano, vivas y dirigidas por hashtag). */
export function defaultDraftItems(resp, { xtoreMusic = false, pool = [] } = {}) {
  let raw = resp && resp.draft && Array.isArray(resp.draft.items) ? resp.draft.items : [];
  if (resp && Array.isArray(resp.auto) && resp.auto.length) {
    const ya = new Set(raw.map(it => String(it.stockId || it.id || "")));
    raw = raw.concat(resp.auto.filter(it => !ya.has(String(it.stockId || it.id || ""))).map(it => ({ ...it, _auto: true })));
  }
  if (xtoreMusic) raw = xtoreMusicItems(raw, pool);
  return raw.map((it, ix) => {
    const t = String(it.assetType || it.type || "").toLowerCase(), type = (t === "video" || t === "animation") ? "video" : (t === "audio" || t === "music" || t === "locucion") ? "audio" : "image";
    return { id: "default:" + String(it.stockId || it.id || ix), url: it.asset || it.url || "", type, title: it.title || ("Contenido " + (ix + 1)), motor: "parrilla-default",
      category: "por-defecto", _default: true, _position: ix, _previewSec: Math.max(2, +it.seconds || 10), createdAt: "8" + String(1000 + ix), _src: it };
  }).filter(x => x.url);
}

function rawDraftCount(resp) {
  const items = resp && resp.draft && Array.isArray(resp.draft.items) ? resp.draft.items : [];
  const ya = new Set(items.map(it => String(it.stockId || it.id || "")));
  const auto = resp && Array.isArray(resp.auto) ? resp.auto.filter(it => !ya.has(String(it.stockId || it.id || ""))) : [];
  return items.length + auto.length;
}

/** xtoreMusicItems() / xtoreLatestStock() de canal.html (modo música de Xtore). */
export function xtoreMusicItems(items, catalog = []) {
  const known = new Map(catalog.map(it => [String(it.id), it]));
  return items.filter(it => {
    if (!it || !["audio", "music", "video", "animation", "image"].includes(String(it.assetType || it.type || "").toLowerCase())) return false;
    const original = known.get(String(it.stockId || it.id || "").replace(/^default:/, ""));
    if ([it.type, it.assetType, original && original.type].some(t => String(t || "").toLowerCase() === "locucion")) return false;
    try { const u = new URL(it.asset || it.url); return u.protocol === "https:" && !u.username && !u.password; } catch (_) { return false; }
  });
}
export function xtoreLatestStock(items, tag = "") {
  const canonical = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/^#+/, "").toLowerCase();
  const wanted = canonical(tag), seenIds = new Set(), seenUrls = new Set();
  return xtoreMusicItems(items).filter(it => (wanted !== "musica" || ["audio", "music", "video", "animation"].includes(it.type)) &&
      (!wanted || (Array.isArray(it.tags) && it.tags.some(t => typeof t === "string" && canonical(t) === wanted))))
    .slice().sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || String(a.id).localeCompare(String(b.id)))
    .filter(it => { const id = String(it.id || ""), url = it.asset || it.url; if (!id || seenIds.has(id) || seenUrls.has(url)) return false; seenIds.add(id); seenUrls.add(url); return true; })
    .slice(0, 5);
}

/** gridWeave() de canal.html: la parrilla (own/paid) entra cada 4 piezas; en modo 50/50 manda sola y en orden. */
export function gridWeave(pl, grid, exact = false) {
  if (!grid.length) return pl;
  const gids = new Set(grid.map(g => g.id));
  const base = pl.filter(p => !gids.has(p.id));
  if (exact && grid.length) return grid.slice().sort((a, b) => (a._position ?? 9999) - (b._position ?? 9999));
  if (!base.length) return grid.slice();
  const out = []; let gi = 0;
  for (let i = 0; i < base.length; i++) { out.push(base[i]); if ((i + 1) % GRID_EVERY === 0) { out.push(grid[gi % grid.length]); gi++; } }
  if (gi === 0) for (const g of grid) out.push(g);
  return out;
}

/** Asignación de /api/playout que pone la pantalla en mural extendido (applyPlayoutAssignment de canal.html). */
export function extendedFrom(assignment) {
  const d = assignment;
  if (!d || !d.configured || String(d.mode || "") !== "extended" || !d.item || !d.tile) return null;
  const raw = d.item;
  return { assignment: d, item: Object.assign({}, raw, { _num: raw.num, motor: "mural extendido", category: "extendido" }) };
}

// ── Textos ─────────────────────────────────────────────────────────────────────────────────────────────────
const T = (es, en) => ({ es, en });
const n = (k, es1, esN, en1, enN) => T(k === 1 ? es1 : esN.replace("#", k), k === 1 ? en1 : enN.replace("#", k));
const comillas = s => `«${s}»`;
const LAYER_NAMES = {
  xtore: T("Música de Xtore", "Xtore music"),
  mural: T("Mural extendido", "Extended video wall"),
  previo: T("Previo de borrador", "Draft preview"),
  hashtag: T("Hashtag del mando", "Remote hashtag"),
  defecto: T("Por defecto", "Default playlist"),
  sincro: T("Sincro con el máster", "Sync with master"),
  parrilla: T("Parrilla de la franja", "Time-slot bookings"),
  stock: T("Stock", "Stock"),
};
// Cómo se nombra cada capa dentro de una frase («la anula la sincro»).
const REF = {
  xtore: T("el modo música de Xtore", "Xtore music mode"), mural: T("el mural extendido", "the extended wall"),
  previo: T("el previo de borrador", "the draft preview"), hashtag: T("el hashtag del mando", "the remote hashtag"),
  defecto: T("«Por defecto»", "the default playlist"), sincro: T("la sincro", "sync"), parrilla: T("la parrilla", "the bookings"), stock: T("el Stock", "the Stock"),
};
const kindTxt = kind => kind === "paid" ? T("La reserva pagada", "The paid booking") : T("La reserva propia", "The own booking");
/** «1 pieza» / «3 piezas» en los dos idiomas. */
export const reservasTxt = k => T(`${k} ${k === 1 ? "reserva" : "reservas"}`, `${k} ${k === 1 ? "booking" : "bookings"}`);
export const piezasTxt = k => T(`${k} ${k === 1 ? "pieza" : "piezas"}`, `${k} ${k === 1 ? "piece" : "pieces"}`);

/** Motivo humano de que la parrilla anule «Por defecto»: «La reserva pagada de la franja 10-14 de Alcampo…». */
function motivoParrilla(grid, circuit) {
  const first = grid.items[0], s = first && first._slot || {};
  const inh = herencia(s.bookingId, circuit), k = kindTxt(s.kind);
  const quien = s.advertiser || s.title || "";
  const franja = bandLabel(grid.band);
  const extra = grid.items.length > 1 ? T(` (y ${grid.items.length - 1} más)`, ` (and ${grid.items.length - 1} more)`) : T("", "");
  const deEs = quien ? ` de ${quien}` : "", deEn = quien ? ` by ${quien}` : "";
  const herEs = inh ? (inh === "global" ? ", heredada de la parrilla global," : `, heredada del canal ${inh},`) : "";
  const herEn = inh ? (inh === "global" ? ", inherited from the global grid," : `, inherited from channel ${inh},`) : "";
  return T(`${k.es} de la franja ${franja}${deEs}${extra.es}${herEs}`, `${k.en} in the ${franja} slot${deEn}${extra.en}${herEn}`);
}

// ── Piezas: lo que se enseña de cada una ────────────────────────────────────────────────────────────────────
const sidOf = it => String((it._src && it._src.stockId) || (it._slot && it._slot.stockId) || it.stockId || String(it.id || "").replace(/^default:/, ""));
function thumbOf(it, stockById) {
  const st = stockById.get(sidOf(it)) || stockById.get(String(it.id)) || null;
  const t = it.thumbnail || it.thumb || it.poster || (st && (st.thumbnail || st.poster)) || "";
  if (t) return String(t);
  return KIND[it.type] === "image" ? String(it.url || "") : "";
}
function stockOf(it, stockById) {
  return stockById.get(sidOf(it)) || stockById.get(String(it.id)) || null;
}
function pieceDims(it, stockById, tech) {
  const st = stockOf(it, stockById), tk = tech[String(it.id)] || (st && tech[String(st.id)]) || null;
  const w = Number((tk && tk.width) || (st && st.ancho)) || 0, h = Number((tk && tk.height) || (st && st.alto)) || 0;
  const o = orientationOf(w, h, st && st.orientacion);
  return { w, h, orientation: o };
}
function procedenciaDe(fuente, it, ctx) {
  if (it._grid) {
    const s = it._slot || {}, inh = herencia(s.bookingId, ctx.circuit), quien = s.advertiser || s.title || "";
    const k = s.kind === "paid" ? T("reserva pagada", "paid booking") : T("reserva propia", "own booking");
    return { tipo: "parrilla", reserva: s.bookingId || "", heredada: inh || "", es: `${k.es} · franja ${bandLabel(ctx.band)}${quien ? " · " + quien : ""}${inh ? " · heredada de " + inh : ""}`,
      en: `${k.en} · ${bandLabel(ctx.band)} slot${quien ? " · " + quien : ""}${inh ? " · inherited from " + inh : ""}` };
  }
  if (fuente === "defecto" || (fuente === "xtore" && it._default)) {
    const src = it._src || {}, sub = String(src.sub || "");
    if (src._auto || /^destino · #/.test(sub)) { const tag = sub.replace(/^destino · #/, ""); return { tipo: "hashtag", tag, es: `dirigida por hashtag #${tag}`, en: `addressed by hashtag #${tag}` }; }
    if (/^viva/.test(sub)) { const nombre = sub.replace(/^viva( · )?/, ""); return { tipo: "viva", nombre, es: `playlist viva ${comillas(nombre || "sin nombre")}`, en: `live playlist ${comillas(nombre || "unnamed")}` }; }
    return { tipo: "manual", es: "puesta a mano en «Por defecto»", en: "added by hand to the default playlist" };
  }
  if (fuente === "mural") return { tipo: "mural", es: "pieza compartida del mural extendido", en: "shared piece of the extended wall" };
  if (fuente === "hashtag") return { tipo: "hashtag-mando", tag: ctx.tag, es: `Stock con #${ctx.tag} (mando)`, en: `Stock tagged #${ctx.tag} (remote)` };
  if (fuente === "sincro") return { tipo: "sincro", es: ctx.syncTxt.es, en: ctx.syncTxt.en };
  if (fuente === "xtore") return { tipo: "stock", es: "Stock · lo último con #musica", en: "Stock · latest #musica" };
  const p = ctx.porDefecto;
  if (p === "tag") return { tipo: "stock", es: "Stock · etiquetado #default", en: "Stock · tagged #default" };
  if (p === "motor") return { tipo: "stock", es: "Stock · sin el material de referencia", en: "Stock · reference material filtered out" };
  return { tipo: "stock", es: "Stock", en: "Stock" };
}

/**
 * Decide qué emite la pantalla. `input` es la foto de los datos (ver functions/api/emision.js):
 *   screen, at, xtoreMusic, playout, liveTag, draft (respuesta de /api/playlist), grid (/grid/day), circuit,
 *   sync {on, why, leader, remote:{items,slotMs}, own}, mode, stock (crudo de /stock/list), tech (id→{duration,width,height}),
 *   screenDims {w,h,orientation,source}
 */
export function decide(input = {}) {
  const at = Number.isFinite(+input.at) ? +input.at : Date.now();
  const screen = String(input.screen || "");
  const pool = stockPool(input.stock);
  const stockById = new Map((Array.isArray(input.stock) ? input.stock : []).filter(Boolean).map(s => [String(s.id), s]));
  const tech = input.tech && typeof input.tech === "object" ? input.tech : {};
  const xtoreMusic = !!input.xtoreMusic;
  const sync = input.sync || {};
  const syncOn = !!sync.on;
  const mode = input.mode || (syncOn ? "sync" : "local");
  const circuit = String(input.circuit || "");
  const liveTag = canonicalPlayTag(input.liveTag || "");
  const extended = extendedFrom(input.playout);
  const grid = gridInjectedFrom(input.grid, at);
  const draftItems = defaultDraftItems(input.draft, { xtoreMusic, pool });
  const capas = [], avisos = [], supuestos = [];
  const capa = (id, estado, detalle, extra = {}) => capas.push({ id, nombre: LAYER_NAMES[id], estado, detalle, ...extra });

  let fuente = "", motivo = null, etiqueta = null, playlist = [], porDefecto = "", cortafuegos = 0;
  const syncTxt = sync.own ? T(`el tema propio del kiosko (${screen}-tema)`, `the kiosk's own theme (${screen}-tema)`)
    : sync.leader && sync.leaderList ? T(`la playlist del líder del grupo (${sync.leader})`, `the group leader's playlist (${sync.leader})`)
    : sync.remote ? T("el máster global", "the global master") : T("su propio orden, sin máster", "its own order, without a master");
  const syncPor = sync.why === "grupo" ? T(`está en el grupo de sincro de ${sync.leader || "otra pantalla"}`, `it is in ${sync.leader || "another screen"}'s sync group`)
    : sync.why === "remoto" ? T("el modo remoto de su circuito es sincro", "its circuit's remote mode is sync")
    : sync.why === "observado" ? T("la propia pantalla informa que está en sincro", "the screen itself reports it is in sync")
    : T("está en sincro", "it is in sync");

  // 0 · Xtore
  if (xtoreMusic) {
    fuente = "xtore";
    // DEFAULT_DRAFT.assigned de canal.html: había piezas (a mano o dirigidas) ANTES de filtrar las no musicales.
    const asignada = draftItems.length > 0 || rawDraftCount(input.draft) > 0;
    playlist = asignada ? xtoreMusicItems(draftItems, pool).slice() : xtoreLatestStock(pool, "musica");
    motivo = asignada ? T(`Modo música de Xtore: emite la playlist asociada (${piezasTxt(playlist.length).es}) y nada más.`, `Xtore music mode: it plays the associated playlist (${piezasTxt(playlist.length).en}) and nothing else.`)
      : T("Modo música de Xtore sin playlist asociada: emite lo último del Stock con #musica (máx. 5).", "Xtore music mode with no associated playlist: it plays the latest #musica Stock items (max 5).");
    etiqueta = T((asignada ? "PLAYLIST ASOCIADA" : "PIXERIA #musica · últimos 5") + " · " + playlist.length + " piezas", (asignada ? "ASSOCIATED PLAYLIST" : "PIXERIA #musica · latest 5") + " · " + playlist.length + " pieces");
  }
  capa("xtore", xtoreMusic ? "activa" : "no-aplica", xtoreMusic ? motivo : T(`Sólo en la pantalla ${XTORE_MUSIC_SCREEN}.`, `Only on screen ${XTORE_MUSIC_SCREEN}.`));

  // 1 · Mural extendido
  if (!fuente && extended) {
    fuente = "mural";
    playlist = [extended.item];
    const tile = extended.assignment.tile || {};
    motivo = T(`Mural extendido: es la tesela ${(tile.index || 0) + 1}/${tile.total || 1} y emite una sola pieza compartida, ${comillas(extended.item.title || extended.item.id)}.`,
      `Extended video wall: it is tile ${(tile.index || 0) + 1}/${tile.total || 1} and plays a single shared piece, ${comillas(extended.item.title || extended.item.id)}.`);
    etiqueta = T(`EXTENDIDO · ${tile.cols || 1}×${tile.rows || 1}`, `EXTENDED · ${tile.cols || 1}×${tile.rows || 1}`);
  }
  capa("mural", extended ? (fuente === "mural" ? "activa" : "anulada") : "inactiva",
    extended ? (fuente === "mural" ? motivo : T("Asignada, pero la anula el modo música de Xtore.", "Assigned, but Xtore music mode overrides it.")) : T("No forma parte de ningún mural extendido.", "Not part of any extended wall."),
    extended && fuente !== "mural" ? { anuladaPor: fuente } : {});

  capa("previo", "no-aplica", T("Sólo en la pestaña de previo de la parrilla (canal.html?rundown=…); nunca en antena.", "Only in the grid's preview tab (canal.html?rundown=…); never on air."));

  // 3 · Hashtag del mando
  if (!fuente && liveTag) {
    fuente = "hashtag";
    const alt = { medio: "all", audience: "all", category: "all", age: "all", slot: "all", tag: liveTag, format: "", ids: [] };
    playlist = defaultOrder(pool.filter(it => it && !it._grid && matchesSeg(it, alt)));
    motivo = T(`El mando ha puesto la playlist alternativa #${liveTag}: manda sobre «Por defecto», la sincro, la parrilla y el Stock (${piezasTxt(playlist.length).es}).`,
      `The remote set the alternative playlist #${liveTag}: it overrides the default playlist, sync, bookings and Stock (${piezasTxt(playlist.length).en}).`);
    etiqueta = T(`PLAYLIST ALTERNATIVA #${liveTag} · ${playlist.length} en loop`, `ALTERNATIVE PLAYLIST #${liveTag} · ${playlist.length} in loop`);
    if (!playlist.length) avisos.push({ nivel: "aviso", ...T(`Ninguna pieza del Stock lleva #${liveTag}: la pantalla se queda vacía.`, `No Stock piece is tagged #${liveTag}: the screen goes blank.`) });
  }
  capa("hashtag", liveTag ? (fuente === "hashtag" ? "activa" : "anulada") : "inactiva",
    liveTag ? (fuente === "hashtag" ? motivo : T(`#${liveTag} no sale: manda ${REF[fuente].es}.`, `#${liveTag} does not play: ${REF[fuente].en} rules.`))
      : T(input.liveTagSource === "desconocido" ? "El mando no ha puesto ningún hashtag que sepamos (vive en el propio player)." : "Sin hashtag del mando.", input.liveTagSource === "desconocido" ? "No known remote hashtag (it lives in the player itself)." : "No remote hashtag."),
    { ...(liveTag && fuente !== "hashtag" ? { anuladaPor: fuente } : {}), ...(liveTag ? { tag: liveTag, origen: input.liveTagSource || "simulado" } : {}) });

  // 4 · «Por defecto»
  const defectoTiene = draftItems.length > 0;
  let defectoEstado = "vacia", defectoDetalle = T("«Por defecto» está vacía: ni piezas a mano, ni playlists vivas, ni contenido dirigido.", "The default playlist is empty: no manual pieces, live playlists or addressed content."), defectoPor = "";
  if (!fuente && defectoTiene && !syncOn && !grid.items.length) {
    fuente = "defecto";
    playlist = draftItems.slice();
    const vivas = (input.draft && input.draft.draft && Array.isArray(input.draft.draft.live)) ? input.draft.draft.live.map(p => p.name).filter(Boolean) : [];
    const deEs = vivas.length ? ` (viva: ${vivas.join(" + ")})` : "", deEn = vivas.length ? ` (live: ${vivas.join(" + ")})` : "";
    const franja = grid.band ? T(` en la franja ${bandLabel(grid.band)}`, ` in the ${bandLabel(grid.band)} slot`) : T("", "");
    motivo = T(`Emite su playlist «Por defecto»${deEs}: ${piezasTxt(playlist.length).es} en bucle. No hay sincro ni reservas own/paid${franja.es}.`,
      `It plays its default playlist${deEn}: ${piezasTxt(playlist.length).en} in a loop. There is no sync and no own/paid booking${franja.en}.`);
    etiqueta = T(`POR DEFECTO · ${playlist.length} en loop`, `DEFAULT · ${playlist.length} in loop`);
    defectoEstado = "activa"; defectoDetalle = motivo;
  } else if (defectoTiene) {
    defectoEstado = "anulada";
    if (fuente) { defectoPor = fuente; defectoDetalle = T(`La anula ${REF[fuente].es}.`, `Overridden by ${REF[fuente].en}.`); }
    else if (syncOn) { defectoPor = "sincro"; defectoDetalle = T(`La anula la sincro: ${syncPor.es}.`, `Overridden by sync: ${syncPor.en}.`); }
    else { defectoPor = "parrilla"; const m = motivoParrilla(grid, circuit); defectoDetalle = T(`${m.es} anula «Por defecto».`, `${m.en} overrides the default playlist.`); }
  }
  capa("defecto", defectoEstado, defectoDetalle, { n: draftItems.length, ...(defectoPor ? { anuladaPor: defectoPor } : {}) });

  // 5 · Sincro
  if (!fuente && syncOn) {
    fuente = "sincro";
    const remote = sync.remote && Array.isArray(sync.remote.items) && sync.remote.items.length ? sync.remote.items : null;
    playlist = remote ? remote.slice() : defaultOrder(pool.filter(it => !it._grid)).slice(0, SYNC_MASTER_MAX);
    const antes = defectoTiene ? T(` y anula «Por defecto» (${piezasTxt(draftItems.length).es})`, ` and overrides the default playlist (${piezasTxt(draftItems.length).en})`) : T("", "");
    motivo = T(`En sincro porque ${syncPor.es}: emite ${syncTxt.es}${antes.es}${grid.items.length ? " y la parrilla de la franja" : ""}.`,
      `In sync because ${syncPor.en}: it plays ${syncTxt.en}${antes.en}${grid.items.length ? " and the slot bookings" : ""}.`);
    etiqueta = remote ? T(`SINCRO ${sync.own ? "KIOSKO " + screen : "CANAL · máster global"} · ${playlist.length} en loop`, `SYNC ${sync.own ? "KIOSK " + screen : "CHANNEL · global master"} · ${playlist.length} in loop`)
      : T(`SINCRO SIN MÁSTER · ${playlist.length} en loop · orden propio`, `SYNC WITHOUT MASTER · ${playlist.length} in loop · own order`);
    if (!remote) avisos.push({ nivel: "aviso", ...T("La sincro está pedida pero el máster no responde: la pantalla ordena por su cuenta y puede no coincidir con las demás.", "Sync is requested but the master is not answering: the screen orders by itself and may not match the others.") });
  }
  capa("sincro", syncOn ? (fuente === "sincro" ? "activa" : "anulada") : "inactiva",
    syncOn ? (fuente === "sincro" ? motivo : T(`Pedida (${syncPor.es}), pero la anula ${REF[fuente].es}.`, `Requested (${syncPor.en}), but overridden by ${REF[fuente].en}.`))
      : T(mode === "conditional" ? "Sin sincro: el circuito está en modo condicional (XPL)." : "Sin sincro: ni grupo de sincro ni modo remoto sincro.", mode === "conditional" ? "No sync: the circuit is in conditional (XPL) mode." : "No sync: neither a sync group nor a remote sync mode."),
    syncOn && fuente !== "sincro" ? { anuladaPor: fuente } : {});

  // 6 · Stock (+ parrilla entrelazada)
  if (!fuente) {
    fuente = "stock";
    const sinDecidir = !grid.items.length && !syncOn;
    let base = pool;
    if (sinDecidir) {
      const marcadas = pool.filter(tieneTagDefault);
      if (marcadas.length) { base = marcadas; porDefecto = "tag"; cortafuegos = pool.length - marcadas.length; }
      else {
        const emitibles = pool.filter(it => !MOTOR_REFERENCIA.test(String(it.motor || "")));
        if (emitibles.length >= CORTAFUEGOS_MIN) { base = emitibles; porDefecto = "motor"; cortafuegos = pool.length - emitibles.length; }
        else cortafuegos = -1;
      }
    }
    playlist = base.filter(it => matchesSeg(it, SEG_CASA)).slice(0, Math.max(1, CFG.max));
    playlist = defaultOrder(playlist);
    playlist = gridWeave(playlist, grid.items, grid.exact);
    const stockN = playlist.filter(it => !it._grid).length;
    const pz = piezasTxt(stockN);
    const que = porDefecto === "tag" ? T(`lo etiquetado #default (${pz.es})`, `what is tagged #default (${pz.en})`)
      : porDefecto === "motor" ? T(`el Stock sin el material de referencia (${pz.es}; ${cortafuegos} fuera)`, `the Stock without reference material (${pz.en}; ${cortafuegos} left out)`)
      : cortafuegos < 0 ? T(`el catálogo entero (${pz.es}) porque no hay material propio suficiente`, `the whole catalogue (${pz.en}) because there is not enough own material`)
      : T(`el Stock entero (los ${stockN} más nuevos)`, `the whole Stock (the ${stockN} newest)`);
    if (grid.exact) {
      motivo = T(`La parrilla editorial 50/50 de la franja ${bandLabel(grid.band)} manda sola: ${piezasTxt(playlist.length).es} en su orden.`, `The 50/50 editorial grid of the ${bandLabel(grid.band)} slot plays alone: ${piezasTxt(playlist.length).en} in order.`);
    } else if (grid.items.length) {
      const m = motivoParrilla(grid, circuit);
      const anula = defectoTiene ? T(` anula «Por defecto»`, ` overrides the default playlist`) : T(" entra en el bucle", " enters the loop");
      motivo = T(`${m.es}${anula.es}: emite ${que.es} con la parrilla entrelazada cada ${GRID_EVERY} piezas.`, `${m.en}${anula.en}: it plays ${que.en} with the bookings woven in every ${GRID_EVERY} pieces.`);
    } else {
      motivo = T(`Sin «Por defecto», sin sincro y sin parrilla en la franja: emite ${que.es}.`, `No default playlist, no sync and no bookings in the slot: it plays ${que.en}.`);
    }
    // El rótulo es el mismo que pinta setLive() en el player (condLiveLabel + piezas en loop).
    etiqueta = T((mode === "conditional" ? "CONDICIONAL · " : "LIVE · ") + playlist.length + " en loop", (mode === "conditional" ? "CONDITIONAL · " : "LIVE · ") + playlist.length + " in loop");
    if (mode === "conditional") avisos.push({ nivel: "info", ...T("El circuito está en modo condicional: la matriz XPL puede elegir otras piezas según la audiencia o el contexto.", "The circuit is in conditional mode: the XPL matrix may pick other pieces depending on audience or context.") });
  }
  capa("parrilla", grid.items.length ? (fuente === "stock" ? "activa" : "anulada") : "vacia",
    grid.items.length ? (fuente === "stock" ? (grid.exact ? T("Parrilla editorial 50/50: manda sola.", "50/50 editorial grid: it plays alone.") : T(`${reservasTxt(grid.items.length).es} own/paid de la franja ${bandLabel(grid.band)}, entrelazada${grid.items.length === 1 ? "" : "s"} cada ${GRID_EVERY} piezas.`, `${reservasTxt(grid.items.length).en} own/paid in the ${bandLabel(grid.band)} slot, woven in every ${GRID_EVERY} pieces.`))
      : T(`${reservasTxt(grid.items.length).es} en la franja, pero no sale${grid.items.length === 1 ? "" : "n"}: manda ${REF[fuente].es}.`, `${reservasTxt(grid.items.length).en} in the slot, but they do not play: ${REF[fuente].en} rules.`))
      : T(grid.band ? `Sin reservas own/paid con creatividad en la franja ${bandLabel(grid.band)}.` : "Fuera de franja: no hay parrilla a esta hora.", grid.band ? `No own/paid bookings with creative in the ${bandLabel(grid.band)} slot.` : "Outside any slot: no bookings at this time."),
    { n: grid.items.length, franja: grid.band ? { id: grid.band.id, label: grid.band.label, from: grid.band.from, to: grid.band.to } : null, ...(grid.items.length && fuente !== "stock" ? { anuladaPor: fuente } : {}) });
  capa("stock", fuente === "stock" ? "activa" : "anulada", fuente === "stock" ? motivo : T(`Reserva de seguridad: no sale porque manda ${REF[fuente].es}.`, `Safety net: it does not play because ${REF[fuente].en} rules.`), fuente !== "stock" ? { anuladaPor: fuente } : {});

  if (grid.sinCreatividad.length) avisos.push({ nivel: "aviso", ...T(`${reservasTxt(grid.sinCreatividad.length).es} own/paid de la franja sin creatividad: no se emite${grid.sinCreatividad.length === 1 ? "" : "n"} ni anula${grid.sinCreatividad.length === 1 ? "" : "n"} «Por defecto».`, `${grid.sinCreatividad.length} own/paid bookings in the slot have no creative: they neither play nor override the default playlist.`) });
  if (!playlist.length && fuente !== "hashtag") avisos.push({ nivel: "aviso", ...T("La lista sale vacía: la pantalla no tendría nada que emitir.", "The list is empty: the screen would have nothing to play.") });

  // ── Piezas ──
  const ctx = { circuit, band: grid.band, tag: liveTag, syncTxt, porDefecto };
  const dims = input.screenDims || {};
  const screenO = dims.orientation || orientationOf(dims.w, dims.h);
  let segundos = 0, desconocidas = 0, malOrientadas = 0;
  const piezas = playlist.map((it0, i) => {
    const tk = tech[String(it0.id)] || null;
    const it = tk && tk.duration && !it0._dur ? { ...it0, _dur: Math.ceil(tk.duration) } : it0;
    const dur = fuente === "sincro" ? syncItemSec(it, CFG, (sync.remote && sync.remote.slotMs) || 20000) : editorialSec(it);
    if (dur > 0) segundos += dur; else desconocidas += 1;
    const d = pieceDims(it, stockById, tech), st = stockOf(it, stockById);
    let formato = null;
    if (screenO && d.orientation && d.orientation !== "cuadrada" && screenO !== "cuadrada" && d.orientation !== screenO && KIND[it.type] !== "audio") {
      malOrientadas += 1;
      formato = T(`Pieza ${d.orientation === "vertical" ? "vertical" : "horizontal"} en pantalla ${screenO}: saldrá con bandas o recortada.`, `${d.orientation === "vertical" ? "Portrait" : "Landscape"} piece on a ${screenO === "vertical" ? "portrait" : "landscape"} screen: it will be letterboxed or cropped.`);
    }
    return { pos: i + 1, id: String(it.id || ""), stockId: st ? String(st.id) : "", num: st && st.num != null ? st.num : (it._num ?? null), titulo: String(it.title || it.prompt || "sin título").slice(0, 160),
      tipo: String(it.type || "image"), medio: KIND[it.type] || "image", duracion: dur > 0 ? dur : null, url: String(it.url || ""), miniatura: thumbOf(it, stockById),
      carril: String((it._src && it._src.lane) || it._lane || ""), ancho: d.w || null, alto: d.h || null, orientacion: d.orientation || "",
      procedencia: procedenciaDe(fuente, it, ctx), ...(formato ? { formato } : {}) };
  });
  if (malOrientadas) avisos.push({ nivel: "aviso", ...T(`${piezasTxt(malOrientadas).es} no ${malOrientadas === 1 ? "tiene" : "tienen"} la orientación de la pantalla (${screenO}).`, `${malOrientadas} pieces do not match the screen orientation (${screenO}).`) });
  if (!screenO) supuestos.push(T("No se conocen las medidas de la pantalla: no se comprueba la orientación de las piezas.", "Screen size unknown: piece orientation is not checked."));
  if (desconocidas) supuestos.push(T(`${desconocidas} ${desconocidas === 1 ? "vídeo" : "vídeos"} sin duración conocida: el player los emite hasta su final.`, `${desconocidas} videos with unknown duration: the player plays them to the end.`));

  return {
    fuente, motivo, etiqueta, capas, piezas, avisos, supuestos,
    duracionTotal: { segundos, desconocidas, aproximada: desconocidas > 0 },
    franja: grid.band ? { id: grid.band.id, label: grid.band.label, from: grid.band.from, to: grid.band.to } : null,
    pantalla: { screen, orientacion: screenO || "", ancho: Number(dims.w) || null, alto: Number(dims.h) || null, medidas: dims.source || "" },
  };
}

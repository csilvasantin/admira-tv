import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { decide, CFG, MEDIA, KIND, TAG_DEFAULT, CORTAFUEGOS_MIN, SYNC_MASTER_MAX, MOTOR_REFERENCIA, canonicalPlayTag } from "./functions/api/_emision.js";
import { TAG_ALIAS } from "./functions/api/_playlist-live.js";

// /api/emision dice qué emitiría una pantalla replicando rebuild() de canal.html (functions/api/_emision.js).
// Esta prueba es la garantía de que la réplica no se desvía: ejecuta el rebuild() REAL del player en una caja
// (node:vm), alimentado por sus propios loadGrid() y loadDefaultDraft() con las mismas respuestas simuladas de
// /grid/day y /api/playlist, y exige que la fuente (el rótulo de setLive) y el orden de piezas coincidan.
// Si alguien cambia rebuild() o sus ayudantes, esto falla y obliga a actualizar _emision.js.
const canal = await readFile(new URL("./canal.html", import.meta.url), "utf8");

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) {
      const head = source.slice(Math.max(0, start - 6), start);
      return (/async\s+$/.test(head) ? "async " : "") + source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} incompleta`);
}
const constLine = name => {
  const m = new RegExp(`^const ${name}\\s*=.*$`, "m").exec(canal);
  assert.ok(m, `falta const ${name}`);
  return m[0].replace(/^const /, "var ");
};
// La lectura del catálogo tal cual la hace loadFeed(): filtro de medios y orden por fecha.
const feed = /all=\(XTORE_PARENT\?xtoreCatalogItems\(items\):(items\.filter\(i=>i&&MEDIA\.includes\(i\.type\)&&i\.url\))\)\.sort\(([^;]+?)\);/.exec(canal);

const FUNCS = ["rebuild", "defaultOrder", "matchesSeg", "matches", "normTag", "canonicalPlayTag", "tagNeedles", "gridWeave",
  "injectTaggedContent", "freshTailOrder", "syncMasterOrder", "condLiveLabel", "extendedItem", "xtoreMusicItems",
  "xtoreLatestStock", "xtoreMusicRebuild", "loadGrid", "loadDefaultDraft", "madridSlot"];

/** Ejecuta el player real con un escenario y devuelve lo que pondría en antena. */
async function player(sc) {
  const labels = [];
  const els = new Map();
  const $ = id => { if (!els.has(id)) els.set(id, { textContent: "", innerHTML: "", value: "" }); return els.get(id); };
  const fetchStub = async url => {
    const u = String(url);
    const body = u.includes("/grid/day") ? sc.grid : u.includes("/api/playlist") ? sc.draft : null;
    return { ok: body != null, json: async () => body };
  };
  const context = vm.createContext({
    console, URLSearchParams, URL, Date, Math, JSON, Map, Set, Number, String, Array, Object, Promise, Intl,
    fetch: fetchStub, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    navigator: { language: "es-ES" }, innerWidth: 1920, innerHeight: 1080,
    $, labels,
  });
  const preludio = `
    ${constLine("MEDIA")}
    ${constLine("KIND")}
    ${constLine("TAG_ALIAS")}
    ${constLine("TAG_DEFAULT")}
    ${constLine("MOTOR_REFERENCIA")}
    ${constLine("CORTAFUEGOS_MIN")}
    ${constLine("tieneTagDefault")}
    ${constLine("SYNC_MASTER_MAX")}
    ${constLine("GRID_API")}
    var cfg={imgSec:9,audioSec:18,interSec:60,max:50,refreshSec:30};
    var seg={medio:'all',audience:'all',category:'all',age:'all',slot:'all',tag:'',format:''};
    var all=[], playlist=[], cur=-1, timer=null, usesAdv=false, mediaEl=null, _playTok=0;
    var syncOn=false, playoutMode='local', gridInjected=[], gridExactMode=false, _gridSig='·';
    var DEFAULT_DRAFT={items:[],signature:'',ready:false,assigned:false};
    var PREVIEW={on:false,items:[]}, _liveTag=false, URL_TAG='', directOn=false, XTORE_PARENT='', _condPlaylist=false;
    var customOrder=[], FRESH={tail:false,tailIds:[]}, taggedContentNums=[], _extendedAssignment=null;
    var SYNC_REMOTE=null, _syncOwnPlaylist=false, SYNC_MASTER='www.admira.tv/canal';
    var scr={screen:'', circuit:''}, _cortafuegos=0, _porDefecto='', _condFallback=false;
    var _xtoreMusicBase=true, _xtoreMusicItem=null, _xtoreMusicOn=false;
    var pairingReady=Promise.resolve(), qs=new URLSearchParams('');
    var stage={innerHTML:'', querySelector:()=>null}, nowEl={textContent:''}, tap={classList:{add(){},remove(){}}};
    function programScreen(){ return scr.screen; } function programCircuit(){ return scr.circuit; }
    function xtoreMusicEnabled(){ return _xtoreMusicOn; }
    function xtorePublicRead(){ return Promise.reject(new Error('sin puente')); }
    function setLive(t){ labels.push(t); }
    function renderChan(){} function renderRail(){} function schedulePrecache(){} function signagePlaylistPush(){}
    function play(){} function paintExtendedTile(){} function freshCancel(){} function resolveMatrixAssets(){}
    function rtbActive(){ return []; } function gridBadge(){} function emitFrameState(){} function stopBar(){}
    function xtoreMusicRelease(){} function syncIndex(){ return 0; }
    function feedAll(items){ all=${feed[1]}.sort(${feed[2]}); all.forEach(it=>{ it._num=it.num; }); }
  `;
  vm.runInContext(preludio + FUNCS.map(n => functionSource(canal, n)).join("\n"), context);
  const set = (code) => vm.runInContext(code, context);
  context.__sc = sc;
  set(`scr.screen=__sc.screen; scr.circuit=__sc.circuit||__sc.screen; _xtoreMusicOn=!!__sc.xtoreMusic;`);
  set(`feedAll(JSON.parse(JSON.stringify(__sc.stock||[])));`);
  if (sc.grid) await set("loadGrid()");
  if (sc.draft) await set("loadDefaultDraft()");
  // Estado estable: el siguiente refresco del Stock (cada 30 s) deja `all` sin la parrilla inyectada.
  set(`feedAll(JSON.parse(JSON.stringify(__sc.stock||[])));`);
  if (sc.syncOn) set(`syncOn=true; playoutMode='sync'; SYNC_REMOTE=__sc.syncRemote?{items:__sc.syncRemote.items,slotMs:__sc.syncRemote.slotMs||20000,offset:0}:null; _syncOwnPlaylist=!!__sc.syncOwn;`);
  if (sc.conditional) set(`playoutMode='conditional';`);
  if (sc.liveTag) set(`_liveTag=true; seg.tag=canonicalPlayTag(__sc.liveTag);`);
  if (sc.playout) set(`_extendedAssignment=Object.assign({},__sc.playout,{_signature:'x'});`);
  set("rebuild(true)");
  return { ids: JSON.parse(set("JSON.stringify(playlist.map(it=>String(it.id)))")), label: labels[labels.length - 1] || "" };
}

function emision(sc) {
  return decide({ screen: sc.screen, at: AT, circuit: sc.circuit || "", xtoreMusic: !!sc.xtoreMusic, playout: sc.playout || null,
    liveTag: sc.liveTag || "", draft: sc.draft || null, grid: sc.grid || null, stock: sc.stock || [],
    mode: sc.conditional ? "conditional" : sc.syncOn ? "sync" : "local",
    sync: sc.syncOn ? { on: true, why: "remoto", remote: sc.syncRemote || null, own: !!sc.syncOwn } : { on: false } });
}

// ── Escenarios ────────────────────────────────────────────────────────────────────────────────────────────
const AT = Date.parse("2026-10-08T12:30:00+02:00");           // 12:30 en Madrid → franja de mediodía
const iso = d => new Date(Date.parse("2026-10-01T10:00:00Z") + d * 3600_000).toISOString();
const pieza = (i, extra = {}) => ({ id: `s${i}`, num: 100 + i, type: i % 5 === 0 ? "image" : "video", url: `https://api.admira.store/stock/asset/s${i}`,
  title: `Pieza ${i}`, category: ["marca", "producto", "ocio"][i % 3], createdAt: iso(i), motor: "grok-imagine-video", tags: [], ...extra });
const STOCK = Array.from({ length: 70 }, (_, i) => pieza(i + 1));
const STOCK_DEFAULT = STOCK.map((p, i) => i % 7 === 0 ? { ...p, tags: [...p.tags, "Default"] } : p);
const STOCK_REFERENCIA = STOCK.map((p, i) => i % 3 === 0 ? { ...p, motor: "yt-dlp" } : p);
const STOCK_POBRE = STOCK.slice(0, 8).map((p, i) => i < 4 ? { ...p, motor: "Telegram Import" } : p);
const STOCK_RARO = [...STOCK.slice(0, 5), { id: "lnk", type: "link", url: "https://x", createdAt: iso(99) }, { id: "sinurl", type: "video", createdAt: iso(98) }];
const STOCK_MUSICA = STOCK.map((p, i) => i % 4 === 0 ? { ...p, type: "music", tags: ["música", "chill"] } : i % 4 === 1 ? { ...p, tags: ["music"] } : p);

const banda = (id, from, to, slots = []) => ({ id, label: id, from, to, capacity: 6, slots: [...slots, ...Array.from({ length: Math.max(0, 6 - slots.length) }, () => ({ kind: "free", status: "free" }))], isNow: from === "12:00" });
const dia = (slotsMediodia = [], date = "2026-10-08") => ({ ok: true, screen: "alcampo-alcala", date, config: { name: "Alcampo Alcalá", circuit: "alcampo", slotSeconds: 15 },
  bands: [banda("manana", "08:00", "12:00", [{ kind: "paid", status: "sold", bookingId: "bm1", advertiser: "Mañanero", creative: { type: "image", url: "https://cdn/m.jpg" } }]),
    banda("mediodia", "12:00", "16:00", slotsMediodia), banda("tarde", "16:00", "20:00"), banda("noche", "20:00", "23:59")] });
const reserva = (bookingId, kind = "paid", extra = {}) => ({ kind, status: kind === "own" ? "own" : "sold", bookingId, advertiser: "Alcampo", title: "Oferta", creative: { type: "video", url: `https://cdn/${bookingId}.mp4` }, ...extra });
const DRAFT = { ok: true, draft: { screen: "alcampo-alcala", playlist: "default", name: "Por defecto", rev: 3, items: [
  { id: "a", stockId: "s3", title: "Manual A", lane: "publicidad", seconds: 12, asset: "https://api.admira.store/stock/asset/s3", assetType: "video" },
  { id: "b", stockId: "s5", title: "Manual B", lane: "municipal", seconds: 8, asset: "https://api.admira.store/stock/asset/s5", assetType: "image" },
  { id: "c", stockId: "", title: "Sin URL", seconds: 8, asset: "", assetType: "image" },
] }, screenTags: ["todas"], auto: [
  { id: "stock-s9", stockId: "s9", title: "Dirigida", sub: "destino · #alcampo_alcala", seconds: 10, asset: "https://api.admira.store/stock/asset/s9", assetType: "video" },
  { id: "stock-s3", stockId: "s3", title: "Repetida", sub: "destino · #alcampo_alcala", seconds: 10, asset: "https://api.admira.store/stock/asset/s3", assetType: "video" },
] };
const VACIO = { ok: true, draft: { screen: "alcampo-alcala", playlist: "default", items: [], rev: 0 }, screenTags: [], auto: [] };

const ESCENARIOS = {
  "Stock con #default": { screen: "alcampo-alcala", stock: STOCK_DEFAULT, grid: dia(), draft: VACIO, fuente: "stock" },
  "Stock con cortafuegos por procedencia": { screen: "alcampo-alcala", stock: STOCK_REFERENCIA, grid: dia(), draft: VACIO, fuente: "stock" },
  "Stock entero cuando el cortafuegos dejaría la pantalla muda": { screen: "alcampo-alcala", stock: STOCK_POBRE, draft: VACIO, fuente: "stock" },
  "Stock que filtra tipos y piezas sin URL": { screen: "alcampo-alcala", stock: STOCK_RARO, fuente: "stock" },
  "Por defecto con piezas a mano y dirigidas": { screen: "alcampo-alcala", stock: STOCK, grid: dia(), draft: DRAFT, fuente: "defecto" },
  "Por defecto anulada por una reserva paid heredada": { screen: "alcampo-alcala", circuit: "alcampo", stock: STOCK_DEFAULT, draft: DRAFT,
    grid: dia([reserva("def-alcampo-77"), reserva("def-alcampo-77"), reserva("p2", "own")]), fuente: "stock" },
  "Reserva own/paid sin creatividad no anula Por defecto": { screen: "alcampo-alcala", stock: STOCK, draft: DRAFT,
    grid: dia([{ kind: "paid", status: "sold", bookingId: "x", advertiser: "Sin pieza", creative: null }]), fuente: "defecto" },
  "Parrilla de otro día no cuenta": { screen: "alcampo-alcala", stock: STOCK, draft: DRAFT, grid: { ...dia([reserva("ayer")]), date: "2026-10-07", bands: dia([reserva("ayer")]).bands.map(b => ({ ...b, isNow: false })) }, fuente: "defecto" },
  "Parrilla editorial 50/50 manda sola": { screen: "alcampo-alcala", stock: STOCK, draft: VACIO,
    grid: dia([reserva("m2", "own", { playlistId: "municipal-50-50", position: 2 }), reserva("m1", "paid", { playlistId: "municipal-50-50", position: 1 })]), fuente: "stock" },
  "Hashtag del mando con alias": { screen: "alcampo-alcala", stock: STOCK_MUSICA, draft: DRAFT, grid: dia([reserva("p1")]), liveTag: "Music", fuente: "hashtag" },
  "Hashtag del mando sin piezas": { screen: "alcampo-alcala", stock: STOCK, draft: DRAFT, liveTag: "inexistente", fuente: "hashtag" },
  "Sincro con el máster anula Por defecto": { screen: "alcampo-alcala", stock: STOCK, draft: DRAFT, grid: dia([reserva("p1")]), syncOn: true,
    syncRemote: { slotMs: 20000, items: [{ id: "m1", url: "https://x/1.mp4", type: "video", dur: 12 }, { id: "m2", url: "https://x/2.jpg", type: "image" }] }, fuente: "sincro" },
  "Sincro por tema propio del kiosko": { screen: "kiosko-1", stock: STOCK, draft: DRAFT, syncOn: true, syncOwn: true,
    syncRemote: { items: [{ id: "t1", url: "https://x/t1.mp4", type: "video", _dur: 30 }] }, fuente: "sincro" },
  "Sincro sin máster ordena por su cuenta": { screen: "alcampo-alcala", stock: STOCK, draft: VACIO, syncOn: true, fuente: "sincro" },
  "Mural extendido": { screen: "wall-2", stock: STOCK, draft: DRAFT, grid: dia([reserva("p1")]),
    playout: { ok: true, configured: true, mode: "extended", screen: "wall-2", item: { id: "w1", url: "https://x/w.mp4", type: "video", title: "Mural", num: 9 }, tile: { index: 1, total: 4, row: 0, col: 1, rows: 2, cols: 2 } }, fuente: "mural" },
  "Condicional sin parrilla": { screen: "alcampo-alcala", stock: STOCK_REFERENCIA, draft: VACIO, conditional: true, fuente: "stock" },
  "Xtore con playlist asociada": { screen: "xtore-virtual-zapatillas", xtoreMusic: true, stock: STOCK_MUSICA,
    draft: { ok: true, draft: { screen: "xtore-virtual-zapatillas", playlist: "default", rev: 1, items: [
      { id: "x1", stockId: "s1", title: "Canción", seconds: 10, asset: "https://api.admira.store/stock/asset/s1", assetType: "audio" },
      { id: "x2", stockId: "s2", title: "Locución", seconds: 10, asset: "https://api.admira.store/stock/asset/s2", assetType: "locucion" },
      { id: "x3", stockId: "s6", title: "Vídeo", seconds: 10, asset: "http://inseguro/x.mp4", assetType: "video" }] } }, fuente: "xtore" },
  "Xtore sin playlist: lo último de #musica": { screen: "xtore-virtual-zapatillas", xtoreMusic: true, stock: STOCK_MUSICA,
    draft: { ok: true, draft: { screen: "xtore-virtual-zapatillas", playlist: "default", rev: 0, items: [] } }, fuente: "xtore" },
};

test("las constantes de la réplica son las del player", () => {
  const ctx = vm.createContext({});
  vm.runInContext(["MEDIA", "KIND", "TAG_ALIAS", "TAG_DEFAULT", "CORTAFUEGOS_MIN", "SYNC_MASTER_MAX", "MOTOR_REFERENCIA"].map(constLine).join("\n") +
    "\nglobalThis.out={MEDIA,KIND,TAG_ALIAS,TAG_DEFAULT,CORTAFUEGOS_MIN,SYNC_MASTER_MAX,MOTOR:String(MOTOR_REFERENCIA)};", ctx);
  const out = JSON.parse(JSON.stringify(ctx.out));
  assert.deepEqual(out.MEDIA, MEDIA);
  assert.deepEqual(out.KIND, KIND);
  assert.deepEqual(out.TAG_ALIAS, TAG_ALIAS);
  assert.equal(out.TAG_DEFAULT, TAG_DEFAULT);
  assert.equal(out.CORTAFUEGOS_MIN, CORTAFUEGOS_MIN);
  assert.equal(out.SYNC_MASTER_MAX, SYNC_MASTER_MAX);
  assert.equal(out.MOTOR, String(MOTOR_REFERENCIA));
  // Los valores por defecto de la pantalla (sin ?img=, ?audio=, ?max=, ?inter=)
  assert.match(canal, /imgSec:\+\(qs\.get\('img'\)\|\|LS\('adtv_img',9\)\)/);
  assert.match(canal, /audioSec:\+\(qs\.get\('audio'\)\|\|LS\('adtv_audio',18\)\)/);
  assert.match(canal, /max:\+\(qs\.get\('max'\)\|\|LS\('adtv_max',50\)\)/);
  assert.match(canal, /interSec:\+\(qs\.get\('inter'\)\|\|LS\('adtv_inter',60\)\)/);
  assert.deepEqual([CFG.imgSec, CFG.audioSec, CFG.max, CFG.interSec], [9, 18, 50, 60]);
  assert.ok(feed, "loadFeed ya no filtra el catálogo como espera la réplica");
  assert.equal(canonicalPlayTag("#Música"), "musica");
});

for (const [nombre, sc] of Object.entries(ESCENARIOS)) {
  test(`mismo resultado que canal.html · ${nombre}`, async () => {
    const real = await player(sc);
    const rep = emision(sc);
    assert.equal(rep.fuente, sc.fuente, `fuente esperada ${sc.fuente}`);
    assert.deepEqual(rep.piezas.map(p => p.id), real.ids, "orden de piezas distinto al del player");
    assert.equal(rep.etiqueta.es, real.label, "rótulo distinto al del player");
  });
}

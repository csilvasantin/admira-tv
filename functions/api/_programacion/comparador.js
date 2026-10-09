// COMPARADOR DEL MODO SOMBRA (E6 · modelo único de playlists, docs/playlists-modelo-unico.md). Puro: sin red, sin KV,
// sin D1 y sin reloj (el instante llega como dato).
//
// Para la misma pantalla y el mismo instante recibe:
//   · lo que decide hoy el legado: decide() de _emision.js, la réplica de rebuild() de canal.html;
//   · lo que resolvería el motor nuevo: resolver() de resolver.js;
//   · la respuesta de /api/playlist que recibió el player (su «Por defecto»), el día de /grid/day que vio decide() y
//     los días de parrilla que leyó el motor nuevo (víspera, día y siguiente).
// Devuelve una firma normalizada de cada lado y un veredicto:
//   · igual        las dos firmas coinciden;
//   · equivalente  difieren sólo en lo que el diseño cambia a propósito (el motivo dice cuál);
//   · distinta     difieren sin explicación: es lo que hay que revisar antes del corte (E13).
//
// FIRMA. Capa normalizada, si la lista es exacta, la cadencia de los spots y las claves de las piezas en orden. La clave
// de una pieza es su reserva (grid:<booking>) si viene de la parrilla y, si no, su asset (a:<url>): los dos lados lo
// llevan siempre, y el stockId del legado depende de que la pieza siga entre las 300 de /stock/list. Cuando un lado no
// decide la lista (el Stock de reserva del player en el legado, la capa relleno en el motor nuevo), su firma lleva
// sólo los spots: no depende del catálogo, así que no cambia con cada pieza nueva del Stock (y no gasta escrituras).
import { GRID_EVERY, bandLabel, defaultDraftItems, gridInjectedFrom, hhmmMin, madridClock } from "../_emision.js";
import { sumarDias } from "./horario.js";

export const VEREDICTOS = Object.freeze(["igual", "equivalente", "distinta"]);
/** Columna sombra.coincide: 1 igual (las firmas coinciden, el sentido original), 2 equivalente, 0 distinta. */
export const COINCIDE = Object.freeze({ distinta: 0, igual: 1, equivalente: 2 });
export const VEREDICTO_DE = Object.freeze({ 0: "distinta", 1: "igual", 2: "equivalente" });
/** Motivos posibles por veredicto (el panel los traduce). */
export const MOTIVOS = Object.freeze({
  igual: ["misma_lista"],
  equivalente: ["relleno_del_player", "parrilla_intercala", "parrilla_vendida", "franja_nocturna_de_ayer", "viva_directa_gana",
    "rundown_exacto", "orquestacion_por_encima"],
  distinta: ["capa_distinta", "nuevo_vacio", "solo_en_nuevo", "piezas_distintas", "orden_distinto", "spots_distintos",
    "cadencia_distinta", "exacta_distinta"],
});

// Capas del legado que no son una playlist: sincro, mural extendido y música de Xtore mandan por encima de todo.
const ORQUESTACION = new Set(["sincro", "mural", "xtore"]);
const PAGADO = new Set(["paid", "sold", "accepted"]);
const MAX_CLAVES = 12, MAX_DIF = 8;

// ── Claves ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** Clave de una pieza de cualquiera de los dos lados: grid:<booking> para la parrilla; si no, a:<asset>. */
export function clave(p) {
  const id = String((p && p.id) || "");
  if (id.startsWith("grid:")) return id;
  const url = String((p && (p.asset || p.url)) || "").trim();
  return url ? "a:" + url : "i:" + id;
}
/** La clave en corto, para enseñar: la reserva, el id del Stock que va en la URL o el nombre del fichero. */
export function corta(k) {
  const s = String(k || "");
  if (s.startsWith("grid:")) return s.slice(0, 40);
  if (s.startsWith("a:")) {
    const u = s.slice(2), m = /\/stock\/([^/?#]+)\//.exec(u);
    if (m) return m[1].slice(0, 32);
    return (u.split(/[?#]/)[0].split("/").filter(Boolean).pop() || u).slice(0, 32);
  }
  return s.slice(2, 34);
}
const unicas = lista => [...new Set(lista)];
const mismaLista = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const mismoConjunto = (a, b) => { const A = new Set(a), B = new Set(b); return A.size === B.size && [...A].every(x => B.has(x)); };
const contenida = (a, b) => { const B = new Set(b); return a.every(x => B.has(x)); };
const resta = (a, b) => { const B = new Set(b); return unicas(a.filter(x => !B.has(x))); };
/** FNV-1a de 32 bits en hexadecimal: basta para saber si una firma cambió. */
export function huella(texto) {
  let h = 0x811c9dc5;
  for (const ch of String(texto)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

// ── Vistas normalizadas de cada lado ────────────────────────────────────────────────────────────────────────────
/**
 * El legado normalizado. `dia` es el /grid/day que vio decide(): con gridInjectedFrom (la misma función) se sabe la
 * franja, sus reservas y si el rundown 50/50 manda solo. `borrador` es la respuesta de /api/playlist del player: lo
 * que sería su «Por defecto» aunque la parrilla o la sincro la anulen.
 */
export function vistaLegado(decision, { borrador = null, dia = null, at = 0 } = {}) {
  const d = decision || {}, fuente = String(d.fuente || "");
  const piezas = Array.isArray(d.piezas) ? d.piezas : [];
  const parrilla = gridInjectedFrom(dia, at), orden = piezas.map(clave);
  const v = { lado: "legado", fuente, capa: fuente || "desconocida", exacta: false, relleno: false, origen: "stock", base: [], spots: [],
    cadencia: null, orden, n: piezas.length, banda: parrilla.band,
    borrador: defaultDraftItems(borrador && borrador.ok !== false ? borrador : null).map(clave) };
  if (fuente === "defecto") { v.capa = "por_defecto"; v.base = orden; }
  else if (fuente === "stock" && parrilla.exact) { v.capa = "propia"; v.exacta = true; v.base = orden; }
  else if (fuente === "stock") {
    // El Stock de reserva del player con la parrilla entrelazada cada 4: la lista la pone el player, no una playlist.
    v.capa = "relleno"; v.relleno = true; v.spots = unicas(orden.filter(k => k.startsWith("grid:")));
    v.cadencia = v.spots.length ? GRID_EVERY : null;
  } else if (fuente === "hashtag") { v.capa = "mando"; v.base = orden; }
  return v;
}

/** El motor nuevo normalizado (salida de resolver()). Sin piezas es la capa relleno: el player teje su propio relleno. */
export function vistaNueva(r) {
  const items = Array.isArray(r && r.items) ? r.items : [], exacta = !!(r && r.exacta);
  const spots = exacta ? [] : unicas((Array.isArray(r && r.spots) ? r.spots : []).map(clave));
  const relleno = !items.length;
  return { lado: "nuevo", capa: relleno ? "relleno" : String((r && r.capa) || "relleno"), exacta, relleno, origen: "player",
    base: items.filter(i => !(i && i.spot)).map(clave), spots, cadencia: spots.length ? (Number(r && r.cadencia) || GRID_EVERY) : null,
    orden: items.map(clave), n: items.length, nombre: String((r && r.nombre) || ""), ids: Array.isArray(r && r.base) ? r.base : [],
    fuentes: Array.isArray(r && r.fuentes) ? r.fuentes : [] };
}

/** El texto canónico de la firma: lo que se compara. */
export function textoFirma(v) {
  if (ORQUESTACION.has(v.capa)) return v.capa === "mural" ? "mural|" + v.orden.join(",") : v.capa;
  if (v.relleno) return `relleno|${v.origen}|cad:${v.cadencia ?? "-"}|spots:${v.spots.join(",")}`;
  return `${v.capa}|exacta:${v.exacta ? 1 : 0}|cad:${v.cadencia ?? "-"}|items:${v.orden.join(",")}`;
}
/** La firma en corto para guardar y enseñar: capa · tamaño · huella (por ejemplo «por_defecto·12p+2s·9f3a2c1b»). */
export function firmaCorta(v, texto = textoFirma(v)) {
  const tam = v.relleno ? `${v.origen}+${v.spots.length}s` : `${v.orden.length}p${v.spots.length ? "+" + v.spots.length + "s" : ""}`;
  return `${v.capa}·${tam}·${huella(texto)}`;
}

// ── Parrilla: lo que el diseño cambia a propósito ───────────────────────────────────────────────────────────────
/**
 * ¿Estamos en la madrugada de una franja que cruza la medianoche (desviación 15)? El legado toma, por los minutos,
 * la franja del documento de HOY (gridBandIsNow), que empieza esta noche; el motor nuevo toma la de AYER, que es la
 * que empezó. Si la víspera y el día no venden lo mismo, los spots difieren por diseño.
 */
export function franjaNocturna({ dia = null, parrilla = [], at = 0 } = {}) {
  const reloj = madridClock(at);
  const cruza = b => !!(b && b.from && b.to && hhmmMin(b.to) <= hhmmMin(b.from) && reloj.min < hhmmMin(b.to));
  if (cruza(gridInjectedFrom(dia, at).band)) return true;
  const ayer = sumarDias(reloj.date, -1), doc = (Array.isArray(parrilla) ? parrilla : []).find(x => x && x.date === ayer);
  return !!(doc && Array.isArray(doc.bands) && doc.bands.some(cruza));
}
/**
 * Reservas de la franja que el motor nuevo teje y el legado no ve (decisión 1): canal.html sólo toma kind own o paid;
 * el motor nuevo toma también sold y accepted, y el estado cuando falta el kind. Devuelve sus claves grid:<booking>.
 */
export function vendidasSinKind(banda) {
  const out = new Set();
  for (const s of (banda && Array.isArray(banda.slots)) ? banda.slots : []) {
    if (!s || !s.creative || !/^https?:\/\//i.test(String(s.creative.url || ""))) continue;
    const kind = String(s.kind || ""), status = String(s.status || "");
    if (kind === "own" || kind === "paid") continue;
    if ((!kind && status === "own") || PAGADO.has(kind) || PAGADO.has(status)) out.add("grid:" + String(s.bookingId || s.creative.url).slice(0, 150));
  }
  return out;
}

// ── Clasificación ───────────────────────────────────────────────────────────────────────────────────────────────
function clasificar(L, N, ctx) {
  const vendidas = vendidasSinKind(L.banda);
  const spotsSoloNuevo = resta(N.spots, L.spots), spotsSoloLegado = resta(L.spots, N.spots);
  const nVendidas = spotsSoloNuevo.filter(k => vendidas.has(k)).length;
  const spotsCasan = !spotsSoloLegado.length && nVendidas === spotsSoloNuevo.length;
  const cadenciaCasa = !N.spots.length || N.cadencia === GRID_EVERY;
  const nocturna = franjaNocturna(ctx);
  // La base del legado: lo que emite o, si la parrilla lo anula, lo que sería su «Por defecto».
  const baseLegado = L.relleno ? L.borrador : L.base, baseNueva = N.base.filter(k => !k.startsWith("grid:"));
  const borradorCasa = mismaLista(baseNueva, L.borrador);
  const dif = extra => ({
    base: { soloLegado: resta(baseLegado, N.base).slice(0, MAX_DIF).map(corta), soloNuevo: resta(N.base, baseLegado).slice(0, MAX_DIF).map(corta) },
    spots: { soloLegado: spotsSoloLegado.slice(0, MAX_DIF).map(corta), soloNuevo: spotsSoloNuevo.slice(0, MAX_DIF).map(corta) },
    ...(nVendidas ? { vendidas: nVendidas } : {}), ...(nocturna ? { nocturna: true } : {}), ...extra });
  const eq = (motivo, extra = {}) => ({ equivalente: true, motivo, diferencia: dif(extra) });
  const dist = (motivo, extra = {}) => ({ equivalente: false, motivo, diferencia: dif(extra) });
  const porSpots = () => dist(spotsCasan ? "cadencia_distinta" : "spots_distintos");
  const porPiezas = (a, b) => dist(mismoConjunto(a, b) ? "orden_distinto" : "piezas_distintas");
  // Decisión 3: una viva que sólo nombra pantallas es directa y deja fuera a las de grupo (el legado las fundía todas).
  const vivaDirecta = baseNueva.length > 0 && contenida(baseNueva, baseLegado) && !mismaLista(baseNueva, baseLegado)
    && N.fuentes.some(f => f && f.papel === "eclipsada" && /^viva-/.test(String(f.playlist || f.id || "")));

  // 0 · Sincro, mural extendido o música de Xtore: orquestación por encima de cualquier playlist, fuera del modelo.
  if (ORQUESTACION.has(L.capa)) return eq("orquestacion_por_encima", { fuente: L.fuente });
  // 1 · Relleno en los dos lados: el Stock de reserva del legado frente a la capa relleno (paso 9: el relleno lo pone
  //     el player). Sólo cuentan los spots que se le tejen encima.
  if (L.relleno && N.relleno) {
    if (spotsCasan && cadenciaCasa) return eq("relleno_del_player");
    return nocturna ? eq("franja_nocturna_de_ayer") : porSpots();
  }
  // 2 · Madrugada de una franja nocturna: si lo que no es parrilla casa, la diferencia es la franja de ayer.
  if (nocturna && borradorCasa) return eq("franja_nocturna_de_ayer");
  // 3 · El motor nuevo se queda sin base y el legado tiene una.
  if (N.relleno) return dist("nuevo_vacio");
  // 4 · El rundown 50/50 es base exacta (desviación 6): lo que el legado entrelazaba con él no entra.
  if (N.exacta && N.capa === "propia" && N.base.length && N.base.every(k => k.startsWith("grid:")) && !L.exacta && contenida(N.base, L.spots)) {
    return eq("rundown_exacto");
  }
  // 5 · El legado emite su Stock de reserva con la parrilla: «Por defecto» anulada por la parrilla (o no hay ninguna).
  if (L.relleno) {
    if (!L.borrador.length) return dist("solo_en_nuevo");
    if (N.capa !== "por_defecto") return dist("capa_distinta");
    if (!borradorCasa && !vivaDirecta) return porPiezas(baseNueva, L.borrador);
    if (!(spotsCasan && cadenciaCasa)) return porSpots();
    // Decisión 1: los spots de la parrilla ya no borran «Por defecto», se intercalan.
    return vivaDirecta ? eq("viva_directa_gana", { tambien: "parrilla_intercala" }) : eq("parrilla_intercala");
  }
  // 6 · El rundown 50/50 manda solo en el legado.
  if (L.exacta) return N.exacta ? porPiezas(N.orden, L.orden) : dist("capa_distinta");
  // 7 · «Por defecto» en el legado (sin sincro ni reservas own/paid con creatividad en la franja).
  if (L.capa === "por_defecto") {
    if (N.capa !== "por_defecto") return dist("capa_distinta");
    if (N.exacta !== L.exacta) return dist("exacta_distinta");
    if (mismaLista(N.base, L.base)) return N.spots.length && spotsCasan && cadenciaCasa ? eq("parrilla_vendida") : porSpots();
    if (vivaDirecta && (!N.spots.length || spotsCasan)) return eq("viva_directa_gana");
    return porPiezas(N.base, L.base);
  }
  return dist("capa_distinta");
}

/**
 * Compara los dos lados. Entrada: {at, nuevo (resolver), legado (decide), borrador (respuesta de /api/playlist),
 * dia (el /grid/day de decide), parrilla (los días del motor nuevo)}. Salida: {veredicto, motivo, coincide, capa,
 * firmaLegado, firmaNueva, detalle} — `detalle` es lo que se guarda en sombra.detalle (sin emails).
 */
export function comparar({ at = 0, nuevo = null, legado = null, borrador = null, dia = null, parrilla = [] } = {}) {
  const L = vistaLegado(legado, { borrador, dia, at }), N = vistaNueva(nuevo);
  const tL = textoFirma(L), tN = textoFirma(N);
  const c = tL === tN ? { equivalente: false, motivo: "misma_lista", diferencia: null } : clasificar(L, N, { dia, parrilla, at });
  const veredicto = tL === tN ? "igual" : c.equivalente ? "equivalente" : "distinta";
  const firmaLegado = firmaCorta(L, tL), firmaNueva = firmaCorta(N, tN);
  return {
    veredicto, motivo: c.motivo, coincide: COINCIDE[veredicto], capa: N.capa, firmaLegado, firmaNueva,
    detalle: {
      veredicto, motivo: c.motivo,
      legado: { fuente: L.fuente, capa: L.capa, n: L.n, spots: L.spots.length, cadencia: L.cadencia, firma: firmaLegado,
        franja: L.banda ? bandLabel(L.banda) : "", claves: (L.relleno ? L.spots : L.orden).slice(0, MAX_CLAVES).map(corta) },
      nuevo: { capa: N.capa, nombre: N.nombre.slice(0, 80), n: N.n, spots: N.spots.length, cadencia: N.cadencia, firma: firmaNueva,
        base: N.ids.slice(0, 6), claves: (N.relleno ? N.spots : N.orden).slice(0, MAX_CLAVES).map(corta) },
      ...(c.diferencia ? { diferencia: c.diferencia } : {}),
    },
  };
}

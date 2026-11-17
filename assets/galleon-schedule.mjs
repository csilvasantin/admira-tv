// Horario del Corsair Galleon 100 SD en modo autónomo (encargo #7569, Neo, 13-nov-2026).
// El teclado tiene DOS superficies (LCD 16:9 arriba, el player; las 12 teclas, el navegador de la playlist) y UNA playlist propia
// (la del mando, /api/playlist?screen=corsair-galleon-100). Aquí se empareja cada pieza con su versión de la
// otra orientación y se decide qué va en antena en cada instante a partir del reloj del servidor, de modo que
// el teclado físico y el gemelo 3D de admira.store pinten lo mismo sin hablarse entre ellos.

const FORMAT_SUFFIX = /\s*(?:·|-|–|—|\|)\s*(?:admira|adaptaci[oó]n|subt[ií]tulos(?: [a-z]{2})?|16:9|9:16|4:3|3:4|horizontal|vertical|landscape|portrait|apaisad[oa]|formato[- ]altern[oa])\s*$/i;

/** Orientación de una pieza de playlist o del Stock: por etiquetas, por campo o por medidas. */
export function orientationOf(item) {
  const tags = Array.isArray(item?.tags) ? item.tags.map(tag => String(tag || '').toLowerCase()) : [];
  if (tags.includes('vertical') || tags.includes('portrait')) return 'portrait';
  if (tags.includes('horizontal') || tags.includes('landscape')) return 'landscape';
  const declared = String(item?.orientacion || item?.orientation || '').toLowerCase();
  if (declared === 'vertical' || declared === 'portrait') return 'portrait';
  if (declared === 'horizontal' || declared === 'landscape') return 'landscape';
  const width = Number(item?.width ?? item?.ancho), height = Number(item?.height ?? item?.alto);
  if (width > 0 && height > 0 && width !== height) return width > height ? 'landscape' : 'portrait';
  return '';
}

/** Título sin los sufijos de formato («· Adaptación · 16:9 · Admira», «· 9:16»…): la familia de la pieza. */
export function familyKey(item) {
  let key = String(item?.title || '').toLowerCase().normalize('NFC');
  let previous;
  do { previous = key; key = key.replace(FORMAT_SUFFIX, ''); } while (key !== previous);
  return key.replace(/\s+/g, ' ').trim();
}

function idsOf(item) {
  const ids = new Set();
  for (const value of [item?.id, item?.stockId]) if (value) ids.add(String(value));
  return ids;
}

function linksOf(item) {
  const links = new Set();
  if (item?.externalRef) links.add(String(item.externalRef));
  for (const tag of Array.isArray(item?.tags) ? item.tags : []) {
    const match = /^par-(.+)$/i.exec(String(tag || ''));
    if (match) links.add(match[1]);
  }
  return links;
}

/** Dos piezas están enlazadas si una apunta a la otra (externalRef o etiqueta par-<id>). */
export function linked(a, b) {
  const idsA = idsOf(a), idsB = idsOf(b);
  for (const link of linksOf(a)) if (idsB.has(link)) return true;
  for (const link of linksOf(b)) if (idsA.has(link)) return true;
  return false;
}

const secondsOf = item => Math.max(0, Number(item?.seconds) || 0);
const opposite = orientation => orientation === 'landscape' ? 'portrait' : 'landscape';

/**
 * Convierte la playlist en turnos H·V. Cada pieza busca su pareja de la otra orientación: primero la enlazada,
 * luego la de la misma familia (mismo título sin formato), luego la vecina inmediata. Sin pareja, la misma pieza
 * ocupa las dos superficies. El turno dura lo que la versión más larga.
 */
export function pairPlaylist(items) {
  const rows = (Array.isArray(items) ? items : []).filter(item => item && typeof item === 'object')
    .map((item, index) => ({ item, index, orientation: orientationOf(item), used: false }));
  const slots = [];
  for (const row of rows) {
    if (row.used) continue;
    row.used = true;
    let mate = null;
    if (row.orientation) {
      const candidates = rows.filter(other => !other.used && other.orientation === opposite(row.orientation));
      mate = candidates.find(other => linked(row.item, other.item))
        || candidates.find(other => familyKey(other.item) && familyKey(other.item) === familyKey(row.item))
        || candidates.find(other => other.index === row.index + 1)
        || null;
    }
    if (mate) mate.used = true;
    const [landscape, portrait] = row.orientation === 'portrait' ? [mate?.item ?? null, row.item] : [row.item, mate?.item ?? null];
    slots.push({
      title: String(row.item.title || mate?.item?.title || ''),
      landscape: landscape || portrait,
      portrait: portrait || landscape,
      paired: Boolean(mate),
      seconds: Math.max(secondsOf(row.item), secondsOf(mate?.item), 2),
      // Pieza dirigida por etiqueta (lista `auto` de la API): llega con 10 s fijos; el player aprende la duración real del vídeo.
      guessed: Boolean(row.item.secondsGuessed || mate?.item?.secondsGuessed),
    });
  }
  return slots;
}

export function cycleMs(slots) {
  return (Array.isArray(slots) ? slots : []).reduce((sum, slot) => sum + Math.round(slot.seconds * 1000), 0);
}

/** Turno en antena en el instante nowMs (reloj del servidor): el ciclo se ancla a la época, no a quien arranca. */
export function slotAt(slots, nowMs) {
  const total = cycleMs(slots);
  if (!total || !Number.isFinite(nowMs)) return null;
  let t = ((nowMs % total) + total) % total;
  for (let index = 0; index < slots.length; index++) {
    const duration = Math.round(slots[index].seconds * 1000);
    if (t < duration) return { index, slot: slots[index], offsetMs: t, total: slots.length };
    t -= duration;
  }
  return null;
}

/** Página de 12 contenidos en orden, incluyendo el actual; sobrantes apagados. */
export function navigatorWindow(total, index) {
  const valid = Number.isInteger(total) && total > 0 && Number.isInteger(index) && index >= 0 && index < total;
  const start = Math.floor(index / 12) * 12;
  return Array.from({ length: 12 }, (_, key) => valid && start + key < total ? start + key : null);
}

/** Milisegundos que hay que sumar al reloj para que el turno `index` empiece justo ahora (salto por tecla). */
export function jumpOffsetMs(slots, index, nowMs) {
  const total = cycleMs(slots);
  if (!total || !Number.isInteger(index) || index < 0 || index >= slots.length || !Number.isFinite(nowMs)) return 0;
  let start = 0;
  for (let i = 0; i < index; i++) start += Math.round(slots[i].seconds * 1000);
  const t = ((nowMs % total) + total) % total;
  return start - t;
}

const TAG_KEY = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^#/, '').replace(/^pantalla:/, '').trim();

/**
 * Piezas del índice del Stock etiquetadas con el nombre de la pantalla («corsair-galleon-100», también «#…» o
 * «pantalla:…»), como piezas de playlist (Carlos, 16-nov-2026). Se leen del índice directamente para que valga cualquier
 * otra etiqueta libre de la pieza (el direccionamiento de la API descarta las que no conoce). Sin duración conocida
 * (`secondsGuessed`): el player toma la del vídeo. Fuera las ocultas y lo que no sea vídeo, imagen o animación.
 */
export function taggedForScreen(stock, screen) {
  const key = TAG_KEY(screen);
  if (!key) return [];
  const accepted = new Set(key === 'corsair-galleon-100' ? [key, 'corsair', 'galleon'] : [key]);
  return (Array.isArray(stock) ? stock : []).filter(piece => piece && typeof piece === 'object' && !piece.oculto
      && ['video', 'image', 'animation'].includes(String(piece.type || '').toLowerCase()) && /^https:\/\//.test(String(piece.url || ''))
      && (Array.isArray(piece.tags) ? piece.tags : []).some(tag => accepted.has(TAG_KEY(tag))))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(piece => ({ id: String(piece.id), stockId: String(piece.id), title: String(piece.title || ''), seconds: Number(piece.seconds) > 0 ? Number(piece.seconds) : 10,
      secondsGuessed: !(Number(piece.seconds) > 0), asset: String(piece.url), assetType: String(piece.type).toLowerCase(), tags: (piece.tags || []).map(String),
      width: Number(piece.width) || 0, height: Number(piece.height) || 0 }));
}

/**
 * Milisegundos que hay que sumar al reloj para que el turno `index` lleve `offsetMs` en este instante: continuidad
 * cuando cambia la playlist o una duración (el ciclo anclado a la época saltaría a cualquier sitio si no).
 */
export function rebaseMs(slots, index, offsetMs, nowMs) {
  const base = jumpOffsetMs(slots, index, nowMs);
  const duration = Math.round((slots?.[index]?.seconds || 0) * 1000);
  return base + Math.max(0, Math.min(Number(offsetMs) || 0, Math.max(0, duration - 1)));
}

/** Pista reproducible (misma forma que una pieza del playout) a partir de una pieza de playlist o del Stock. */
export function trackOf(item) {
  if (!item) return null;
  const url = String(item.asset || item.url || '');
  const type = String(item.assetType || item.type || '').toLowerCase();
  if (!/^https:\/\//.test(url) || !['video', 'image', 'animation'].includes(type)) return null;
  return { id: String(item.stockId || item.id || ''), type, url, title: String(item.title || '') };
}

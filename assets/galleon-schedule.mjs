// Horario del Corsair Galleon 100 SD en modo autónomo (encargo #7569, Neo, 13-nov-2026).
// El teclado tiene DOS superficies (LCD 16:9 arriba y mosaico 9:16 en las 12 teclas) y UNA playlist propia
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

/** Pista reproducible (misma forma que una pieza del playout) a partir de una pieza de playlist o del Stock. */
export function trackOf(item) {
  if (!item) return null;
  const url = String(item.asset || item.url || '');
  const type = String(item.assetType || item.type || '').toLowerCase();
  if (!/^https:\/\//.test(url) || !['video', 'image', 'animation'].includes(type)) return null;
  return { id: String(item.stockId || item.id || ''), type, url, title: String(item.title || '') };
}

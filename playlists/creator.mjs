// Lógica pura del creador de playlists (FLT-101265).
// La página /playlists/index.html la importa; node --test la cubre sin DOM.

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const WEEKDAY_MAP = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };
const CAPSULE_RE = /conocimiento|c[aá]psula|capsula|knowledge|sabias|sabías/i;

export function normTag(value) {
  return String(value || '').trim().toLowerCase().replace(/^#+/, '');
}

export function itemTags(item) {
  const tags = Array.isArray(item && item.tags) ? item.tags : [];
  return tags.map(normTag).filter(Boolean);
}

export function itemFormat(item) {
  const tags = itemTags(item);
  if (tags.includes('vertical') || item?.orientacion === 'vertical') return 'vertical';
  if (tags.includes('horizontal') || item?.orientacion === 'horizontal') return 'horizontal';
  const w = Number(item?.ancho || item?.width || 0);
  const h = Number(item?.alto || item?.height || 0);
  if (w > 0 && h > 0) return h > w ? 'vertical' : 'horizontal';
  return '';
}

export function itemLanguage(item) {
  const explicit = normTag(item?.language || item?.lang || '');
  if (explicit === 'es' || explicit === 'en') return explicit;
  const tags = itemTags(item);
  if (tags.includes('es') || tags.includes('espanol') || tags.includes('español')) return 'es';
  if (tags.includes('en') || tags.includes('english')) return 'en';
  return '';
}

export function itemSeconds(item) {
  const n = Number(item?.seconds ?? item?.duration ?? item?.dur);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.max(2, Math.min(600, Math.round(n)));
}

export function totalSeconds(items) {
  return (items || []).reduce((sum, item) => sum + itemSeconds(item), 0);
}

export function formatDuration(seconds, lang = 'es') {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const min = lang === 'en' ? 'min' : 'min';
  if (!m) return r + ' s';
  return r ? m + ' ' + min + ' ' + r + ' s' : m + ' ' + min;
}

export function reorderItems(items, from, to) {
  const list = (items || []).slice();
  if (!Number.isInteger(from) || !Number.isInteger(to)) return list;
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return list;
  const [row] = list.splice(from, 1);
  list.splice(to, 0, row);
  return list;
}

export function criteriaActive(criteria) {
  if (!criteria || typeof criteria !== 'object') return false;
  return ['hashtag', 'type', 'format', 'language', 'audience', 'category', 'timeSlot']
    .some(key => String(criteria[key] || '').trim());
}

export function matchesCriteria(item, criteria = {}) {
  if (!item || !criteriaActive(criteria)) return false;
  const hash = normTag(criteria.hashtag);
  if (hash && !itemTags(item).includes(hash)) return false;
  if (criteria.type) {
    const wanted = String(criteria.type);
    const got = String(item.type || '');
    if (wanted === 'audio') {
      if (!['audio', 'music', 'locucion'].includes(got)) return false;
    } else if (got !== wanted) return false;
  }
  if (criteria.format && itemFormat(item) !== criteria.format) return false;
  if (criteria.language && itemLanguage(item) !== criteria.language) return false;
  if (criteria.audience && item.audience !== criteria.audience) return false;
  if (criteria.category && item.category !== criteria.category) return false;
  if (criteria.timeSlot && item.timeSlot !== criteria.timeSlot) return false;
  return true;
}

export function pieceFromStock(item, seconds) {
  return {
    id: item.id,
    title: item.title || item.id,
    type: item.type,
    url: item.url,
    thumbnail: item.thumbnail || null,
    category: item.category || null,
    audience: item.audience || null,
    motor: item.motor || null,
    tags: Array.isArray(item.tags) ? item.tags.slice() : [],
    seconds: seconds != null ? itemSeconds({ seconds }) : itemSeconds(item),
    orientacion: item.orientacion || null,
    language: itemLanguage(item) || null,
    timeSlot: item.timeSlot || null,
  };
}

export function selectByCriteria(stock, criteria) {
  return (stock || [])
    .filter(item => item && item.url && item.type !== 'link' && item.type !== 'furni' && matchesCriteria(item, criteria))
    .map(item => pieceFromStock(item));
}

function sameIds(left, right) {
  return (left || []).map(item => item.id).join('\n') === (right || []).map(item => item.id).join('\n');
}

function keepSeconds(previous, next) {
  const known = new Map((previous || []).map(item => [item.id, item.seconds]));
  return next.map(item => known.has(item.id) ? { ...item, seconds: itemSeconds({ seconds: known.get(item.id) }) } : item);
}

export function regenerateAuto(playlist, stock, now = Date.now()) {
  if (!playlist || playlist.mode !== 'auto') return { playlist, changed: false };
  const items = keepSeconds(playlist.items, selectByCriteria(stock, playlist.criteria || {}));
  if (sameIds(playlist.items, items)) return { playlist, changed: false };
  return { changed: true, playlist: { ...playlist, items, regeneratedAt: now } };
}

export function isCapsule(item) {
  if (!item) return false;
  const blob = [item.category, item.title, ...(item.tags || [])].filter(Boolean).join(' ');
  return CAPSULE_RE.test(blob);
}

export function proposeMix(pool, rule = {}) {
  const every = Math.max(1, Math.min(20, Number(rule.every) || 3));
  const list = (pool || []).slice();
  const capsules = list.filter(isCapsule);
  const rest = list.filter(item => !isCapsule(item));
  const items = [];
  let cursor = 0;
  if (!rest.length) items.push(...capsules);
  else {
    rest.forEach((item, index) => {
      items.push(item);
      if ((index + 1) % every === 0 && capsules.length) {
        items.push(capsules[cursor % capsules.length]);
        cursor += 1;
      }
    });
  }
  return {
    status: 'pending',
    every,
    capsuleCount: capsules.length,
    note: capsules.length ? '' : 'no-capsules',
    items,
  };
}

export function refreshProposal(playlist, stock, now = Date.now()) {
  if (!playlist || playlist.mode !== 'ia') return { playlist, changed: false };
  const pool = selectByCriteria(stock, playlist.criteria || {});
  const base = pool.length ? pool : (playlist.items || []);
  const proposal = proposeMix(base, { every: playlist.every || playlist.proposal?.every || 3 });
  proposal.at = now;
  if (playlist.proposal && sameIds(playlist.proposal.items, proposal.items)) return { playlist, changed: false };
  return { changed: true, playlist: { ...playlist, proposal } };
}

export function decideProposal(playlist, decision, now = Date.now()) {
  if (!playlist || !playlist.proposal || !Array.isArray(playlist.proposal.items)) return playlist;
  if (decision === 'approve') {
    return {
      ...playlist,
      items: playlist.proposal.items.map(item => ({ ...item })),
      proposal: { ...playlist.proposal, status: 'approved' },
      approvedAt: now,
    };
  }
  if (decision === 'reject') {
    return { ...playlist, proposal: { ...playlist.proposal, status: 'rejected' }, rejectedAt: now };
  }
  return playlist;
}

export function circuitsFromSurfaces(surfaces) {
  const map = new Map();
  for (const surface of surfaces || []) {
    const id = String(surface?.circuit || '').trim();
    const screen = String(surface?.screen || '').trim();
    if (!id || !screen) continue;
    if (!map.has(id)) map.set(id, { id, screens: [] });
    const row = map.get(id);
    if (!row.screens.includes(screen)) row.screens.push(screen);
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id, 'es'));
}

export function resolveTargets({ circuits = [], groups = [], players = [], surfaces = [] } = {}) {
  const byCircuit = new Map(circuitsFromSurfaces(surfaces).map(row => [row.id, row.screens]));
  const out = [];
  const push = screen => {
    const id = String(screen || '').trim();
    if (!id || out.includes(id)) return;
    out.push(id);
  };
  for (const circuit of circuits) (byCircuit.get(circuit) || []).forEach(push);
  for (const group of groups) {
    const screens = Array.isArray(group) ? group : (group?.screens || []);
    screens.forEach(push);
  }
  for (const player of players) push(player);
  return out;
}

function mix(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

export function seededShuffle(list, seed = 1) {
  const arr = (list || []).slice();
  const next = mix(seed);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = next() % (i + 1);
    const swap = arr[i];
    arr[i] = arr[j];
    arr[j] = swap;
  }
  return arr;
}

export function screenSeed(screen) {
  return [...String(screen || 'player')].reduce((sum, char) => (sum + char.charCodeAt(0)) >>> 0, 17);
}

export function playbackItems(items, mode, seed = 1) {
  if (mode === 'random') return seededShuffle(items || [], seed);
  return (items || []).slice();
}

export function assignmentPlan(screenIds, mode) {
  const ids = (screenIds || []).slice();
  if (mode === 'sync') {
    return ids.map((screen, index) => ({ screen, role: index === 0 ? 'master' : 'follower', mode: 'sync' }));
  }
  if (mode === 'random') {
    return ids.map(screen => ({ screen, role: 'player', mode: 'random', seed: screenSeed(screen) }));
  }
  return ids.map(screen => ({ screen, role: 'player', mode: 'linear' }));
}

export function madridClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || '';
  return {
    ymd: get('year') + '-' + get('month') + '-' + get('day'),
    weekday: WEEKDAY_MAP[get('weekday')] || '',
    hm: get('hour') + ':' + get('minute'),
  };
}

export function scheduleActive(schedule, clock) {
  if (!schedule) return true;
  const ymd = clock?.ymd || '';
  const weekday = clock?.weekday || '';
  const hm = clock?.hm || '';
  if (schedule.start && ymd && ymd < schedule.start) return false;
  if (schedule.end && ymd && ymd > schedule.end) return false;
  if (Array.isArray(schedule.days) && schedule.days.length && !schedule.days.includes(weekday)) return false;
  if (schedule.from && schedule.to && hm) {
    if (schedule.from <= schedule.to) {
      if (hm < schedule.from || hm >= schedule.to) return false;
    } else if (hm < schedule.from && hm >= schedule.to) return false;
  }
  return true;
}

export function higherPriority(left, right) {
  const a = Number(left?.priority) || 0;
  const b = Number(right?.priority) || 0;
  return a >= b ? left : right;
}

export function playerAirState({ now, cachePercent, online } = {}) {
  if (!now || now.error) return { state: 'error', labelKey: 'stateError' };
  const health = now.health || {};
  if (health.lastReason && health.source !== 'live' && health.source !== 'cache') {
    return { state: 'error', labelKey: 'stateError' };
  }
  if (now.standby) return { state: 'espera', labelKey: 'stateIdle' };
  if (now.item && (online || health.source === 'live')) return { state: 'emitiendo', labelKey: 'stateOnAir' };
  const percent = Number(cachePercent);
  if ((Number.isFinite(percent) && percent >= 99) || health.source === 'cache') {
    return { state: 'descargada', labelKey: 'stateCached' };
  }
  if (health.lastReason) return { state: 'error', labelKey: 'stateError' };
  return { state: 'sin_senal', labelKey: 'stateOffline' };
}

export function cachePercentOf(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const direct = payload.percent ?? payload.pct ?? payload.progress;
  if (direct != null && Number.isFinite(Number(direct))) return Number(direct);
  const lists = payload.lists || payload.items || payload.files;
  if (!Array.isArray(lists) || !lists.length) return null;
  const nums = lists.map(row => Number(row?.percent ?? row?.pct)).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

export function proofHref(screen) {
  return '/estadisticas/?screen=' + encodeURIComponent(String(screen || ''));
}

export function metastyle(name) {
  if (name === 'alsea') {
    return { id: 'alsea', accent: '#e4002b', phos: '#ffb44c', ink: '#fff6ee', panel: '#1a1012' };
  }
  return { id: 'admira', accent: '#7aa2ff', phos: '#3df08a', ink: '#cdd8e8', panel: '#121a27' };
}

export const COPY = {
  es: {
    title: 'Playlists',
    sub: 'conjuntos de contenidos → circuito y parrilla',
    new: 'Nueva playlist',
    search: 'Buscar playlist por nombre…',
    manual: 'Manual',
    auto: 'Automática',
    ia: 'IA · aprobación',
    hashtag: 'Hashtag del proyecto',
    type: 'Tipo',
    format: 'Formato',
    language: 'Idioma',
    audience: 'Audiencia',
    category: 'Categoría',
    slot: 'Franja',
    any: 'Cualquiera',
    regen: 'Regenerar con el Stock',
    regenHint: 'Si entra una pieza nueva con este hashtag, la playlist se regenera sola.',
    propose: 'Proponer mezcla',
    approve: 'Aprobar y emitir este orden',
    reject: 'Rechazar propuesta',
    pending: 'Propuesta pendiente de aprobación. No se emite hasta que la apruebes.',
    approved: 'Propuesta aprobada.',
    rejected: 'Propuesta rechazada. Sigue el orden anterior.',
    noCapsules: 'No hay cápsulas de conocimiento en este criterio. La propuesta solo reordena lo que hay.',
    every: 'Cada cuántas piezas entra una cápsula',
    duration: 'Duración',
    total: 'Duración total',
    preview: 'Vista previa',
    previewNote: 'Vista previa local. No emite en la flota.',
    schedule: 'Programación',
    days: 'Días',
    fromDate: 'Fecha de inicio',
    toDate: 'Fecha de fin',
    fromTime: 'Desde',
    toTime: 'Hasta',
    priority: 'Prioridad frente a la parrilla',
    assign: 'Asignar',
    circuit: 'Circuito',
    group: 'Grupo',
    players: 'Players sueltos',
    linear: 'Lineal',
    random: 'Aleatorio',
    sync: 'Sincronizado',
    syncHint: 'El primer player es el máster. El resto sigue su reloj.',
    proof: 'Proof of play',
    stateOnAir: 'emitiendo',
    stateCached: 'descargada',
    stateError: 'error',
    stateIdle: 'en espera',
    stateOffline: 'sin señal',
    metaAlsea: 'Metaestilo Alsea',
    metaAdmira: 'Metaestilo Admira',
    lang: 'EN',
    emptyAuto: 'Ninguna pieza del Stock cumple ese criterio.',
    drag: 'Arrastra para reordenar',
  },
  en: {
    title: 'Playlists',
    sub: 'content sets → circuit and grid',
    new: 'New playlist',
    search: 'Search playlist by name…',
    manual: 'Manual',
    auto: 'Automatic',
    ia: 'AI · approval',
    hashtag: 'Project hashtag',
    type: 'Type',
    format: 'Format',
    language: 'Language',
    audience: 'Audience',
    category: 'Category',
    slot: 'Daypart',
    any: 'Any',
    regen: 'Rebuild from Stock',
    regenHint: 'A new Stock piece with this hashtag rebuilds the playlist on its own.',
    propose: 'Propose a mix',
    approve: 'Approve and use this order',
    reject: 'Reject proposal',
    pending: 'Proposal waiting for approval. It does not go on air until you approve it.',
    approved: 'Proposal approved.',
    rejected: 'Proposal rejected. The previous order stays.',
    noCapsules: 'No knowledge capsules match this criteria. The proposal only reorders what is there.',
    every: 'Insert a capsule every N pieces',
    duration: 'Duration',
    total: 'Total duration',
    preview: 'Preview',
    previewNote: 'Local preview. It does not broadcast to the fleet.',
    schedule: 'Schedule',
    days: 'Days',
    fromDate: 'Start date',
    toDate: 'End date',
    fromTime: 'From',
    toTime: 'Until',
    priority: 'Priority against the grid',
    assign: 'Assign',
    circuit: 'Circuit',
    group: 'Group',
    players: 'Loose players',
    linear: 'Linear',
    random: 'Random',
    sync: 'Synchronized',
    syncHint: 'The first player is the master. The rest follow its clock.',
    proof: 'Proof of play',
    stateOnAir: 'on air',
    stateCached: 'downloaded',
    stateError: 'error',
    stateIdle: 'idle',
    stateOffline: 'no signal',
    metaAlsea: 'Alsea metastyle',
    metaAdmira: 'Admira metastyle',
    lang: 'ES',
    emptyAuto: 'No Stock piece matches that criteria.',
    drag: 'Drag to reorder',
  },
};

export function copy(lang) {
  return COPY[lang === 'en' ? 'en' : 'es'];
}

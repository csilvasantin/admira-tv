// Incident store for /support/app — same object across P1 Radar, P2 Sala, P3 Parte.
// Persistence: localStorage (browser) or injected Map (tests). Fan-out: BroadcastChannel + storage events.
export const STATUSES = ['open', 'assigned', 'in_field', 'resolved', 'valued'];
export const SEVS = ['P0', 'P1', 'P2', 'P3'];
export const STORAGE_KEY = 'admira.support.incidents.v1';
export const CHANNEL = 'admira-support-incidents';
export const SLA_P0_MIN = 15;

const CHECK_P0 = [
  'Llegada confirmada · foto de fachada',
  'Player visible · online',
  'Captura remota vs imagen real del pasillo',
  'Reboot aplicado y sincro < 1s',
  'Playlist en antena, slot correcto',
  'Cableado / PoE / HDMI comprobados',
  'Punto firma el parte (cierre humano)',
];

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function pad(n) { return String(n).padStart(2, '0'); }

export function formatClock(ts, tz = 'Europe/Madrid') {
  const d = new Date(ts);
  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '00';
  return `${get('hour')}:${get('minute')}:${get('second')} CEST`;
}

export function ageLabel(openedAt, now) {
  const ms = Math.max(0, now - openedAt);
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (h < 24) return `${h}h ${pad(r)}`;
  const days = Math.floor(h / 24);
  return days === 1 ? 'ayer' : `${days}d`;
}

function seed(now) {
  const t = now - 14 * 60000;
  return {
    seq: 10482,
    orphans: {
      vivosSinCircuito: ['player-lab-02', 'wall-tmp-11', 'kiosk-demo-x'],
      virtuales: ['admiranext-virtual-sala', 'player-preview-cco'],
      sitiosSinPlayer: ['Alcampo Torrejón'],
    },
    incidents: [
      {
        id: 'INC-10482', sev: 'P0', playerId: 'admiranext-mupi', site: 'Alcampo Alcalá',
        siteId: 'ALC-ALC-01', circuit: 'ALCAMPO-DOOH', signal: 'heartbeat miss',
        status: 'open', assignee: null, source: ['cae'], playlist: 'ALCAMPO-SEMANA-37',
        slaMin: SLA_P0_MIN, openedAt: t, playerOnline: true, sincro: 0.2,
        slot: '4/12', slotTitle: 'Frescura otoño', frame: '00:14 / 00:20',
        block: 'MUPI-PORTRAIT', nextClip: 'promo-fin-semana.mp4',
        notes: 'Capa negra en compositor. Captura remota sí muestra el spot; el panel físico no. Sospecha HDMI flojo en el player.',
        minutes: 24, cost: 85, valuation: null, snoozedUntil: null, mergedInto: null,
        etaMin: 18, km: 11.4, tech: 'Neo · flota campo',
        checklist: CHECK_P0.map((label, i) => ({ label, done: i < 3 })),
        photos: [
          { id: 'fachada', label: 'fachada · 13:31', on: true },
          { id: 'pasillo', label: 'pantalla pasillo', on: true },
          { id: 'captura', label: 'captura remota', on: false },
          { id: 'reboot', label: 'tras reboot', on: false },
        ],
        timeline: [
          { at: t, kind: 'bad', title: 'heartbeat miss', text: 'CAE: el player deja de reportar. Incidencia INC-10482 nace sola. source=cae.' },
          { at: t + 3000, kind: 'warn', title: 'triage Neo', text: 'Causa probable: caída de red / sincro. SLA P0 15 min. Sugerido: captura + reboot si offline > 10 min.' },
          { at: t + 111000, kind: 'ok', title: 'reaparece online', text: 'Heartbeat vuelve. SINCRO 0.2s. Playlist sigue en antena. Estado player = ONLINE.' },
        ],
        chat: [
          { who: 'Neo · diagnóstico', role: 'ag', text: 'INC-10482 P0. El mupi dejó de reportar 14 min y volvió solo. Sincro estable. No veo fallo de playlist. Si el punto no ve imagen, pido captura antes de reboot.' },
          { who: 'Tú · Flota Asistencia', role: 'hu', text: 'El pasillo no ve el spot de otoño. La pantalla latea en Flota como EN EMISIÓN.' },
          { who: 'Trinity · causa', role: 'ag', text: 'Posible capa negra / compositor. Siguiente: CAPTURA remota. Si el frame no coincide con slot 4, REBOOT. Luego aceptar parte si el punto sigue ciego.' },
        ],
      },
      {
        id: 'INC-10471', sev: 'P1', playerId: 'player-cc-042', site: 'C.C. Parque Sur',
        siteId: 'PS-042', circuit: 'ALCAMPO-DOOH', signal: 'stock/list fail',
        status: 'assigned', assignee: 'Trinity', source: ['cae'], playlist: 'PARQUE-SUR-37',
        slaMin: 60, openedAt: now - 41 * 60000, playerOnline: true, sincro: 0.8,
        notes: '', minutes: 0, cost: 0, valuation: null, snoozedUntil: null, mergedInto: null,
        checklist: CHECK_P0.map((label) => ({ label, done: false })),
        photos: [], timeline: [{ at: now - 41 * 60000, kind: 'warn', title: 'stock/list fail', text: 'player-cc-042 falla stock/list.' }],
        chat: [],
      },
      {
        id: 'INC-10460', sev: 'P1', playerId: 'mupi-granvia-07', site: 'Gran Vía 07',
        siteId: 'GV-07', circuit: 'MERCADONA-WALL', signal: 'offline',
        status: 'in_field', assignee: 'Neo · ruta', source: ['cae'], playlist: 'GV-DOOH',
        slaMin: 60, openedAt: now - (2 * 60 + 8) * 60000, playerOnline: false, sincro: null,
        notes: '', minutes: 40, cost: 120, valuation: null, snoozedUntil: null, mergedInto: null,
        checklist: CHECK_P0.map((label, i) => ({ label, done: i < 2 })),
        photos: [], timeline: [], chat: [],
      },
      {
        id: 'INC-10455', sev: 'P2', playerId: 'totem-renfe-atocha', site: 'Atocha L1',
        siteId: 'REN-L1', circuit: 'RENFE-ATOCHA', signal: 'sincro drift 4.2s',
        status: 'assigned', assignee: 'Morfeo', source: ['cae'], playlist: 'ATOCHA-L1',
        slaMin: 240, openedAt: now - 3 * 3600000, playerOnline: true, sincro: 4.2,
        notes: '', minutes: 0, cost: 0, valuation: null, snoozedUntil: null, mergedInto: null,
        checklist: CHECK_P0.map((label) => ({ label, done: false })),
        photos: [], timeline: [], chat: [],
      },
      {
        id: 'INC-10440', sev: 'P2', playerId: 'wall-mercadona-08', site: 'Mercadona 08',
        siteId: 'MER-08', circuit: 'MERCADONA-WALL', signal: 'playlist fail',
        status: 'open', assignee: null, source: ['agent'], playlist: 'MER-08-WEEK',
        slaMin: 240, openedAt: now - 5 * 3600000, playerOnline: true, sincro: 0.4,
        notes: '', minutes: 0, cost: 0, valuation: null, snoozedUntil: null, mergedInto: null,
        checklist: CHECK_P0.map((label) => ({ label, done: false })),
        photos: [], timeline: [], chat: [],
      },
      {
        id: 'INC-10422', sev: 'P3', playerId: 'player-virtual-lab', site: 'lab',
        siteId: 'LAB-01', circuit: 'LAB', signal: 'tester timeout',
        status: 'resolved', assignee: 'Oráculo', source: ['manual'], playlist: 'LAB-LOOP',
        slaMin: 1440, openedAt: now - 26 * 3600000, playerOnline: true, sincro: 0.1,
        notes: '', minutes: 12, cost: 0, valuation: null, snoozedUntil: null, mergedInto: null,
        checklist: CHECK_P0.map((label) => ({ label, done: true })),
        photos: [], timeline: [], chat: [],
      },
      {
        id: 'INC-10411', sev: 'P3', playerId: 'kiosk-caixa-plaza', site: 'Caixa Plaza',
        siteId: 'CX-PL', circuit: 'CAIXABANK-BRANCH', signal: 'reboot OK',
        status: 'valued', assignee: 'punto · 5/5', source: ['asistencia_click'], playlist: 'CAIXA-PLAZA',
        slaMin: 1440, openedAt: now - 30 * 3600000, playerOnline: true, sincro: 0.2,
        notes: '', minutes: 18, cost: 45, valuation: { score: 5, by: 'punto', minutes: 18, cost: 45 },
        snoozedUntil: null, mergedInto: null,
        checklist: CHECK_P0.map((label) => ({ label, done: true })),
        photos: [], timeline: [], chat: [],
      },
    ],
  };
}

function activeForPlayer(incidents, playerId) {
  const openish = incidents.filter((i) => i.playerId === playerId && !i.mergedInto && i.status !== 'valued');
  const order = { open: 0, assigned: 1, in_field: 2, resolved: 3 };
  openish.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.openedAt - a.openedAt);
  return openish[0] || null;
}

export function createStore(opts = {}) {
  const storage = opts.storage || (typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : memoryStorage());
  const nowFn = opts.now || (() => Date.now());
  const listeners = new Set();
  let bc = null;
  if (opts.broadcast !== false && typeof globalThis.BroadcastChannel === 'function') {
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = () => emit('remote');
    } catch (_) { bc = null; }
  }
  if (opts.broadcast !== false && typeof globalThis.addEventListener === 'function') {
    try {
      globalThis.addEventListener('storage', (e) => {
        if (e && e.key === STORAGE_KEY) emit('remote');
      });
    } catch (_) { /* node tests */ }
  }

  function read() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.incidents)) return data;
      }
    } catch (_) { /* seed */ }
    const data = seed(nowFn());
    write(data, false);
    return data;
  }

  function write(data, notify = true) {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (notify) {
      try { bc && bc.postMessage({ type: 'sync', at: nowFn() }); } catch (_) {}
      emit('local');
    }
  }

  function emit(why) {
    listeners.forEach((fn) => { try { fn(why); } catch (_) {} });
  }

  function mutate(fn) {
    const data = read();
    const before = JSON.stringify(data);
    const out = fn(data);
    if (JSON.stringify(data) !== before) write(data);
    return out;
  }

  function nextId(data) {
    data.seq = Math.max(data.seq || 10482, ...data.incidents.map((i) => Number(String(i.id).replace(/\D/g, '')) || 0));
    data.seq += 1;
    return `INC-${data.seq}`;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function list(filter = {}) {
    const now = nowFn();
    let rows = read().incidents.filter((i) => !i.mergedInto);
    if (filter.status && filter.status !== 'all') rows = rows.filter((i) => i.status === filter.status);
    if (filter.sev && filter.sev !== 'all') rows = rows.filter((i) => i.sev === filter.sev);
    if (filter.circuit && filter.circuit !== 'all') rows = rows.filter((i) => i.circuit === filter.circuit);
    if (filter.site && filter.site !== 'all') rows = rows.filter((i) => i.site === filter.site);
    if (filter.q) {
      const q = String(filter.q).toLowerCase();
      rows = rows.filter((i) => [i.id, i.playerId, i.site, i.signal, i.playlist].join(' ').toLowerCase().includes(q));
    }
    const rank = { P0: 0, P1: 1, P2: 2, P3: 3 };
    rows = rows.map((i) => ({ ...i, age: ageLabel(i.openedAt, now) }));
    rows.sort((a, b) => (rank[a.sev] - rank[b.sev]) || a.openedAt - b.openedAt);
    return rows;
  }

  function get(id) {
    const row = read().incidents.find((i) => i.id === id);
    return row ? clone(row) : null;
  }

  function stats() {
    const rows = list();
    const openish = rows.filter((i) => i.status !== 'valued');
    return {
      abiertas: openish.length,
      p0: openish.filter((i) => i.sev === 'P0').length,
      enCampo: openish.filter((i) => i.status === 'in_field').length,
      slaP0: SLA_P0_MIN,
    };
  }

  function orphans() {
    return clone(read().orphans);
  }

  function circuits() {
    return [...new Set(read().incidents.map((i) => i.circuit))].sort();
  }

  function sites() {
    return [...new Set(read().incidents.map((i) => i.site))].sort();
  }

  function addEvent(inc, ev) {
    inc.timeline = inc.timeline || [];
    inc.timeline.push({ at: nowFn(), kind: ev.kind || 'ok', title: ev.title, text: ev.text });
  }

  function ensureSala(playerId, extra = {}) {
    const pid = String(playerId || '').trim();
    if (!pid) throw new Error('playerId_required');
    return mutate((data) => {
      let inc = activeForPlayer(data.incidents, pid);
      const source = extra.source || null;
      if (!inc) {
        const id = nextId(data);
        inc = {
          id, sev: extra.sev || 'P1', playerId: pid,
          site: extra.site || 'sin sitio', siteId: extra.siteId || '',
          circuit: extra.circuit || 'sin circuito', signal: extra.signal || 'asistencia',
          status: 'open', assignee: extra.assignee || null, source: [source || 'asistencia_click'],
          playlist: extra.playlist || '—', slaMin: extra.slaMin || 60,
          openedAt: nowFn(), playerOnline: extra.playerOnline !== false, sincro: extra.sincro ?? 0.2,
          notes: '', minutes: 0, cost: 0, valuation: null, snoozedUntil: null, mergedInto: null,
          etaMin: extra.etaMin || 18, km: extra.km || 11.4,
          tech: extra.tech || extra.assignee || 'Neo · flota campo',
          checklist: CHECK_P0.map((label) => ({ label, done: false })),
          photos: [
            { id: 'fachada', label: 'fachada', on: false },
            { id: 'pasillo', label: 'pantalla', on: false },
            { id: 'captura', label: 'captura remota', on: false },
            { id: 'reboot', label: 'tras reboot', on: false },
          ],
          timeline: [], chat: [],
        };
        addEvent(inc, {
          kind: 'ok', title: source,
          text: `Sala abierta para ${pid}. Incidencia ${id} creada al click. Nunca sala vacía.`,
        });
        data.incidents.unshift(inc);
      } else if (source && !(inc.source || []).includes(source)) {
        inc.source = [...(inc.source || []), source];
        addEvent(inc, {
          kind: 'ok', title: source,
          text: `Flota fila → Asistencia. Entra a esta sala con playerId=${pid}. source+=${source}.`,
        });
      }
      if (!inc.id) throw new Error('empty_sala');
      return clone(inc);
    });
  }

  function patch(id, fields, event) {
    return mutate((data) => {
      const inc = data.incidents.find((i) => i.id === id);
      if (!inc) throw new Error('not_found');
      Object.assign(inc, fields);
      if (event) addEvent(inc, event);
      return clone(inc);
    });
  }

  function addChat(id, msg) {
    return mutate((data) => {
      const inc = data.incidents.find((i) => i.id === id);
      if (!inc) throw new Error('not_found');
      inc.chat = inc.chat || [];
      inc.chat.push({ who: msg.who, role: msg.role || 'hu', text: msg.text, at: nowFn() });
      return clone(inc);
    });
  }

  function merge(fromId, intoId) {
    if (fromId === intoId) throw new Error('same_incident');
    return mutate((data) => {
      const from = data.incidents.find((i) => i.id === fromId);
      const into = data.incidents.find((i) => i.id === intoId);
      if (!from || !into) throw new Error('not_found');
      if (from.siteId && into.siteId && from.siteId !== into.siteId) {
        throw new Error('distinct_site');
      }
      from.mergedInto = intoId;
      from.status = 'valued';
      addEvent(into, { kind: 'warn', title: 'merge', text: `${fromId} fusionada en ${intoId}.` });
      return clone(into);
    });
  }

  function snooze(id, minutes = 30) {
    return patch(id, { snoozedUntil: nowFn() + minutes * 60000 }, {
      kind: 'ok', title: 'snooze', text: `Snooze ${minutes} min.`,
    });
  }

  function escalate(id, agent = 'Neo') {
    const cur = get(id);
    if (!cur) throw new Error('not_found');
    return patch(id, { assignee: agent, status: cur.status === 'open' ? 'assigned' : cur.status }, {
      kind: 'warn', title: 'escalar', text: `Escalado a ${agent}.`,
    });
  }

  function acceptParte(id, tech = 'Neo · flota campo') {
    const cur = get(id);
    if (!cur) throw new Error('not_found');
    const next = cur.status === 'open' ? 'assigned' : cur.status;
    return patch(id, { status: next, assignee: tech, tech }, {
      kind: 'ok', title: 'parte', text: `Parte aceptado. Ciclo assigned → in_field → resolved → valued. Mismo ${id}.`,
    });
  }

  function setStatus(id, status) {
    if (!STATUSES.includes(status)) throw new Error('bad_status');
    return patch(id, { status }, { kind: 'ok', title: status, text: `Estado → ${status}.` });
  }

  function valueIncident(id, { score, by, minutes, cost } = {}) {
    const s = Number(score);
    if (!Number.isFinite(s) || s < 1 || s > 5) throw new Error('score_required');
    const valuation = { score: s, by: by || 'punto', minutes: Number(minutes) || 0, cost: Number(cost) || 0 };
    return patch(id, { status: 'valued', valuation, minutes: valuation.minutes, cost: valuation.cost, assignee: `${valuation.by} · ${s}/5` }, {
      kind: 'ok', title: 'valued',
      text: `Cierre con valor ${s}/5 · ${valuation.cost}€ · ${valuation.minutes} min · by ${valuation.by}.`,
    });
  }

  function deviceAction(id, action) {
    const labels = {
      reboot: 'REBOOT remoto disparado. Esperando heartbeat post-boot.',
      capture: 'CAPTURA en cola. El PNG se adjuntará al parte.',
      tester: 'TESTER webcam: preview local del técnico. No sustituye captura del player.',
    };
    const text = labels[action] || action;
    const fields = {};
    if (action === 'capture') {
      fields.photos = (get(id)?.photos || []).map((p) => p.id === 'captura' ? { ...p, on: true } : p);
      if (!fields.photos.length) fields.photos = [{ id: 'captura', label: 'captura remota', on: true }];
    }
    return patch(id, fields, { kind: 'ok', title: action, text });
  }

  function reset() {
    storage.removeItem(STORAGE_KEY);
    write(seed(nowFn()), true);
  }

  return {
    list, get, stats, orphans, circuits, sites, ensureSala, patch, addChat,
    merge, snooze, escalate, acceptParte, setStatus, valueIncident, deviceAction,
    subscribe, reset, read, STORAGE_KEY,
  };
}

let singleton;
export function getStore() {
  if (!singleton) singleton = createStore();
  return singleton;
}

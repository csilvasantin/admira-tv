/**
 * admira-xr-core.js — núcleo compartido XR de Admira (MOCK, sin red)
 * ------------------------------------------------------------------
 * Módulo ES compartido por el hub /xr/ y los players (Quest VR, Vision Pro AR).
 * HOY es un MOCK: NO abre red. Sirve sesión anónima, catálogo de campañas y
 * telemetría de proof-of-play en memoria + espejo en localStorage.
 *
 * Arquitectura común:
 *   - Sesión anónima con id estable (sessionStorage) — sin login, sin PII.
 *   - Telemetría: 9 eventos canónicos con whitelist estricta.
 *   - Proof-of-play: cada view.started/completed queda registrado.
 *   - Puente futuro → eventos hacia Open Loyalty (worker admira-loyalty).
 *
 * Uso:
 *   import { AdmiraXR } from '/xr/core/admira-xr-core.js';
 *   AdmiraXR.session();                       // arranca / recupera sesión
 *   AdmiraXR.emit('xr.view.started', {...});  // emite un evento canónico
 *   AdmiraXR.catalog();                       // 3 campañas mock
 */

'use strict';

/* ---- Constantes ---- */

// Whitelist EXACTA de los 9 eventos canónicos. Cualquier otro type se rechaza.
const CANONICAL_EVENTS = Object.freeze([
  'xr.session.started',
  'xr.asset.loaded',
  'xr.view.started',
  'xr.view.completed',
  'xr.hotspot.clicked',
  'xr.screen.placed',
  'xr.campaign.selected',
  'xr.reward.triggered',
  'xr.session.ended'
]);

const STORAGE_KEY = 'admira_xr_events'; // espejo localStorage (máx 200)
const MAX_MIRROR = 200;
const SESSION_KEY = 'admira_xr_session'; // id anónimo estable en sessionStorage

/* ---- Estado interno del módulo ---- */

const _queue = [];      // cola en memoria (fuente de verdad de la sesión viva)
let _session = null;    // { id, startedAt }
let _seq = 0;           // contador monotónico → eventId determinista

/* ---- Utilidades ---- */

// Lectura segura de storage (algunos contextos XR restringen storage).
function _safeGet(store, key) {
  try { return store.getItem(key); } catch (_) { return null; }
}
function _safeSet(store, key, val) {
  try { store.setItem(key, val); return true; } catch (_) { return false; }
}

// Id anónimo compacto y estable. No es criptográfico: sólo agrupa una sesión.
function _newSessionId() {
  const rnd = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return 'xr_' + t + '_' + rnd;
}

/* ---- Sesión anónima ---- */

/**
 * session() — arranca o recupera la sesión anónima.
 * El id es estable durante la pestaña (sessionStorage). Emite
 * xr.session.started sólo la primera vez que se crea en esta pestaña.
 * @returns {{id:string, startedAt:number}}
 */
function session() {
  if (_session) return _session;

  let id = _safeGet(sessionStorage, SESSION_KEY);
  const isNew = !id;
  if (!id) {
    id = _newSessionId();
    _safeSet(sessionStorage, SESSION_KEY, id);
  }
  _session = { id: id, startedAt: Date.now() };

  if (isNew) emit('xr.session.started', { ua: navigator.userAgent });
  return _session;
}

/* ---- Telemetría ---- */

/**
 * emit(type, metadata) — encola un evento canónico.
 * Rechaza (con warning) cualquier type fuera de la whitelist.
 * @param {string} type       uno de CANONICAL_EVENTS
 * @param {object} [metadata] datos libres del evento (sin PII)
 * @returns {object|null} el evento encolado, o null si el type no es válido
 */
function emit(type, metadata) {
  if (CANONICAL_EVENTS.indexOf(type) === -1) {
    console.warn('[AdmiraXR] evento NO canónico ignorado:', type);
    return null;
  }
  // session() puede llamar a emit() antes de fijar _session: usamos lo que haya.
  const sid = _session ? _session.id : (_safeGet(sessionStorage, SESSION_KEY) || 'xr_pending');

  const evt = {
    eventId: sid + '#' + (++_seq),   // determinista: sesión + secuencia monotónica
    seq: _seq,
    type: type,
    sessionId: sid,
    ts: Date.now(),
    metadata: metadata || {}
  };

  _queue.push(evt);
  _mirror(evt);
  console.info('[AdmiraXR]', evt.type, evt.eventId, evt.metadata);
  return evt;
}

// Espejo en localStorage, recortado a los últimos MAX_MIRROR.
function _mirror(evt) {
  let arr = [];
  const raw = _safeGet(localStorage, STORAGE_KEY);
  if (raw) { try { arr = JSON.parse(raw) || []; } catch (_) { arr = []; } }
  arr.push(evt);
  if (arr.length > MAX_MIRROR) arr = arr.slice(arr.length - MAX_MIRROR);
  _safeSet(localStorage, STORAGE_KEY, JSON.stringify(arr));
}

/**
 * events() — copia de la cola en memoria de esta sesión.
 * @returns {object[]}
 */
function events() {
  return _queue.slice();
}

/**
 * flush() — STUB. HOY no hace red.
 *
 * Los writes reales están pendientes de coordinar con Morfeo por KV.
 * Destino futuro: puente `/events` del worker admira-loyalty (Open Loyalty),
 * que persistirá el proof-of-play y disparará recompensas.
 * Cuando exista, este método hará un POST batch de _queue y la vaciará
 * al confirmarse. De momento devuelve la cuenta sin tocar nada.
 *
 * @returns {Promise<{queued:number, sent:number, transport:string}>}
 */
function flush() {
  // TODO(Morfeo): POST batch → https://<worker admira-loyalty>/events (KV).
  return Promise.resolve({ queued: _queue.length, sent: 0, transport: 'noop-mock' });
}

/* ---- Catálogo mock ---- */

// Campañas mock. `media` usa imágenes YA existentes en el repo (raíz del site).
const _CATALOG = Object.freeze([
  {
    id: 'camp-showroom',
    title: 'Showroom Admira',
    tagline: 'El espacio de marca, inmersivo',
    media: '/og-admira.png',
    accent: '#3df08a'
  },
  {
    id: 'camp-canal',
    title: 'Canal en vivo',
    tagline: 'La antena, dentro del visor',
    media: '/og-canal.png',
    accent: '#38d6ff'
  },
  {
    id: 'camp-player',
    title: 'Admira Player',
    tagline: 'Kiosco y señalización, en 3D',
    media: '/og-player.png',
    accent: '#f5b431'
  }
]);

/**
 * catalog() — catálogo mock de 3 campañas (título + media + tagline).
 * @returns {object[]}
 */
function catalog() {
  return _CATALOG.map(function (c) { return Object.assign({}, c); });
}

/* ---- API pública ---- */

export const AdmiraXR = Object.freeze({
  CANONICAL_EVENTS: CANONICAL_EVENTS,
  session: session,
  emit: emit,
  events: events,
  flush: flush,
  catalog: catalog
});

export default AdmiraXR;

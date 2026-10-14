// Every request owns a room snapshot. Late responses cannot cross rooms.
export class QueueRequestError extends Error {
  constructor(message, code, status = 0) { super(message); this.code = code; this.status = status; }
}

export class RoomClient {
  constructor(room, {fetchImpl = (...args) => fetch(...args), storage, timeout = 6000} = {}) {
    this.room = room; this.generation = 0; this.readVersion = 0; this.fetchImpl = fetchImpl;
    this.storage = storage; this.timeout = timeout; this.controllers = new Set(); this.read = null;
    // Adopt the old single-room key only for the room where it was supplied.
    try {
      const legacy = storage?.getItem('gc_clave');
      if (legacy && !this.key()) this.setKey(legacy);
      if (legacy) storage.removeItem('gc_clave');
    } catch (_) {}
  }
  snapshot() { return {room:this.room, generation:this.generation}; }
  current(context) { return context.room === this.room && context.generation === this.generation &&
    (context.readVersion === undefined || context.readVersion === this.readVersion); }
  invalidateState() {
    this.readVersion++;
    this.readController?.abort(); this.readController = null; this.read = null;
  }
  key() { try { return this.storage?.getItem('gc_clave:' + this.room) || ''; } catch (_) { return ''; } }
  setKey(value) { try { this.storage?.setItem('gc_clave:' + this.room, value); } catch (_) {} }
  switch(room) {
    this.room = room; this.generation++;
    this.invalidateState();
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear(); this.read = null;
  }
  async request(op, body, context = this.snapshot()) {
    if (!this.current(context)) throw new QueueRequestError('Room changed', 'stale');
    if (!/^[a-z0-9-]{2,80}$/.test(context.room)) throw new QueueRequestError('Invalid room', 'room');
    const controller = new AbortController(); this.controllers.add(controller);
    if (context.readVersion !== undefined) this.readController = controller;
    let timeout, expired = false, rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = () => reject(new QueueRequestError(
      !this.current(context) ? 'Room changed' : expired ? 'Request timed out' : 'Request cancelled',
      !this.current(context) ? 'stale' : expired ? 'timeout' : 'cancelled'));
      controller.signal.addEventListener('abort', rejectAbort, {once:true});
    });
    timeout = setTimeout(() => { expired = true; controller.abort(); }, this.timeout);
    const headers = {'content-type':'application/json'}, key = this.key();
    if (key) headers['x-clave-sala'] = key;
    try {
      const operation = (async () => {
        const response = await this.fetchImpl('/gestorColas/api/' + op + '?sala=' + encodeURIComponent(context.room), {
          method:body ? 'POST' : 'GET', headers, credentials:'same-origin', cache:'no-store',
          signal:controller.signal, ...(body ? {body:JSON.stringify(body)} : {})
        });
        const data = await response.json().catch(() => { throw new QueueRequestError('Invalid response', 'response', response.status); });
        if (!this.current(context)) throw new QueueRequestError('Room changed', 'stale');
        if (response.ok === false || data.ok !== true) throw new QueueRequestError(data.error || 'Request failed', 'response', response.status);
        return data;
      })();
      return await Promise.race([operation, aborted]);
    } finally {
      clearTimeout(timeout); controller.signal.removeEventListener('abort', rejectAbort); this.controllers.delete(controller);
    }
  }
  state() {
    if (this.read) return this.read;
    const context = {...this.snapshot(), readVersion:this.readVersion};
    const promise = this.request('estado', undefined, context).finally(() => { if (this.read === promise) this.read = null; });
    this.read = promise; return promise;
  }
}

// Keep the original intent through a lost response, retry or same-tab reload.
// This contains only the user's draft and nonce, never a payment token.
export class PendingOrder {
  constructor(storage, nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2,'0')).join('')) { this.storage = storage; this.nonce = nonce; this.memory = new Map(); }
  get(room) {
    if (this.memory.has(room)) return this.memory.get(room);
    try {
      const draft = JSON.parse(this.storage?.getItem('gc_pending:' + room) || 'null');
      if (draft && /^[A-Za-z0-9._-]{6,48}$/.test(draft.idem) && typeof draft.nombre === 'string') { this.memory.set(room, draft); return draft; }
    } catch (_) {}
    return null;
  }
  begin(room, nombre) {
    let draft = this.get(room);
    if (!draft) {
      draft = {nombre:String(nombre || ''), idem:this.nonce()}; this.memory.set(room, draft);
      try { this.storage?.setItem('gc_pending:' + room, JSON.stringify(draft)); } catch (_) {}
    }
    return draft;
  }
  complete(room, idem) {
    if (this.get(room)?.idem !== idem) return;
    this.memory.delete(room);
    try { this.storage?.removeItem('gc_pending:' + room); } catch (_) {}
  }
}

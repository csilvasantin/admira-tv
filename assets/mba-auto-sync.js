(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AdmiraMBAAutoSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCREENS = new Set(['macbookairazul', 'macbookaircrema', 'macbookairrosa', 'macbookairplata']);
  function snapshot(value) {
    if (!value || typeof value.revision !== 'string' || !value.revision ||
        !Number.isFinite(value.epochMs) || value.epochMs < 0 || !Array.isArray(value.items) ||
        !value.items.length || value.items.length > 50) throw new Error('invalid_mba_revision');
    const ids = new Set();
    const items = value.items.map(item => {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
          !/^https:\/\//.test(item.url || '') || !Number.isFinite(item.dur) || item.dur <= 0 || item.dur > 86400) {
        throw new Error('invalid_mba_item');
      }
      ids.add(item.id);
      return Object.assign({}, item, {dur: Math.ceil(item.dur), _dur: Math.ceil(item.dur), _syncDurationLocked: true});
    });
    return {revision: value.revision, epochMs: value.epochMs, items};
  }
  function create(options) {
    const now = options.now || Date.now, schedule = options.setTimeout || setTimeout;
    const cancel = options.clearTimeout || clearTimeout;
    let current = null, pending = null, offset = 0, timer = null;
    function apply(next) {
      if (current && (next.epochMs < current.epochMs ||
          next.epochMs === current.epochMs && next.revision === current.revision)) return;
      current = next;
      if (options.onChange) options.onChange(current, offset);
    }
    function arm() {
      if (timer !== null) cancel(timer);
      timer = null;
      if (!pending) return;
      const wait = pending.epochMs - (now() + offset);
      if (wait <= 0) { const due = pending; pending = null; apply(due); return; }
      timer = schedule(arm, Math.min(wait, 2147483647));
    }
    function receive(packet, receivedAt) {
      if (!packet || packet.ok !== true || packet.group !== 'mba-admira-tv' || !Number.isFinite(packet.serverNow)) {
        throw new Error('invalid_mba_state');
      }
      // Validate the complete packet before replacing a previously usable state.
      const active = snapshot(packet.active), next = packet.pending ? snapshot(packet.pending) : null;
      if (next && next.epochMs <= active.epochMs) throw new Error('invalid_mba_activation');
      offset = packet.serverNow - (receivedAt == null ? now() : receivedAt);
      const candidate = next && next.epochMs <= now() + offset ? next : active;
      apply(candidate);
      // An older response must not cancel a revision already prepared for activation.
      if (next && (!current || next.epochMs > current.epochMs) && (!pending || next.epochMs >= pending.epochMs)) pending = next;
      if (pending && current && pending.epochMs <= current.epochMs) pending = null;
      arm();
      if (options.onClock) options.onClock(offset);
      return current;
    }
    return {receive, get current() { return current; }, get pending() { return pending; }, get offset() { return offset; },
      stop() { if (timer !== null) cancel(timer); timer = null; }};
  }
  return {isTargetScreen: screen => SCREENS.has(String(screen || '').toLowerCase()), snapshot, create};
});

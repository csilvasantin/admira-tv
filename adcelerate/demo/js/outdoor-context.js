/* Shared, deliberately small contract between the two same-origin renderers. */
(function(root) {
  'use strict';
  const profiles = ['familias', 'jovenes', 'turistas', 'seniors'];
  const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  function validate(c) {
    if (!c || c.siteId !== 'bcn-kiosk-016' || !finite(c.hour, 0, 23.999999) ||
        !finite(c.baseCount, 0, 800) || !Number.isInteger(c.effectiveCount) || !finite(c.effectiveCount, 0, 800) ||
        typeof c.manual !== 'boolean' || !['kiosk', 'plaza', 'building'].includes(c.selection) ||
        !c.mix || !profiles.every(p => finite(c.mix[p], 0, 100)) ||
        Math.abs(profiles.reduce((sum, p) => sum + c.mix[p], 0) - 100) > 0.1 ||
        !c.layers || !['crowd', 'buildings', 'roads', 'night'].every(k => typeof c.layers[k] === 'boolean')) return null;
    return {siteId:c.siteId, hour:c.hour, baseCount:c.baseCount, effectiveCount:c.effectiveCount,
      manual:c.manual, selection:c.selection, mix:Object.fromEntries(profiles.map(p => [p,c.mix[p]])),
      layers:Object.fromEntries(['crowd','buildings','roads','night'].map(k => [k,c.layers[k]]))};
  }
  function message(type, context) {
    return {channel:'admira-outdoor', version:1, type, ...(context ? {context} : {})};
  }
  function accepts(event, source, origin) {
    const d = event && event.data;
    return !!(event && event.origin === origin && event.source === source && d &&
      d.channel === 'admira-outdoor' && d.version === 1 && ['ready','context','close','stop'].includes(d.type) &&
      (d.type !== 'context' || validate(d.context)));
  }
  function bestEntry(search, embedded) {
    const params = new URLSearchParams(search);
    if (embedded && params.get('embed') === '1') return null;
    const next = new URLSearchParams();
    if (params.has('cal')) next.set('cal', params.get('cal'));
    if (['front','panels'].includes(params.get('side'))) next.set('side', params.get('side'));
    // Explicit calibration links retain intent; ordinary external links open the universe.
    if (params.has('cal') || params.has('side')) next.set('view', 'photo');
    return '../' + (next.size ? '?' + next.toString() : '');
  }
  const api = {validate, message, accepts, bestEntry};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OutdoorContext = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

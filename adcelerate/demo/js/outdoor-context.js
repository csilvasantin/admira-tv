/* Shared, deliberately small contract between the two same-origin renderers. */
(function(root) {
  'use strict';
  const sites=typeof module!=='undefined'&&module.exports?require('./outdoor-sites.js'):root.OutdoorSites;
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
  const actions = ['forward','backward','left','right','look-up','look-down','home','panels','front','zoom-in','zoom-out','link','site','release','jesus','jesus-2023'];
  const shortString = (s, max, empty = true) => typeof s === 'string' && s.length <= max && (empty || s.length > 0);
  function validateWalkCommand(p) {
    if (!p || !actions.includes(p.action) || (p.action === 'link' && !shortString(p.pano,250,false))) return null;
    if(p.action==='site' && !sites.get(p.siteId))return null;
    if(['forward','backward'].includes(p.action) && p.hold!==undefined && typeof p.hold!=='boolean')return null;
    return {action:p.action, ...(p.action === 'link' ? {pano:p.pano} : {}),
      ...(p.action==='site'?{siteId:p.siteId}:{}),
      ...(['forward','backward'].includes(p.action)&&p.hold!==undefined?{hold:p.hold}:{})};
  }
  function validateWalkState(p) {
    if (!p || (p.siteId!==undefined && !sites.get(p.siteId)) ||
        ['canEnterJesus','routeActive','canOpenJesus2023'].some(key=>p[key]!==undefined&&typeof p[key]!=='boolean') || !['loading','ready','error','unavailable'].includes(p.status) ||
        !shortString(p.pano,250) || !finite(p.heading,0,360) || !shortString(p.date,100) ||
        !Number.isInteger(p.steps) || !finite(p.steps,0,1000000) || typeof p.supportVisible !== 'boolean' ||
        !(p.position === null || (p.position && finite(p.position.lat,-90,90) && finite(p.position.lng,-180,180))) ||
        !Array.isArray(p.links) || p.links.length > 32 ||
        !p.links.every(l => l && shortString(l.pano,250,false) && finite(l.heading,0,360) && shortString(l.description,160))) return null;
    return {...(p.siteId!==undefined?{siteId:p.siteId}:{}),
      ...Object.fromEntries(['canEnterJesus','routeActive','canOpenJesus2023'].filter(key=>p[key]!==undefined).map(key=>[key,p[key]])),status:p.status,pano:p.pano,heading:p.heading,position:p.position ? {...p.position} : null,
      date:p.date,steps:p.steps,supportVisible:p.supportVisible,
      links:p.links.map(l => ({pano:l.pano,heading:l.heading,description:l.description}))};
  }
  function message(type, context) {
    const data = type === 'walk-state' || type === 'walk-command' || (type === 'support-select' && context) ? {payload:context} : (context ? {context} : {});
    return {channel:'admira-outdoor', version:1, type, ...data};
  }
  function accepts(event, source, origin) {
    const d = event && event.data;
    return !!(event && event.origin === origin && event.source === source && d &&
      d.channel === 'admira-outdoor' && d.version === 1 && ['ready','context','close','stop','walk-state','walk-command','support-select'].includes(d.type) &&
      (d.type !== 'context' || validate(d.context)) &&
      (d.type !== 'walk-state' || validateWalkState(d.payload)) &&
      (d.type !== 'walk-command' || validateWalkCommand(d.payload)) &&
      (d.type !== 'support-select' || d.payload===undefined || (d.payload && !!sites.get(d.payload.siteId))));
  }
  function bestEntry(search, embedded) {
    const params = new URLSearchParams(search);
    if (embedded && params.get('embed') === '1') return null;
    const next = new URLSearchParams();
    if (params.has('cal')) next.set('cal', params.get('cal'));
    if (['front','panels'].includes(params.get('side'))) next.set('side', params.get('side'));
    // Explicit calibration links retain intent; ordinary external links open the universe.
    if (params.has('cal') || params.has('side')) next.set('view', 'photo');
    if (params.get('walk') === '1') next.set('view', 'human');
    if(sites.get(params.get('site')))next.set('site',params.get('site'));
    return '../' + (next.size ? '?' + next.toString() : '');
  }
  const api = {validate, validateWalkState, validateWalkCommand, message, accepts, bestEntry};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OutdoorContext = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

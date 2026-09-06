/* Shared, deliberately small contract between the two same-origin renderers. */
(function(root) {
  'use strict';
  const sites=typeof module!=='undefined'&&module.exports?require('./outdoor-sites.js'):root.OutdoorSites;
  const surfaces=typeof module!=='undefined'&&module.exports?require('./dooh-surfaces.js'):root.DoohSurfaces;
  const routes=typeof module!=='undefined'&&module.exports?require('./urban-route.js'):root.UrbanRoutes;
  const speeds=[1,2,4,6,8];
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
  const actions = ['forward','backward','left','right','look-up','look-down','home','panels','front','zoom-in','zoom-out','link','site','release','jesus','jesus-2023','inspect'];
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
  function validSurfaceRequest(p){return !!(p && surfaces.get(p.surfaceId) && Number.isSafeInteger(p.requestId) && p.requestId>0);}
  function validateSurfaceCommand(p){
    return validSurfaceRequest(p)&&['focus','cancel'].includes(p.action)&&(p.preservePano===undefined||typeof p.preservePano==='boolean')?{action:p.action,surfaceId:p.surfaceId,requestId:p.requestId,...(p.preservePano!==undefined?{preservePano:p.preservePano}:{})}:null;
  }
  function validateSurfaceState(p){
    if(!validSurfaceRequest(p)||!['loading','ready','error','cancelled'].includes(p.status)||
      (p.reason!==undefined&&!['manual','cancel','timeout','unavailable'].includes(p.reason)))return null;
    return {surfaceId:p.surfaceId,requestId:p.requestId,status:p.status,...(p.reason!==undefined?{reason:p.reason}:{})};
  }
  const validToken=p=>p&&Number.isSafeInteger(p.requestId)&&p.requestId>0;
  function validateRouteCommand(p){
    return validToken(p)&&routes.get(p.routeId)&&['start','cancel','speed'].includes(p.action)&&
      (p.speed===undefined||speeds.includes(p.speed))&&(p.action!=='speed'||p.speed!==undefined)?
      {action:p.action,routeId:p.routeId,requestId:p.requestId,...(p.speed!==undefined?{speed:p.speed}:{})}:null;
  }
  function validateRouteState(p){
    const route=p&&routes.get(p.routeId);
    if(!validToken(p)||!route||!['loading','walking','ready','error','cancelled'].includes(p.status)||
      !Number.isInteger(p.step)||p.step<0||p.step>=route.panos.length||p.total!==route.panos.length-1||
      !shortString(p.pano,250)||(p.speed!==undefined&&!speeds.includes(p.speed))||
      (p.reason!==undefined&&!['manual','cancel','timeout','unavailable','missing-link','off-route'].includes(p.reason)))return null;
    return {requestId:p.requestId,routeId:p.routeId,status:p.status,step:p.step,total:p.total,pano:p.pano,...(p.speed!==undefined?{speed:p.speed}:{}),...(p.reason!==undefined?{reason:p.reason}:{})};
  }
  function validateAudioCommand(p){
    if(!validToken(p)||!surfaces.get(p.screenId)||!['enable','disable','volume'].includes(p.action)||
      (p.volume!==undefined&&!finite(p.volume,0,1))||(p.action==='volume'&&p.volume===undefined))return null;
    return {requestId:p.requestId,screenId:p.screenId,action:p.action,...(p.volume!==undefined?{volume:p.volume}:{})};
  }
  function validateAudioState(p){
    return validToken(p)&&surfaces.get(p.screenId)&&['muted','playing','paused','blocked','unavailable'].includes(p.status)&&finite(p.volume,0,1)?
      {requestId:p.requestId,screenId:p.screenId,status:p.status,volume:p.volume}:null;
  }
  const playerActions=['open','close','next','prev','first','last','restart','play','pause','toggle-pause','seek','volume','mute','loop','content','playlist','restore','preview'];
  function validatePlayerCommand(p){
    if(!validToken(p)||!surfaces.get(p.screenId)||!playerActions.includes(p.action))return null;
    const result={screenId:p.screenId,requestId:p.requestId,action:p.action};
    const fields={seek:['seconds',v=>finite(v,0,86400)],volume:['volume',v=>finite(v,0,1)],mute:['muted',v=>typeof v==='boolean'],preview:['expanded',v=>typeof v==='boolean'],loop:['loop',v=>['one','playlist'].includes(v)],content:['contentId',v=>shortString(v,160,false)],playlist:['playlistId',v=>shortString(v,160,false)]};
    const field=fields[p.action];
    if(field){if(!field[1](p[field[0]]))return null;result[field[0]]=p[field[0]];}
    return result;
  }
  function validatePlayerState(p){
    if(!validToken(p)||!surfaces.get(p.screenId)||!['local','scheduled'].includes(p.mode)||
      !['loading','playing','paused','blocked','error'].includes(p.status)||
      !shortString(p.contentId,160)||!shortString(p.title,240)||!shortString(p.playlistId,160,false)||
      !Number.isInteger(p.total)||!finite(p.total,0,512)||!Number.isInteger(p.index)||
      (p.total===0?![-1,0].includes(p.index):!finite(p.index,0,p.total-1))||
      !finite(p.position,0,86400)||!finite(p.duration,0,86400)||!finite(p.volume,0,1)||
      typeof p.muted!=='boolean'||(p.expanded!==undefined&&typeof p.expanded!=='boolean')||!['one','playlist'].includes(p.loop)||
      !Array.isArray(p.catalog)||p.catalog.length>512||!p.catalog.every(i=>i&&shortString(i.id,160,false)&&shortString(i.title,240)&&['video','image'].includes(i.type))||
      !Array.isArray(p.playlists)||p.playlists.length>64||!p.playlists.every(i=>i&&shortString(i.id,160,false)&&shortString(i.title,240)))return null;
    if(new Set(p.catalog.map(i=>i.id)).size!==p.catalog.length||new Set(p.playlists.map(i=>i.id)).size!==p.playlists.length)return null;
    return {screenId:p.screenId,requestId:p.requestId,mode:p.mode,status:p.status,contentId:p.contentId,title:p.title,playlistId:p.playlistId,
      index:p.index,total:p.total,position:p.position,duration:p.duration,volume:p.volume,muted:p.muted,loop:p.loop,expanded:!!p.expanded,
      catalog:p.catalog.map(i=>({id:i.id,title:i.title,type:i.type})),playlists:p.playlists.map(i=>({id:i.id,title:i.title}))};
  }
  function message(type, context) {
    const payloadType=['walk-state','walk-command','surface-command','surface-state','surface-interaction','route-command','route-state','audio-command','audio-state','player-command','player-state'].includes(type)||(type==='support-select'&&context);
    const data=payloadType?{payload:context}:(context?{context}:{});
    return {channel:'admira-outdoor', version:1, type, ...data};
  }
  function accepts(event, source, origin) {
    const d = event && event.data;
    return !!(event && event.origin === origin && event.source === source && d &&
      d.channel === 'admira-outdoor' && d.version === 1 && ['ready','context','close','stop','walk-state','walk-command','support-select','surface-command','surface-state','surface-interaction','route-command','route-state','audio-command','audio-state','player-command','player-state'].includes(d.type) &&
      (d.type !== 'context' || validate(d.context)) &&
      (d.type !== 'walk-state' || validateWalkState(d.payload)) &&
      (d.type !== 'walk-command' || validateWalkCommand(d.payload)) &&
      (d.type!=='route-command'||validateRouteCommand(d.payload)) &&
      (d.type!=='route-state'||validateRouteState(d.payload)) &&
      (d.type!=='audio-command'||validateAudioCommand(d.payload)) &&
      (d.type!=='audio-state'||validateAudioState(d.payload)) &&
      (d.type!=='player-command'||validatePlayerCommand(d.payload)) &&
      (d.type!=='player-state'||validatePlayerState(d.payload)) &&
      (d.type!=='surface-command'||validateSurfaceCommand(d.payload)) &&
      (d.type!=='surface-state'||validateSurfaceState(d.payload)) &&
      (d.type!=='surface-interaction'||(d.payload&&d.payload.reason==='manual')) &&
      (d.type !== 'support-select' || d.payload===undefined || (d.payload && !!sites.get(d.payload.siteId) && (d.payload.screenId===undefined || surfaces.get(d.payload.screenId)?.siteId===d.payload.siteId))));
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
    if(params.get('tour')==='dooh'){next.set('tour','dooh');next.set('view','human');}
    if(['walk','direct'].includes(params.get('travel')))next.set('travel',params.get('travel'));
    if(speeds.map(String).includes(params.get('speed')))next.set('speed',params.get('speed'));
    return '../' + (next.size ? '?' + next.toString() : '');
  }
  const api = {validate, validateWalkState, validateWalkCommand, validateSurfaceCommand, validateSurfaceState, validateRouteCommand, validateRouteState, validateAudioCommand, validateAudioState, validatePlayerCommand, validatePlayerState, message, accepts, bestEntry};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OutdoorContext = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

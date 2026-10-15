import {deduceScreenTags, targetMatches} from './_playlist-live.js';

const text = v => String(v || '').trim();
/** Catálogo de destinos y pertenencias reales; un servicio no cambia la identidad física. */
export function stockCatalog(snapshot) {
  const names = new Map((snapshot.projects || []).map(p=>[p.id,p.name])), rows=[], assignments=[];
  for (const s of snapshot.screens || []) {
    const f=s.facts||{}, base=deduceScreenTags(f), site=f.xpace||'sin-ubicacion';
    const row={project:f.project||'sin-proyecto',projectName:names.get(f.project)||f.project||'Sin proyecto',
      circuit:f.circuit||'sin-circuito',circuitName:f.circuit||'Sin circuito',location:site,
      locationName:snapshot.xpaces?.[site]||f.xpaceName||site,screen:s.screen,deviceName:s.name||s.screen};
    const contexts=[row];
    for (const c of snapshot.circuits || []) {
      if (!c || c.enabled===false || !targetMatches(c.target,base)) continue;
      const project=c.catalogProject||c.service?.brand||row.project;
      contexts.push({...row,project,projectName:names.get(project)||project,circuit:c.id,circuitName:c.name||c.id,service:c.service?.use||''});
    }
    rows.push(...contexts);
    const p=(snapshot.playlists||[]).find(p=>p.screen===s.screen);
    if (!p?.items?.length) continue;
    // Todas las rutas autorizadas son visibles. El id común cuenta una sola
    // playlist aunque se acceda a ella desde varios proyectos o circuitos.
    for(const context of contexts) assignments.push({id:'default:'+s.screen,name:p.name||'Por defecto',screen:s.screen,synthetic:!!p.synthetic,
      ...context,stockIds:[...new Set(p.items.map(i=>text(i.stockId)).filter(Boolean))]});
  }
  return {ok:true,rows,assignments,partial:!!snapshot.partial};
}

export function appendStockItems(draft, items) {
  const current=Array.isArray(draft.manual)?draft.manual:draft.items||[];
  const ids=new Set((draft.items||current).map(i=>text(i.stockId))), added=items.filter(i=>!ids.has(text(i.stockId)));
  if (draft.synthetic&&added.length) throw new Error('automatic_playlist_requires_explicit_pin');
  if(current.length+added.length>200) throw new Error('playlist_full');
  return {items:[...current,...added],added:added.length};
}

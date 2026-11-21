// The sequence is assigned by D1. Retried deliveries keep their original position.
const schema = `CREATE TABLE IF NOT EXISTS import_delivery (
  seq INTEGER PRIMARY KEY, screen TEXT NOT NULL, event TEXT NOT NULL, priority INTEGER NOT NULL,
  stock TEXT NOT NULL, item TEXT NOT NULL, UNIQUE(screen,event))`;
const index = 'CREATE INDEX IF NOT EXISTS import_delivery_screen ON import_delivery(screen,priority,seq)';
const empty = () => ({emergency:null, front:[], tail:[]});
export const validEvent = v => typeof v === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
export async function priorityState(db,screen) {
  if (!db) throw Error('priority_unavailable');
  try {
    const {results} = await db.prepare(`WITH ranked AS (
      SELECT *, row_number() OVER (PARTITION BY CASE WHEN priority IN (0,3) THEN '' ELSE stock END ORDER BY seq DESC) AS rank
      FROM import_delivery WHERE screen=?)
      SELECT event,priority,item FROM ranked WHERE rank=1 AND priority!=3
      ORDER BY priority, CASE WHEN priority=1 THEN -seq ELSE seq END`).bind(screen).all();
    const state=empty();
    for(const r of results) {
      const item={...JSON.parse(r.item),event:r.event,priority:r.priority};
      if(r.priority===0)state.emergency=item;
      else (r.priority===1?state.front:state.tail).push(item);
    }
    return state;
  } catch(e) {
    if(/no such table: import_delivery/.test(String(e.message)))return empty();
    throw e;
  }
}
export async function writePriority(db,{screen,event,priority,item,expected}) {
  await db.batch([db.prepare(schema),db.prepare(index)]);
  // A late acknowledgement from an older incident cannot end its replacement.
  const stock=priority===3?expected:item.stockId;
  const filter=priority===3?' AND ?=(SELECT event FROM import_delivery WHERE screen=? AND priority IN (0,3) ORDER BY seq DESC LIMIT 1)':'';
  // The same transaction checks the venue binding even if it was created after the catalog read.
  const hasBindings=(await db.prepare("SELECT name FROM sqlite_master WHERE name='xpace_playlist_screen' AND type='table'").all()).results.length>0;
  const fence=hasBindings?' AND NOT EXISTS (SELECT 1 FROM xpace_playlist_screen WHERE screen_id=?)':'';
  const args=[screen,event,priority,stock,JSON.stringify(item||null)];
  if(priority===3)args.push(expected,screen);
  if(hasBindings)args.push(screen);
  const [_,read]=await db.batch([
    db.prepare('INSERT INTO import_delivery(screen,event,priority,stock,item) SELECT ?,?,?,?,? WHERE 1'+filter+fence+' ON CONFLICT(screen,event) DO NOTHING').bind(...args),
    db.prepare('SELECT stock,priority FROM import_delivery WHERE screen=? AND event=?').bind(screen,event)
  ]);
  const saved=read.results[0];
  if(!saved||saved.stock!==stock||saved.priority!==priority)return false;
  return true;
}

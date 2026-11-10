// Señal de REPOSO del Stream Deck XL de AdmiraNeXT01 (antes METAHUMAN) · 10-nov-2026.
// El puente (tools/streamdeck-bridge/puente.py) la manda dentro de su POST /streamdeck cuando el deck está en
// salvapantallas con la playlist admira-tv-streamdeck. La nube la guarda recortada y la devuelve en
// GET /streamdeck/estado como `reposo`. Contrato: admira.store admira-xp/docs/objeto-stream-deck.md § «Señal de reposo».
export const ESTADOS_REPOSO = ['reposo', 'activo'];

const texto = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const entero = (v, min = 0) => (Number.isFinite(Number(v)) && Number(v) >= min ? Math.floor(Number(v)) : null);
function httpsOVacio(u) {
  try { const url = new URL(String(u || '')); return url.protocol === 'https:' ? url.href.slice(0, 300) : ''; } catch { return ''; }
}

// Devuelve el objeto a guardar, o null (borra / ignora). `ahora` = reloj de la nube, para el ts si falta.
export function normalizarReposo(r, ahora = Date.now()) {
  if (!r || typeof r !== 'object' || Array.isArray(r) || !ESTADOS_REPOSO.includes(r.estado)) return null;
  const pl = r.playlist && typeof r.playlist === 'object' ? r.playlist : {};
  const p = r.pieza && typeof r.pieza === 'object' && !Array.isArray(r.pieza) ? r.pieza : null;
  const pieza = p ? { id: texto(p.id, 60), title: texto(p.title, 120), sub: texto(p.sub, 80), seconds: entero(p.seconds),
    index: entero(p.index), total: entero(p.total, 1), poster: httpsOVacio(p.poster), desde: entero(p.desde) } : null;
  return {
    estado: r.estado, desde: entero(r.desde), ts: entero(r.ts) ?? ahora, fuente: texto(r.fuente, 40), recibido: ahora,
    playlist: { screen: texto(pl.screen, 60) || 'admira-tv-streamdeck', name: texto(pl.name, 80), rev: entero(pl.rev), total: entero(pl.total, 1) },
    pieza: pieza && (pieza.id || pieza.title) ? pieza : null
  };
}

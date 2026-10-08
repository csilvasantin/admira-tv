/* aviso-parrilla.js — la parrilla avisa cuando «Por defecto» no está en antena (8-oct-2026).
 *
 * Se carga desde /parrilla/ con una sola etiqueta <script> para no tocar su código. Hace dos cosas, sólo leyendo:
 *   · mantiene el enlace «¿Qué emite ahora? ↗» (#emisionLink) apuntando a /emision/?screen=<dispositivo activo>;
 *   · en el editor de «Por defecto» (?playlist=default), pregunta a /api/emision?resumen=1 y, si otra capa
 *     (sincro, una reserva own/paid de la franja, el mural…) anula esa playlist, lo dice encima del editor.
 * El dispositivo activo lo lee de la URL (?device=), que la parrilla mantiene al cambiar de selector.
 */
(function () {
  'use strict';
  if (window.__emisionAviso) return; window.__emisionAviso = true;
  var NOMBRES = { xtore: 'el modo música de Xtore', mural: 'el mural extendido', hashtag: 'el hashtag del mando', sincro: 'la sincro', parrilla: 'una reserva de la parrilla', stock: 'el Stock' };
  var actual = '', pedido = 0, timer = 0;
  function dispositivo() { var q = new URLSearchParams(location.search); return (q.get('device') || q.get('screen') || '').trim().toLowerCase(); }
  function porDefecto() { return new URLSearchParams(location.search).get('playlist') === 'default'; }
  function caja() {
    var b = document.getElementById('emisionAviso');
    if (b) return b;
    var st = document.createElement('style');
    st.textContent = '#emisionAviso{display:flex;gap:10px 14px;align-items:center;flex-wrap:wrap;margin:0 0 12px;padding:11px 14px;border:1px solid #6b5426;border-radius:14px;background:#1c160a;color:#ffe2a8;font-size:13.5px;line-height:1.45}' +
      '#emisionAviso[hidden]{display:none}#emisionAviso b{color:#ffbd59}#emisionAviso a{margin-left:auto;color:#ffbd59;font-weight:700;white-space:nowrap}';
    document.head.appendChild(st);
    b = document.createElement('div'); b.id = 'emisionAviso'; b.setAttribute('role', 'status'); b.hidden = true;
    var ancla = document.querySelector('.context-picker') || document.querySelector('main');
    if (ancla && ancla.parentNode) ancla.parentNode.insertBefore(b, ancla.nextSibling); else document.body.prepend(b);
    return b;
  }
  function enlace(screen) {
    var a = document.getElementById('emisionLink');
    if (a) a.href = '/emision/' + (screen ? '?screen=' + encodeURIComponent(screen) : '');
  }
  function pinta(screen, d) {
    var b = caja();
    var capa = d && d.ok && (d.capas || []).find(function (c) { return c.id === 'defecto'; });
    if (!capa || capa.estado !== 'anulada') { b.hidden = true; return; }
    var quien = NOMBRES[capa.anuladaPor] || capa.anuladaPor || 'otra capa';
    b.innerHTML = '';
    var t = document.createElement('span');
    t.innerHTML = '⚠ <b>«Por defecto» no se está emitiendo ahora</b> en esta pantalla: manda ' + quien + '. ';
    var m = document.createElement('span'); m.textContent = (capa.detalle && capa.detalle.es) || '';
    var a = document.createElement('a'); a.href = '/emision/?screen=' + encodeURIComponent(screen); a.target = '_blank'; a.rel = 'noopener'; a.textContent = '¿Qué emite ahora? ↗';
    b.appendChild(t); b.appendChild(m); b.appendChild(a);
    b.hidden = false;
  }
  function consulta(force) {
    var screen = dispositivo();
    enlace(screen);
    if (!porDefecto() || !screen) { if (document.getElementById('emisionAviso')) caja().hidden = true; return; }
    if (!force && screen === actual) return;
    actual = screen;
    var mio = ++pedido;
    fetch('/api/emision?resumen=1&screen=' + encodeURIComponent(screen), { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (d) { if (mio === pedido && screen === dispositivo()) pinta(screen, d); });
  }
  function arranca() {
    consulta(true);
    // La parrilla cambia ?device= con replaceState (sin evento): se mira cada 3 s; la emisión se relee cada minuto.
    setInterval(function () { consulta(false); }, 3000);
    clearInterval(timer); timer = setInterval(function () { consulta(true); }, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})();

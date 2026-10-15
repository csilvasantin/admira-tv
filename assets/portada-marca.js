/* portada-marca.js — el color de la marca, legible sobre la portada oscura de admira.tv (Carlos, 15-oct-2026).
 *
 * La portada es oscura también con marca blanca: el fondo de la página no cambia. Pero las marcas de modo
 * claro (Starbucks, Altadis, Lumbre…) traen colores pensados para fondo blanco: el verde #00704A de
 * Starbucks se queda en 3,1:1 sobre el negro de la portada y el marrón de Lumbre casi no se ve.
 * Aquí, cada vez que se aplica o se quita una marca («admira:marca», del módulo común shared/marca-blanca.js):
 *   --mbh-acento        el color primario de la marca, aclarado lo justo para leerse (AA, 4,5:1) sobre
 *                       los fondos oscuros de la portada; textos de acento, enlaces y foco.
 *   --mbh-boton         el botón principal: el primario de la marca con su propio texto si se distingue
 *   --mbh-boton-texto   del fondo (3:1) y su texto se lee (4,5:1); si no, el acento con tinta oscura.
 * Sin marca no pone nada (la portada de Admira se queda como está). El CSS que los usa está en index.html.
 */
(function (G) {
  'use strict';
  var doc = G.document;
  if (!doc || G.AdmiraPortadaMarca) return;
  var root = doc.documentElement;
  // Fondos oscuros de la portada: el de la página (#070a10), --panel, --panel2 y el más claro de una
  // tarjeta tintada por su pilar.
  var FONDOS = ['#070a10', '#0c121c', '#101927', '#16202f'];
  var TINTA_OSCURA = '#04110b';
  var PROPS = ['--mbh-acento', '--mbh-boton', '--mbh-boton-texto'];

  function rgb(valor) {
    var v = String(valor || '').trim(), m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(v))) return m[1].split('').map(function (c) { return parseInt(c + c, 16); });
    if ((m = /^#([0-9a-f]{6})$/i.exec(v))) return [0, 2, 4].map(function (i) { return parseInt(m[1].slice(i, i + 2), 16); });
    if ((m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(v))) return [+m[1], +m[2], +m[3]];
    return null;
  }
  function hex(c) { return '#' + c.map(function (x) { return ('0' + Math.round(x).toString(16)).slice(-2); }).join(''); }
  function luminancia(c) {
    var l = c.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  }
  function contraste(a, b) {
    var la = luminancia(a), lb = luminancia(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  // El color mezclado con blanco lo justo (de 4 en 4 %) para pasar `min` sobre todos los fondos oscuros.
  function legible(c, min) {
    var fondos = FONDOS.map(rgb);
    for (var k = 0; k <= 1.0001; k += 0.04) {
      var m = c.map(function (x) { return x + (255 - x) * k; });
      if (fondos.every(function (f) { return contraste(m, f) >= min; })) return hex(m);
    }
    return '#ffffff';
  }

  function quitar() { PROPS.forEach(function (p) { root.style.removeProperty(p); }); }
  function aplicar() {
    if (!root.hasAttribute('data-mb-marca')) { quitar(); return null; }
    var cs = G.getComputedStyle(root);
    var prim = rgb(cs.getPropertyValue('--mb-primario')), texto = rgb(cs.getPropertyValue('--mb-primario-texto'));
    if (!prim) { quitar(); return null; }
    var acento = legible(prim, 4.5);
    var pagina = rgb(FONDOS[0]);
    var suyo = !!texto && contraste(prim, pagina) >= 3 && contraste(prim, texto) >= 4.5;
    var r = {acento: acento, boton: suyo ? hex(prim) : acento, botonTexto: suyo ? hex(texto) : TINTA_OSCURA};
    root.style.setProperty('--mbh-acento', r.acento);
    root.style.setProperty('--mbh-boton', r.boton);
    root.style.setProperty('--mbh-boton-texto', r.botonTexto);
    return r;
  }

  G.AdmiraPortadaMarca = {aplicar: aplicar, legible: function (v, min) { var c = rgb(v); return c ? legible(c, min || 4.5) : null; }, contraste: function (a, b) { return contraste(rgb(a), rgb(b)); }};
  doc.addEventListener('admira:marca', aplicar);
  aplicar();
})(window);

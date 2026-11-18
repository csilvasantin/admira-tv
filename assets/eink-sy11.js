// Protocolo y codificación de la tinta SY11-ab (480×800, BWRY) para el puente Web Bluetooth (/eink/puente/, 18-nov-2026).
// Es el mismo que usa el puente del Mac Studio (~/.admira-eink: eink_encode.py + eink_bridge.py), sacado de la app
// AI Cast Assistant: servicio FEE7, escritura 36F5, avisos 36F6; saludo 0x81 derivado de la MAC; imagen tramada con
// Atkinson sobre negro/blanco/rojo/amarillo, saturación 1,25, girada 180° (sin espejo), 2 bits por píxel por columnas,
// y el formato «ratio 01»: 108 000 bytes con la franja central de 12 000 duplicada, en 540 paquetes
// 86 00 <índice> + 200 bytes + 1 byte de suma. Con 96 000 bytes la pantalla nunca termina.
(function (root) {
  "use strict";
  var W = 480, H = 800;
  var PALETA = [[0, 0, 0], [255, 255, 255], [255, 0, 0], [255, 255, 0]];
  var CODIGO = [0, 1, 3, 2];   // índice de paleta → 2 bits: negro 00, blanco 01, rojo 11, amarillo 10

  function cercano(r, g, b) {
    var mejor = 0, md = Infinity;
    for (var i = 0; i < 4; i++) { var p = PALETA[i], d = (r - p[0]) * (r - p[0]) + (g - p[1]) * (g - p[1]) + (b - p[2]) * (b - p[2]); if (d < md) { md = d; mejor = i; } }
    return mejor;
  }
  // RGBA 480×800 → índices de paleta (0..3). Satura como ImageEnhance.Color(1.25) y trama con Atkinson (1/8 a 6 vecinos).
  function trama(rgba, w, h) {
    w = w || W; h = h || H;
    var n = w * h, px = new Float32Array(n * 3), out = new Uint8Array(n), f = 1.25;
    for (var i = 0; i < n; i++) {
      var r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3] / 255;
      r = r * a + 255 * (1 - a); g = g * a + 255 * (1 - a); b = b * a + 255 * (1 - a);   // transparente = blanco
      var gris = (r * 299 + g * 587 + b * 114) / 1000;
      px[i * 3] = gris + (r - gris) * f; px[i * 3 + 1] = gris + (g - gris) * f; px[i * 3 + 2] = gris + (b - gris) * f;
    }
    var vec = [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var k = (y * w + x) * 3;
      var rr = Math.max(0, Math.min(255, px[k])), gg = Math.max(0, Math.min(255, px[k + 1])), bb = Math.max(0, Math.min(255, px[k + 2]));
      var idx = cercano(rr, gg, bb); out[y * w + x] = idx;
      var p = PALETA[idx], er = Math.round((rr - p[0]) / 8), eg = Math.round((gg - p[1]) / 8), eb = Math.round((bb - p[2]) / 8);
      for (var v = 0; v < 6; v++) {
        var nx = x + vec[v][0], ny = y + vec[v][1];
        if (nx < 0 || nx >= w || ny >= h) continue;
        var q = (ny * w + nx) * 3; px[q] += er; px[q + 1] += eg; px[q + 2] += eb;
      }
    }
    return out;
  }
  // Índices 480×800 → 96 000 bytes: girado 180° y por columnas, 4 píxeles por byte (el primero en los bits altos).
  function empaqueta(idx, w, h) {
    w = w || W; h = h || H;
    var porCol = (h + 3) >> 2, buf = new Uint8Array(porCol * w);
    for (var x = 0; x < w; x++) for (var y = 0; y < h; y++) {
      var c = CODIGO[idx[(h - 1 - y) * w + (w - 1 - x)]];   // giro de 180°
      buf[x * porCol + (y >> 2)] |= c << (6 - 2 * (y & 3));
    }
    return buf;
  }
  // 96 000 bytes → 540 paquetes de 205 bytes en el formato «ratio 01».
  function paquetes(datos) {
    var mitad = datos.length >> 1, b = new Uint8Array(108000);
    b.set(datos.subarray(0, mitad), 0); b.set(datos.subarray(mitad - 6000, mitad + 6000), 48000); b.set(datos.subarray(mitad), 60000);
    var lista = [];
    for (var i = 0, n = 1; i < b.length; i += 200, n++) {
      var p = new Uint8Array(205), suma = 0;
      p[0] = 0x86; p[1] = 0x00; p[2] = (n >> 8) & 255; p[3] = n & 255;
      for (var j = 0; j < 200; j++) { p[4 + j] = b[i + j]; suma += b[i + j]; }
      p[204] = suma & 255; lista.push(p);
    }
    return lista;
  }
  // Saludo 0x81: 81 00 04 01 01 01 01 + 4 primeros bytes de SHA-256(MAC^0x4D + 01 01 01 01) + 00 00.
  async function saludo(mac, subtle) {
    var h = String(mac || "").replace(/[^0-9a-f]/gi, ""), g = new Uint8Array(10);
    for (var i = 0; i < 6; i++) g[i] = parseInt(h.substr(i * 2, 2), 16) ^ 0x4d;
    g[6] = g[7] = g[8] = g[9] = 1;
    var d = new Uint8Array(await (subtle || crypto.subtle).digest("SHA-256", g));
    return new Uint8Array([0x81, 0x00, 0x04, 1, 1, 1, 1, d[0], d[1], d[2], d[3], 0, 0]);
  }
  // Respuesta al saludo: 11 00 11 00 "SY11-014" 01E0 0320 04 … → firmware y tamaño.
  function leeInfo(v) {
    if (!v || v.length < 17 || v[0] !== 0x11) return null;
    var fw = ""; for (var i = 4; i < 12; i++) if (v[i]) fw += String.fromCharCode(v[i]);
    return { firmware: fw, width: (v[12] << 8) | v[13], height: (v[14] << 8) | v[15], colorModel: v[16] };
  }
  function hex(u8) { return Array.prototype.map.call(u8, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }

  var api = { W: W, H: H, PALETA: PALETA, trama: trama, empaqueta: empaqueta, paquetes: paquetes, saludo: saludo, leeInfo: leeInfo, hex: hex,
    SERVICIO: 0xfee7, ESCRITURA: 0x36f5, AVISOS: 0x36f6, MAC_SY11: "FFFFFF10B4B6" };
  root.EinkSY11 = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

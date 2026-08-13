/* Sesión del copiloto CMS. Fuente de verdad del token:
 *   · Yokup  → payload.firma (2 partes). exp en milisegundos (Date.now()).
 *   · JWT    → header.payload.firma (3 partes). exp en segundos Unix.
 * sessionValid() leía siempre split(".")[0]: en un JWT eso es la cabecera
 * (alg/typ, sin exp) y la sesión se daba por caducada en cada recarga. */
(function (g) {
  "use strict";

  function b64urlJson(part) {
    var b64 = String(part || "").replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var bin = atob(b64);
    try { return JSON.parse(decodeURIComponent(escape(bin))); }
    catch (_) { return JSON.parse(bin); }
  }

  function sessionPayload(token) {
    if (!token || String(token).indexOf(".") < 0) return null;
    var parts = String(token).split(".");
    var raw = parts.length >= 3 ? parts[1] : parts[0];
    try { return b64urlJson(raw); } catch (_) { return null; }
  }

  function sessionValid(token, now) {
    var p = sessionPayload(token);
    if (!p || !p.exp) return false;
    var expMs = Number(p.exp);
    if (!isFinite(expMs) || expMs <= 0) return false;
    if (expMs < 1e12) expMs *= 1000;
    return (now || Date.now()) < expMs - 30000;
  }

  g.AdmiraSession = { payload: sessionPayload, valid: sessionValid };
})(typeof globalThis !== "undefined" ? globalThis : this);

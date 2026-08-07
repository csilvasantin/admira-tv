/* admira-version-watch.js — «⟳ VERSIÓN NUEVA · RECARGAR» para cualquier site de la casa.
 *
 * Por qué (Carlos, 7-ago-2026): «el tema del botón debería aparecer en todos
 * nuestros sites porque es muy buena solución». Nació en yokup.com y el problema
 * que resuelve lo tienen todos: una pestaña abierta desde antes de un despliegue
 * SIGUE refrescando sus datos —los sondeos no paran— pero ejecuta el JavaScript
 * de su carga. La pantalla enseña cifras de hoy pintadas con código de ayer, y
 * nadie sospecha nada porque todo parece vivo.
 *
 * Y viene con la lección aprendida (incidencia SVC-5FSKZH): NUNCA se comparan dos
 * fuentes distintas. La primera versión de esto enfrentaba el ?v= escrito a mano
 * en cada HTML contra el sello de /version.json; sólo casan si todos los caminos
 * de publicación las escriben a la vez, y casi nunca es así. La condición era
 * cierta siempre, el aviso salía en cada carga y recargar no lo quitaba. Un aviso
 * que salta siempre es peor que no tenerlo: el día que de verdad haya versión
 * nueva, nadie le hará caso.
 *
 * Así que cada fuente se compara CONSIGO MISMA a lo largo de la vida de la pestaña:
 *   · el sello de /version.json, contra el que se leyó al cargar;
 *   · la huella (ETag) de este mismo fichero, contra la de su carga.
 * Recargar limpia el aviso siempre —la referencia se toma de nuevo— y basta con
 * que UNA se mueva para avisar: el ETag detecta un despliegue aunque el sello esté
 * congelado, y el sello lo detecta aunque un intermediario sirva el mismo ETag.
 * Si no hay ninguna de las dos, no se dice nada: sin nada que comparar, callar.
 *
 * Se instala con una línea y sin dependencias:
 *   <script src="/assets/admira-version-watch.js" defer></script>
 */
(function () {
  "use strict";
  var SRC = (document.currentScript && document.currentScript.src) || "";
  var selloRef = null, huellaRef = null, avisado = false;

  function avisa(sello) {
    if (avisado) return;
    avisado = true;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "admira-stale";
    b.setAttribute("aria-live", "polite");
    b.innerHTML = '<span aria-hidden="true">⟳</span> VERSIÓN NUEVA · RECARGAR';
    b.title = "Se ha publicado algo desde que abriste esta pestaña" +
              (sello ? " (ahora en producción: " + sello + ")" : "") +
              ". Los datos se refrescan, el código no: recarga para verlos bien.";
    // No se recarga solo: puede haber un filtro puesto o un formulario a medias.
    // Se ofrece, y decide quien mira.
    b.addEventListener("click", function () { location.reload(); });
    // Estilo propio para no depender del CSS del site que lo monte. Ámbar, no
    // rojo: es una cortesía, no una avería.
    var css = document.createElement("style");
    css.textContent =
      ".admira-stale{position:fixed;right:14px;bottom:14px;z-index:2147483000;" +
      "font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;" +
      "display:inline-flex;align-items:center;gap:6px;padding:9px 12px;border:0;border-radius:8px;" +
      "background:#ffb454;color:#231400;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35);" +
      "animation:admira-stale-in .25s ease-out}" +
      ".admira-stale:hover{filter:brightness(1.07)}" +
      ".admira-stale:focus-visible{outline:2px solid #231400;outline-offset:2px}" +
      "@keyframes admira-stale-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}" +
      "@media (prefers-reduced-motion:reduce){.admira-stale{animation:none}}";
    document.head.appendChild(css);
    document.body.appendChild(b);
  }

  function miraSello() {
    // El query evita intermediarios que ignoren cache:no-store.
    fetch("/version.json?vw=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var v = d && (d.version || d.sello);
        if (!v) return;
        v = String(v).trim();
        if (selloRef === null) { selloRef = v; return; }
        if (v !== selloRef) avisa(v);
      })
      .catch(function () {});
  }

  function miraHuella() {
    if (!SRC) return;
    fetch(SRC, { method: "HEAD", cache: "no-store" })
      .then(function (r) {
        if (!r.ok) return;
        var h = r.headers.get("etag") || r.headers.get("last-modified");
        if (!h) return;
        if (huellaRef === null) { huellaRef = h; return; }
        if (h !== huellaRef) avisa(selloRef);
      })
      .catch(function () {});
  }

  function ronda() { miraSello(); miraHuella(); }

  // La primera ronda va nada más cargar y sólo TOMA LA REFERENCIA: es lo que hace
  // que recargar limpie el aviso.
  ronda();
  // Cada 2 min basta: es una cortesía, no un latido. Y al volver a la pestaña,
  // que es justo cuando se mira una que llevaba horas abierta.
  setInterval(ronda, 120000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) ronda(); });
})();

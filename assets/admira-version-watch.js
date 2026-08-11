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
 * Así que /version.json se compara CONSIGO MISMO a lo largo de la vida de la
 * pestaña. No basta con mirar sólo `version`: cada deploy regenera también
 * `deployedAt` y declara el commit. Eso permite avisar aunque alguien publique
 * por error sin subir la r. El ETag de este script NO sirve para detectar ese
 * caso: si el script no cambió, su ETag tampoco cambia.
 *
 * Recargar limpia el aviso siempre —la referencia se toma de nuevo—. Si el
 * release no responde o no declara ninguna identidad, no se dice nada: sin nada
 * que comparar, callar.
 *
 * Se instala con una línea y sin dependencias:
 *   <script src="/assets/admira-version-watch.js" defer></script>
 */
(function () {
  "use strict";
  var releaseRef = null, avisado = false, comprobando = false, repetir = false;

  function identidad(d) {
    if (!d) return null;
    var version = String(d.version || d.sello || "").trim();
    var commit = String(d.gitFull || d.git || d.gitShort || "").trim();
    var deployedAt = String(d.deployedAt || "").trim();
    var signature = String(d.signature || "").trim();
    var fingerprint = [version, commit, deployedAt, signature].filter(Boolean).join("|");
    return fingerprint ? { fingerprint: fingerprint, version: version } : null;
  }

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

  function miraRelease() {
    // El query evita intermediarios que ignoren cache:no-store.
    var vigente = true;
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var opciones = { cache: "no-store" };
    if (controller) opciones.signal = controller.signal;
    var limite;
    var red = fetch("/version.json?vw=" + Date.now(), opciones)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!vigente) return;
        var actual = identidad(d);
        if (!actual) return;
        if (releaseRef === null) { releaseRef = actual; return; }
        if (actual.fingerprint !== releaseRef.fingerprint) avisa(actual.version);
      })
      .catch(function () {});
    var tiempo = new Promise(function (resolve) {
      limite = setTimeout(function () {
        vigente = false;
        if (controller) controller.abort();
        resolve();
      }, 8000);
    });
    return Promise.race([red, tiempo]).then(function () { clearTimeout(limite); });
  }

  function ronda() {
    // visibilitychange, focus y el intervalo pueden coincidir. Una sola lectura
    // activa y, si llegó otra señal, una repetición al terminar: sin carreras
    // que conviertan una respuesta vieja en la nueva referencia.
    if (comprobando) { repetir = true; return; }
    comprobando = true;
    miraRelease().then(function () {
      comprobando = false;
      if (repetir) { repetir = false; ronda(); }
    });
  }

  // La primera ronda va nada más cargar y sólo TOMA LA REFERENCIA: es lo que hace
  // que recargar limpie el aviso.
  ronda();
  // En operación, dos minutos dejan demasiado tiempo una consola con código
  // viejo. 30 s sigue siendo una petición minúscula y focus/online/pageshow
  // cubren el regreso inmediato a una pestaña que llevaba horas abierta.
  setInterval(ronda, 30000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) ronda(); });
  window.addEventListener("focus", ronda);
  window.addEventListener("online", ronda);
  window.addEventListener("pageshow", ronda);
})();

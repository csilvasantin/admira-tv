/* Playlist en vivo, solo lectura.
 * Ahora: GET api.admira.store/signage/now (lo que la pantalla dice emitir).
 * Siguiente: la pieza que sigue en GET /api/control/playlist (la cola que publicó).
 * No hay escrituras: ni emisión, ni playlist, ni órdenes.
 */
(function (G) {
  "use strict";
  var PANTALLA = "xpaceos-web";
  var CADA_MS = 15000;

  function pistaDe(ahora, cola) {
    var item = ahora && ahora.item;
    var items = cola && Array.isArray(cola.items) ? cola.items : [];
    if (!item || !item.id) return { estado: "vacio" };
    var i = -1;
    for (var n = 0; n < items.length; n++) {
      if (items[n] && items[n].id === item.id) { i = n; break; }
    }
    var publicada = i >= 0 ? items[i] : null;
    var siguiente = i >= 0 && items.length > 1 ? items[(i + 1) % items.length] : null;
    return {
      estado: "en-antena",
      titulo: item.title || item.id,
      portada: (publicada && publicada.thumb) || item.thumbnail || (item.type === "image" ? item.url : "") || "",
      duracion: Number(item.dur) || 0,
      desde: Number(item.startedAt) || 0,
      siguiente: siguiente ? { titulo: siguiente.title || siguiente.id, portada: siguiente.thumb || "" } : null,
      enCola: i >= 0
    };
  }

  function portadaSegura(url) {
    try {
      var u = new URL(String(url || ""));
      if (u.protocol !== "https:") return "";
      if (u.hostname !== "stock.admira.store" && u.hostname !== "api.admira.store") return "";
      return u.href;
    } catch (_) { return ""; }
  }

  function pantallaDe(search) {
    var q = "";
    try { q = new URLSearchParams(String(search || "")).get("screen") || ""; } catch (_) { q = ""; }
    q = String(q).trim().toLowerCase();
    return /^[a-z0-9][a-z0-9-]{1,79}$/.test(q) ? q : PANTALLA;
  }

  G.AdmiraEnvivo = { pistaDe: pistaDe, portadaSegura: portadaSegura, pantallaDe: pantallaDe, pantalla: PANTALLA };

  var doc = G.document;
  if (!doc || !doc.getElementById) return;

  var pantalla = pantallaDe(G.location && G.location.search);
  var timer = null;

  function en() {
    return /^en/i.test((doc.documentElement && doc.documentElement.lang) || "");
  }
  function txt(es, enTexto) { return en() ? enTexto : es; }

  function pintaPortada(img, vacio, url, titulo) {
    var src = portadaSegura(url);
    if (!src) {
      img.removeAttribute("src");
      img.hidden = true;
      vacio.hidden = false;
      return;
    }
    img.alt = titulo || "";
    img.hidden = false;
    vacio.hidden = true;
    img.onerror = function () { img.hidden = true; vacio.hidden = false; };
    if (img.getAttribute("src") !== src) img.src = src;
  }

  function pinta(pista, fallo) {
    var ahora = doc.getElementById("ahoraTitulo");
    var meta = doc.getElementById("ahoraMeta");
    var sig = doc.getElementById("siguienteTitulo");
    var sigNota = doc.getElementById("siguienteNota");
    var estado = doc.getElementById("envivoEstado");
    if (fallo) {
      ahora.textContent = txt("No se ha podido leer.", "Couldn't read it.");
      meta.textContent = "";
      sig.textContent = "—";
      sigNota.textContent = "";
      estado.textContent = txt("La lectura ha fallado. Se reintenta sola.", "The read failed. It will retry on its own.");
      return;
    }
    if (!pista || pista.estado !== "en-antena") {
      ahora.textContent = txt("Sin emisión activa.", "Nothing on air.");
      meta.textContent = pantalla;
      sig.textContent = "—";
      sigNota.textContent = txt("No hay una pieza siguiente que informar.", "There is no next piece to report.");
      pintaPortada(doc.getElementById("ahoraPortada"), doc.getElementById("ahoraSinPortada"), "", "");
      pintaPortada(doc.getElementById("siguientePortada"), doc.getElementById("siguienteSinPortada"), "", "");
      estado.textContent = txt("Actualizado ahora.", "Updated just now.");
      return;
    }
    ahora.textContent = pista.titulo;
    var partes = [pantalla];
    if (pista.duracion) partes.push(pista.duracion + " s");
    if (pista.desde && pista.desde < Date.now()) {
      var s = Math.max(0, Math.round((Date.now() - pista.desde) / 1000));
      partes.push(txt("lleva " + s + " s", "on for " + s + " s"));
    }
    meta.textContent = partes.join(" · ");
    pintaPortada(doc.getElementById("ahoraPortada"), doc.getElementById("ahoraSinPortada"), pista.portada, pista.titulo);
    if (pista.siguiente) {
      sig.textContent = pista.siguiente.titulo;
      sigNota.textContent = txt("La siguiente de la cola publicada.", "Next in the published queue.");
      pintaPortada(doc.getElementById("siguientePortada"), doc.getElementById("siguienteSinPortada"), pista.siguiente.portada, pista.siguiente.titulo);
    } else {
      sig.textContent = "—";
      sigNota.textContent = pista.enCola
        ? txt("La cola publicada no tiene otra pieza.", "The published queue has no other piece.")
        : txt("La cola publicada no incluye esta pieza.", "The published queue does not include this piece.");
      pintaPortada(doc.getElementById("siguientePortada"), doc.getElementById("siguienteSinPortada"), "", "");
    }
    estado.textContent = txt("Actualizado ahora. Se refresca sola.", "Updated just now. It refreshes on its own.");
  }

  function leer(url) {
    return fetch(url, { method: "GET", cache: "no-store", credentials: "omit" }).then(function (r) {
      if (!r.ok) throw new Error("lectura");
      return r.json();
    });
  }

  function refrescar() {
    var q = encodeURIComponent(pantalla);
    return Promise.all([
      leer("https://api.admira.store/signage/now?screen=" + q),
      leer("/api/control/playlist?screen=" + q)
    ]).then(function (par) {
      pinta(pistaDe(par[0], par[1]), false);
    }).catch(function () { pinta(null, true); });
  }

  function arrancar() {
    doc.getElementById("pantallaNombre").textContent = pantalla;
    refrescar();
    timer = G.setInterval(refrescar, CADA_MS);
    var boton = doc.getElementById("envivoRefrescar");
    if (boton) boton.addEventListener("click", refrescar);
    doc.addEventListener("admira:languagechange", function () { refrescar(); });
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})(window);

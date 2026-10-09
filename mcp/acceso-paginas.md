# Páginas con verja · `AdmiraTvAuth.ready()` y `AdmiraTvAuth.expired()` (contrato para quien programa páginas · 9-oct-2026)

Toda página humana de admira.tv lleva la verja `auth-gate.js` en el `<head>`. La verja oculta la página
(`<html class="gate-locked">`) hasta que la cuenta de Google tiene permiso para el proyecto de esa ruta. Desde el
9-oct-2026 (admira.tv #64, arreglo del bucle de recarga) expone dos funciones que **toda página que llame a una API
al arrancar** tiene que usar.

Ayuda para personas: https://admira.tv/help/#paginas-acceso · Código: `auth-gate.js` (`window.AdmiraTvAuth`) · Prueba:
`auth-gate-bucle-401.test.mjs`.

## El fallo que lo motivó

Sin sesión, `/users/` y `/remotecontrol/` llamaban a su API **antes** de que la verja dejara pasar. El 401 borraba la
sesión y recargaba la página; la verja volvía a empezar sin llegar a pintar el botón de Google. En el iPad se veía
«Estableciendo enlace» volviendo a 48 %, 46 %, 36 %…; en local, 11 recargas en 10 s en `/users/` y 155 en 8 s en
`/remotecontrol/`. Con el arreglo, una sola carga.

## El contrato

| Función | Devuelve | Úsala para |
|---|---|---|
| `AdmiraTvAuth.ready()` | Una promesa que se cumple cuando la verja quita `gate-locked` (al instante si ya está abierta) | Arrancar la página: primera llamada a la API **y** los refrescos periódicos (`setInterval`) |
| `AdmiraTvAuth.expired()` | `true` si va a recargar; `false` si ya recargó hace menos de un minuto | Tratar un **401** de la API con la página ya abierta: tira la sesión y recarga **una vez por minuto como mucho** para que la verja pida entrar otra vez |

Además siguen: `AdmiraTvAuth.authorization()` (cabecera `Bearer` de la sesión antigua, o `""`), `credential()` y
`clear()` (cierra la sesión: borra la local y llama a `POST /auth/logout`).

Reglas:

1. **No llames a la API antes de `ready()`.** Tampoco arranques temporizadores de refresco antes.
2. **Un 401 pasa siempre por `expired()`.** Nunca `location.reload()` a mano tras un 401.
3. Si `expired()` devuelve `false`, **dilo en la página** («sesión caducada: vuelve a entrar») en vez de recargar.
4. Comprueba que `window.AdmiraTvAuth` existe: una página sin verja (o con una verja antigua en caché) debe seguir
   funcionando.
5. Las páginas que no llevan verja (`canal.html` y el runtime del player) no se tocan: la emisión es siempre libre.

## Ejemplo mínimo

```html
<head>
  <script src="/auth-gate.js?v=<token del sello>"></script>
  …
</head>
<body>
  …
  <p id="estado" role="status"></p>
  <script>
    const A = window.AdmiraTvAuth;
    const listo = (A && A.ready) ? A.ready() : Promise.resolve();

    async function api(ruta) {
      const bearer = (A && A.authorization) ? A.authorization() : "";   // sesión antigua; la cookie va sola
      const r = await fetch(ruta, { credentials: "same-origin", cache: "no-store",
        headers: bearer ? { Authorization: bearer } : {} });
      if (r.status === 401) {
        const recarga = (A && A.expired) ? A.expired() : false;
        if (!recarga) document.getElementById("estado").textContent = "Sesión caducada: vuelve a entrar.";
        throw new Error("sesión caducada");
      }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }

    async function cargar() { /* pintar con await api("/api/…") */ }

    listo.then(() => {
      cargar();
      setInterval(cargar, 30000);   // los refrescos también, después de ready()
    });
  </script>
</body>
```

El token `?v=` de `auth-gate.js` lo pone el sello de la release (`tools/sella-versiones.py`): no lo escribas a mano.
Para que la ruta nueva pida el permiso correcto, añádela a `PATH_PROJECTS` de `auth-gate.js` (por ejemplo, `emision` y
`programacion` piden `digitalsignage-player`).

## Comprobar

- Sin sesión, la página se queda en la verja con el botón de Google visible y **no recarga** (DevTools → Red: una sola
  carga del documento).
- Con sesión caducada (borrar la cookie con la página abierta), el siguiente 401 recarga una vez; si vuelve a fallar
  antes de un minuto, la página lo dice y no recarga.
- `node --test auth-gate-bucle-401.test.mjs`.

## EN · summary

Every human page loads `auth-gate.js`, which hides the page until access is granted. Pages that call an API on
startup must wait for `AdmiraTvAuth.ready()` (a promise resolved when `gate-locked` is removed) before the first call
and before starting refresh timers, and must route every 401 through `AdmiraTvAuth.expired()` (clears the session and
reloads at most once per minute; returns `false` otherwise, so the page should say the session expired). This fixed
the reload loop on `/users/` and `/remotecontrol/` (admira.tv #64).

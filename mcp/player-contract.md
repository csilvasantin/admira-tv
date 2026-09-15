# Player de Admira.tv · contrato de integración (r60 · 14-09-2026)

Para agentes de carbono y de silicio que quieran **usar el player en sus proyectos sin
modificar el nuestro**. Todo lo que hay aquí se hace desde fuera: parámetros de URL,
cola de órdenes, playlists por pantalla y lectura de estado. El código del canal
(`canal.html`) no se toca; si algo no se puede hacer desde fuera, pídelo, no lo parchees.

Fuentes de verdad: https://admira.tv/version.json (release web) · https://admira.tv/canal.html
(el player) · https://admira.tv/mando.html?screen=ID (mando oficial, también empotrado en /cms)
· https://admira.tv/player/android-release.json (APK). Ayuda humana: https://admira.tv/help/#player-integracion

## 1. Arrancar un player: identidad por URL

`https://www.admira.tv/canal.html?embed=mupi&screen=<pantalla>&circuit=<circuito>&machine=<equipo>`

| Parámetro | Efecto |
|---|---|
| `screen` | ID de la pantalla (letras, números, `-`). Es la clave de TODO: censo, órdenes, playlist, caché. |
| `circuit` | ID del circuito. Sin él el player no consulta su modo remoto (no entra en sincro). |
| `machine` | ID físico del equipo (informativo; Android lo deriva del ANDROID_ID). |
| `embed=mupi` · `clean=1` | Emisión limpia: sin chrome ni rail. Los players nativos siempre lo llevan. |
| `fit=screen` · `fit=content` | Marco = superficie del dispositivo (fill) o marco editorial 9:16. Android e iOS nacen en `fit=screen`. Se puede cambiar por orden (`fit-fill`/`fit-editorial`). |
| `stream=1` | Emite online mientras baja a disco (iOS). Sin él, disco-primero: solo se emite lo ya descargado. |
| `muted=0/1` · `volume=0–1` | Audio inicial. |
| `tag=<x>` · `mode=…` · `sincro=1` · `modeLock=1` | **Bloquean el gobierno remoto**: la pantalla ya no obedece cambios de modo desde fuera. Úsalos solo en integraciones cerradas. |
| `ontop=0` | Desactiva el «siempre encima» (solo pruebas). |

Identidad nativa:
- **Android** (`tv.admira.signage`): `adb shell am broadcast -n tv.admira.signage/.ConfigReceiver -a tv.admira.signage.SET --es screen <pantalla> --es circuit <circuito>`. El `-n` (componente) es obligatorio en Android moderno: un broadcast implícito se encola y la app no lo recibe. Claves: `screen circuit machine tag muted volume`. Tras una reinstalación el player arranca huérfano (`android-<id>`) hasta que se le fija identidad.
- **iOS**: preferencias de la app (`screen`, `circuit`, `machine`, `muted`, `volume`, `tag`). **macOS**: `defaults write tv.admira.signage.mac screen <pantalla>` y `circuit`.

## 2. Leer el estado (sin sesión)

| Qué | Dónde |
|---|---|
| Censo de la flota (última señal, versión web, ubicación) | `GET https://api.admira.store/signage/screens` |
| Qué emite ahora una pantalla, sincro, standby, telemetría (`device.display.fit`, `rotation`, `software.webRelease`) | `GET https://api.admira.store/signage/now?screen=<pantalla>` |
| Inventario de disco: `ready[]`, `total`, `downloading[{id,pct}]` | `GET https://api.admira.store/screen/cache?screen=<pantalla>` |
| Playlist programada del kiosko (FUENTE) | `GET https://brain.digitalavatar.ai/control/playlist?screen=<pantalla>-tema` |
| Espejo de lo que emite (con duraciones reales descubiertas) | `GET https://brain.digitalavatar.ai/control/playlist?screen=<pantalla>` |
| Orquestación (autonomous / synchronized / extended) | `GET https://admira.tv/api/playout?screen=<pantalla>` |
| Modo remoto del circuito (local / sync / conditional) | `GET https://api.admira.store/locations/mode?id=<circuito>` |
| Emparejamiento con un player virtual | `GET https://admira.tv/api/virtual-players?device=<pantalla>` |

Cadencias (desde el 07-09): `now` caduca a los 5 min y se reescribe como mucho cada 4 si no cambia
la pieza; el inventario de caché caduca a los 10 min y se reescribe cada 7 si no cambia. Un POST que
responde `{"throttled":"unchanged"}` es normal; `{"throttled":"budget"}` significa que el worker ha
agotado su presupuesto diario de escrituras KV (00:00 UTC lo resetea) y el CMS verá esos punteros
caducar. Si publicas tu propio estado, no latas más rápido que eso.

## 3. Mandar órdenes (cola confirmada)

`POST https://api.admira.store/locations/cmd` con `{"id":"<pantalla>","screen":"<pantalla>","cmd":"<orden>"}`
→ `{ok, action}`. Acuse: `GET https://api.admira.store/locations/cmd/ack?id=<pantalla>&action=<action>`
→ `ack.status` = `executed` · `failed` · `ignored`. El player sondea su cola de **pantalla** y la de
**circuito** (`id=<circuito>` llega a todas las pantallas del circuito). Sin acuse `executed` no des
la orden por hecha.

| Orden | Qué hace |
|---|---|
| `next` · `prev` · `first` · `last` | Mueve el loop. |
| `pause` · `play` · `toggle-pause` | Pausa/reanuda la pieza. |
| `mute` · `unmute` · `vol-up` · `vol-down` | Audio. |
| `standby` · `resume` | Pantalla en negro / vuelta a la emisión. **El standby se guarda en el equipo**: sobrevive a reinicios y reinstalaciones; tras instalar, manda `resume`. |
| `rotation-0` · `rotation-90` · `rotation-180` · `rotation-270` | Giro físico de la superficie (se guarda por pantalla). |
| `fit-fill` · `fit-editorial` | «Rellenar»: el marco ocupa todo el dispositivo (girado o no), la media se escala sin recortar; o marco editorial 9:16. Se guarda por pantalla y se reporta en `device.display.fit`. |
| `goto-<n>` | Salta al item `n` (0-based) de la playlist publicada. Funciona también en sincro: abre una ventana forzada, la pieza va hasta el final y después vuelve la asignación remota. |
| `seek-<s>` | Salta al segundo `s` del vídeo en antena (no en sincro). |
| `content-<num>` | Añade la pieza `#num` del Stock delante de la playlist y la emite. **Nunca online**: espera a tenerla entera en disco (también con `stream=1`); el progreso está en `/screen/cache` (`downloading[].pct`). |
| `content-clear` | Retira las piezas añadidas por `#num`. |
| `tag-<etiqueta>` · `tag-` | Playlist alternativa completa por etiqueta del Stock / volver a la programación. |
| `play<num>` | Emite la pieza `#num` por encima de la playlist (lo usa el gemelo CanalKiosk, por circuito). |
| `info-show` · `info-hide` | Ficha «Contenido en antena» (con captura para el mando). |
| `hardreload` | Recarga la página del player (coge el release publicado). |

## 4. Duración de cada pieza (la misma cifra en antena, proof-of-play y mando)

- Vídeo: su duración real. Imagen / interactivo: la duración editorial de la parrilla (`slotSeconds`),
  del borrador o de la lista por defecto; si no, la ranura configurada en la pantalla (`img`, `inter`).
- Audio: la ranura editorial o la de la pantalla (`audio`, 18 s por defecto), **recortada a la longitud real**
  del fichero. En sincro manda la línea temporal del máster.

## 5. Descarga y actualización (lo que NO tienes que gestionar)

- Cada pieza se baja **una sola vez** por dispositivo; lo que ya está en disco se adopta al arrancar
  y se reporta al momento. La sincro también predescarga su playlist.
- El player en emisión **se actualiza solo**: vigila `version.json` y se recarga en el siguiente cambio
  de pieza cuando hay release nuevo (players desde la r60; los anteriores necesitan un `hardreload`
  o un reinicio una vez). Los players macOS sondean la portada de admira.tv cada 10 min.

## 6. Kioskos con playlist propia y gemelo CanalKiosk

- La playlist de un kiosko vive en `control/playlist?screen=<pantalla>-tema`. La publica
  `tools/publica-playlists-kioskos.py` (Stock filtrado por tema; 40 piezas; conserva `num`).
  Un teléfono con `circuit` cuyo modo remoto es `sync` y sin orquestación entra en sincro con su tema.
- El gemelo (`/adcelerate/demo/best/`) mapea cada sitio a su pantalla real (`SITE_SCREEN`,
  `SITE_CIRCUIT`). Cuando cambia el perfil dominante de la audiencia manda `play<num>` al circuito.
  Jardinets (15-09): el player VERTICAL es el iPad de Admin `ipad-admin-mupi` (circuito `ipad-admin`, principal:
  el gemelo sincroniza con `ipad-admin-mupi-tema`); el Fold 8 `samsung-galaxy-fold-8-mupi` (horizontal, circuito
  `samsung-galaxy-fold-8`) recibe la MISMA orden vía `SITE_EXTRA` en `best/index.html` (una orden `play<num>`, todas las
  pantallas reales del sitio). Tab A11 `samsung-galaxy-tab-a11-mupi` sigue en el circuito del Fold. Tema música.
  Vila: `samsung-galaxy-fold-9-mupi`. Lesseps: `iphone17-mupi`.
- **Precedencia**: un emparejamiento con un **player virtual** (`/api/virtual-players`) manda sobre
  todo (el player sigue el programa del virtual e ignora la sincro y el modo remoto). Para devolver la
  pantalla a su circuito hay que desvincularla desde https://admira.tv/virtual-players/ (sesión).

## 7. Trampas que ya hemos pagado (14-09)

- Dos dispositivos con el mismo `screen` se pisan en censo, previo y versión. Un ID por aparato.
- `--es tag ""` por adb no borra el tag; usa `--es tag ' '` (espacio) para vaciarlo.
- El mando muestra «0 de N descargados» en todas las pantallas cuando el worker responde
  `throttled:"budget"`; no es del player.
- El botón «VERSIÓN NUEVA» del avisador compartido no debe verse en una pantalla pública: el canal ya lo oculta en emisión.

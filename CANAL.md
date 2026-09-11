# Admira.tv · Canal de cartelería vertical (`canal.html`)

El **canal de emisión DOOH** de la trilogía Admira (Crear → Operar → **Emitir**).
Un MUPI vertical (9:16) que emite **en bucle todo el media creado en Pixeria**,
segmentable y configurable por pantalla. Live en **https://admira.tv/canal.html**.

> Es la capa de *emitir*: Pixeria crea → XpaceOS opera → **Admira.tv emite**.

---

## De dónde sale el contenido

- Fuente: el **índice público del Stock** en R2 (CORS abierto, sin worker):
  `https://stock.admira.store/stock/index.json`
- Se re-consulta cada `refresh` segundos (def. 30): cuando publicas algo nuevo en
  Pixeria, entra solo en la rotación (lo más reciente primero).
- Tope de piezas en el loop: `max` (def. 50, los más recientes).

### Tipos de media que emite
`video` · `animation` · `image` · `digital-twin` · `audio` · `music` · `locucion`.
(Se excluyen `link` —no es media— y `furni` —mobiliario del gemelo—.)
- **Vídeo / animación**: reproduce y avanza al acabar.
- **Imagen / digital-twin / twin-npc**: se muestra `img` segundos (def. 9), con barra de progreso.
- **Audio / música / locución**: tarjeta con ♪ + onda; ranura de `audio` segundos (def. 18).
  Si el fichero es **más corto** que la ranura, ocupa su longitud real (una cuña de 6 s
  no reserva 18). Si viene **programado** (parrilla, borrador o lista por defecto) ocupa
  la **duración editorial** de esa programación, no la ranura de la pantalla (r58).

---

## Segmentación

El contenido **universal** (sin segmento) siempre se emite; el **segmentado** solo
aparece si casa con el segmento elegido. Dimensiones (del Stock de Pixeria):

| Filtro | Valores |
|---|---|
| Medio | todo · vídeo · imagen · audio |
| Audiencia | todas · mujeres (`f`) · hombres (`m`) |
| Categoría | todas · atraer · producto · promo · marca |
| Edad | todas · niño · joven · adulto · senior · vejez |
| Franja | todas · **auto** (según hora de Madrid) · mañana · mediodía · tarde · noche |
| Etiqueta | texto libre (busca en tags) |

---

## Pantalla / circuito

- Selector de **circuito/tienda** poblado desde las ubicaciones reales del grupo
  (`https://admira.app/locations.js` → `window.OMNIP_LOCATIONS_DEFAULT`, ~107).
- **ID de pantalla** editable (se autocompleta a `<circuito>-led`).
- La identidad se muestra en el HUD (📍) y queda lista para la **parrilla por
  pantalla** cuando se construya el backbone `/grid` (ver «Pendiente»).
  *Hoy fija identidad; el contenido sigue saliendo del Stock + segmento.*

---

## Controles

Barra inferior (auto-oculta a los 3,5 s de inactividad) y atajos de teclado:

| Control | Botón | Tecla |
|---|---|---|
| Pausa / reanudar | ⏸ / ▶ | espacio |
| Silencio | 🔇 / 🔊 | M |
| Volumen | slider | + / − |
| Always on top ON/OFF | — | **⇧ + Q** |

### Giro y «Rellenar» desde el mando (r59)

El selector del mando (`0° · 90° · 180° · 270° · ⛶ Rellenar`) gobierna cómo se
presenta la pantalla física. El giro (`rotation-N`) ya existía; **Rellenar** añade
el ajuste del marco (`fit-fill` / `fit-editorial`), persistente por pantalla:

- **editorial** (por defecto en web/iOS/macOS): marco 9:16 del MUPI. Una pieza
  horizontal en un teléfono girado 90° se ve pequeña dentro del marco vertical.
- **fill**: el marco ocupa **todo el dispositivo** (girado o no, contrato `screen-fit`)
  y la media se escala todo lo que cabe **sin recortar ni deformar** (`contain`).
  Android WebView y `?fit=screen` nacen en este modo.

El player lo reporta en `device.display.fit` (`/signage/now`), así el botón del mando
se ilumina solo cuando está confirmado. En el mando, con Rellenar activo y una pieza
**horizontal** (`ar > 1`), el previo se enseña **apaisado y a todo el ancho, encima
del bloque de control**; con una pieza vertical conserva el marco 9:16 al lado.

Arranca **en mudo** (para que el autoplay funcione); al desmutear, en algunos
navegadores hace falta un gesto (hay overlay «toca para arrancar» de respaldo).

### Contrato de autonomía Digital Signage (DS)

Al iniciar el player nativo en modo **Digital Signage**, la máquina queda autónoma:
mantiene la emisión desde disco, se reconecta y el watchdog recupera un cuelgue sin
depender de una sesión abierta en el CMS o el mando.

Los comandos de contenido (`/ds off`, pausa, mute, cambio de pieza o de modo) **no
terminan el proceso DS**. El proceso continúa hasta una acción terminal explícita:

- **remota:** kill-switch autorizado del player;
- **local:** salir del player con **Escape** en macOS, Windows y Linux;
- **Android:** cinco toques en la esquina superior izquierda;
- o terminación explícita del proceso desde el sistema operativo.

`Shift + Q` no mata DS: solo alterna el blindaje visual Always on top para pruebas.

### Arranque remoto en iPhone/iOS

El botón **Arrancar** del mando (`/remotecontrol/`) y el botón **▶** del mini-mando del
CMS (`/cms`) expresan una intención completa: sale de `standby`, quita la pausa y verifica
el `play()` real. La cola por pantalla de `/remotecontrol/` espera esa verificación antes de
acusar el comando; el mini-mando del CMS conserva su canal por circuito, que solo confirma
el encolado. Si WebKit bloquea la reproducción con audio porque la orden no nació
de un gesto local, el player reintenta en mudo: la imagen arranca remotamente y el sonido se
puede habilitar después. Si también falla el intento silencioso, el acuse es `failed` y el
mando no presenta un falso doble tick de éxito.

iOS suspende JavaScript y red cuando la app pasa a segundo plano. Al volver a primer plano,
el player consume la cola de control inmediatamente (`visibilitychange`, `pageshow`, `online`).
Una app terminada por iOS no puede despertarse desde una página web, SSE, WebSocket ni Service
Worker: ese caso requiere una siguiente fase nativa con APNs; el mando web no lo simula.

### `#ID` desde el mando: nunca online, y el mando ve la descarga (r59)

Un `content-<num>` añade la pieza delante de la playlist y la baja **ASAP**. Hasta que
está **entera en el equipo** (`_ready`, tras completar la escritura en caché) el player
**no la emite**: el bucle la salta, también con `?stream=1` (la app iOS arranca así, y
antes el bucle la estrenaba online a medio bajar). Una entrada de caché parcial tampoco
cuenta como «en disco» mientras la descarga sigue en vuelo.

En el mando, la pastilla del tag se **rellena de izquierda a derecha** con el % real que
reporta el player en `/screen/cache` y muestra el porcentaje al lado del número
(`923 · ⇩ 37%`); en verde `✓ 100%` cuando está entera, y en rojo `⌛ n%` si la descarga
no se confirma en el plazo. Aplicar otro tag, limpiar o cambiar de pantalla lo borra.

### Always on top (⇧Q) — la emisión nunca se tapa

Doctrina DOOH: **nada se pone encima del contenido**. El canal arranca con el modo
**ON TOP activo por defecto** (`?ontop=0` lo arranca apagado). Con ON TOP encendido:

- `window.alert` / `confirm` / `prompt` → **no-ops** (devuelven `undefined`/`false`/`null`
  y solo loguean a `console.debug`). Ningún diálogo modal tapa la emisión.
- `window.onerror` + `unhandledrejection` → **capturados y silenciados** (solo consola).
  Ningún error pinta nada en pantalla.
- Diálogos de salida (`onbeforeunload` ajeno) → **anulados**.
- **Vigilante de overlays**: un `MutationObserver` mira los **hijos directos de `<body>`**
  y **oculta** (`display:none`) cualquiera que no sea nuestro. La *whitelist* son:
  `#wrap` (toda la emisión), `<script>`/`<style>`/`<link>`, el chrome de navegación
  `admira-nav` (ids/clases con prefijo `adm`) y cualquier nodo marcado `data-adm-ok="1"`.
  Los overlays legítimos del player (HUD de testing, badges, cámara, `#seg`, `#tap`)
  viven **dentro de `#mupi`/`#wrap`**, así que el vigilante nunca los toca. El stack de
  la emisión (`#wrap`) sube a `z-index` máximo.

**⇧ + Q** alterna el modo (HUD efímero `🛡 ON TOP: ON` / `🛡 ON TOP: OFF (test)`).
Es un **toggle de test que NO persiste**: cada recarga vuelve al default (ON, salvo
`?ontop=0`). Al apagarlo se restauran `alert/confirm/prompt`, se para el observer y se
**re-muestran** los overlays que había ocultado. Se ignora si el foco está en un
`input`/`select`/`textarea`.

En la app Android el blindaje es **doble**: además de este modo web, el `WebChromeClient`
suprime los diálogos JS nativos y el `WebViewClient` no muestra la página de error del
WebView (reintento silencioso con backoff). El checkbox «Contenido siempre encima» de la
pantalla de configuración (marcado por defecto) propaga `&ontop=1|0` a la URL del canal.

### Ficha interactiva del contenido

En un teléfono, tableta o pantalla táctil, un **doble toque** sobre el contenido abre
una ficha viva de la pieza en antena. Con ratón se usa **doble clic** y con teclado
permanece disponible **Ctrl+I**. El mismo gesto vuelve a cerrarla.

La ficha muestra datos reales del player: título, tipo, posición en el loop, progreso,
resolución, tamaño, identificador, origen, pantalla y etiquetas. Se actualiza cada
segundo mientras está abierta, no pausa el contenido y no altera `/emit`, el beat de
pantalla ni el proof-of-play. Botones, enlaces y controles quedan fuera del gesto para
evitar aperturas accidentales; `touch-action: manipulation` impide el zoom de doble toque.
El shell Android detecta el gesto a nivel nativo para que también funcione cuando la pieza
en antena es una Xperiencia `interactive` dentro de un iframe.

### Controles ocultos de testing (Shift+flechas)

Para **navegar el loop a mano durante pruebas** hay atajos ocultos, **protegidos
con Mayúscula** para que no se disparen por error (una flecha suelta NO mueve la
emisión). Sin teclado (tablet / WebView) son totalmente inocuos.

| Acción | Tecla | HUD (línea 1) |
|---|---|---|
| Siguiente contenido | **Shift + →** | `TEST ⏭ nombre-pieza.mp4 · 4,2 MB · 7/53` |
| Contenido anterior | **Shift + ←** | `TEST ⏮ nombre-pieza.mp4 · 4,2 MB · 6/53` |
| Primero del loop | **Shift + ↑** | `TEST ⇤ nombre-pieza.mp4 · 4,2 MB · 1/53` |
| Último del loop | **Shift + ↓** | `TEST ⇥ nombre-pieza.mp4 · 4,2 MB · 53/53` |

- Solo reaccionan a `Shift` + una de las 4 flechas; se ignoran si el foco está en
  un `input`/`textarea`/`select` o campo editable. Sin Shift, cero efecto.
- Reutilizan la **ruta de avance natural** (`next`/`prev`/`play`) — no duplican
  render: cortan el timer/vídeo/audio en curso y arrancan la pieza destino igual
  que el flujo normal. Por eso el **beat `/signage/now`** y el **proof-of-play
  `/emit`** siguen reflejando la pieza real mostrada (no se corrompen).
- **HUD enriquecido (r37), hasta 2 líneas** CRT/cian efímeras (~2,5 s), esquina inferior:
  - **Línea 1**: `TEST ⏭ nombre · peso · x/y` — nombre = `title` del Stock (o
    basename del url), truncado a ~40 chars; peso = `size` del índice formateado
    KB/MB con coma es-ES. Si la pieza no trae `size` (parrilla, catálogo offline),
    se resuelve con un `fetch HEAD` **asíncrono y cacheado por url**: el HUD sale
    al instante con `…` y se actualiza al llegar el `content-length` (o `?` si el
    origen no lo expone).
  - **Línea 2**: metatags de la pieza — `#tags` del Stock + segmentación
    (audiencia/categoría/edad/franja), máx 5 con `+N` si hay más. Si la pieza no
    tiene tags ni segmentación, la línea 2 **se omite**.
  - Ejemplo: `TEST ⏭ Generated video ｜ Ø-Obsolete [74778881… · 311,5 KB · 5/27`
    ‖ `#video #genérico #visual #good #atraer`. Nada persistente, no ensucia la emisión.
- En modo **DIRECTO** (`/direct`) o sin loop, muestran `TEST ⏭ · sin loop` y no tocan nada.

## Playlist (cola)

### Saltar desde el mando (`goto-N`)

La pestaña **Playlist** del mando (`/mando.html`, empotrado en el CMS experto) envía
`goto-<índice>` por la cola confirmada. En el player el salto es una **orden manual**
con la misma ventana forzada que un `#ID` (r58): sale de sincro/directo, pasa a modo
local, la pieza va **hasta su final** y después `pollMode` devuelve la pantalla a su
asignación remota (sincro, condicional…). Antes, en una pantalla sincronizada, la
pieza arrancaba y al cargar sus metadatos la sincro la devolvía al índice del máster:
el operador pulsaba y «no saltaba».

Rail a la **izquierda** con **3 previos + el actual (● ahora) + 3 próximos**
(ventana de 7 centrada en lo que emite). Miniaturas por tipo; **clic = saltar** a
esa pieza. Se oculta en pantallas estrechas (≤900px), pensado para la vista de
control; el MUPI estrecho va solo.

---

## Modos por URL

Todos los ajustes se **guardan en la pantalla** (localStorage) y son **compartibles
por URL** (la URL gana sobre lo guardado). Así configuras una pantalla una vez, o
despliegas N pantallas con un enlace:

| Param | Qué hace |
|---|---|
| `screen`, `circuit` | identidad de la pantalla |
| `medio`, `audience`, `category`, `age`, `slot`, `tag` | segmento |
| `img`, `audio`, `refresh`, `max` | reproducción (segundos / nº) |
| `muted` (0/1), `volume` (0–1) | audio inicial |
| `embed=mupi` · `clean=1` · `chrome=0` | **modo limpio**: MUPI a pantalla completa, sin chrome/rail (para casting/empotrar) |
| `fresh=<seg>` | **novedad al aire** (opt-in, r53): una pieza NUEVA del segmento toma la antena en exclusiva, en bucle, esos segundos; luego entra al loop y el loop sigue por la SIGUIENTE. Acompañantes: `freshMaxAge=<seg>` (900 por defecto: qué se considera «reciente») y `freshbadge=0` (quita el chip «✦ RECIÉN CREADO»). Sin `fresh` nada cambia. |
| `freshtail=1` | la novedad se coloca **literalmente al final** del loop (por defecto queda a la cabeza, porque el orden de casa es lo más nuevo primero). Por pantalla y por sesión: al recargar vuelve el orden canónico. |
| `audience=remote` (alias `va=1`) | **audiencia remota** (r62): la pantalla no lleva cámara; el público lo publica otro equipo en el bus `mcp-tv.admira.store/audience/<screen>`. El canal arranca en **condicional blindado** (ni `pollMode` ni la directiva XPL lo cambian mientras el parámetro viva en la URL, misma doctrina que `?tag=`) y sondea el bus cada 500 ms. `audience=remote` **no filtra** por segmento (`seg.audience` queda en `all`). Ver «Audiencia remota». |
| `audience_api=<base>` | base del bus de audiencia (def. `https://mcp-tv.admira.store`); para pruebas locales con un mock (`http://127.0.0.1:8787`). |

**Ejemplos**
- Quiosc, solo imágenes, 8 máx: `?circuit=bcn-kiosk-005&screen=bcn-kiosk-005-led&medio=image&max=8`
- Mujeres · tarde · imagen 6s: `?audience=f&slot=tarde&img=6`
- Empotrado a pantalla completa: `?embed=mupi`
- Mupi del Xtanco (lo recién creado manda 3 min y luego entra por la cola): `?clean=1&screen=xtanco-totem&tag=tiktok&fresh=180&refresh=20&freshtail=1`

---

## Audiencia remota (r62 · FLT-100243)

Un tótem **sin cámara** puede condicionar su carril con el público que detecta otro
equipo (PuertaCam) y publica en el bus **`GET https://mcp-tv.admira.store/audience/<screen>`**
(CORS abierto):

```json
{"ok":true,"screen":"xtanco-totem","fresh":true,"ttl_ms":2000,
 "label":{"sex":"m|f|u","age_band":"child|youth|adult|senior","confidence":0.91,"ts":"…","source":"PuertaCam"},
 "decision":{"lane":"Matrix|TopGun|neutral","creative":"Matrix|Top Gun|neutral_6s","age_ms":350}}
```

Con `?audience=remote` el canal:

1. arranca en **condicional** y lo **blinda** (`AUDIENCE_REMOTE` entra en la guarda de
   `pollMode` junto a `URL_TAG`/`URL_SYNC`; la directiva XPL tampoco cambia el modo);
2. sondea el bus **cada 500 ms** (`fetch … {cache:'no-store'}`): con `fresh` y
   `sex ∈ {m,f}` escribe `window.__xplCam = {faces:1, gender:sex, age, ts}` — el mismo
   contrato que la cámara local — y si el **carril cambió** llama a `XPLCanal.tick()` en
   el acto (presupuesto < 2 s desde el label); con `fresh=false` o `sex='u'` pone
   `__xplCam = null` → `camFresh()` no ve público y `matchMatrix` cae a la regla
   catch-all = **carril neutro**;
3. anti-flapeo: el neutro no se re-tickea antes de **6 s**; un `m`/`f` fresco gana siempre;
4. red silenciosa: nunca rompe el bucle; tras 5 fallos seguidos sondea a 2 s y vuelve a
   500 ms al primer éxito.

Vocabulario que recibe la matriz: `gender` `m`/`f`; `age` = `age_band` mapeado a
`nino` (child) · `joven` (youth) · `adulto` (adult, y por defecto) · `senior` (senior).
Un `/forcecam` del CLI (`window.__xplForce`) sigue mandando sobre el bus.

**Otras vías de inyectar público** (mismo efecto que `/forcecam`: fuerza condicional y
re-evalúa la matriz ya):

| Vía | Comando |
|---|---|
| Cola del mando (`/control/cmds`, `applyCtrlCmd`) | `audience-m` · `audience-f` · `audience-u` (alias `forcecam-m|f|u`; `u`/`off` = público real) |
| `postMessage` desde el padre (source `xpaceos-robot-cli`) | `admiratv audiencia m|f|u` |
| CLI local | `/forcecam m|f|u` |

**Salida al padre**: en cada cambio de carril el canal hace
`parent.postMessage({source:'admira-tv-canal', event:'audience', lane, sex, fresh, ts}, '*')`
(igual que `media-state`). `lane` es el del bus (`Matrix|TopGun|neutral`) o, si el bus no
lo trae o el público se forzó a mano, el sexo (`m`/`f`) / `neutral`.

Diagnóstico en consola: `window.__adtvAudienceRemote` (polls, ok, fails, lane, sex, last).

**Nunca negro (r63).** Los `assets` de la matriz que no estén en el feed de 300 del canal se
resuelven contra el índice completo del Stock (`stockFullIndex()`, el mismo de `/play<N>`,
cacheado 10 min), entran en el pool (`_matrixExtra`, re-inyectado en cada `loadFeed`) y se
precachean como el resto de `_condUrls`. Una regla con assets concretos es decisión del CMS:
el cortafuegos por procedencia (`MOTOR_REFERENCIA`) no la veta. Y si aun así la regla deja
0 piezas, el canal cae al carrusel completo del feed y el rótulo dice
`CONDICIONAL · sin assets → carrusel · N en loop` (`_condFallback`); la regla vuelve a mandar
en cuanto la pieza se resuelve. Medido en el Xtanco (11-sep): label→asset visible 151–593 ms;
vuelta al neutro ~2,3 s tras el último label (TTL 2 s del bus).

Ejemplo (tótem Xtanco): `?clean=1&screen=xtanco-totem&circuit=xtanco&audience=remote&muted=1`.

## Cómo entra en la trilogía

- **pixeria.com** (Crear) y **xpaceos.com** (Operar) enlazan a admira.tv en su nav.
- El landing **admira.tv** → botón «Ver el canal en antena» → `canal.html`.
- **Player de cartelería (kiosko)**: las apps reproductoras (Electron macOS
  `digital-signage-player`, y la flota Android/iOS) abren `www.admira.tv` a pantalla
  completa. El `index.html` detecta su User-Agent (`AdmiraMacOSPlayer` /
  `AdmiraPlayer` / `AdmiraKiosk`) y **redirige solo al canal en modo emisión limpia**
  (`canal.html?embed=mupi`), preservando cualquier query (`?circuit=`, `?screen=`…).
  Un navegador normal sigue viendo el landing. Escape manual: `?nokiosk=1`.

## Programar la parrilla (desde admira.tv)

El backbone **`/grid`** del worker `pixer-eleven` **ya está implementado** (handlers
`/grid/day|config|book|unbook|offer|decide|control|emit|upload|screens`) y `canal.html`
**ya lee su parrilla**: en cada franja inyecta en el loop los creativos `own`/`paid`
de esa banda (`gridWeave`, cadencia fija) y muestra el badge 📅 de lo que manda la
parrilla; si no hay nada programado cae al Stock+segmento.

Para **programar contenido propio** sin salir de admira.tv: `cms.html` → botón
**📅 Programar**. Eliges pantalla (`/grid/screens`) → franja → pieza del **Stock de
Pixeria**, y se reserva como `own` (`POST /grid/book`). Las escrituras piden la
`GRID_KEY` (se teclea una vez, se guarda en el navegador como `grid_key`). El control
de propietario completo (ofertas/política/lista negra) sigue en `xpaceos.com/control/`.

## Multi-canal: cómo lanzar el canal de un equipo

Cada **equipo/pantalla** emite el canal de **su circuito**. La clave que une todo es
el `circuit`; con él, `canal.html?circuit=<slug>&screen=<slug>-mupi` identifica la
pantalla y `/grid/day?screen=` le sirve **su** parrilla. La arquitectura multi-canal ya
existe: `/grid/projects` agrupa circuitos en canales (Canal AdmiraNeXT, Canal Xtanco…);
si el prefijo del circuit **casa** con un canal, emite ese canal; si **no casa** ninguno,
cae al **loop universal del Stock** (+ segmento). No hay que tocar nada más por pantalla.

Las integraciones con un selector de modo propio pueden añadir `modeLock=1`. Mientras
ese parámetro esté presente, `mode=local|sync|conditional` no será sustituido por el
modo remoto del circuito; los comandos remotos de reproducción siguen funcionando.

**Lanzar el canal de un equipo nuevo (2 clics, sin datos a ciegas):**

1. **Alta** (`alta.html`): pon nombre + circuito y detecta ubicación. El alta:
   - registra el sitio vía `api.admira.store/locations/*` (proxy del worker, **no
     bloqueado en España**; cae a `omnipublicity-api` directo sólo si el proxy falla);
   - entrega la URL de canal **ya cableada** — siempre `?circuit=<slug>&screen=<slug>-mupi`;
   - te dice **qué canal emitirá** ese equipo ("Este equipo emitirá: Canal Xtanco") o,
     si el circuit no casa ningún canal, que "emitirá el loop universal del Stock".
2. **Abrir canal en esa pantalla** con el botón del alta (o el player en `embed=mupi`).

Para **cablear un player huérfano** (vivo pero sin circuito) o **conectar una superficie
de parrilla a su player físico**, ver `CMS.md` §6 (botones de un clic en «Descuadres»).

### Duración editorial: una sola regla (r58)

`editorialSec(it)` decide cuántos segundos **ocupa** una pieza en la emisión local, y la
misma cifra es la que se **imputa** al proof-of-play (`/emit`) y la que se **publica** al
mando (`/signage/now` y `/control/playlist`), así los tres cuentan lo mismo:

| Tipo | Segundos |
|---|---|
| Vídeo / animación | duración real (`_dur`) en cuanto se conoce; hasta entonces 0 (el proof-of-play estima 15) |
| Imagen | `_previewSec` (parrilla/borrador/por defecto) → si no, `img` de la pantalla (mín. 2) |
| Interactivo | `_previewSec` → lo que declaró la Xperiencia → `inter` de la pantalla (mín. 5) |
| Audio / música / locución | `_previewSec` → si no, `audio` de la pantalla (mín. 3); **recortado** a la longitud real del fichero si es menor |

La parrilla horaria (`/grid/day`) entra con `config.slotSeconds` como `_previewSec`
(2–120 s, 10 por defecto): imagen y audio programados ocupan **esa** ranura; un vídeo
programado sigue yendo hasta su final. Un cambio de `slotSeconds` reconstruye el loop
igual que un cambio de reserva. En **sincro** nada de esto aplica: manda la línea
temporal del máster (`syncItemDurationMs`).

## Pendiente / siguiente paso

- Programación por día futuro (hoy el panel de `cms.html` programa el día en curso).
- `cms.html` → 📅 Programar no expone `slotSeconds` de la pantalla (hoy solo se ajusta
  desde `/grid/config`); el player ya lo respeta.

_Build documentado: 2026-06-19. Bucle /grid activado desde cms.html: 2026-06-26._

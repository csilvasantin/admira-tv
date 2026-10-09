# Programación · modelo único de playlists (contrato para agentes · 9-oct-2026)

Para agentes de carbono y de silicio que tengan que **leer, escribir o vigilar** la programación nueva de admira.tv.
Este documento resume y enlaza; el detalle (algoritmo, desviaciones 1–59, pruebas) vive en el documento canónico:

- Diseño completo: https://admira.tv/docs/playlists-modelo-unico.md (en el repo: `docs/playlists-modelo-unico.md`)
- Qué emite hoy una pantalla (el legado, la réplica de `canal.html`): https://admira.tv/mcp/emision.md
- Panel de discrepancias: https://admira.tv/programacion/sombra/ (sesión del portal)
- Ayuda para personas: https://admira.tv/help/#programacion

> **Regla de oro.** Hasta el corte (E13) **manda el KV de siempre** (`/api/playlist`, la parrilla `/grid/day` y lo que
> el player decide en `canal.html`). La D1 nueva es una copia que se compara (sombra) y se mantiene al día (espejo).
> Ningún player lee todavía `/api/programacion`. Para saber qué emite una pantalla **hoy**, usa `/api/emision`, no esto.

## 0. Estado en producción (foto del 9-oct-2026)

| Qué | Valor |
|---|---|
| D1 | `admira-programacion` (región WEUR), creada por Carlos; binding `PROGRAMACION_DB`; migración `migrations/programacion/0001.sql` aplicada (#61) |
| Importación del legado | Aplicada: **34 playlists + 34 asignaciones** → `meta.version = 68` |
| Paridad con `/api/emision` | 7 de 7 pantallas comprobadas **idénticas**; las pantallas sin lista propia resuelven a la capa `relleno` (es lo diseñado: el player teje su Stock) |
| Banderas | Encendidas por Carlos el 9-oct: `sombra: true`, `espejo: true`, `motor: "apagado"` → `meta.version = 69` |
| Comprobación posterior | Simulación del importador con `archivar=1`: **0 escrituras** (la D1 y el KV coinciden) |
| Clave de servicio | `PROGRAMACION_SERVICE_KEY` **no está puesta**: sólo escribe la sesión del portal |
| Quién consume `/api/programacion` | Nadie todavía (el player llega en E9) |

Es una foto, no estado vivo. Para el estado actual: `GET /api/programacion/banderas` (sesión) da `version` y banderas;
`GET /api/programacion/sombra` da las cuentas de veredictos.

## 1. El modelo en una página

- **Playlist** (qué se emite): `fija` (piezas a mano), `viva` (reglas contra el Stock) o `mixta` (piezas y huecos).
  Hasta 200 piezas; historial de 50 revisiones; `rev` para el bloqueo optimista.
- **Asignación** (a dónde y cuándo): `destino {all, any}` con etiquetas (`pantalla:`, `circuito:`, `proyecto:`,
  `xpacio:`…; OR dentro de una faceta, AND entre facetas), `directa` (sólo nombra `pantalla:`), programación en hora de
  Europe/Madrid (`fecha_desde`/`fecha_hasta`, máscara `dias` L=1…D=64, `franjas` en minutos, `recurrencia`,
  `excepciones`), `capa`, `mezcla`, `peso`, `estado` (`borrador`, `activa`, `pausada`, `archivada`) y `ref_externa`
  (`kv:default:<pantalla>`, `kv:viva:<id>`, `grid:<booking>`).
- **Capas**, de más a menos prioridad: `emergencia` 500 · `pagada` 400 · `propia` 300 · `por_defecto` 200 ·
  `relleno` 100. Mientras manda el mando en vivo, la capa de salida es `mando`.
- **Mezclas**: `sustituye` (base sola) · `fusiona` (base junto a las que fusionan) · `anade` (se guarda sin eñe; se
  acepta «añade»: va detrás de la base si su capa es igual o mayor) · `intercala` (spot cada `cadencia` piezas; 4 si
  nadie declara otra).
- **Orden K** dentro de una capa: directa primero › sustituye antes que fusiona › más `peso` › `fecha_desde` más
  reciente › `actualizado_en` más reciente › `id`.
- **Las tres decisiones de Carlos (8-oct-2026)**:
  1. La parrilla de `/grid` es una **capa de venta aparte**: no se migra, el motor la lee (slots `paid`/`sold`/
     `accepted` = `pagada` · `intercala`; `own` = `propia` · `intercala`; rundown `municipal-50-50` = base `propia`
     exacta).
  2. El **mando en vivo** (hashtag, `#ID`, directo) manda **2 h o hasta el siguiente borde de franja**, lo que llegue
     antes, y lo pagado se sigue intercalando.
  3. En «por defecto», **lo directo gana y lo de grupo se suma**; `peso` es la válvula de escape.
- **Resolver** (`functions/api/_programacion/resolver.js`): puro, sin red. Devuelve `capa`, `exacta`, `nombre`,
  `items`, `spots`, `cadencia`, `base`, `mando`, `fuentes` (el papel de cada candidata), `validoHasta` (próximo
  borde, máx. 48 h), `siguiente`, `rev` y `screenTags`.

## 2. Acceso

| Ruta | Leer | Escribir |
|---|---|---|
| `GET /api/programacion?screen=` | Pantallas virtuales (`virtual-*`, `xtore-virtual-*`) sin sesión; el resto, sesión del portal con permiso `digitalsignage-player` o sesión de lectura (visor) | — |
| `/api/programacion/{playlists,asignaciones,circuitos}[/:id]` | Sesión `digitalsignage-player` o visor (el visor no recibe `creado_por`/`actualizado_por`) | Sesión `digitalsignage-player` (actor = su email) **o** clave de servicio (ver abajo) |
| `/api/programacion/historial/…` y `/auditoria` | Sólo sesión `digitalsignage-player` (llevan emails); visor → 403 `solo_lectura` | — |
| `POST /api/programacion/importar` | — | Sólo sesión; clave de servicio → 403 `importador_solo_sesion` |
| `/api/programacion/banderas` | Sólo sesión (también para leer); visor → 403 `solo_lectura`; clave → 403 `banderas_solo_sesion` | Sólo sesión |
| `GET /api/programacion/sombra` | Sesión o visor (no lleva emails); la clave de servicio no lee | — |

**Clave de servicio** (servidor a servidor, pensada para Pixeria): secreto de Pages `PROGRAMACION_SERVICE_KEY`, en la
cabecera `X-Programacion-Key` (recomendada) o `Authorization: Bearer`; `X-Actor: <proceso>` deja el actor
`servicio:<proceso>`. **Hoy está apagada** (el secreto no está puesto): quien llegue con clave recibe 401. Sin CORS:
nunca desde un navegador ni en una URL. Si se activa, el valor va en `admira-vault` y **no puede empezar por `mbl_`**
(el guarda global de `functions/_middleware.js` lo tomaría por una clave de lectura).

Desde un navegador con la sesión del portal abierta en admira.tv, todas las llamadas son `fetch(…, {credentials:
"same-origin"})`. Sin sesión, la primera respuesta es 401 (el 503 de la D1 se comprueba **después** del acceso).

## 3. Endpoints

### 3.1 Lectura: `GET /api/programacion?screen=<id>[&at=<ISO|ms>][&tag=<hashtag>]` (E3)

- `screen` obligatorio (`^[a-z0-9][a-z0-9-]{1,79}$`, el mismo formato que `/api/playlist` y `/api/emision`).
- `at` opcional: el instante (ISO o milisegundos); sin él, ahora.
- `tag` opcional: **simula** el mando en vivo por hashtag desde `at`, con la caducidad de la decisión 2. No hay
  mando persistido hasta E8.
- Acepta las pistas del player (`w`, `h`, `o`, `lang`, `circuit`, `project`, `xpace`/`loc`, `iot`) como `/api/playlist`.
  Sin ellas, usa lo que la pantalla dejó registrado al pedir su playlist. **No escribe nada** (ni KV ni D1).
- Lee la D1 (memoria por `meta.version`), `/grid/day` de tres días (víspera, día y siguiente) y el Stock
  (`stock/index.json`).

Respuesta 200: sobre `{ok, screen, at, ahora, publico, version, motor, memoria: "acierto"|"fallo", lecturas:
{parrilla: [fechas], stock: n, autorretrato: bool}}` + la salida del resolver (sección 1). Ejemplo completo en el
documento canónico, «API de lectura (E3)».

| Estado | Error | Cuándo |
|---|---|---|
| 400 | `bad_screen` · `bad_at` | Pantalla o instante ilegibles |
| 401 / 403 | `unauthorized` · `forbidden` | Sin sesión o sin permiso (salvo pantallas virtuales) |
| 503 | `programacion_db_no_configurada` · `programacion_db_sin_esquema` · `programacion_lectura_fallida` | Sin binding, sin migración o fallo de la D1 |
| 405 | — | Cualquier método que no sea GET |

### 3.2 Escritura: `/api/programacion/<recurso>[/<id>]` (E4)

`<recurso>` = `playlists` · `asignaciones` · `circuitos`. Cada escritura aceptada es **un solo `db.batch`**: fila,
revisión, auditoría y `meta.version + 1` (la memoria de 3.1 se invalida sola).

| Método y ruta | Qué hace | Respuestas |
|---|---|---|
| `GET /<recurso>` | Lista. `playlists?proyecto=&limite=` (máx. 500) · `asignaciones?playlist_id=&estado=&limite=` (máx. 1000) · `circuitos` | 200 `{ok, version, <recurso>}` · 400 `estado_invalido` |
| `POST /<recurso>` | Crea. Sin `id`: sale del nombre (playlists, circuitos) o `asg-xxxxxxxx` | 201 `{ok, <entidad>, version}` + `Location` · 409 `ya_existe` (con `actual`) · 422 |
| `GET /<recurso>/<id>` | Lee una | 200 · 404 `no_existe` |
| `PUT /<recurso>/<id>` | **Sustituye entera** (lo que no llega vuelve a su valor por defecto). Exige `rev` | 200 · 404 · 409 `revision_conflict` (con `actual`) · 422 · 428 `rev_requerida` |
| `PATCH /<recurso>/<id>` | Cambia **sólo** los campos que llegan (los de primer nivel, enteros: `items`, `destino`, `franjas`). Exige `rev` | Las de PUT |
| `DELETE /<recurso>/<id>` | Borra de verdad (la copia final queda en la auditoría). Exige `rev` | 200 `{ok, borrado, version}` · 404 · 409 `revision_conflict` · 409 `playlist_en_uso` · 428 |
| `GET /historial/<tipo>/<id>` | Hasta 50 revisiones (de la última a la primera) y `actual` | 200 `{ok, version, tipo, id, actual, revisiones}` · 404 · 403 `solo_lectura` (visor) |
| `GET /auditoria` | Escrituras aceptadas, de la más reciente a la más antigua. Filtros `entidad`, `id`, `actor`, `accion` (`crear`, `actualizar`, `borrar`, `banderas`, `espejo_fallido`, `espejo_omitido`); `limite` (50, máx. 200) y `antes=<siguiente>` | 200 `{ok, version, entradas, siguiente}` · 400 `entidad_invalida` / `antes_invalido` · 403 `solo_lectura` |

Reglas comunes:

- **`rev`** va en el cuerpo (`{"rev": 3, …}`), en `?rev=3` o en `If-Match: "3"`. Sin ella, PUT/PATCH/DELETE → **428
  `rev_requerida`** sin escribir. Si no es la de la fila → **409 `revision_conflict`** con la fila en `actual` y sin
  rastro (ni revisión, ni auditoría, ni versión). Releer, rehacer el cambio sobre `actual` y repetir.
- **Validación → 422** con el campo culpable: `{"ok":false,"error":"fechas_invertidas","campo":"fecha_hasta",
  "mensaje":"…"}`. Una asignación que apunta a una playlist inexistente es 422 `playlist_inexistente`
  (`campo: "playlist_id"`).
- 400 `json_invalido` (cuerpo que no es un objeto JSON) · 413 (más de 2 millones de caracteres) · 404
  `ruta_desconocida` · 405 con `Allow` · un id imposible (`[a-z0-9-]`, máx. 60) es 404 `no_existe`.
- `motivo` (cuerpo, o `?motivo=` en DELETE; 300 caracteres) queda en la revisión y en la auditoría.
- Una playlist con una asignación sin archivar **no se borra** (409 `playlist_en_uso`): primero
  `PATCH /asignaciones/<id> {"estado":"archivada","rev":N}`.
- Los circuitos no tienen historial de revisiones: `historial/circuito/<id>` devuelve `revisiones: []` y una `nota`.

### 3.3 Importador del legado: `POST /api/programacion/importar` (E5)

Traduce los borradores «Por defecto», las playlists vivas y los circuitos del KV a la D1. **Simula por defecto.**
Idempotente por `ref_externa`: una segunda pasada sale toda `igual` y no sube la versión.

| Parámetro (en la URL, sin cuerpo) | Efecto |
|---|---|
| *(ninguno)* | Simulación: sólo `SELECT` en la D1 y `get`/`list` en el KV |
| `aplicar=1` | Escribe (como mucho 50 entidades por petición; si quedan, `pendientes` > 0 y `siguiente` repite el tramo) |
| `pisar=1` | Actualiza también lo **editado fuera** del importador (por la API de E4); sin él, `omitir` · `editado_fuera` |
| `archivar=1` | Archiva las asignaciones huérfanas del importador y **apaga** (`activo: false`) sus circuitos huérfanos; sin él sólo se informan en `huerfanos` |
| `cursor` | El `siguiente` de la respuesta anterior; repetir hasta `completo: true` |
| `limite` · `muestra` | Borradores por tramo (50, máx. 100) · operaciones que enseña (25, máx. 500) |

Nunca borra. No toca lo ajeno (`id_ocupado`, `ajena`) ni con `pisar`. No importa borradores sintéticos
(`synthetic: true`), vacíos ni inválidos: salen en `omitidas` con su motivo. La respuesta trae `resumen`
(crear/actualizar/archivar/igual/omitir por entidad), `muestra`, `omitidas`, `huerfanos`, `espejo` (marcas de la
doble escritura de los últimos 7 días) y, al aplicar, `version_antes`, `version`, `aplicadas`, `fallidas` y
`pendientes`. Errores: 401 · 403 `forbidden` / `solo_lectura` / `importador_solo_sesion` · 503 (D1 o KV) · 400
`cursor_invalido` · 405 (`Allow: POST`).

### 3.4 Banderas: `GET/POST /api/programacion/banderas` (E6/E7)

- `GET` → `{ok, version, banderas: {motor, sombra, espejo}, editables: ["sombra","espejo"], bloqueadas: {motor:
  "motor_bloqueado_hasta_E13"}}`.
- `POST {"sombra"?: bool, "espejo"?: bool, "motivo": "…"}` → `{ok, cambiado, version, banderas}`. Sólo escribe las
  que cambian (auditado como `accion: banderas`, sube `meta.version`); repetir el mismo valor no escribe
  (`cambiado: false`).
- Errores: **409 `motor_bloqueado_hasta_E13`** si el cuerpo trae `motor` (no escribe nada) · 422
  `bandera_requerida` / `bandera_invalida` / `bandera_desconocida` (con `campo`) · 400 `json_invalido` · 405.
- Propagación: la instancia que atiende la cambia ya; las demás leen `sombra` en menos de un minuto y `espejo` en
  menos de 30 s. Apagar `espejo` es inmediato en cuanto una instancia lee datos.

### 3.5 Sombra: `GET /api/programacion/sombra` (E6)

`?veredicto=igual|equivalente|distinta&motivo=<motivo>&pantalla=<id>&limite=N&antes=<siguiente>` →
`{ok, version, banderas: {sombra, motor}, cuentas: {igual, equivalente, distinta, total}, motivos: [{veredicto,
motivo, n}], filas, siguiente}`. Una fila por pantalla: `pantalla`, `veredicto`, `motivo`, `capa`, `version`,
`firmas: {legado, nuevo}`, `desde`, `primera`, `ultima`, `cambios`, `legado`, `nuevo`, `diferencia`, `anterior`.
Errores: 400 `veredicto_invalido` / `motivo_invalido` / `pantalla_invalida` / `antes_invalido` · 405.

## 4. Banderas: leer y cambiar (sólo con sesión, sólo con el OK de Carlos)

```js
// Leer (consola de DevTools en admira.tv, con la sesión del portal abierta)
await fetch("/api/programacion/banderas", { credentials: "same-origin" }).then(r => r.json())

// Cambiar sombra o espejo: SIEMPRE con motivo; el email de la sesión queda en la auditoría
await fetch("/api/programacion/banderas", { method: "POST", credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sombra: false, motivo: "<por qué>" }) }).then(r => r.json())

// Quién las tocó
await fetch("/api/programacion/auditoria?accion=banderas", { credentials: "same-origin" }).then(r => r.json())
```

El panel `/programacion/sombra/` tiene el mismo interruptor de `sombra` en ▤ Avanzado (pide confirmación).

## 5. Runbooks

### 5.1 Importador: simular → revisar → aplicar

```js
const importar = q => fetch("/api/programacion/importar" + (q ? "?" + q : ""),
  { method: "POST", credentials: "same-origin" }).then(r => r.json());

// 1. Simular todos los tramos (no escribe)
let r = await importar("archivar=1&muestra=500"), tramos = [r];
while (r.siguiente) tramos.push(r = await importar("archivar=1&muestra=500&cursor=" + encodeURIComponent(r.siguiente)));
tramos.map(t => [t.resumen.escrituras, t.resumen.omitidas, t.huerfanos.length, t.espejo && t.espejo.fallidos])

// 2. Revisar resumen, omitidas (sintético/vacío es lo esperado; invalido, destino_excede_limite, ref_duplicada,
//    id_duplicado hay que mirarlos), muestra (id_ocupado, editado_fuera) y huerfanos.

// 3. Aplicar con las MISMAS opciones que se simularon
let a = await importar("aplicar=1&archivar=1"), hechos = [a];
while (a.siguiente) hechos.push(a = await importar("aplicar=1&archivar=1&cursor=" + encodeURIComponent(a.siguiente)));
hechos.map(h => [h.ok, h.aplicadas, h.fallidas.length, h.pendientes])

// 4. Comprobar: otra simulación tiene que dar resumen.escrituras = 0 en todos los tramos.
```

Si hay `fallidas` (p. ej. un 409 porque alguien escribió entretanto), repetir el paso 3: es idempotente. `pisar=1`
sólo después de revisar `pisa` en la muestra, entidad a entidad.

### 5.2 Reconciliar tras `espejo_fallido`

La doble escritura corre en `waitUntil`: quien guarda en `/parrilla/` no se entera de un fallo. Las señales son:

- `GET /api/programacion/auditoria?accion=espejo_fallido` (y `espejo_omitido`): `motivo` `fallo_d1`,
  `tiempo_agotado`, `conflicto` o `rechazada`, con la `ref` del KV y quién guardó. Estas marcas **no** suben la versión.
- En la simulación del importador: `espejo.fallidos` > 0.

Procedimiento:

1. Simular con `archivar=1` todos los tramos (5.1, paso 1). Las `escrituras` son la deriva. Sin `archivar=1` no se ve
   la de los borradores vaciados, las vivas borradas ni los circuitos borrados.
2. Si hay escrituras, aplicar con `aplicar=1&archivar=1` y volver a simular: 0 escrituras.
3. Lo `omitir` · `editado_fuera` **no es deriva**: es una edición hecha por la API que no se pisa. Se decide entidad a
   entidad (deshacerla por la API o, tras revisar `pisa`, `pisar=1`).
4. Para el documento de vivas y circuitos basta también con guardar cualquier viva o circuito en `/parrilla/`: el
   espejo lo refleja entero.

### 5.3 Leer el panel de sombra (`/programacion/sombra/`)

Cada player, al pedir su playlist, deja (como mucho cada 10 min por instancia) un veredicto que compara lo que
recibió con lo que resolvería el motor nuevo. Por defecto el panel filtra `distinta`.

| Veredicto · motivo | Qué significa | Acción |
|---|---|---|
| `igual` · `misma_lista` | Las dos firmas coinciden | Ninguna |
| `equivalente` · `relleno_del_player` | Sin lista propia en los dos lados: el Stock del player frente a la capa `relleno` | Ninguna (diseñado) |
| `equivalente` · `orquestacion_por_encima` | Manda la sincro, el mural o la música de Xtore (fuera del modelo) | Ninguna (pendiente de confirmar con Carlos tras el corte, desviación 41) |
| `equivalente` · `parrilla_intercala` / `parrilla_vendida` / `rundown_exacto` / `franja_nocturna_de_ayer` / `viva_directa_gana` | Diferencias **intencionadas** por las decisiones de Carlos | Ninguna |
| `distinta` · `nuevo_vacio`, `solo_en_nuevo`, `capa_distinta`, `piezas_distintas`, `orden_distinto`, `spots_distintos`, `cadencia_distinta`, `exacta_distinta` | Discrepancia real | Abrir la fila: enlaza a `/emision/?screen=` (lo de hoy) y a `/api/programacion?screen=` (lo nuevo). Causas típicas: el KV cambió y el espejo falló (5.2), un borrador con `synthetic: true`, o una asignación creada por la API que hoy no existe |

Vigilar también el gasto de la D1 (Cloudflare → D1 → `admira-programacion` → Metrics): unas 6.500 filas escritas al
día para ~130 pantallas. Si se dispara, apagar `sombra` y mirar `cambios` en el panel.

### 5.4 Lo que NO hay que hacer

- **No encender `motor`.** La API lo rechaza (409 `motor_bloqueado_hasta_E13`) y **no** hay que saltárselo con SQL en
  la D1: `motor` es el corte (E13), por circuito y con el KV en solo lectura.
- No tratar `/api/programacion` como «lo que emite ahora»: eso es `/api/emision`.
- No escribir en la D1 por la API de E4 para «arreglar» algo que viene del KV: el importador lo verá como
  `editado_fuera` y dejará de sincronizarlo. Se arregla en el legado (`/parrilla/`, `/api/playlist`).
- No usar `pisar=1` sin revisar `pisa`; no aplicar con opciones distintas de las simuladas.
- No borrar playlists en uso: archivar la asignación primero.
- No cambiar banderas sin el OK de Carlos ni sin `motivo`.
- No poner la clave de servicio en un navegador, en una URL ni en un mensaje; nunca publicar su valor.
- No abrir `canal.html?screen=<pantalla real>` para «comprobar»: se hace pasar por esa pantalla (ver
  https://admira.tv/mcp/emision.md, trampas).

## 6. Pendiente

| Entrega | Qué | Estado |
|---|---|---|
| E8 | Mando en vivo persistido (2 h o borde de franja); `mando.html` lo usa | Pendiente |
| E9 | El player (`canal.html`) consume `items`, `spots`, `cadencia`, `exacta`; repregunta en `validoHasta`; precarga `siguiente`. Detrás de bandera | Pendiente. **Acceso por decidir con Carlos**: lectura pública por pantalla, como `/api/playlist` (recomendada), o clave de player |
| E10–E11 | Editores de playlists y de programación («qué sale cuándo») | Pendiente |
| E12 | Emergencias con confirmación y auditoría | Pendiente |
| E13 | Corte: `motor = encendido` por circuito, KV en solo lectura | Pendiente |
| E14 | Retirada del legado | Pendiente |

Decisiones abiertas: desviación 6 (¿spots sobre una base exacta? recomendado no), desviación 41 (¿orquestación por
encima del modelo tras el corte?), desviación 33 (actor del espejo reconocible por el importador) y la activación
opcional de `PROGRAMACION_SERVICE_KEY`.

## 7. Relacionado

- admira.tv #54 (arreglos de playlists, fase 1): `/api/playlist` GET con `synthetic`, `origin`, `rev` y `liveRev`;
  409 sólo si la `rev` guardada no coincide; el censo de etiquetas sólo se escribe con pistas del player.
- admira.tv #55 (qué emite cada pantalla): https://admira.tv/mcp/emision.md.
- admira.tv #57–#62 (modelo único E1–E7) y #61 (D1 creada y conectada). Lista con enlaces:
  https://admira.tv/mcp/cambios-2026-10-09.md.
- omnipublicity-api #34 (E0, clave para escribir `-tema`): https://github.com/csilvasantin/omnipublicity-api/pull/34 —
  escribir `/control/playlist?screen=<pantalla>-tema` exigirá `CONTROL_PLAYLIST_KEY` en cuanto esté puesta (hoy no lo
  está: nada cambia). `tools/publica-playlists-kioskos.py` ya la lee del entorno o de `admira-vault` (#56).
- Pixeria #86 (asignar al circuito respeta lo sintético): https://github.com/csilvasantin/pixeria/pull/86 — el modo
  «añadir» envía `rev`, relee una vez ante un 409 y salta la pantalla cuya lista no puede leer.

## EN · summary

Unified playlist model for admira.tv (design approved 8 Oct 2026; full spec at
https://admira.tv/docs/playlists-modelo-unico.md). Until cut-over (E13) the legacy KV still drives every player; the
D1 `admira-programacion` is a compared (shadow) and mirrored (double-write) copy. Production on 9 Oct 2026: 34
playlists + 34 assignments imported (version 68); Carlos switched `sombra` and `espejo` on and kept `motor` off
(version 69); a dry-run afterwards showed 0 writes. Read with `GET /api/programacion?screen=&at=&tag=` (session or
public virtual screens); write with `/api/programacion/{playlists,asignaciones,circuitos}[/:id]` (portal session;
the optional `PROGRAMACION_SERVICE_KEY` is not set). `rev` is mandatory for PUT/PATCH/DELETE (428 without it, 409 on
mismatch, 422 on validation). The importer simulates by default (`?aplicar=1`, `?pisar=1`, `?archivar=1`). Flags at
`/api/programacion/banderas` (session only); `motor` is blocked until E13 — never force it. To see what a screen plays
today, use `/api/emision` (https://admira.tv/mcp/emision.md).

# Modelo único de playlists de admira.tv

Diseño aprobado por Carlos el 8-oct-2026. Este documento recoge el diseño, las tres decisiones de Carlos, lo que hacen las
entregas E1 a E5 y E7, en qué se aparta la implementación del diseño y el plan completo de entregas.

## Por qué

Hoy, lo que emite una pantalla sale de varias piezas que se pisan entre sí sin una regla escrita:

- el borrador «Por defecto» de cada pantalla en el KV (`admira-tv:playlist:default:v1:<pantalla>`);
- las playlists vivas por metatags (`admira-tv:playlist:live:v1`), que sólo cuentan si no hay borrador;
- el contenido dirigido por hashtag, que se pega detrás;
- la parrilla de `/grid/day` (pixer-worker), que en `canal.html` **anula** el «Por defecto» en cuanto hay un slot;
- el mando del operador (`tag-…`, `content-…`), que no caduca nunca.

El modelo único reduce todo eso a dos entidades (**playlist** y **asignación**) y a un **resolver** puro que dice qué sale en
una pantalla en un instante, por qué y hasta cuándo.

## Las tres decisiones de Carlos (8-oct-2026)

Las tres son las opciones recomendadas.

1. **La parrilla de `/grid` sigue siendo una capa de venta aparte.** No se migra: el motor nuevo la lee.
   - Los slots `paid`, `sold` o `accepted` son capa **pagada** con mezcla **intercala**.
   - Los slots `own` son capa **propia** con mezcla **intercala**.
   - El rundown `municipal-50-50` es la base **propia**, con orden **exacto**.
2. **El mando en vivo del operador (hashtag, `#ID` o directo) manda, pero caduca.**
   - Caduca a las **2 h** o en el **siguiente cambio de franja**, lo que llegue antes.
   - Mientras manda, lo pagado se sigue intercalando.
3. **Desempate del «por defecto».**
   - Lo asignado directamente a una pantalla gana.
   - Lo que llega por grupos se fusiona.
   - El campo `peso` sirve como válvula de escape.

## El modelo

### Playlist: qué se emite

| Campo | Significado |
|---|---|
| `id`, `nombre`, `proyecto` | Identidad (`id` en minúsculas y guiones). |
| `tipo` | `fija` lleva piezas puestas a mano. `viva` lleva reglas contra el Stock. `mixta` lleva piezas y huecos. |
| `items` | Hasta 200. Cada uno es `{tipo:'pieza', …}` con la misma forma que la playlist «Por defecto» de hoy, o `{tipo:'hueco', regla, cuantas}`. |
| `reglas` | Reglas de contenido con la misma forma y los mismos límites que `cleanLive().content`. |
| `opciones` | `{exacta, segundos}`. |
| `duracion_s` | Calculada. |
| `origen` | `manual`, `legado:kv-default`, `legado:kv-viva`, `pixeria-stock`… |
| `rev` | Revisión de la entidad, para el bloqueo optimista. |
| Historial | Las 50 últimas revisiones. |

### Asignación: a dónde y cuándo

- **`destino`.** `{all, any}` con la sintaxis de `targetMatches` de `_playlist-live.js`: dentro de cada faceta basta con una
  (OR) y entre facetas tienen que cumplirse todas (AND).
- **`directa`.** Vale 1 cuando el destino sólo nombra `pantalla:…`.
- **Programación.** En hora de pared de Europe/Madrid:
  - `fecha_desde` y `fecha_hasta` son inclusivas. Si falta una, el rango queda abierto por ese lado.
  - `dias` es una máscara de bits: L=1, M=2, X=4, J=8, V=16, S=32, D=64.
  - `franjas` son `[{desde, hasta}]` en minutos locales. Si `hasta <= desde`, la franja cruza la medianoche y **pertenece al
    día en que empieza**: `dias`, las fechas y las excepciones se miran en ese día.
  - `recurrencia` puede ser `{tipo:'semanal', cada:N, ancla}` o `{tipo:'fechas', fechas}`. Las semanas van de lunes a
    domingo y se cuentan desde la semana del ancla.
  - `excepciones` son días sueltos o rangos `{desde, hasta}`.
  - `inicio_utc` y `fin_utc` se precalculan como cotas conservadoras para filtrar en SQL.
- **Cambio de hora.** Las horas que no existen saltan a las 03:00 y las que se repiten toman la primera ocurrencia. Así,
  00:00–02:30 y 02:30–24:00 siguen cubriendo el día sin hueco ni solape, también el 25-oct-2026 y el 28-mar-2027.
- **`capa`.** Por orden de prioridad: emergencia 500, pagada 400, propia 300, por_defecto 200 y relleno 100.
- **`mezcla`.** Se guarda como `anade`, sin eñe, para no depender de la codificación; al entrar también se acepta «añade».
  - `sustituye`: es la base, sola.
  - `fusiona`: es la base, junto con las demás que fusionan.
  - `anade`: va detrás de la base si su capa es igual o mayor.
  - `intercala`: es un spot que se mete cada `cadencia` piezas.
- **`peso`, `estado`, `ref_externa`, `rev` e historial.** `estado` es `borrador`, `activa`, `pausada` o `archivada`.
  `ref_externa` es, por ejemplo, `kv:default:<pantalla>`, `kv:viva:<id>` o `grid:<booking>`.

**Orden K** (desempate dentro de una capa), por este orden:

1. directa primero;
2. sustituye antes que fusiona;
3. más peso;
4. fecha_desde más reciente (sin fecha cuenta como la más antigua);
5. actualizado_en más reciente;
6. id ascendente.

## D1 `admira-programacion` (E1)

- **Binding.** `PROGRAMACION_DB`.
- **Esquema.** `migrations/programacion/0001.sql`. Es idempotente.
- **Tablas.**

| Tabla | Para qué |
|---|---|
| `meta` | Fila única con `version` (sube en cada escritura y sirve de clave de caché), `esquema` y `banderas` (`motor: apagado/sombra/encendido`). |
| `playlist`, `playlist_revision` | Entidad y sus 50 últimas revisiones. |
| `asignacion`, `asignacion_revision` | Entidad, con `inicio_utc`/`fin_utc` precalculados, y sus revisiones. |
| `asignacion_destino` | Índice invertido etiqueta → asignación (filtro previo; la comprobación exacta la hace el resolver). |
| `circuito` | Circuitos definidos, que hoy viven dentro del documento de vivas. |
| `clave_servicio` | Claves de escrituras servidor a servidor. Sólo se guarda el hash SHA-256; el valor vive en `admira-vault`. **E4 todavía no la usa**: la clave de Pixeria es un secreto de Pages (desviación 22). |
| `auditoria` | Una fila por escritura aceptada, con la `version` resultante. |
| `sombra` | Comparación entre el legado y el motor nuevo, por pantalla. |

**Escritura con bloqueo optimista en un solo `db.batch`**, que en D1 es una transacción
(`functions/api/_programacion/almacen.js`):

1. `INSERT`, o `UPDATE … WHERE id = ? AND rev = ?`, que deja en la fila una ficha de escritura única (`escritura`).
2. Revisión: una copia exacta de la fila, sacada con `json_object` de la propia fila. Después, la poda a las 50 últimas.
3. Índice del destino (sólo en las asignaciones).
4. Auditoría.
5. `meta.version + 1`.
6. Lectura de la versión y de la fila escrita.

Los pasos 2 a 5 sólo actúan si la fila lleva **mi** ficha. Si `changes = 0`, la respuesta es **409** y no queda rastro en el
historial, la auditoría ni la versión. Un id repetido al crear aborta el batch entero y también es 409.

Hay dos guardas más:

- una asignación sólo puede apuntar a una playlist que exista (si no, 422 `playlist_inexistente`);
- no se borra una playlist a la que apunte una asignación sin archivar (409 `playlist_en_uso`).

Al borrar, la copia final queda en la auditoría.

## Resolver (E2)

Está en `functions/api/_programacion/resolver.js`. Es puro, sin red, y todo le llega ya leído:

- `facts` (la identidad completa de la pantalla);
- `circuitos`;
- `asignaciones` y `playlists`;
- `stock`;
- `parrilla` (la respuesta de `/grid/day`);
- `mando` (opcional), con la forma `{tipo, valor, desde}`.

Algoritmo:

1. **Etiquetas de la pantalla.** `deduceScreenTags(facts)` + `applyCircuits`. Si llegan `screenTags`, mandan ellas.
2. **Hora local.** Con Intl.
3. **Candidatas.** Las asignaciones activas que cubren el instante y casan con el destino, más las implícitas:
   - el hashtag dirigido (`addressedContent`), como `por_defecto` · `anade`;
   - los slots de la franja actual de la parrilla, según la decisión 1.
4. **Emergencia.** Si hay alguna, sale la fusión de todas, exacta y sin spots. Si la fusión sale vacía, se ignora.
5. **Base.** Se toma la capa más alta con `sustituye` o `fusiona` y, dentro de ella, el orden K:
   - si la ganadora sustituye, va sola;
   - si fusiona, se funde con las de su misma clase: las directas con las directas y las de grupo con las de grupo.
   - Si la base sale vacía (por ejemplo, una regla sin piezas), se baja a la siguiente.
6. **Reglas vivas y huecos.** Se resuelven contra el Stock con `resolveContent`. Ningún `stockId` se repite entre playlists y
   la lista se corta en 200. Dentro de una fija, en cambio, se respeta la repetición puesta a mano.
7. **Añadidos.** Van los de capa igual o superior a la base, detrás y sin repetir.
8. **Spots.** Primero los pagados y después los propios, cada `cadencia` piezas: la mínima declarada o, si no hay ninguna, 4.
   Se reparten en ciclo y ninguno se queda sin salir en la vuelta. Sobre una base exacta no se teje nada.
9. **Sin base ni añadidos.** `items` queda vacío y la capa es `relleno`. Los `spots` van aparte para que el player los teja
   sobre su propio relleno.
10. **`validoHasta` y `siguiente`.**
    - `validoHasta` es el primer borde de programación, de franja de la parrilla o de caducidad del mando, como mucho a 48 h.
    - `siguiente` es lo que saldrá en ese momento (capa, nombre, base y piezas para precargar), o `null` si no cambia nada en
      48 h.

**Mando en vivo (decisión 2).**

- **Validez.** Manda desde `desde` hasta 2 h después o hasta el primer borde posterior (de la parrilla o de cualquier
  asignación que toque a la pantalla), lo que llegue antes. Mientras manda, la capa es `mando`.
- **Hashtag y directo.** Sustituyen la base. Lo pagado se sigue intercalando, sea cual sea su mezcla. Los spots propios y los
  añadidos no entran.
- **`#ID`.** Pone la pieza la primera y lo demás sigue detrás, como el «añade una pieza» de hoy.
- **Mando sin piezas.** Si el tag no tiene piezas, la programación sigue y el mando queda marcado con `vacio: true`.

**Salida.**

- `capa`, `exacta`, `nombre`, `items`, `spots` y `cadencia`;
- `base` (los ids);
- `mando`;
- `fuentes`, que dice qué papel tuvo cada candidata: `base`, `anade`, `spot`, `eclipsada`, `vacia`, `sin_playlist`,
  `por_debajo_de_la_base`, `omitida_por_base_exacta`, `ignorada_por_emergencia` o `ignorada_por_mando`;
- `validoHasta`, `siguiente`, `rev` y `screenTags`.

## API de lectura (E3)

`GET /api/programacion?screen=<id>[&at=<ISO o ms>][&tag=<hashtag>]`, en `functions/api/programacion.js`. Sirve la salida
del resolver para una pantalla en un instante. **Todavía no la consume nadie**: el player llegará en E9, detrás de bandera.

**Parámetros.**

- `screen` (obligatorio): el id de la pantalla, con el mismo formato que `/api/playlist` y `/api/emision`.
- `at` (opcional): el instante, en ISO o en milisegundos. Si falta, es ahora.
- `tag` (opcional): simula el mando en vivo por hashtag desde `at` (`{tipo:'hashtag', valor, desde: at}`), que caduca
  según la decisión 2.
- Las pistas del player (`w`, `h`, `o`, `lang`, `circuit`, `project`, `xpace`/`loc`, `iot`) se aceptan igual que en
  `/api/playlist`.

**Qué lee.** Nada de esto escribe.

1. **D1** (`PROGRAMACION_DB`), con `almacen.js`: `leerMeta` en cada consulta y, si hace falta, `listarCircuitos` y
   `candidatas`.
2. **Parrilla.** `/grid/day` de api.admira.store, una lectura pública sin `GRID_KEY`, pedida igual que en `/api/emision`
   (sin `&date=` si es hoy). Se piden **tres días**: la víspera, el día de `at` y el siguiente. El resolver acepta ahora
   una lista de días.
3. **Stock.** `loadStock` de `playlist.js`: `stock.admira.store/stock/index.json`, el mismo índice que las vivas de hoy.
4. **Identidad.** `hintFacts` + `enrichFacts` de `playlist.js`, que E3 exporta sin cambiarles el comportamiento (con
   ellas, también `loadStock`).
   - Si pregunta el player (`w`/`h`/`lang` o `player=1`), habla por sí mismo, como en `/api/playlist`.
   - Si no, las pistas que falten salen de lo que la pantalla dejó registrado al pedir su playlist
     (`admira-tv:screen:tags:v1:<pantalla>`), como en `/api/emision`.
   - `enrichFacts` recibe un `ACCESS` de solo lectura (`soloLectura` de `emision.js`): ni el censo de etiquetas ni el
     índice de Xpacios se escriben desde aquí.

**Memoria por instancia.**

- Lo leído de la D1 se guarda con la clave `meta.version`. Cada consulta lee sólo la fila de `meta`.
- Mientras la versión no cambie, se reutilizan los circuitos y las candidatas. Las candidatas se guardan por etiquetas de
  la pantalla y hora de `at`: se piden desde el inicio de la hora con 49 h de horizonte, así que valen para cualquier
  instante de esa hora.
- Cuando una escritura sube la versión, se olvida todo lo anterior.
- La parrilla y lo que la pantalla dejó registrado se recuerdan 60 s; el Stock, 45 s (la memoria de `playlist.js`). Un
  fallo de red no se recuerda.
- Hay un tope de 500 entradas por memoria.

**Acceso.** Es la misma postura que `/api/emision`, porque reutiliza su `autorizar`:

- las pantallas virtuales (`virtual-*`, `xtore-virtual-*`) se leen sin sesión;
- el resto, con la sesión del portal y permiso `digitalsignage-player`, o con la sesión de lectura viva.

`auth-gate.js` no cambia: sólo asigna proyectos a páginas, y E3 no tiene página.

**Respuestas.**

| Estado | Cuándo |
|---|---|
| 400 `bad_screen` / `bad_at` | Pantalla o instante ilegibles. |
| 401 / 403 | Sin sesión o sin permiso (igual que `/api/emision`). |
| 503 `programacion_db_no_configurada` | No hay binding `PROGRAMACION_DB`. Es **lo normal en producción** hasta que se cree la D1, y por eso la fusión es segura con el binding comentado. |
| 503 `programacion_db_sin_esquema` | La D1 existe, pero sin la migración `0001.sql`. |
| 503 `programacion_lectura_fallida` | Falló una lectura de la D1. Queda en el log. |
| 405 | Cualquier método que no sea GET. |
| 200 | La salida del resolver con un sobre. |

El sobre lleva:

- `ok`, `screen`, `at` (ISO), `ahora` y `publico`;
- `version` (`meta.version`), `motor` (la bandera `motor` de `meta`: `apagado`, `sombra` o `encendido`) y `memoria`
  (`acierto` si circuitos y candidatas salieron de la memoria; `fallo` si se leyeron);
- `lecturas`: `{parrilla: [fechas leídas], stock: número de piezas, autorretrato: true/false}`.

Después va todo lo del resolver: `instante`, `local`, `capa`, `exacta`, `nombre`, `items`, `spots`, `cadencia`, `base`,
`mando`, `fuentes`, `validoHasta`, `rev`, `screenTags` y `siguiente`. Por ejemplo, abreviado:

```json
{
  "ok": true, "screen": "alcampo-alcala", "at": "2026-10-14T08:00:00.000Z", "ahora": false, "publico": false,
  "version": 2, "motor": "apagado", "memoria": "fallo",
  "instante": 1791964800000, "local": "2026-10-14 10:00",
  "capa": "por_defecto", "exacta": false, "nombre": "Por defecto", "base": ["defecto-alcampo-alcala"],
  "items": [
    { "id": "stock-s1", "stockId": "s1", "title": "Pieza s1", "seconds": 10, "asset": "https://stock.admira.store/stock/s1/a.mp4", "assetType": "video" },
    "… s2, s3, s4 …",
    { "id": "grid:b-77", "title": "Oferta semanal", "sub": "parrilla · 8-12 · Alcampo", "seconds": 15, "asset": "https://cdn.admira.store/oferta.mp4", "spot": true, "capa": "pagada" }
  ],
  "spots": [{ "id": "grid:b-77", "…": "…" }], "cadencia": 4, "mando": null,
  "fuentes": [
    { "id": "defecto-alcampo-alcala", "capa": "por_defecto", "mezcla": "sustituye", "papel": "base", "piezas": 4 },
    { "id": "parrilla:manana:pagada", "capa": "pagada", "mezcla": "intercala", "papel": "spot", "piezas": 1 }
  ],
  "validoHasta": 1791972000000, "rev": 2875901350,
  "screenTags": ["circuito:alcampo", "pantalla:alcampo-alcala", "proyecto:alcampo", "todas"],
  "siguiente": { "en": 1791972000000, "capa": "por_defecto", "nombre": "Por defecto", "base": ["defecto-alcampo-alcala"], "items": ["…"] },
  "lecturas": { "parrilla": ["2026-10-13", "2026-10-14", "2026-10-15"], "stock": 0, "autorretrato": false }
}
```

## API de escritura (E4)

`/api/programacion/<recurso>[/<id>]`, `/api/programacion/historial/<tipo>/<id>` y `/api/programacion/auditoria`, en
`functions/api/programacion/[recurso]/[[resto]].js`. El acceso está en `functions/api/_programacion/acceso.js`. Todo pasa
por `almacen.js` (E1), así que cada escritura aceptada es un solo `db.batch` con bloqueo optimista, revisión, auditoría
y `meta.version + 1`: la memoria de `GET /api/programacion` se invalida sola en la consulta siguiente. **Todavía no la
consume nadie**: los editores llegan en E10 y E11. El importador (E5) va por la misma ruta (`POST /importar`), pero con
su propio acceso y su propia lectura del KV (ver «Importador del legado (E5)»).

**Por qué `[recurso]/[[resto]]` y no `[[ruta]]`.** En Pages, un comodín `[[ruta]]` también casa con la base
(`/api/programacion`) y el router prueba las rutas por número de tramos, así que le ganaría a `functions/api/programacion.js`
(comprobado en el bundle de `wrangler pages functions build`). Con `[recurso]` delante hace falta al menos un tramo:
`GET /api/programacion?screen=` sigue yendo a E3.

### Rutas

`<recurso>` es `playlists`, `asignaciones` o `circuitos`. En `historial/<tipo>` y en `?entidad=` vale el singular o el
plural.

| Método y ruta | Qué hace | Respuestas |
|---|---|---|
| `GET /<recurso>` | Lista. Filtros: `playlists?proyecto=&limite=` (500 como mucho) · `asignaciones?playlist_id=&estado=&limite=` (1000) · `circuitos` (todos). | 200 `{ok, version, <recurso>: […]}` · 400 `estado_invalido` |
| `POST /<recurso>` | Crea. Sin `id`, sale del nombre (playlists y circuitos) o es `asg-xxxxxxxx` (asignaciones). | 201 `{ok, <entidad>, version}` con `Location` · 409 `ya_existe` (con `actual`) · 422 |
| `GET /<recurso>/<id>` | Lee una. | 200 `{ok, version, <entidad>}` · 404 `no_existe` |
| `PUT /<recurso>/<id>` | La **sustituye entera**: lo que no llega vuelve a su valor por defecto. Exige `rev`. | 200 `{ok, <entidad>, version}` · 404 · 409 `revision_conflict` (con `actual`) · 422 · 428 `rev_requerida` |
| `PATCH /<recurso>/<id>` | Cambia **sólo los campos que llegan**, sobre la fila actual (los de primer nivel se sustituyen enteros: `items`, `destino` o `franjas` van completos). Exige `rev`. | Las mismas que PUT |
| `DELETE /<recurso>/<id>` | La borra de verdad. Exige `rev`. | 200 `{ok, borrado, version}` · 404 · 409 `revision_conflict` o `playlist_en_uso` · 428 |
| `GET /historial/<tipo>/<id>` | Las revisiones (50 como mucho, de la última a la primera, con `datos`, `autor`, `en` y `motivo`) y cómo está ahora (`actual`, `null` si se borró). | 200 `{ok, version, tipo, id, actual, revisiones}` · 404 si no hay ni fila ni revisiones · 403 `solo_lectura` al visor |
| `POST /importar` | El importador del legado (E5): simula por defecto y escribe con `?aplicar=1` (opciones `pisar` y `archivar`). Sólo sesión del portal. | Ver «Importador del legado (E5)» |
| `GET /auditoria` | Las escrituras aceptadas, de la más reciente a la más antigua. Filtros: `entidad`, `id`, `actor`, `accion` (`crear`, `actualizar`, `borrar`, `banderas` y, desde E7, las marcas `espejo_fallido` y `espejo_omitido`). Paginada: `limite` (50 por defecto, 200 como mucho) y `antes=<siguiente>`. | 200 `{ok, version, entradas, siguiente}` · 400 `entidad_invalida` / `antes_invalido` · 403 `solo_lectura` al visor |

En todas:

- 401 `unauthorized` sin sesión (ni clave, si es una escritura); 403 `forbidden` sin el permiso; 403 `solo_lectura` si
  el visor escribe o pide historial o auditoría.
- 503 `programacion_db_no_configurada` sin el binding y 503 `programacion_db_sin_esquema` sin la migración, como en E3.
  Se comprueba **después** del acceso, así que sin sesión la respuesta es 401. Un fallo de la D1 es 503
  `programacion_lectura_fallida` o `programacion_escritura_fallida` y queda en el log.
- 404 `ruta_desconocida` y 405 con `Allow` para el método que no toca. Un `<id>` que no es un id posible
  (`[a-z0-9-]`, 60 como mucho) es 404 `no_existe`.

**La revisión (`rev`).** Va en el cuerpo (`{"rev": 3, …}`), en `?rev=3` o en `If-Match: "3"`. Sin ella, PUT, PATCH y
DELETE responden 428 `rev_requerida` sin escribir (un PUT sin `rev` crearía). Si no es la de la fila, la respuesta es
409 `revision_conflict` con la fila actual en `actual` y no queda rastro: ni revisión, ni auditoría, ni versión. En
PATCH, la fusión se hace sobre la fila leída, pero el `UPDATE … WHERE rev = ?` del almacén sigue mandando: si otro
escribe entretanto, también es 409.

**El motivo.** `motivo` en el cuerpo (o `?motivo=` en DELETE) queda en la revisión y en la auditoría (300 caracteres).

**Validación → 422.** Es la de `modelo.js` y `horario.js`. El almacén la devuelve como 400 y la ruta la traduce a 422
con el campo culpable y un mensaje legible:

```json
{ "ok": false, "error": "fechas_invertidas", "campo": "fecha_hasta", "mensaje": "fecha_hasta es anterior a fecha_desde." }
```

`playlist_inexistente` (una asignación que apunta a una playlist que no existe) también es 422, con `campo: "playlist_id"`.
Un cuerpo que no es un objeto JSON es 400 `json_invalido`, y uno de más de 2 millones de caracteres, 413.

**Borrar.** Es un borrado de verdad, el que ya hacía `almacen.js`: la copia final queda en la auditoría
(`detalle.datos`), y las revisiones de playlists y asignaciones se conservan hasta que se cree otra con el mismo id. Una
playlist a la que apunta una asignación sin archivar no se borra (409 `playlist_en_uso`): primero se archiva la
asignación (`PATCH {estado: "archivada", rev}`).

### Acceso

- **Leer** (todo GET): la sesión del portal con permiso `digitalsignage-player` (`readSession` + `accessFor`, de
  `_auth-session.js`) o la sesión de lectura viva (el visor, con `lecturaStillLive`). Es la postura de `autorizar` de
  `/api/emision` y de E3, sin la puerta pública de las pantallas virtuales, porque aquí no hay pantalla.
- **El visor no ve quién escribió.** Historial y auditoría llevan los emails de los actores, así que al visor le
  responden 403 `solo_lectura`, antes de tocar la D1. En las listas y lecturas sueltas de playlists, asignaciones y
  circuitos le llegan las filas sin `creado_por` ni `actualizado_por`. La sesión del portal con `digitalsignage-player`
  lo ve todo.
- **Escribir** (POST, PUT, PATCH y DELETE):
  - la sesión del portal con permiso `digitalsignage-player`. El actor de la auditoría, la revisión y
    `creado_por`/`actualizado_por` es su email;
  - o la **clave de servicio de Pixeria**, server to server, en `X-Programacion-Key: <clave>` (la recomendada) o en
    `Authorization: Bearer <clave>`. Se compara en tiempo constante (los SHA-256 de las dos) con el secreto de Pages
    `PROGRAMACION_SERVICE_KEY`. El actor es `servicio:<X-Actor>` (minúsculas, guiones) o `servicio:pixeria`. **Sin el
    secreto puesto, la clave está apagada**: sólo vale la sesión, y quien llegue con clave recibe 401;
  - una clave equivocada no cuenta: sin sesión es 401; con sesión, manda la sesión;
  - la sesión de lectura no escribe: 403 `solo_lectura` (lo mismo que ya hace el guarda global de
    `functions/_middleware.js`).
- **Sin CORS.** La clave sólo se usa entre servidores; nunca en un navegador ni en la URL.

## Importador del legado (E5)

`POST /api/programacion/importar`, en `functions/api/_programacion/importar.js`, enrutada por la API de E4. El plan lo
hace `functions/api/_programacion/importador.js`, que es puro: recibe lo leído del KV y de la D1 y devuelve las
operaciones. Traduce con `legado.js`, la misma traducción de las pruebas de paridad.

**Qué importa.**

| Fuente en el KV | Referencia | En la D1 |
|---|---|---|
| Borrador «Por defecto» `admira-tv:playlist:default:v1:<pantalla>` con piezas | `kv:default:<pantalla>` | Playlist fija `defecto-<pantalla>` + asignación directa, `por_defecto` · `sustituye`. Si no cabe en 60, el id lleva huella (desviación 48). |
| Cada viva de `admira-tv:playlist:live:v1` | `kv:viva:<id>` | Playlist viva `viva-<id>` + asignación por su destino, `por_defecto` · `fusiona`, peso N, N−1, … (las apagadas, `pausada`). |
| Cada circuito definido del mismo documento | `kv:circuito:<id>` | Circuito `<id>`. |

No se importan:

- los borradores sintéticos (`synthetic: true`), porque no son datos guardados: los compone `playlist.js` en cada consulta;
- los vacíos, los que no se entienden (sin `items` como lista, la regla de `readDraft`) y los que no validan (`invalido`,
  con el código de `modelo.js`).

Todos salen en `omitidas` con su motivo.

### Idempotencia: cómo se decide cada operación

- **La clave es `ref_externa`.** La asignación se busca por su `ref_externa` (índice único de `0001.sql`). La playlist y el
  circuito se buscan por el id que da la traducción, porque esas tablas no tienen `ref_externa`.
- **Se compara el contenido**: las columnas que escribe `almacen.js` (`COLUMNAS`), saneadas por `modelo.js` en los dos lados.
  - Si coinciden, `igual`: no se escribe nada.
  - Si no, `actualizar`, con la `rev` que tiene la fila y la lista de `cambios`.
  - Si no hay fila, `crear`.
- **Una segunda pasada sale toda `igual`** y no sube `meta.version`.
- **No pisa lo ajeno, ni con `pisar`.** Si el id lo ocupa algo que no salió del legado, la operación es `omitir` ·
  `id_ocupado` (y la de su asignación, `playlist_omitida`). «No salió del legado» quiere decir:
  - una playlist sin origen `legado:…`;
  - un circuito que no creó el importador;
  - una asignación con otra `ref_externa`, o con la suya pero creada por otro (`creado_por` que no es `importador:…`).
- **Tampoco lo editado fuera (decisión de Carlos).** Si algo que salió del legado se cambió después por otro camino (su
  `actualizado_por` no es `importador:…`; por ejemplo, la API de E4) y ya no coincide con lo traducido, la operación es
  `omitir` · `editado_fuera`, con `actualizado_por`. **Sólo con `?pisar=1`** se actualiza, y la operación lo avisa en
  `pisa` (el último actor). Si lo editado coincide con lo traducido, sale `igual`.
- **Nunca borra.** Lo que está en la D1 y ya no en el KV se informa en `huerfanos`, con su motivo. **Sólo con
  `?archivar=1`** (decisión de Carlos), las asignaciones huérfanas se archivan:

| Motivo | Cuándo | Con `?archivar=1` |
|---|---|---|
| `viva_eliminada` | La viva ya no está en el documento (asignación y playlist). | Se archiva la asignación. |
| `circuito_eliminado` | El circuito ya no está (sólo los que creó el importador). | Se apaga el circuito (`activo: false`). |
| `borrador_vacio`, `ilegible`, `sin_valor` | El borrador sigue, pero hoy no manda nada. | Se archiva la asignación. |
| `sintetico` | El borrador guardado lleva `synthetic: true`. | Sólo se informa (desviación 35). |
| `sin_clave_kv` | La clave del borrador ya no existe. Se mira en el último tramo, con la lista de todas las claves. | Se archiva la asignación. |

- **Archivar** es guardar la asignación con `estado: "archivada"` y su `rev`: deja de emitirse (el resolver y
  `candidatas()` sólo miran las `activa`), pero la fila sigue, con su historial. La operación es `archivar`, con el motivo
  del huérfano y `cambios: ["estado"]`.
  - Sólo se archiva lo del importador: ref `kv:…` y creada por él. Lo demás sale `omitir` · `ajena`.
  - Lo editado fuera sale `omitir` · `editado_fuera`, salvo con `?pisar=1` (con el aviso `pisa`).
  - Lo ya archivado sale `igual` · `ya_archivada`: la pasada siguiente no escribe nada.
  - Las playlists huérfanas no se tocan (no tienen estado).
  - Los circuitos huérfanos del importador se **apagan** (`activo: false`; decisión de Carlos del 9-oct-2026, la misma
    regla que el espejo de E7, desviación 41): dejan de dar `circuito:<id>` a las pantallas. Mismas reglas: sólo los que
    creó el importador, `omitir` · `editado_fuera` salvo con `?pisar=1` (con `pisa`), `igual` · `ya_apagado` si ya lo
    está. Cuentan como `archivar` de `circuito` en `resumen` y en `aplicadas`, con `cambios: ["activo"]` y el motivo
    `importador E5 · kv:circuito:<id> · apagado: circuito_eliminado`.
  - Si la fuente vuelve al KV, la asignación (o el circuito) es del importador y se reactiva en la importación siguiente.

### Petición y respuesta

**Parámetros** (todos en la URL; no lleva cuerpo):

- `aplicar=1`: escribe. Sin él, simulación.
- `pisar=1`: actualiza también lo editado fuera del importador (si no, `omitir` · `editado_fuera`).
- `archivar=1`: archiva las asignaciones huérfanas del importador y apaga sus circuitos huérfanos (si no, sólo se
  informan).
- `cursor`: el `siguiente` de la respuesta anterior.
- `limite`: borradores por tramo, 50 por defecto y 100 como mucho.
- `muestra`: cuántas operaciones enseñar, 25 por defecto y 500 como mucho. Van primero las que escriben u omiten y
  después las `igual`.

**Simulación** (por defecto). Sólo `SELECT` en la D1 y sólo `get`/`list` en el KV, también con `pisar` y `archivar`: lo
que se simula con unas opciones es lo que se aplica con ellas. Por ejemplo:

```json
{
  "ok": true, "modo": "simulacion", "opciones": { "pisar": false, "archivar": false }, "version": 5,
  "tramo": { "vivas": "leidas", "borradores": 2, "continuacion": false },
  "resumen": { "escrituras": 1, "omitidas": 1, "huerfanos": 0,
    "circuito": { "crear": 0, "actualizar": 0, "archivar": 0, "igual": 1, "omitir": 0 },
    "playlist": { "crear": 0, "actualizar": 1, "archivar": 0, "igual": 1, "omitir": 0 },
    "asignacion": { "crear": 0, "actualizar": 0, "archivar": 0, "igual": 2, "omitir": 0 } },
  "muestra": [{ "entidad": "playlist", "id": "defecto-alcampo-alcala", "ref": "kv:default:alcampo-alcala",
    "accion": "actualizar", "motivo": "contenido_cambiado", "rev": 1, "cambios": ["items", "duracion_s"] }],
  "omitidas": [{ "ref": "kv:default:alcampo-parla", "motivo": "sintetico", "clave": "admira-tv:playlist:default:v1:alcampo-parla" }],
  "huerfanos": [], "huerfanos_borradores": "comprobados", "completo": true, "siguiente": null
}
```

- `tramo.vivas` vale `leidas`, `sin_documento` (no hay clave: ni vivas ni circuitos), `ilegible` (no se importan ni se
  buscan sus huérfanos) o `fuera_del_tramo` (de continuación).
- `huerfanos_borradores` vale `comprobados`, `en_el_ultimo_tramo` o `sin_comprobar` (más de 20.000 claves).
- `espejo` (desde E7, en simulación y al aplicar): la bandera de la doble escritura y sus marcas de los últimos 7 días,
  `{bandera, dias, fallidos, omitidos, editado_fuera, motivos: {fallido: {…}, omitido: {…}}, ultima}`, o `null` si no se
  pudieron leer. Ver «Doble escritura (E7)».

**Aplicar** (`?aplicar=1`). Ejecuta el plan con `guardarPlaylist`, `guardarAsignacion` y `guardarCircuito` de
`almacen.js`. Cada escritura es su propio `db.batch`, con revisión, auditoría y `meta.version + 1`. El actor es
`importador:<email>` y el motivo, `importador E5 · <ref>` (al archivar, `… · archivada: <motivo>`). Las playlists se
escriben antes que sus asignaciones, y lo que se archiva va al final. La respuesta es la de la simulación más:

- `version_antes` y `version`;
- `aplicadas: {crear, actualizar, archivar}`;
- `fallidas: [{entidad, id, ref, accion, status, error}]`. Por ejemplo, un 409 si alguien escribió entretanto: basta con
  repetir. Con alguna fallida, `ok: false`, pero el estado sigue siendo 200;
- `pendientes`;
- en la `muestra`, cada operación con su `resultado: {status, rev}`.

**Tramos y topes.** Están pensados para no pasar de los límites de una invocación de Workers.

- **El primer tramo** lleva el documento de vivas (circuitos y vivas) y la primera página de borradores. Los siguientes,
  una página cada uno (`KV.list` con cursor).
- **Cada petición escribe como mucho 50 entidades.** Si su plan tiene más, `pendientes` > 0 y `siguiente` repite **el
  mismo tramo**: el plan se rehace, lo ya escrito sale `igual` y sigue lo que faltaba.
- **Se repite** con `cursor=<siguiente>` hasta `completo: true`.

**Errores.**

| Estado | Cuándo |
|---|---|
| 401 `unauthorized` | Sin sesión (ni una clave de servicio válida). |
| 403 `forbidden` | Sesión sin el permiso. |
| 403 `solo_lectura` | El visor. |
| 403 `importador_solo_sesion` | Sólo la clave de servicio de Pixeria: no abre el importador. |
| 503 `programacion_db_no_configurada` / `programacion_db_sin_esquema` | Como en E3 y E4, después del acceso. |
| 503 `kv_no_disponible` / `kv_lectura_fallida` | Sin `ACCESS` con `get` y `list`, o falló su lectura. |
| 503 `programacion_lectura_fallida` / `programacion_escritura_fallida` | Falló la D1. Si fue al escribir, la respuesta dice qué se aplicó; repetir es seguro. |
| 400 `cursor_invalido` | Un `cursor` que no salió de esta ruta. |
| 405 | Cualquier método que no sea POST (`Allow: POST`). |

## Doble escritura (E7)

Hasta el corte (E13), lo que se guarda en el KV por `POST /api/playlist` se escribe también en la D1. Lo hace
`functions/api/_programacion/espejo.js`, con **una sola llamada** en cada manejador de escritura de `playlist.js`
(`espejar(…)`, justo después de guardar en el KV y antes de devolver la respuesta). La lectura del player (`GET`) no se
toca. Va detrás de la bandera **`meta.banderas.espejo`, apagada por defecto**.

### Qué se refleja

Todas las escrituras de hoy que cambian lo que emite una pantalla pasan por `POST /api/playlist`:

| Escritura del legado | Quién la hace | En la D1 |
|---|---|---|
| Borrador «Por defecto» con piezas (`{screen, items, rev}`) | `/parrilla/` en modo «Por defecto» (`runPush`) y «aplicar a dispositivos»; Pixeria (`stock.html`, `players-programar`) con la clave del Stock | Playlist `defecto-<pantalla>` + su asignación directa, como el importador. |
| Borrador vaciado (`items: []`; no hay borrado de borradores) | Las mismas | Se **archiva** la asignación (nunca se borra), como `?archivar=1`. La playlist se queda. Si se vuelve a llenar, se reactiva. |
| `live-save` (crear, cambiar, apagar una viva) | `/parrilla/` (playlists vivas) | El documento de vivas **entero**: `viva-<id>` + su asignación, con el peso N, N−1, … del importador (añadir una viva cambia el peso de las demás); las apagadas, `pausada`. |
| `live-delete` | `/parrilla/` | Lo mismo, y la asignación de la viva que ya no está se **archiva**. |
| `circuit-save` | `/parrilla/` (circuitos definidos) | El circuito, con las reglas del importador: `destino_excede_limite` se omite, no se recorta. |
| `circuit-delete` | `/parrilla/` | El circuito que ya no está se **apaga** (`activo: false`), nunca se borra (desviación 41). |

No se reflejan, porque no son playlists ni asignaciones o no viven en este KV:

- los borradores **sintéticos**: no son datos guardados (los compone el `GET` en cada consulta). El espejo los descarta antes
  de tocar la D1;
- `identity-sync` (el registro de identidad de las pantallas), el censo de etiquetas y el índice de Xpacios: el motor nuevo
  los lee del mismo KV, con `enrichFacts`;
- la parrilla de venta (`/grid/draft`, `/grid/book`, `/grid/unbook` en api.admira.store) y `/playlists/` (`xpl.admira.store`):
  viven fuera de este KV; la parrilla sigue siendo una capa aparte que el motor lee (decisión 1).

### Cómo escribe

- **La misma traducción que el importador.** `traducir()` + `planificar()` de `importador.js` (con `legado.js` debajo), con
  `archivar` y sin `pisar`, sobre lo que se acaba de guardar en el KV. Lo escrito es, columna a columna, lo que escribiría
  una importación completa del mismo KV: después, la simulación del importador sale toda `igual`.
- **Lectura acotada.** `leerParaEspejo` de `almacen.js` lee sólo la asignación y la playlist de esa pantalla o, para el
  documento de vivas, las asignaciones `kv:viva:…`, sus playlists y los circuitos; en la misma ida, la fila de `meta`.
- **Actor `importador:espejo:<email o servicio>`.** El importador sigue tomando esas filas por suyas (desviación 33). Con la
  sesión del portal es el email; con la clave del Stock, `importador:espejo:pixeria-stock`. Quién guardó en el KV, con su
  origen completo, va en el motivo: `espejo E7 · <ref> · <borrador|live-save|…> · por <quien>` (al archivar,
  `… · archivada: <motivo>`; al apagar un circuito, `… · apagado: circuito_eliminado`).
- **Hora del legado.** Se escribe con `ahora` = el `updatedAt` del KV, así que `actualizado_en` en la D1 es el de la
  escritura del legado.
- **Escrituras fuera de orden.** Si la fila de la D1 es más nueva que la escritura que se refleja (otro espejo o el
  importador ya escribieron algo posterior), no se pisa: `espejo_omitido` · `obsoleto`. Un 409 (otro escribió entretanto)
  se reintenta releyendo, hasta 3 veces; lo ya escrito sale `igual`.

### `waitUntil`, no en línea

El espejo corre en `waitUntil`, después de que el manejador tenga su respuesta. Se eligió así porque:

- la respuesta del legado es **la misma**: ni un campo ni una cabecera de más (las pruebas comparan el texto y las cabeceras
  con y sin D1);
- la latencia **no cambia**: el manejador no espera a la D1. En línea, hasta con un plazo corto, cada guardado pagaría al
  menos una ida a la D1 (está en WEUR; desde colos lejanos son decenas de ms), también con la bandera apagada, y un plazo
  que corta a mitad deja la D1 a medias igualmente;
- `espejar()` no lanza nunca: sólo mira si hay binding; el trabajo empieza en una microtarea.

El precio: quien guarda no se entera de un fallo del espejo, y si la instancia se recicla antes de terminar (`waitUntil`
da 30 s; el espejo se corta a los 15 s), lo pendiente se pierde. Por eso cada fallo deja una marca y la reconciliación es
el importador.

### Conflictos: lo editado fuera no se pisa

Como el importador sin `?pisar=1` (decisión de Carlos):

- lo que salió del legado y alguien editó después por la API de E4 (`actualizado_por` que no es `importador:…`) **no se
  escribe**: esa entidad se queda como la dejó la persona y queda `espejo_omitido` · `editado_fuera` en la auditoría, con
  `actualizado_por`. El resto de la escritura sí se refleja (por ejemplo, la asignación de una playlist retocada);
- lo ajeno tampoco: `id_ocupado`, `playlist_omitida` y `ajena`, con su marca;
- lo que la traducción no admite (`invalido`, `destino_excede_limite`, `ref_duplicada`, `id_duplicado`) también deja marca.

Las omisiones se marcan sólo para lo que tocó esa escritura: una viva retocada no se vuelve a marcar en cada guardado de
otra, salvo que su traducción cambie (por ejemplo, su peso).

### Fallos y reconciliación

- Un fallo de la D1 (una excepción, un rechazo o los 15 s del plazo) **no cambia la respuesta del legado**, va al log
  (`programacion: espejo …`) y deja `espejo_fallido` en la auditoría, con `motivo` (`fallo_d1`, `tiempo_agotado`,
  `conflicto` tras los reintentos o `rechazada`), la `ref` del KV, el origen y quién guardó.
- Las marcas **no son escrituras del modelo**: no suben `meta.version` (no invalidan la memoria de lectura de E3) y llevan la
  versión del momento. `entidad`/`entidad_id` son los de la entidad afectada (`asignacion`/`defecto-<pantalla>` para un
  borrador) o `meta`/`espejo` si falló el documento de vivas entero. Se consultan con
  `GET /api/programacion/auditoria?accion=espejo_fallido` (o `espejo_omitido`).
- Si la D1 no acepta ni la marca, sólo queda el log: el espejo nunca escribe en el KV. La simulación del importador lo
  detecta igual.
- La simulación del importador (`POST /api/programacion/importar` sin `aplicar`) cuenta las marcas de los últimos 7 días en
  `espejo`: `fallidos`, `omitidos`, `editado_fuera` y el desglose por motivo.

### La bandera

- `meta.banderas.espejo`: `true` (también vale `1`, `"on"`, `"encendido"`…) la enciende; si falta, está apagada. Se lee con
  `bandera()` de `almacen.js`, que tolera que el campo no exista. **La enciende Carlos** (ver «Activar la doble escritura»).
- **E6 expone las banderas en `/api/programacion/banderas`: ese endpoint tiene que aceptar `espejo` (booleano).**
  `fijarBanderas` ya lo admite (clave `[a-z_]`, valor booleano).
- **Memoria por instancia: 30 s, y por `meta.version`.** Con la bandera apagada y la memoria caliente, el espejo no toca la
  D1; en frío, lee sólo la fila de `meta` (en `waitUntil`, así que tampoco cuesta al legado). Con la bandera encendida no hay
  lectura de más: la de los datos trae `meta` y vuelve a mirar la bandera, así que **apagarla es inmediato**. Encenderla
  tarda hasta 30 s en llegar a cada instancia: lo guardado en ese rato lo recoge la importación del procedimiento de abajo.

## Paridad con hoy

`functions/api/_programacion/legado.js` traduce el legado del KV al modelo:

- **Borrador «Por defecto».** Se convierte en una playlist fija con una asignación directa, `por_defecto` · `sustituye`.
  Los borradores vacíos no se traducen.
- **Vivas.** Cada una se convierte en una playlist viva con una asignación `por_defecto` · `fusiona`. Llevan `peso` N, N−1, …
  para que el orden K conserve el del documento.
- **Circuitos.** Pasan tal cual. Para guardarlos en la D1, el importador usa `circuitoDesdeLegado` (desviación 32).

Las pruebas comparan el resolver con una copia fiel de lo que compone hoy `onRequestGet` de `playlist.js` y con lo que
`canal.html` pega detrás:

- lo puesto a mano gana a las vivas;
- las vivas se funden en el mismo orden y con el mismo tope de 200;
- el hashtag se añade detrás.

Cambios **intencionados** respecto a hoy:

- los spots de la parrilla ya **no borran** el «Por defecto»: se intercalan;
- el mando caduca;
- una viva cuyo destino sólo nombra pantallas pasa a ser directa y gana a las vivas de grupo, según la decisión 3.

## Desviaciones del diseño

1. **`hintFacts` y `enrichFacts` no se reutilizan dentro del resolver.** `enrichFacts` hace red y el resolver es puro. Por
   eso el resolver recibe `facts` ya completados y él mismo aplica `deduceScreenTags` + `applyCircuits`. **E3** exporta
   las dos funciones de `playlist.js` y las usa `/api/programacion`, que es quien llama al resolver.
2. **Columna `escritura` (ficha de escritura).** Está en `playlist`, `asignacion` y `circuito`. Hace falta porque en D1 un
   batch no se detiene cuando un UPDATE devuelve `changes = 0`: sin la ficha, la revisión, la auditoría y la versión se
   escribirían igualmente en un 409.
3. **`meta` es una sola fila con columnas.** No es una tabla clave/valor, así que `version = version + 1` es atómico.
4. **Ficheros de más.**
   - `modelo.js`: vocabulario, validación y orden K, compartidos por el resolver y el almacén.
   - `legado.js`: el puente KV → modelo para la paridad y, más adelante, para el importador y el modo sombra.
   - `_d1-memoria.mjs`: una D1 de pruebas sobre `node:sqlite`, con batch transaccional.
5. **Caída de base vacía.** Una base que no tiene piezas cede a la siguiente, en lugar de dejar la pantalla en negro. Lo
   mismo vale para la emergencia.
6. **La base exacta no lleva añadidos ni spots.** Las bases exactas son el rundown 50/50, la emergencia y las playlists con
   `opciones.exacta`. Los slots de la franja que quedan fuera del rundown aparecen en `fuentes` como omitidos.
   **Pendiente de confirmar con Carlos** si algún pagado suelto debería intercalarse aun así.
7. **Sin base pero con añadidos.** Por ejemplo, sólo hay hashtag: salen los añadidos y la capa es la del añadido
   (`por_defecto`), igual que el «Dirigido por hashtag» de hoy. Sin base ni añadidos, `items = []`, como dice el paso 9.
8. **Bajo un mando por hashtag o directo, lo pagado se convierte en spot sea cual sea su mezcla.** Por ejemplo, una toma
   pagada que sustituye.
9. **Intercalado.** Los spots que no caben en la vuelta se ponen al final, así que todo spot sale al menos una vez por
   vuelta. Hoy sólo pasaba cuando la base era más corta que la cadencia.
10. **`candidatas()` mira también las 2 h anteriores.** Así el resolver ve el borde de franja que caduca un mando en vivo.
11. **`validoHasta` no tiene en cuenta la vigencia de cada pieza del Stock** (`catalogo.desde/hasta`). Las reglas se
    resuelven de nuevo en cada consulta.
12. **Sin claves foráneas declaradas.** La integridad la dan las guardas en SQL, que permiten devolver un error claro: 409 o
    422.
13. **Mezcla por defecto de una asignación.** Si es directa, `sustituye`; si es de grupo, `fusiona`.
14. **El rundown de la parrilla cuenta como directo**, porque `/grid/day` es por pantalla.

Desviaciones añadidas en E3:

15. **La parrilla se lee de tres días.** `/api/emision` sólo lee el día de `at`; `/api/programacion` lee también la víspera
    y el siguiente, y el resolver acepta una lista de días.
    - Sin la víspera, la franja nocturna de ayer (por ejemplo, 22:00–02:00) no contaría de madrugada.
    - Sin el siguiente, `validoHasta` saltaría a +48 h tras la última franja del día.
    - Cada franja se ancla a la fecha de su día y lleva su propia duración editorial (`slotSeconds`).
    - **Diferencia con `canal.html` y el worker:** `gridBandIsNow()` mira sólo los minutos, así que a las 00:30 toma la
      franja 22:00–02:00 del documento de HOY. El motor nuevo toma la de AYER, que es la que empezó (la misma regla que en
      las franjas de una asignación). E6 (sombra) lo marcará como discrepancia si la víspera y el día no venden lo mismo.
16. **Los circuitos salen sólo de la D1** (tabla `circuito`). Los del KV (`admira-tv:playlist:live:v1`) llegan con el
    importador (E5): hasta la primera importación, un destino `circuito:<circuito definido>` no casa en el motor nuevo.
17. **Stock: `stock/index.json`** (`loadStock`), el índice que usan las vivas y `resolveContent`, y no `/stock/list`, que es
    el que leen `canal.html` y `/api/emision` para su réplica.
18. **Además de `hintFacts` y `enrichFacts`, se exporta `loadStock`**, para no duplicar la lectura del Stock ni su memoria.
    No cambia el comportamiento de `playlist.js`.
19. **`tag` sólo simula el mando por hashtag.** Ni `#ID` ni directo: el mando persistido llega en E8.
20. **El acceso es el de `/api/emision`, con sesión.** El player (`canal.html`) no tiene sesión, así que E9 necesitará otra
    puerta. **Pendiente de decidir con Carlos:** una lectura pública por pantalla, como la de `/api/playlist`, o una clave
    de player.
21. **Errores 503 de más:** `programacion_db_sin_esquema` (la D1 existe sin la migración) y `programacion_lectura_fallida`.

Desviaciones añadidas en E4:

22. **La clave de Pixeria es un secreto de Pages (`PROGRAMACION_SERVICE_KEY`), no la tabla `clave_servicio`.** Es una
    sola clave, con permiso de escritura sobre las tres entidades, sin ámbitos por proyecto. La tabla (hash y `ambitos`)
    queda para cuando haya más de un cliente de servicio o haga falta acotar por proyecto.
23. **La clave de servicio sólo abre escrituras.** Para leer hace falta sesión. Pixeria conoce la `rev` por la respuesta
    de su propia escritura y, si se le adelanta alguien, por el `actual` del 409.
24. **El visor lee las entidades, pero no ve los actores.** Igual que en `/api/emision` y E3, la sesión de lectura viva
    lee playlists, asignaciones y circuitos, aunque sin `creado_por` ni `actualizado_por`. Historial y auditoría le dan
    403 `solo_lectura`, porque llevan los emails de quien escribió. No escribe.
25. **La validación es 422, no 400.** El almacén sigue devolviendo 400; la ruta lo traduce y añade `campo` y `mensaje`.
26. **Sin `rev`, 428 `rev_requerida`** en PUT, PATCH y DELETE (el almacén ya lo hacía en el borrado).
27. **PATCH es una fusión superficial** sobre la fila actual. Una mezcla que se puso por defecto queda guardada como dicha:
    si un PATCH cambia el destino de directa a grupo, la mezcla sigue siendo `sustituye` hasta que se cambie o se mande
    `mezcla: null`.
28. **`slugId` quita el guion final que deja el recorte a 60 (arreglado en E4).** Recortaba después de quitar los guiones
    de los bordes, así que un nombre largo podía dar un id acabado en «-» que `slugId` ya no reproducía al actualizar: esa
    fila no se podía guardar otra vez con `guardar*`. Ahora `slugId(slugId(x)) === slugId(x)`, en `modelo.js`, y vale
    igual para la API, el almacén y el importador de E5. Sólo cambian los ids que antes acababan en «-»; como la D1
    todavía no existe, no hay filas que migrar.
29. **Los circuitos no tienen historial de revisiones** (no hay tabla en `0001.sql`). `historial/circuito/<id>` devuelve
    `revisiones: []`, la fila actual y una `nota` que remite a la auditoría. Las auditorías de escritura de un circuito
    sólo guardan nombre y motivo; la de su borrado, la copia completa.

Desviaciones añadidas en E5:

30. **El importador va dentro del router de E4, no en una ruta hermana.** Un `functions/api/programacion/importar.js`
    nunca recibiría nada: el router de Pages prueba antes las rutas con más tramos y `/:recurso/:resto*` casa también con
    `/api/programacion/importar`. Comprobado en el bundle de `wrangler pages functions build`.
31. **Sólo `asignacion` tiene `ref_externa`.**
    - La playlist se identifica por el id de la traducción (`defecto-<pantalla>`, `viva-<id>`) y se da por propia si su
      origen empieza por `legado:`.
    - El circuito se identifica por su id y se da por propio si lo creó el importador (`creado_por` = `importador:…`).
    - La asignación se identifica por su `ref_externa` y se da por propia si además la creó el importador. Otra con la
      misma ref (puesta a mano por la API) es `id_ocupado` y no se toca ni con `pisar`.
    - `kv:circuito:<id>` sólo existe en el plan y en los huérfanos.
32. **Los circuitos largos no pierden pantallas.** `/parrilla/` guarda el destino entero en `target.all` (hasta 200),
    pero el modelo acota `all` a 48.
    - Con `any` vacío, la faceta más larga pasa a `any`, que significa lo mismo (`circuitoDesdeLegado` de `legado.js`).
    - Si ni así cabe, el circuito se omite con `destino_excede_limite`; no se recorta.
33. **Lo importado que se edite fuera del importador no se pisa por defecto** (decisión de Carlos). Sale `omitir` ·
    `editado_fuera` con `actualizado_por`; con `?pisar=1` se actualiza con lo del KV y el aviso `pisa`. «Editado fuera»
    es que el último `actualizado_por` no sea `importador:…`. Ojo con E7: si la doble escritura escribe en la D1 con el
    email de quien guarda en el KV, el importador verá esas filas como editadas fuera (y, si las crea, como ajenas).
34. **Los huérfanos se informan; sólo con `?archivar=1` se archivan sus asignaciones** (decisión de Carlos). Nunca se
    borra nada. Sin archivar, un borrador que se vacía deja activa su asignación en la D1 y el motor nuevo seguiría
    sirviendo la lista vieja a esa pantalla. Se archivan sólo las del importador y no editadas fuera (salvo `pisar`); las
    playlists huérfanas sólo se informan, los circuitos huérfanos se apagan (desde E7, ver la 41) y `sintetico` no se
    archiva (ver la 35).
35. **Un borrador guardado con `synthetic: true` no se importa**, como pide el plan. Hoy `playlist.js` sólo mira `items`
    y lo emitiría como lista a mano, pero ningún código guarda esa marca (POST `/api/playlist` no la escribe): es una
    guarda, y si apareciera uno, la sombra (E6) lo marcaría. Por lo mismo, su asignación importada antes (si la hubiera)
    no se archiva con `?archivar=1`: sólo se informa.
36. **La pantalla sale de la clave del KV**, no del `screen` del valor, porque es la clave lo que lee `playlist.js`.
    - Dos claves que dan el mismo slug (`a--b` y `a-b`) no se importan dos veces: la segunda sale `ref_duplicada`.
    - Dos ids que el recorte a 60 dejaba iguales ya no chocan: llevan huella (desviación 48). `id_duplicado` queda para
      el caso, improbable, de que dos huellas de 8 hexadecimales coincidan.
37. **El peso de las vivas depende de su posición en el documento.** Añadir, quitar o reordenar una viva cambia el peso
    de las demás, y sus asignaciones se actualizan (una revisión cada una). Es lo que conserva el orden K de hoy.
38. **La clave de servicio no abre el importador** y recibe 403 `importador_solo_sesion` (no 401): se la reconoce, pero
    importar es cosa de una persona con sesión.

Desviaciones añadidas en E7:

39. **El espejo corre en `waitUntil`, no en línea** (ver «`waitUntil`, no en línea»). Quien guarda no se entera de un fallo
    del espejo: lo dicen la auditoría (`espejo_fallido`), el log y la simulación del importador.
40. **El espejo archiva siempre y nunca pisa**: es el importador con `archivar` y sin `pisar`. Como refleja el documento de
    vivas entero, la primera escritura de vivas con la bandera encendida archiva también las asignaciones de vivas borradas
    antes (con la bandera apagada), igual que `?archivar=1`. Los borradores, en cambio, sólo se reflejan de uno en uno.
41. **Un circuito borrado se apaga (`activo: false`)**, en el espejo y en el importador con `?archivar=1` (decisión de
    Carlos, 9-oct-2026; en E5 sólo se informaba como `circuito_eliminado`). Sin eso, el motor nuevo seguiría dando
    `circuito:<id>` a pantallas que hoy ya no lo tienen y las vivas que lo usan llegarían a donde hoy no llegan. Nunca se
    borra; si el circuito vuelve al KV, el importador o el espejo lo reactivan (es suyo). Sólo los que creó el
    importador, y lo editado fuera no se apaga salvo con `?pisar=1`. La regla vive en `planificar()`, así que el espejo y
    el importador no pueden discrepar.
42. **`actualizado_en` de lo reflejado es la hora del KV** (`updatedAt`), no la del espejo, y lo más nuevo no se pisa
    (`obsoleto`). El importador sigue escribiendo con su propia hora.
43. **Marcas en la auditoría sin subir la versión** (`espejo_fallido`, `espejo_omitido`): la columna `accion` no tiene
    `CHECK`, así que no hace falta migración (el comentario de `0001.sql` sólo lista las cuatro de E1).
44. **Las omisiones se marcan sólo para lo que tocó la escritura**, para no repetir la misma marca en cada guardado.
45. **La bandera se recuerda 30 s por instancia.** «Bandera apagada = sin D1» vale con la memoria caliente; en frío hay una
    lectura de la fila de `meta`, en `waitUntil`.
46. **Si la D1 no acepta ni la marca, sólo queda el log.** El espejo no escribe marcas en el KV.
47. **Las cuentas del espejo salen en la simulación del importador, que es `POST`** (`POST /api/programacion/importar`
    sin `aplicar`): no hay un `GET` del importador (sigue siendo 405).
48. **Ids estables para las fuentes largas** (decisión de Carlos, 9-oct-2026). Un id tiene 60 caracteres como mucho y
    `defecto-<pantalla>` no cabe con pantallas de más de 52 (`cleanScreen` admite 80), ni `viva-<id>` con vivas de más de
    55. El recorte daba el mismo id a dos fuentes con el mismo principio, y la segunda pisaba o se omitía.
    - `idLegado()` de `legado.js` (con `idDefecto` e `idViva`) es la única fuente de esos ids, para el importador, el
      espejo y la paridad: si el id entero cabe, es el de siempre (`slugId`); si no, se recorta a 51 y se le añade `-` y
      8 hexadecimales del SHA-256 del id entero (`huella.js`, síncrono, comprobado contra `node:crypto`). Es el mismo en
      cada pasada y en cualquier máquina, y `slugId` lo deja igual, así que `guardar*` no lo toca.
    - **Los ids que caben no cambian**: toda pantalla de hasta 52 caracteres y toda viva de hasta 55 dan el id de antes,
      por construcción (`idLegado` devuelve entonces `slugId`), y las pruebas lo comparan con la fórmula de antes en
      cientos de casos. Las 34 importadas el 9-oct-2026 sólo cambian si alguna pasa de esas longitudes.
    - La `ref_externa` de un borrador lleva la pantalla entera (`slugEntero`, el `slugId` sin el recorte; si cabe en 60,
      es el mismo): con más de 60, la recortada también coincidía. La lista de pantallas con clave de los huérfanos usa
      la misma forma.
    - Si alguna pantalla de producción tuviera más de 52 caracteres, su id cambiaría: el importador crearía la playlist
      nueva, la asignación (encontrada por su ref) pasaría a apuntarla y la vieja saldría en `huerfanos`.
    - **No cambia el destino**: sigue siendo la etiqueta de pantalla de hoy (`screenTag`, que recorta a 60). Dos
      pantallas de más de 60 caracteres con el mismo principio ya comparten hoy la etiqueta `pantalla:…` en el legado; eso
      queda como está.

## Plan de entregas

| Entrega | Contenido | Estado |
|---|---|---|
| **E0** | Diseño y las tres decisiones de Carlos. | Hecha (8-oct-2026) |
| **E1** | D1: esquema `0001.sql`, almacén con bloqueo optimista, revisiones, poda, auditoría y versión, probado con una D1 simulada. Binding preparado y comentado. | **Hecha** |
| **E2** | `horario.js` y `resolver.js` puros, más las pruebas de horario, de resolver (con paridad) y de almacén. | **Hecha** |
| **E3** | Exportar `hintFacts`/`enrichFacts` (y `loadStock`). `GET /api/programacion?screen=` sirve el resolver con `/grid/day` y el Stock leídos y memoria por `meta.version`. Sin consumidores. Crear la D1 real. | **Hecha**, salvo «Crear la D1 real», que lanza Carlos (ver «Activar la D1»). Hasta entonces la ruta responde 503 `programacion_db_no_configurada`. |
| **E4** | API de escritura de playlists, asignaciones y circuitos con sesión y permiso `digitalsignage-player`, 409 por `rev`, historial y auditoría consultables. Claves de servicio para Pixeria. | **Hecha**. La clave de servicio queda apagada hasta que Carlos ponga el secreto (ver «Activar la clave de servicio de Pixeria»); sin la D1, la API responde 503 `programacion_db_no_configurada`. |
| **E5** | Importador del legado: borradores, vivas y circuitos del KV a la D1 con `legado.js`, idempotente por `ref_externa`. | **Hecha**. `POST /api/programacion/importar` simula por defecto y escribe con `?aplicar=1`; `?pisar=1` y `?archivar=1` son opcionales. Sin la D1 responde 503 `programacion_db_no_configurada`; para usarlo, ver «Cómo importar». |
| E6 | Modo sombra: el resolver corre en paralelo a lo de hoy, se compara la firma con la decisión de `_emision.js` (la réplica de `canal.html`), se guarda en `sombra` y hay un panel de discrepancias. | Pendiente |
| E7 | Doble escritura: lo que hoy se guarda en el KV desde la parrilla y desde playlists se escribe también en la D1 hasta el corte. | **Hecha**, detrás de la bandera `espejo` (apagada). La enciende Carlos: ver «Activar la doble escritura (E7)». El endpoint de banderas de E6 tiene que aceptar `espejo`. |
| E8 | Mando en vivo persistido, con caducidad de 2 h o al borde de franja; `mando.html` lo usa. | Pendiente |
| E9 | Player: `canal.html` consume `items`, `spots`, `cadencia` y `exacta`, vuelve a preguntar en `validoHasta` y precarga `siguiente`. Detrás de bandera. | Pendiente |
| E10 | Editor de playlists fijas, vivas y mixtas con huecos (`/playlists/` y `/parrilla/`). | Pendiente |
| E11 | Editor de programación: calendario, franjas, recurrencias, excepciones y la vista «qué sale cuándo» (`expandir`). | Pendiente |
| E12 | Emergencias: botón con confirmación, auditoría y prueba en la flota. | Pendiente |
| E13 | Corte: `motor = encendido` por circuito y el KV en solo lectura. | Pendiente |
| E14 | Retirada del legado (KV y réplicas) y limpieza. | Pendiente |

> Las entregas E3 a E14 se han reconstruido a partir del resumen del diseño. Si el mensaje de diseño original las ordena de
> otra forma, manda el original.

## Activar la D1 (hecho el 9-oct-2026)

Carlos creó `admira-programacion` (región WEUR, id `13926d62-95aa-4276-84ef-13ffddf884d2`), el bloque de `wrangler.toml`
está descomentado y `0001.sql` aplicado en remoto: 12 tablas, `meta.version = 0`, motor apagado y sombra desactivada.
Los pasos de abajo quedan como referencia para recrearla.

1. Crear la base y copiar el `database_id` que devuelve:

   ```bash
   npx wrangler d1 create admira-programacion
   ```

2. Pegar ese id en el bloque comentado de `wrangler.toml` y descomentar sus cinco líneas.
3. Aplicar la migración:

   ```bash
   npx wrangler d1 migrations apply admira-programacion --remote
   ```

   Como alternativa, sin tocar `wrangler.toml`, se puede usar
   `npx wrangler d1 execute admira-programacion --remote --file=migrations/programacion/0001.sql`. Es idempotente, pero
   así la migración no queda registrada en `d1_migrations`.

4. Tras desplegar, comprobar con sesión que `GET /api/programacion?screen=<una pantalla>` ya no da 503 y responde
   `version: 0` y `motor: "apagado"`. Con la D1 vacía sólo salen la parrilla y lo dirigido por hashtag; si no hay nada,
   la capa es `relleno`.

## Cómo importar (cuando exista la D1)

Con la D1 creada y migrada (ver «Activar la D1») y una sesión del portal con `digitalsignage-player`. Desde el navegador
con la sesión abierta en admira.tv, en la consola de DevTools:

```js
const importar = q => fetch("/api/programacion/importar" + (q ? "?" + q : ""), { method: "POST", credentials: "same-origin" }).then(r => r.json());
```

1. **Simular primero.** Recorrer todos los tramos sin escribir, con la muestra entera:

   ```js
   let r = await importar("muestra=500"), tramos = [r];
   while (r.siguiente) tramos.push(r = await importar("muestra=500&cursor=" + encodeURIComponent(r.siguiente)));
   tramos
   ```

2. **Revisar**, tramo a tramo:
   - `resumen`: cuántas operaciones son `crear`, `actualizar`, `igual` y `omitir` por entidad;
   - `omitidas`: lo sintético y lo vacío es lo esperado; `invalido`, `destino_excede_limite`, `ref_duplicada` o
     `id_duplicado` hay que mirarlo;
   - `muestra`: cualquier `omitir` · `id_ocupado` (algo ajeno ocupa el id) y cualquier `omitir` · `editado_fuera` (lo
     importado que alguien retocó por la API: no se pisa salvo con `pisar=1`);
   - `huerfanos`: lo que ya no está en el KV. No se borran nunca; se pueden archivar en el paso 4.
3. **Aplicar**, también tramo a tramo:

   ```js
   let a = await importar("aplicar=1"), hechos = [a];
   while (a.siguiente) hechos.push(a = await importar("aplicar=1&cursor=" + encodeURIComponent(a.siguiente)));
   hechos.map(h => [h.ok, h.aplicadas, h.fallidas.length, h.pendientes])
   ```

   Si hay `fallidas` (por ejemplo, un 409 porque alguien escribió entretanto), repetir el paso 3: es idempotente. Para
   pisar lo editado fuera, repetir los pasos 1 a 3 añadiendo `pisar=1` a cada llamada, sólo después de revisar qué se
   va a pisar (`pisa` en la muestra).
4. **Archivar huérfanos (opcional).** Simular con `archivar=1` (y, si se quiere, `pisar=1`) como en el paso 1, revisar
   las operaciones `archivar` y las `omitir` · `ajena` o `editado_fuera`, y aplicar con `aplicar=1&archivar=1` como en el
   paso 3. Las asignaciones quedan `archivada` y los circuitos, apagados; no se borran, y si su fuente vuelve al KV, la
   importación siguiente los reactiva.
5. **Comprobar.**
   - Otra simulación (paso 1, con las mismas opciones) tiene que dar `resumen.escrituras = 0` en todos los tramos.
   - `GET /api/programacion?screen=<una pantalla con borrador>` tiene que servir las mismas piezas que `/api/playlist`.
   - `GET /api/programacion/auditoria?actor=importador:<email>` enseña lo escrito.

Hasta el corte (E13) el KV sigue mandando: después de cambiar el legado se puede volver a importar, y sólo se escribe lo
que cambió. Con la doble escritura de E7 encendida no hace falta: el importador queda para reconciliar (ver «Activar la
doble escritura (E7)»).

## Activar la doble escritura (E7) (lo lanza Carlos)

Con la D1 importada (ver «Cómo importar») y desplegada la rama de E7.

1. **Encender la bandera** `espejo` con el endpoint de banderas de E6 (`/api/programacion/banderas`, con `{"espejo": true}`).
   Mientras ese endpoint no esté, con SQL en la D1 remota, que deja la misma auditoría y sube la versión igual que
   `fijarBanderas`:

   ```bash
   npx wrangler d1 execute admira-programacion --remote --command "INSERT INTO auditoria (en, actor, accion, entidad, entidad_id, rev, version, detalle) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'csilvasantin@gmail.com', 'banderas', 'meta', 'banderas', NULL, version + 1, '{\"espejo\":true}' FROM meta WHERE id = 1; UPDATE meta SET banderas = json_set(banderas, '$.espejo', json('true')), version = version + 1, actualizado_en = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE id = 1;"
   ```

2. **Esperar un minuto** (la memoria de 30 s de cada instancia) y **cerrar el hueco**: simular y aplicar como en «Cómo
   importar», pasos 1 a 3, **con `archivar=1`** (es lo que hace el espejo), para recoger lo guardado mientras la bandera
   estaba apagada.
3. **Comprobar.**
   - Una simulación con `archivar=1` (todos los tramos) da `resumen.escrituras = 0` y `espejo.bandera: true`.
   - Guardar algo de prueba en `/parrilla/` (el «Por defecto» de una pantalla de pruebas) y ver en
     `GET /api/programacion/historial/playlist/defecto-<pantalla>` una revisión de `importador:espejo:<email>` con el motivo
     `espejo E7 · kv:default:<pantalla> · borrador · por <email>`.
   - Otra simulación con `archivar=1`: otra vez 0 escrituras.
4. **Apagar** es poner `espejo` a `false` (con el mismo endpoint o el mismo SQL con `json('false')`): es inmediato.

**Reconciliar** (cuando `espejo.fallidos` > 0 en la simulación, tras una caída de la D1 o ante cualquier duda):

1. Simular con `archivar=1` todos los tramos. Las `escrituras` son la deriva; sin `archivar=1` no se ve la de los
   borradores vaciados, las vivas borradas ni los circuitos borrados (sólo saldrían en `huerfanos`).
2. Si hay escrituras, aplicar con `aplicar=1&archivar=1` y volver a simular: 0 escrituras.
3. Lo `omitir` · `editado_fuera` no es deriva del espejo: es una edición por la API que no se pisa. Se decide entidad a
   entidad: deshacerla por la API o, después de revisar `pisa`, `pisar=1`.
4. Para el documento de vivas (vivas y circuitos) basta también con cualquier escritura nueva (guardar una viva o un
   circuito, aunque sea sin cambios): el espejo lo refleja entero, con `archivar`.

## Activar la clave de servicio de Pixeria (lo lanza Carlos)

Hasta entonces, la API sólo admite la sesión del portal.

1. Generar el valor y guardarlo en `admira-vault`. Usar una clave hexadecimal: una que empiece por `mbl_` la tomaría el
   guarda global de `functions/_middleware.js` por una clave de lectura y la enviaría a data.yokup.com para reconocerla.

   ```bash
   openssl rand -hex 32
   ```

2. Ponerla como secreto del proyecto de Pages (pide el valor por la entrada estándar, así que no queda en el historial):

   ```bash
   npx wrangler pages secret put PROGRAMACION_SERVICE_KEY --project-name admira-tv
   ```

3. Pixeria la manda en `X-Programacion-Key` desde su servidor, con `X-Actor` para distinguir el proceso (por ejemplo,
   `X-Actor: stock`, que queda como `servicio:stock`).
4. Para revocarla, `npx wrangler pages secret delete PROGRAMACION_SERVICE_KEY --project-name admira-tv`, o poner otra.

## Pruebas

```bash
node --test 'functions/api/_programacion/*.test.mjs'
```

Las pruebas del almacén y de la ruta usan `node:sqlite` (Node 22.13 o posterior). Sin él, se saltan en vez de fallar.

`programacion-api.test.mjs` prueba `GET /api/programacion` sobre la D1 simulada con la migración real, con el KV y la red
simulados:

- el 503 sin binding y sin esquema;
- el acceso de `/api/emision`;
- la playlist directa;
- que los grupos se sumen y que lo directo gane;
- `at`, `tag` y la identidad;
- la memoria por `meta.version`: acierto sin cambios y fallo tras una escritura;
- que no escribe nada: ni KV (tampoco el índice de Xpacios), ni D1 (sólo SELECT), ni nada que no sea GET.

`programacion-escritura.test.mjs` prueba la API de escritura (E4) sobre la misma D1 simulada:

- el 503 sin binding y sin esquema, y las rutas (404, 405 con `Allow`);
- el CRUD de playlists, asignaciones y circuitos, con `meta.version + 1` en cada escritura;
- el 409 por una `rev` vieja en PUT, PATCH y DELETE, sin revisión, auditoría ni versión;
- el 422 con el campo culpable, el 400 de un JSON roto y el 428 sin `rev`;
- el acceso: 401, 403, el visor (lee las entidades sin los actores, no escribe, y 403 en historial y auditoría) y el
  email de la sesión como actor;
- la clave de servicio: `Bearer` y `X-Programacion-Key`, el actor `servicio:…`, que no abre lecturas y que sin el
  secreto está apagada;
- el historial, la auditoría (filtros y páginas) y la copia final del borrado;
- que tras una escritura por la API, `GET /api/programacion` deja de acertar en su memoria y sirve lo nuevo.

`importador.test.mjs` prueba el importador (E5): el plan puro y `POST /api/programacion/importar` sobre la misma D1
simulada, con un KV simulado con `list` y `get`:

- el plan de una mezcla realista (borrador con piezas, sintético, vacío, vivas con destino y un circuito);
- los ids de las fuentes largas: la huella es el SHA-256 de `node:crypto`; los ids, refs e ids de vivas que caben son los
  de antes (cientos de pantallas y vivas con la forma de las de hoy) y `slugEntero` es `slugId` mientras cabe; dos
  pantallas de más de 52 caracteres (y dos de más de 60) y dos vivas largas con el mismo principio dan ids distintos y
  fijos, y el plan las importa todas;
- los circuitos largos (sin perder pantallas) y las filas ajenas (`id_ocupado`);
- que la simulación no escribe: sólo SELECT en la D1 y nada en el KV;
- aplicar, y que la segunda pasada sale toda `igual`;
- un cambio en el legado: `actualizar` con la `rev` buena, y el peso de las vivas reordenadas;
- lo editado por la API: `omitir` · `editado_fuera` por defecto, `?pisar=1` lo sobrescribe (con `pisa`), la simulación
  no escribe y la pasada siguiente sale toda igual;
- los huérfanos, que no se borran; con `?archivar=1` se archivan sólo las asignaciones del importador no editadas fuera
  (con `pisar`, también ésas; nunca las ajenas ni por `sintetico`) y se apagan sus circuitos (no los ajenos; los
  editados fuera, sólo con `pisar`), la simulación no escribe, la segunda pasada no escribe nada y una viva o un circuito
  que vuelven se reactivan;
- el acceso: 401, 403, el visor y la clave de servicio;
- los tramos con cursor y el tope de escrituras por petición;
- que, tras importar, `GET /api/programacion` sirve lo mismo que hoy `playlist.js` y que la paridad de `legado.js`.

`espejo.test.mjs` prueba la doble escritura (E7) con los manejadores de verdad de `POST /api/playlist`, sobre la misma D1
simulada y un KV simulado:

- **la prueba de identidad**: cada escritura del legado (borrador con sesión y con la clave del Stock, pantalla virtual,
  otra versión, vaciado y vuelta a llenar; `live-save` al crear, al añadir otra y al apagarla; `live-delete`;
  `circuit-save`, también uno que no cabe; `circuit-delete`) se refleja, y después la simulación del importador (con y sin
  `archivar=1`) sale toda `igual` y una importación nueva del mismo KV en una D1 vacía da, columna a columna, el mismo
  contenido; lo que la D1 del espejo tiene de más está archivado o apagado;
- con la bandera apagada, la respuesta es la misma (texto y cabeceras), no se escribe nada y, con la memoria caliente, no
  se ejecuta ni una sentencia en la D1; encenderla, apagarla (inmediato) y una bandera en texto;
- un fallo de la D1 no cambia la respuesta, deja `espejo_fallido` sin subir la versión y la simulación lo cuenta; el
  importador lo reconcilia. Una D1 caída o colgada no tumba nada (`tiempo_agotado`);
- lo editado fuera (`editado_fuera`, también al vaciar un borrador o borrar un circuito), lo ajeno (`id_ocupado`) y lo que
  llega tarde (`obsoleto`, y dos espejos a la vez en cualquier orden) no se pisan;
- los sintéticos, `identity-sync` y el `GET` no tocan la D1;
- la respuesta sale antes de que termine el espejo (con la D1 bloqueada, el manejador ya ha respondido);
- pantallas y vivas largas: el espejo da los mismos ids con huella que el importador, cada una con lo suyo, y vaciar
  una archiva sólo su asignación.

Las rutas se compilan con `npx wrangler@4.119.0 pages functions build --outdir /tmp/fx-e5`. En el bundle:

- `GET /api/programacion` sigue yendo a `programacion.js`;
- `/api/programacion/<algo>` va a la ruta de E4, también `POST /api/programacion/importar`.

Se ha comprobado repitiendo las peticiones contra el bundle.

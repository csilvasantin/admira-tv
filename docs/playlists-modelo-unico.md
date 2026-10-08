# Modelo único de playlists de admira.tv

Diseño aprobado por Carlos el 8-oct-2026. Este documento recoge el diseño, las tres decisiones de Carlos, lo que hacen las
entregas E1 a E4, en qué se aparta la implementación del diseño y el plan completo de entregas.

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
consume nadie**: los editores llegan en E10 y E11, y el importador (E5) escribe con `almacen.js` directamente.

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
| `GET /historial/<tipo>/<id>` | Las revisiones (50 como mucho, de la última a la primera, con `datos`, `autor`, `en` y `motivo`) y cómo está ahora (`actual`, `null` si se borró). | 200 `{ok, version, tipo, id, actual, revisiones}` · 404 si no hay ni fila ni revisiones |
| `GET /auditoria` | Las escrituras aceptadas, de la más reciente a la más antigua. Filtros: `entidad`, `id`, `actor`, `accion` (`crear`, `actualizar`, `borrar`, `banderas`). Paginada: `limite` (50 por defecto, 200 como mucho) y `antes=<siguiente>`. | 200 `{ok, version, entradas, siguiente}` · 400 `entidad_invalida` / `antes_invalido` |

En todas:

- 401 `unauthorized` sin sesión (ni clave, si es una escritura); 403 `forbidden` sin el permiso; 403 `solo_lectura` si
  escribe el visor.
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

## Paridad con hoy

`functions/api/_programacion/legado.js` traduce el legado del KV al modelo:

- **Borrador «Por defecto».** Se convierte en una playlist fija con una asignación directa, `por_defecto` · `sustituye`.
  Los borradores vacíos no se traducen.
- **Vivas.** Cada una se convierte en una playlist viva con una asignación `por_defecto` · `fusiona`. Llevan `peso` N, N−1, …
  para que el orden K conserve el del documento.
- **Circuitos.** Pasan tal cual.

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
16. **Los circuitos salen sólo de la D1** (tabla `circuito`). Los del KV (`admira-tv:playlist:live:v1`) llegarán con el
    importador (E5). Hasta entonces, un destino `circuito:<circuito definido>` no casa en el motor nuevo.
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
24. **El visor lee.** Igual que en `/api/emision` y E3, la sesión de lectura viva lee playlists, asignaciones, historial y
    auditoría (con los emails de los actores). No escribe.
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

## Plan de entregas

| Entrega | Contenido | Estado |
|---|---|---|
| **E0** | Diseño y las tres decisiones de Carlos. | Hecha (8-oct-2026) |
| **E1** | D1: esquema `0001.sql`, almacén con bloqueo optimista, revisiones, poda, auditoría y versión, probado con una D1 simulada. Binding preparado y comentado. | **Hecha** |
| **E2** | `horario.js` y `resolver.js` puros, más las pruebas de horario, de resolver (con paridad) y de almacén. | **Hecha** |
| **E3** | Exportar `hintFacts`/`enrichFacts` (y `loadStock`). `GET /api/programacion?screen=` sirve el resolver con `/grid/day` y el Stock leídos y memoria por `meta.version`. Sin consumidores. Crear la D1 real. | **Hecha**, salvo «Crear la D1 real», que lanza Carlos (ver «Activar la D1»). Hasta entonces la ruta responde 503 `programacion_db_no_configurada`. |
| **E4** | API de escritura de playlists, asignaciones y circuitos con sesión y permiso `digitalsignage-player`, 409 por `rev`, historial y auditoría consultables. Claves de servicio para Pixeria. | **Hecha**. La clave de servicio queda apagada hasta que Carlos ponga el secreto (ver «Activar la clave de servicio de Pixeria»); sin la D1, la API responde 503 `programacion_db_no_configurada`. |
| E5 | Importador del legado: borradores, vivas y circuitos del KV a la D1 con `legado.js`, idempotente por `ref_externa`. | Pendiente |
| E6 | Modo sombra: el resolver corre en paralelo a lo de hoy, se compara la firma con la decisión de `_emision.js` (la réplica de `canal.html`), se guarda en `sombra` y hay un panel de discrepancias. | Pendiente |
| E7 | Doble escritura: lo que hoy se guarda en el KV desde la parrilla y desde playlists se escribe también en la D1 hasta el corte. | Pendiente |
| E8 | Mando en vivo persistido, con caducidad de 2 h o al borde de franja; `mando.html` lo usa. | Pendiente |
| E9 | Player: `canal.html` consume `items`, `spots`, `cadencia` y `exacta`, vuelve a preguntar en `validoHasta` y precarga `siguiente`. Detrás de bandera. | Pendiente |
| E10 | Editor de playlists fijas, vivas y mixtas con huecos (`/playlists/` y `/parrilla/`). | Pendiente |
| E11 | Editor de programación: calendario, franjas, recurrencias, excepciones y la vista «qué sale cuándo» (`expandir`). | Pendiente |
| E12 | Emergencias: botón con confirmación, auditoría y prueba en la flota. | Pendiente |
| E13 | Corte: `motor = encendido` por circuito y el KV en solo lectura. | Pendiente |
| E14 | Retirada del legado (KV y réplicas) y limpieza. | Pendiente |

> Las entregas E3 a E14 se han reconstruido a partir del resumen del diseño. Si el mensaje de diseño original las ordena de
> otra forma, manda el original.

## Activar la D1 (lo lanza Carlos)

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
- el acceso: 401, 403, el visor (lee, no escribe) y el email de la sesión como actor;
- la clave de servicio: `Bearer` y `X-Programacion-Key`, el actor `servicio:…`, que no abre lecturas y que sin el
  secreto está apagada;
- el historial, la auditoría (filtros y páginas) y la copia final del borrado;
- que tras una escritura por la API, `GET /api/programacion` deja de acertar en su memoria y sirve lo nuevo.

Las rutas se compilan con `npx wrangler@4.119.0 pages functions build --outdir /tmp/fx-e4`. En el bundle, `GET
/api/programacion` sigue yendo a `programacion.js` y `/api/programacion/<algo>` a la ruta de E4.

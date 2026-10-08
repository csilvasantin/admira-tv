# Modelo único de playlists de admira.tv

Diseño aprobado por Carlos el 8-oct-2026. Este documento recoge el diseño, las tres decisiones de Carlos, lo que hacen las
entregas E1 y E2, en qué se aparta la implementación del diseño y el plan completo de entregas.

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
| `clave_servicio` | Claves de escrituras servidor a servidor. Sólo se guarda el hash SHA-256; el valor vive en `admira-vault`. |
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

1. **`hintFacts` y `enrichFacts` no se reutilizan dentro del resolver.** `playlist.js` no los exporta y `enrichFacts` hace
   red, mientras que el resolver es puro y `playlist.js` lo está tocando otra línea de trabajo. Por eso el resolver recibe
   `facts` ya completados y él mismo aplica `deduceScreenTags` + `applyCircuits`. Exportar las dos funciones queda para E3.
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

## Plan de entregas

| Entrega | Contenido | Estado |
|---|---|---|
| **E0** | Diseño y las tres decisiones de Carlos. | Hecha (8-oct-2026) |
| **E1** | D1: esquema `0001.sql`, almacén con bloqueo optimista, revisiones, poda, auditoría y versión, probado con una D1 simulada. Binding preparado y comentado. | **Hecha** |
| **E2** | `horario.js` y `resolver.js` puros, más las pruebas de horario, de resolver (con paridad) y de almacén. | **Hecha** |
| E3 | Crear la D1 real. Exportar `hintFacts`/`enrichFacts`. `GET /api/programacion?screen=` sirve el resolver con `/grid/day` y el Stock leídos y memoria por `meta.version`. Sin consumidores. | Pendiente |
| E4 | API de escritura de playlists, asignaciones y circuitos con sesión y permiso `digitalsignage-player`, 409 por `rev`, historial y auditoría consultables. Claves de servicio para Pixeria. | Pendiente |
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

## Pruebas

```bash
node --test 'functions/api/_programacion/*.test.mjs'
```

Las pruebas del almacén usan `node:sqlite` (Node 22.13 o posterior). Sin él, se saltan en vez de fallar.

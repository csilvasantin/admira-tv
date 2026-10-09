# Qué emite cada pantalla · `/api/emision` y `/emision/` (contrato para agentes · 8-oct-2026)

Responde a la pregunta de Carlos «¿qué emite **ahora** la pantalla X y quién le ha anulado su playlist?». Reúne lo
mismo que lee el player y aplica la **misma decisión** que `rebuild()` de `canal.html`, sin emitir ni escribir nada.

- Página para personas: https://admira.tv/emision/?screen=<pantalla> (sesión del portal, permiso `digitalsignage-player`)
- API: `GET https://admira.tv/api/emision?screen=<pantalla>[&at=<ISO|ms>][&tag=<hashtag>][&resumen=1]`
- Código: `functions/api/emision.js` (reúne los datos) y `functions/api/_emision.js` (`decide()`, puro)
- Ayuda para personas: https://admira.tv/help/#que-emite · Llegó en admira.tv #55 (página y API «Qué emite»)

## 1. La pila de prioridades (gana la primera que se cumple)

`decide()` es una réplica de `rebuild()` de `canal.html`. `emision-canal-equivalencia.test.mjs` ejecuta el
`rebuild()` real en una caja (`node:vm`) con los mismos datos y exige la misma fuente y el mismo orden de piezas: si
alguien toca `rebuild()`, esa prueba avisa de que esto también hay que tocarlo.

| # | `fuente` | Capa | Cuándo gana |
|---|---|---|---|
| 0 | `xtore` | Música de Xtore | Sólo la pantalla `xtore-virtual-zapatillas`: su playlist asociada o lo último con `#musica` (5) |
| 1 | `mural` | Mural extendido | `/api/playout` la pone en modo `extended`: una pieza compartida |
| 2 | — | Previo de borrador | Sólo en la pestaña de previo de la parrilla (`canal.html?rundown=…`); **nunca en antena** (capa `no-aplica`) |
| 3 | `hashtag` | Hashtag del mando | El mando puso `tag-<x>`: Stock con ese tag. **No se publica**: sólo se ve si se simula con `?tag=` |
| 4 | `defecto` | «Por defecto» | Tiene piezas (a mano, playlists vivas o dirigidas por #hashtag) **y** no hay sincro **y** no hay reservas own/paid **con creatividad** en la franja actual de `/grid/day` |
| 5 | `sincro` | Sincro con el máster | Grupo de sincro (`/api/playout`) o modo remoto del circuito (`/locations/mode`), o la pantalla informa que está en sincro |
| 6 | `stock` | Stock + parrilla | Todo lo demás: `#default` › cortafuegos por procedencia › todo (máx. 50), con **una reserva de la parrilla cada 4 piezas** (o la parrilla editorial 50/50 sola) |

Cada capa sale en `capas[]` con `estado`: `activa`, `anulada` (con `anuladaPor`), `inactiva`, `vacia` o `no-aplica`, y
un `detalle` en ES/EN. Así se ve, por ejemplo, que «Por defecto» está **anulada por la parrilla** de la franja 10-14.

## 2. Petición

| Parámetro | Qué hace |
|---|---|
| `screen` | Obligatorio. `^[a-z0-9][a-z0-9-]{1,79}$` |
| `at` | Otro instante (ISO o ms). Si está a menos de 2 min de ahora, cuenta como «ahora» y se lee lo observado |
| `tag` | Simula el hashtag del mando (vive en el player y no se publica) |
| `resumen=1` | Quita `piezas` y devuelve `total` (lo usa el aviso de la parrilla) |
| `circuit`, `w`, `h` | Opcionales; si faltan, salen de lo que la pantalla dejó registrado al pedir su playlist |

**Acceso**: pantallas virtuales (`virtual-*`, `xtore-virtual-*`) sin sesión; el resto, sesión del portal con
`digitalsignage-player` o sesión de lectura (visor). Sin sesión → 401; sin permiso → 403; pantalla mal formada → 400
`bad_screen`; instante ilegible → 400 `bad_at`; otro método → 405.

**Sin efectos.** `/api/playlist` y `/api/playout` se llaman **en proceso** con un KV de solo lectura (no se graba el
censo de etiquetas ni el índice de Xpacios, y no se encarga la comparación del modo sombra). El resto son GET de
lectura a `api.admira.store` y `brain.digitalavatar.ai`. Nunca lee `/locations/cmd` (podría consumir órdenes del
mando).

## 3. Respuesta

```text
ok, screen, at, ahora, madrid {fecha, hora}, publico, nombre, circuito,
fuente, motivo {es, en}, etiqueta {es, en},          ← lo que gana, por qué y el rótulo que pintaría el canal
capas [{id, nombre, estado, detalle, anuladaPor?}],
piezas [{pos, id, stockId, num, titulo, tipo, medio, duracion, url, miniatura, carril, ancho, alto, orientacion,
         procedencia {tipo, es, en}, formato?}],      ← en el orden en que sonarían
avisos [{nivel, es, en}], supuestos [{es, en}],        ← lo que no cuadra y lo que el servidor no puede ver
duracionTotal {segundos, desconocidas, aproximada}, franja, franjas [...], pantalla {...},
observado {...} | null,                                ← sólo para «ahora»
lecturas {playlist, playout, parrilla, stock, modo, sincro}
```

`procedencia.tipo` dice de dónde sale cada pieza: `manual` (puesta a mano en «Por defecto»), `viva` (playlist viva,
con su nombre), `hashtag` (dirigida por hashtag), `parrilla` (reserva own/paid, con `reserva` y si es heredada),
`hashtag-mando`, `sincro`, `mural` o `stock`.

## 4. Qué significa `observado`

Sólo se rellena cuando `at` es «ahora». Es **lo que la propia pantalla dice**, no lo que el servidor predice:

| Campo | De dónde | Significado |
|---|---|---|
| `vivo` | `GET api.admira.store/signage/now?screen=` | `lastSeen` de hace **menos de 5 min**: el player está latiendo |
| `standby` | idem | La pantalla está en reposo |
| `ultimaSenal` | idem | Milisegundos del último latido |
| `ahora` | idem (`item`) | La pieza que la pantalla dice estar emitiendo: `id`, `titulo`, `tipo`, `url`, `desde`, `duracion` |
| `modo` | idem (`item.sinc.modo`) | `local`, `sync`, `extended`… según la pantalla |
| `publicada` | `GET brain.digitalavatar.ai/control/playlist?screen=` | La lista que la pantalla publicó al mando: `n`, `parece` (`defecto`, `stock`, `sincro`, `mural`, `previo`, `stock-o-hashtag`) y `coincide` (si es exactamente la predicha) |

Lectura práctica: `vivo: true` + `publicada.coincide: true` = la pantalla emite lo que el servidor cree. `coincide:
false` sale también como aviso: puede llevar un hashtag o un `#ID` del mando, un orden manual o un segmento local que
el servidor no ve. `vivo: false` = no ha latido en 5 min (apagada, sin red, o el player aún no informa).

Los players nativos que informan a `/signage/now`, `/control/playlist` y `/screen/cache` aparecen igual: así se
verificó el 9-oct-2026 el player nativo de iPad en `altadis-bcn-001-p1-vertical` (`vivo: true`); ver
https://admira.tv/mcp/ipad-nativo.md.

## 5. La página `/emision/`

- Selector de proyecto y pantalla, instante (Ahora / otra hora de hoy) y chips de franja de la parrilla. La URL guarda
  `?project=&screen=&at=&tag=&lang=` (también acepta `?device=`).
- «Ahora emite»: fuente, motivo, rótulo y lo observado; «Pila de prioridades»; avisos; «Qué se supone»; piezas en
  orden con miniatura, duración y procedencia. Casilla para refrescar cada 30 s mirando «ahora». Bilingüe ES/EN.
- «Simular un hashtag del mando» (= `?tag=`).
- **▶ Previo local**: recorre la lista en la propia página, sin llamar a nada que emita.
- **Ver en canal ↗** avisa antes de abrir: `canal.html` **no tiene modo de solo lectura**. Abierto con una pantalla
  real, la pestaña se hace pasar por ella: cuenta pases en sus estadísticas, publica su playlist al mando, puede
  ejecutar y acusar órdenes del mando y deja esa pantalla guardada en el navegador.
- La parrilla (`/parrilla/`) enlaza «¿Qué emite ahora? ↗» con el dispositivo activo y, en el editor de «Por defecto»,
  avisa encima cuando otra capa la anula (`emision/aviso-parrilla.js`, que usa `?resumen=1`).

## 6. Trampas

- El hashtag del mando no se publica: si alguien lo puso, manda sobre todo y el servidor no lo ve. Simúlalo con `tag`.
- Sin medidas de la pantalla (no ha pedido su playlist en 45 días) no se comprueba la orientación y las vivas por
  orientación o idioma pueden no casar: sale en `supuestos`.
- Esto es **el legado**. Lo que resolvería el modelo único nuevo es `GET /api/programacion?screen=`
  (https://admira.tv/mcp/programacion.md); el modo sombra compara los dos.
- No uses `canal.html?screen=<pantalla real>` para mirar: usa esta API o el previo local.

## EN · summary

`GET /api/emision?screen=&at=&tag=&resumen=1` answers "what is screen X playing now, and what overrode its playlist?".
It replicates `canal.html`'s `rebuild()` priority (Xtore › extended wall › draft preview › remote hashtag › default
playlist › sync › Stock with a grid booking every 4 pieces) without side effects. Virtual screens are public; others
need a portal session with `digitalsignage-player`. `observado` (only for "now") is what the screen itself reports:
`vivo` = heartbeat within 5 minutes on `/signage/now`; `publicada.coincide` = its published list matches the
prediction. Human page: https://admira.tv/emision/. Opening `canal.html` with a real screen id impersonates that
screen; use the local preview instead.

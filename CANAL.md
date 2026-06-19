# Admira.tv · Canal de cartelería vertical (`canal.html`)

El **canal de emisión DOOH** de la trilogía Admira (Crear → Operar → **Emitir**).
Un MUPI vertical (9:16) que emite **en bucle todo el media creado en Pixeria**,
segmentable y configurable por pantalla. Live en **https://admira.tv/canal.html**.

> Es la capa de *emitir*: Pixeria crea → XpaceOS opera → **Admira.tv emite**.

---

## De dónde sale el contenido

- Fuente: el **índice público del Stock** en R2 (CORS abierto, sin worker):
  `https://pub-bf043a4daa3b43b7a0b769617729d074.r2.dev/stock/index.json`
- Se re-consulta cada `refresh` segundos (def. 30): cuando publicas algo nuevo en
  Pixeria, entra solo en la rotación (lo más reciente primero).
- Tope de piezas en el loop: `max` (def. 50, los más recientes).

### Tipos de media que emite
`video` · `animation` · `image` · `digital-twin` · `audio` · `music` · `locucion`.
(Se excluyen `link` —no es media— y `furni` —mobiliario del gemelo—.)
- **Vídeo / animación**: reproduce y avanza al acabar.
- **Imagen / digital-twin / twin-npc**: se muestra `img` segundos (def. 9), con barra de progreso.
- **Audio / música / locución**: tarjeta con ♪ + onda; ranura de `audio` segundos (def. 18).

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
| Anterior | ⏮ | ← |
| Pausa / reanudar | ⏸ / ▶ | espacio |
| Siguiente | ⏭ | → |
| Silencio | 🔇 / 🔊 | M |
| Volumen | slider | ↑ / ↓ |

Arranca **en mudo** (para que el autoplay funcione); al desmutear, en algunos
navegadores hace falta un gesto (hay overlay «toca para arrancar» de respaldo).

## Playlist (cola)

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

**Ejemplos**
- Quiosc, solo imágenes, 8 máx: `?circuit=bcn-kiosk-005&screen=bcn-kiosk-005-led&medio=image&max=8`
- Mujeres · tarde · imagen 6s: `?audience=f&slot=tarde&img=6`
- Empotrado a pantalla completa: `?embed=mupi`

---

## Cómo entra en la trilogía

- **pixeria.com** (Crear) y **xpaceos.com** (Operar) enlazan a admira.tv en su nav.
- El landing **admira.tv** → botón «Ver el canal en antena» → `canal.html`.

## Pendiente / siguiente paso

- **Backbone `/grid`** en el worker `pixer-eleven` (NO implementado): el componente
  compartido `emission-calendar` + el contrato ya existen (`admira-design`), y el
  control owner vive en `xpaceos.com/control/`. Cuando se implementen los handlers
  `/grid/*`, el selector de pantalla pasará de fijar identidad a leer la **parrilla
  real por pantalla** (lo vendido/programado), cerrando el bucle de monetización.

_Build documentado: 2026-06-19._

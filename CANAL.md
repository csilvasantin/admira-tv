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
| Pausa / reanudar | ⏸ / ▶ | espacio |
| Silencio | 🔇 / 🔊 | M |
| Volumen | slider | + / − |

Arranca **en mudo** (para que el autoplay funcione); al desmutear, en algunos
navegadores hace falta un gesto (hay overlay «toca para arrancar» de respaldo).

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

## Pendiente / siguiente paso

- Soportar en `canal.html` `gridWeave` los creativos de tipo audio/música (hoy solo
  vídeo/imagen entran en el loop de parrilla).
- Programación por día futuro (hoy el panel de `cms.html` programa el día en curso).

_Build documentado: 2026-06-19. Bucle /grid activado desde cms.html: 2026-06-26._

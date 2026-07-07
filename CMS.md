# Admira.tv · CMS y plataforma de programación (`cms.html`)

Panel de **control de flota + programación de la parrilla** de admira.tv. Es la cara
de operación del backbone `/grid` (worker `pixer-eleven`). Live en **https://admira.tv/cms.html**.

> Capa *emitir* de la trilogía (Pixeria crea → XpaceOS opera → **Admira.tv emite**).
> El contrato del calendario vive en `admira-design/EMISSION-CALENDAR.md`.

---

## 1. Canales / proyectos

Un **canal** agrupa **circuitos** (el prefijo del `id` de cada equipo/pantalla, p.ej.
`xtanco-led-frontal` → circuito `xtanco`). Sirve para no cargar las ~8.700 ubicaciones de
golpe y para operar por contexto.

- Selector **📡** arriba en `cms.html`: filtra a la vez la **vista de flota** y el
  **selector de pantallas** de Programar a los circuitos del canal.
- **Arranca en «Canal AdmiraNeXT»** por defecto (no en «Todos», que es muy pesado).
- Editor **✎**: crear / renombrar / asignar circuitos / borrar canales. Guarda en el
  worker (necesita `GRID_KEY`). El cambio es inmediato para toda la flota (KV compartido).

Canales sembrados (KV `grid:projects`):

| Canal | Circuitos |
|---|---|
| Canal AdmiraNeXT (todos los Macs del grupo) | `admiranext`, `admira`, `robot` |
| CanalKiosk | `kiosko` |
| CanalMetro | `metro` |
| Canal Xtanco | `xtanco` |

API: `GET /grid/projects` (público, defaults si KV vacío) · `POST /grid/projects`
(`{key, projects:[{id,name,circuits[]}]}`, requiere `GRID_KEY`).

---

## 2. Programar la parrilla (botón 📅 Programar)

Eliges **pantalla → franja → pieza del Stock de Pixeria** y se reserva como contenido
**propio** (`status:'own'`, `POST /grid/book`). `canal.html` lee `/grid/day` y emite lo
programado de la franja actual (`gridWeave`, cadencia fija); si no hay nada, cae al
Stock + segmento.

- **Día futuro**: navegador de día (◀ fecha ▶ / hoy). Mínimo hoy, no pasado.
- **Franjas pasadas**: en el día de hoy, las franjas ya terminadas salen atenuadas («pasada»);
  la actual marca «● en antena ahora».
- **Audio/música**: el picker incluye audio/música/locución y reserva `creative.type:'audio'`
  (el worker `gridCleanCreative` acepta video/image/audio; `canal.html` lo reproduce por su
  ruta de audio, `KIND→audio`).
- **⧉ Duplicar día**: copia todo el contenido propio del día mostrado a otra fecha.
- Quitar una reserva propia: ✕ en el slot (`POST /grid/unbook`).

---

## 3. `GRID_KEY` (clave de escritura)

Todas las escrituras del grid (`book`, `unbook`, `config`, `control`, `projects`, `decide`,
`upload`) requieren `GRID_KEY` (secret del worker). En el navegador se teclea **una vez** en
el campo del panel (se guarda en `localStorage` como `grid_key`; el agente NO la ve).

Para automatizar/flota está en la **bóveda**: `~/Claude/admira-vault/vault-get.sh GRID_KEY`
(rotada el 2026-06-26; el valor coincide en worker y bóveda). NUNCA imprimirla en un mensaje.

---

## 4. pixerScreens — conectar una pantalla del grid con el player físico

Cada pantalla del grid puede llevar `pixerScreens: []` = los **IDs de player físico** que
reciben su emisión (vía `POST /grid/emit` → `/signage/now`). Se asigna en
`POST /grid/config {key, screen, pixerScreens:[...]}`.

Estado actual de **Canal Xtanco** (5 superficies, `GET /grid/screens`):

| Pantalla (grid) | Superficie | pixerScreens |
|---|---|---|
| `xtanco-escaparate-exterior` | Escaparate exterior | **— pendiente** |
| `xtanco-led-frontal` | LED Frontal (interior) | `xtore-lg8qao`, `xtore-07313n` |
| `xtanco-led-vertical` | LED Vertical (metahuman) | **— pendiente** |
| `xtanco-mostrador-panel` | Mostrador (interior) | **— pendiente** |
| `xtanco-vending-cigarreras` | Vending / cigarreras | **— pendiente** |

> **PENDIENTE (paso siguiente):** asignar el player físico a cada superficie de Xtanco.
> Hoy solo hay 2 players de señalética registrados (`xtore-lg8qao`, `xtore-inicial`) y
> ninguno emitiendo, así que falta saber el **ID real** de cada equipo (exterior / vertical
> metahuman / mostrador) o que se registren al arrancar. NO mapear a ciegas (mandaría
> contenido a la pantalla equivocada). Cuando estén los IDs:
> `POST /grid/config {key, screen:'xtanco-led-vertical', pixerScreens:['<id>']}`.

---

## 5. Otras vistas del CMS

- Tarjetas de flota: estado online/offline (signage/now < 180s), audiencia por cámara,
  modo de emisión (condicional / local / sincro), control remoto del player, forzar
  público chico/chica (matriz de segmentación), estado de descarga (pseudo-streaming).
- Enlaces: 🎯 Condicional · 📺 Canal · ➕ Alta · Control ↗ (XpaceOS, owner completo).

---

## 6. EN EMISIÓN — AHORA (vista de emisión unificada) · r34

Sección estrella al principio de `cms.html`: qué equipo emite qué canal **AHORA**, cruzando
en vivo **4 registros** (cada `fetch` aislado con su timeout; si una fuente cae, el resto sigue).
Auto-refresco cada **40 s** (independiente del grid de flota de 10 s).

- **Fuentes:** `api.admira.store/signage/screens` (players vivos, la vista viva) · `…/grid/screens`
  (superficies + `pixerScreens[]`) · `…/grid/projects` (canal ← circuitos) · `omnipublicity /locations`
  (mapa; bloqueable en ES → degrada a «mapa: n/d») · `admira-fleet /machines` (flota).
- **Claves de join:** `player.screen ∈ gridSurface.pixerScreens` (físico↔lógico) · `player.loc` ↔
  `location.id` (por prefijo de circuito). Los huecos se pintan HONESTOS: «— sin alta en mapa»,
  «— sin parrilla», «— huérfano (sin loc)»; nunca se inventa el vínculo.
- **Tabla:** estado 🟢/🔴 (campo `online`/`age_seconds`, TTL ~10 min), player, rol (canal/juego),
  circuito·sitio, canal·parrilla (+ si la superficie está mapeada), pieza (`showing_id`), visto.
- **Descuadres** (alimenta la tarea siguiente): players vivos sin `loc`, superficies con
  `pixerScreens:[]`, sitios del mapa sin player vivo. Toggle «⚠ Descuadres» (izq).
- **Flota (equipos):** los `/machines` de admira-fleet, marcados «sin vincular» (el pegamento
  real `deviceId` es trabajo futuro; sólo se sugiere un match por nombre). Toggle «🖥 Flota».
- **Límites conocidos:** `signage/screens` sólo lista players que hayan hecho beat (<~10 min);
  `/locations` puede caer en España (se maneja con gracia); el vínculo host↔pantalla es heurístico.

_Documentado: 2026-06-26 · §6 añadido 2026-07-07 (subMorfeo · MacBookProNegro14)._

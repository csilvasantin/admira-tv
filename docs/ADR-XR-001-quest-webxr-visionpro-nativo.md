# ADR-XR-001 · Estrategia XR de Admira: Quest = WebXR, Vision Pro = nativo

- **Status:** Accepted
- **Date:** 2026-07-08
- **Decisores:** Carlos Silva (dirección) · equipo AdmiraNeXT
- **Ámbito:** capa XR del ecosistema Admira (admira.tv / Admira XP)

---

## Context

Admira lleva su cartelería y sus campañas al terreno inmersivo, y ahí el hardware manda: **Meta Quest y Apple Vision Pro no piden la misma experiencia ni el mismo camino técnico**. El Quest es un dispositivo de **VR de mundo cerrado**: el usuario se calza el visor y entra en un espacio íntegramente sintético — un showroom, una sala virtual, un training, la simulación de una tienda, un muro de pantallas. El Vision Pro es un dispositivo de **AR/spatial de mundo real**: el usuario sigue viendo su entorno y Admira superpone una capa espacial encima — mupis virtuales, dashboards flotantes, pantallas ancladas a paredes y mesas. Optimizar para uno penaliza al otro: forzar un runtime único produciría un mínimo común denominador pobre en ambos.

El camino técnico también diverge por madurez de plataforma. En Quest, el **Browser soporta WebXR con nivel de producción** (incluido passthrough, planos y anclas), lo que nos deja publicar sin App Store y iterar a velocidad web. En Vision Pro, la experiencia espacial de primera clase —anclado real a superficies, entrada por mirada+pellizco, integración con el entorno— vive en el **runtime nativo visionOS (SwiftUI + RealityKit)**; WebXR en Safari existe desde visionOS 2 pero cubre el caso inmersivo, no la capa AR-sobre-el-mundo que Admira quiere en ese dispositivo. Por eso adoptamos **dos vías de producto con un núcleo compartido**, en lugar de un único player.

---

## Decision

Dos players XR, un solo core.

### Vía 1 — Meta Quest · **Admira VR Player** (WebXR-first)
- **Experiencia:** mundo cerrado/inmersivo — showroom, sala virtual, training, simulación de tienda, muro de pantallas, campañas 3D.
- **Stack:** **WebXR first** servido en `admira.tv/xr/quest/`, render con **Three.js / Babylon.js**, distribución vía Browser del Quest (opcionalmente empaquetado como PWA).
- **Nativo después:** Unity + OpenXR **solo si** un caso exige app nativa (rendimiento extremo, features de plataforma fuera de la web). No es el punto de partida.

### Vía 2 — Apple Vision Pro · **Admira AR/Spatial Player** (nativo-first)
- **Experiencia:** capa espacial sobre el mundo real — mupis virtuales, dashboards flotantes, pantallas colocadas en paredes/mesas.
- **Stack:** **app nativa visionOS** con **SwiftUI + RealityKit + RealityView**.
- **WebXR:** solo como **demo web compartida** reutilizable, nunca como vía principal del dispositivo.

### Núcleo común — `admira-xr-core`
Paquete compartido por ambos runtimes (capa JS para Quest, capa Swift para Vision Pro) con la lógica que no debe divergir:
- catálogo de assets/campañas,
- resolución de media,
- sesión anónima,
- telemetría,
- proof-of-play,
- emisión de eventos hacia backend / Open Loyalty.

### Eventos canónicos XR (9)
Envelope mínimo de cada evento:

```json
{
  "eventId":   "<sha256 determinista>",
  "type":      "xr.session.started",
  "subjectId": "<sesión anónima>",
  "metadata":  { "device": "quest|visionpro", "sceneId": "...", "campaignId": "...", "screenId": "..." },
  "occurredAt": "2026-07-08T10:15:00Z"
}
```

| # | type | Cuándo se emite | Payload mínimo (`metadata`) |
|---|------|-----------------|-----------------------------|
| 1 | `xr.session.started` | Al abrirse la sesión XR (usuario entra al VR Player o abre el AR Player) | `device` |
| 2 | `xr.asset.loaded` | Cuando un asset/escena 3D termina de cargar y está listo para render | `device`, `sceneId` |
| 3 | `xr.view.started` | Al iniciarse la visualización de una pieza/experiencia | `device`, `sceneId`, `campaignId` |
| 4 | `xr.view.completed` | Al completarse la visualización (fin de la pieza o salida) | `device`, `sceneId`, `campaignId` |
| 5 | `xr.hotspot.clicked` | Al activar un hotspot/CTA dentro de la escena | `device`, `sceneId`, `campaignId` |
| 6 | `xr.screen.placed` | Al anclar una pantalla/mupi en el espacio (AR) o colocarla en el muro (VR) | `device`, `sceneId`, `screenId` |
| 7 | `xr.campaign.selected` | Al elegir una campaña del catálogo para reproducir | `device`, `campaignId` |
| 8 | `xr.reward.triggered` | Al dispararse una recompensa/misión asociada a la experiencia | `device`, `campaignId` |
| 9 | `xr.session.ended` | Al cerrarse la sesión XR | `device` |

**RESTRICCIÓN de arranque:** los eventos se emiten **primero en mock/local** — **sin writes reales a KV/backend** hasta coordinar con Morfeo (ver "Reconciliación").

### Reconciliación con la gamificación existente
El mapa de eventos de gamificación ([`admira-loyalty/docs/EVENTS.md`](../../01.-AdmiraXperience-Game/workers/admira-loyalty/docs/EVENTS.md)) ya define `ar.experience.start` / `ar.experience.complete` y el puente **`admira-loyalty`** (outbox idempotente `loyalty_events`, `eventId` determinista, whitelist de tipos, drenaje por cron a Open Loyalty). Se decide:

- Los **`xr.*` son el set canónico de XR**.
- **`ar.experience.start` → alias legacy de `xr.view.started`** y **`ar.experience.complete` → alias legacy de `xr.view.completed`**. Se mantienen como alias, no se duplican mecánicas.
- Cuando se activen los **writes reales**, los `xr.*` entrarán por el **mismo puente `POST /events`** del worker `admira-loyalty` (misma outbox, misma idempotencia). Habrá que **ampliar la whitelist de tipos** del worker para admitir los `xr.*` → **coordinar con Morfeo** por el margen de KV antes de abrir esa llave.

---

## Consequences

**Positivas**
- WebXR en Quest = iteración a velocidad web, sin fricción de App Store, un solo despliegue en `admira.tv`.
- Vision Pro nativo = experiencia espacial de primera clase (anclado real, mirada+pellizco, integración de entorno) imposible de igualar por web hoy.
- `admira-xr-core` evita el drift: una sola definición de catálogo, sesión, telemetría, proof-of-play y contrato de eventos.
- Los `xr.*` reutilizan el puente `admira-loyalty` ya probado (outbox idempotente) — no se reinventa la ingesta.

**Negativas**
- Dos runtimes del core: una **implementación JS** (Quest) y una **Swift** (Vision Pro) del mismo contrato → doble mantenimiento y riesgo de desincronía si no se disciplina el contrato.
- La vía nativa de visionOS arrastra **ciclo de App Store** (review, certificados, releases) frente a la inmediatez web del Quest.
- Dos superficies de QA y de telemetría a vigilar.

**Riesgos**
- **WebXR en Quest Browser vs nativo:** techos de rendimiento/features de la web pueden obligar a saltar a Unity+OpenXR en algún caso; la vía nativa queda como plan B explícito, no como sorpresa.
- **App Store review de visionOS:** tiempos y criterios de Apple pueden frenar releases; mitigar con buffer de publicación y builds internas (TestFlight).
- **Un core, dos lenguajes:** el contrato (`admira-xr-core`) debe ser la fuente de verdad versionada; si JS y Swift divergen, la telemetría y el proof-of-play dejan de casar.

---

## Alternatives rechazadas

- **Unity-first en ambos dispositivos.** Descartada por **coste**: renunciar a la inmediatez de WebXR en Quest y montar dos apps nativas encarece y ralentiza sin beneficio proporcional en el caso VR web-servible.
- **WebXR como vía principal en Vision Pro.** Descartada por **limitada**: WebXR en Safari (disponible desde visionOS 2) cubre lo inmersivo pero no la capa AR-sobre-el-mundo (anclado real a superficies, dashboards espaciales) que Admira quiere en ese dispositivo — **WWDC24 lo confirma** al situar esa experiencia en el runtime nativo. Queda como demo web compartida, no como vía principal.
- **Players separados sin core común.** Descartada por **drift**: sin `admira-xr-core`, catálogo, sesión anónima, telemetría y contrato de eventos derivarían por separado y romperían el proof-of-play y la gamificación.

---

## Referencias

- Meta — WebXR en el Browser de Quest: <https://developers.meta.com/horizon/documentation/web/webxr-overview/> · Mixed Reality (passthrough/planos/anclas): <https://developers.meta.com/horizon/documentation/web/webxr-mixed-reality/>
- Meta — Unity + OpenXR para Quest (vía nativa B): <https://developers.meta.com/horizon/documentation/unity/unity-project-setup/> · settings OpenXR Quest: <https://developers.meta.com/horizon/documentation/unity/unity-openxr-settings-quest/>
- Apple — visionOS · RealityKit / RealityView (vía nativa Vision Pro): <https://developer.apple.com/documentation/realitykit/realityview> · framework RealityKit: <https://developer.apple.com/documentation/realitykit>
- Apple — WebXR en la web espacial, WWDC24 (por qué WebXR no es la vía principal en Vision Pro): <https://developer.apple.com/videos/play/wwdc2024/10066/> · "Optimize for the spatial web": <https://developer.apple.com/videos/play/wwdc2024/10065/>
- Interno — mapa de eventos de gamificación y puente `admira-loyalty`: [`01.-AdmiraXperience-Game/workers/admira-loyalty/docs/EVENTS.md`](../../01.-AdmiraXperience-Game/workers/admira-loyalty/docs/EVENTS.md)

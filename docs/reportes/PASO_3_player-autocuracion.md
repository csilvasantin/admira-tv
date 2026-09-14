# PASO 3 · Player con bucle de autocuración — qué existe, qué falta y plan por fases (14-sep-2026)

Encargo #3320 (Carlos vía Neo MBP14) · misión FLT-100445 · MorfeoMacMini · MacMini. Ampliación del HandON de admira.tv (PASO_1 y PASO_2). **Esto es el plan, no la implementación**: el programa cubre tres shells nativos, un vigilante, un runbook, un canal de mandos y un panel; se hace por fases con evidencia en cada una.

## Lo que ya existe hoy (medido en PASO_1)
| Punto pedido | Lo que hay | Hueco |
|---|---|---|
| a) Latido unificado cada 60 s | El canal (común a Android/iOS/Windows/macOS) publica `POST api.admira.store/signage/now` por pieza y cada 60 s con `screen, producer, item, role, version, device{display,system,hardware,software,storage,network}, health{stalls,recoveries,source,online,uptimeSec}, loc, machine`; `/signage/screens` marca online si late en <6 min | Va a api.admira.store, no a admira.live; faltan `device_id` estable por plataforma, `playlist_hash`, `last_content_ok`, cpu/mem/disk/temp (el WebView no los ve: hace falta el shell nativo), contador de crashes y **cola offline con reenvío** |
| b) Vigilante en el Mini | El vigía de control del Mini vigila Macs (SSH, presencia), no players; `/signage/screens` ya da `last_seen` y `age_seconds` | No hay proceso que convierta «sin latido >3 min», «pantalla en negro» o «crash counter» en incidencia yokup; no hay dedupe por device_id |
| c) Runbook de resolución | Mando remoto en `mando.html` (play, reload, volumen, captura); reinicio de app solo en macOS (LaunchAgent) y Linux (systemd); Android OTA verifica SHA-256; iOS/Windows sin reinicio ni rollback | No hay runbook automatizado ni informe por paso; el reinicio de dispositivo y el rollback no existen en Android Play/iOS/Windows |
| d) Comandos remotos con token | `brain.digitalavatar.ai/control/cmds` + `/control/ack` con credencial de dispositivo (`/control/device/enroll`), y cola legacy `/locations/cmd` sin auth; polling 2,5→10 s, no WebSocket | Dos planos de mando; `screenshot` existe (`/signage/shot`), `reload/restart` parcial, `reboot/set_version/logs_upload` no; Windows no expone nada nativo |
| e) Panel en yokup.com | `admira.tv/players.html` (online/versión) y CMS cruzan Stock+censo; yokup no tiene pestaña Players | Semáforo, incidencias abiertas y último paso del runbook no existen en yokup |
| f) Simulacro | — | No hay player de pruebas designado ni ciclo documentado |

## Plan por fases (cada fase cierra con evidencia y sello)
1. **Vigilante + incidencias sin duplicar (1-2 días, todo en el Mini y en yokup).** Proceso launchd (`ProcessType Standard`, como el vigía de presencia) que lee `/signage/screens` cada 60 s, abre una misión de incidencia en el proyecto admiratv por `device_id` cuando pasan >3 min sin latido o `health.source` cae, adjunta último estado y captura de `/signage/shot`, y la cierra sola tras 5 min sanos. No toca players. Es lo que más valor da con menos riesgo.
2. **Latido v3 unificado (3 shells).** Extender el payload de `/signage/now` con `device_id`, `playlist_hash`, `last_content_ok`, `crash_count`, y añadir desde el shell nativo cpu/mem/disk/temp por el puente `AdmiraNative` (que hoy solo iOS implementa; ver PASO_1 §4). Cola offline en `localStorage` con reenvío. Exige compilar Android/iOS/Windows: fuera del Mini (sin JDK/SDK/Xcode).
3. **Un solo plano de mando.** Retirar `/locations/cmd`, quedarse con `/control/*` con credencial de dispositivo, y completar `reload, restart, reboot, screenshot, set_version, logs_upload` en el canal y en cada shell (reboot: ADB/MDM/servicio Windows; rollback: manifiesto por plataforma con SHA-256).
4. **Runbook automático + panel.** El vigilante ejecuta los seis pasos con informe por paso en la tarea de la incidencia y escala a Carlos con ventana 1/2/3; pestaña Players en yokup (semáforo, incidencias, último paso).
5. **Simulacro** con un player de pruebas: apagarlo, ver nacer la incidencia, seguir el runbook y verla cerrarse; evidencia en la misión.

Riesgos: tres formatos de versión y tres identidades de flota distintas (PASO_1 §4) impiden un `device_id` común sin antes alinear el sello; el reinicio de dispositivo en iOS no existe sin MDM; Windows no tiene supervisión de proceso. Tokens: cada fase con su propia misión y su cierre, no una sesión maratón.

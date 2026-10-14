# Gestión de turnos / Queue management

## Español

La entrada operativa es `/gestorColas/`; la pantalla pública es `/gestorColas/pantalla/`. La tarjeta Colas de Inicio abre ahora el control. El flujo es recibido → preparando → listo → recogido. El relé de demostración sigue simulando pagos: esta revisión no introduce cobros reales.

Cambios comprobables:

- Los botones envían el ID estable del pedido. Un A001 anterior a un reinicio no puede actuar sobre el nuevo A001.
- Una llamada fallida recupera el botón. “Llamada registrada” confirma el servidor; la voz requiere la pantalla y sus permisos de audio.
- El alta conserva nombre y nonce hasta la confirmación. Un reintento, incluso tras recargar la misma pestaña, reutiliza el mismo pedido.
- Cambiar de sala limpia las comandas previas, descarta respuestas tardías y conserva las claves por sala. Una clave no autoriza otras salas.
- Las lecturas tienen plazo, se agrupan durante la petición y se invalidan después de una escritura. La caché pública no se repuebla con una lectura anterior a una acción.
- El permiso de pago de un pedido en barra sólo viaja entre servidores y sólo corresponde a ese pedido. No se añaden permisos de administrador.

La ayuda ES/EN explica recuperación, cambio de sala, reinicio compartido y tiempos del relé: 30 s en recibido, 60 s en preparación y 120 s en listo.

## English

The operational entry is `/gestorColas/`; the public display is `/gestorColas/pantalla/`. The Home Queue card now opens the control. The flow is received → preparing → ready → collected. The demonstration relay still simulates payments; this review adds no real charges.

Buttons use stable order IDs. Failed calls release their buttons. Order creation retains its name and nonce through retries and same-tab reloads. Room changes clear old orders and discard late responses; credentials remain scoped to each room. Reads have deadlines, share pending requests and refresh after writes. An earlier read cannot repopulate the public cache after an action. The exact-order payment token stays between servers; no administrator permissions are added.

The ES/EN help documents recovery, room switching, shared resets and relay timings: 30 seconds received, 60 seconds preparing and 120 seconds ready.

## Validación / Validation

```sh
node --test gestor-colas-kds.test.mjs gestor-colas-room-client.test.mjs gestor-colas-consistency.test.mjs
python3 tools/gen-apps-grid.py --check
```

These tests use isolated credentials and simulated transport. A separate integration check on MBP16 runs the actual `ColaTienda` implementation from `ainimation` against the actual TV facade with in-memory storage and no administrator key; no external queue is written.

Browser review runs headless on MBP16. An isolated fixture exercises the changed UI with two operators and a public display, the actual facade and the actual in-memory relay. Its preview must be labelled as an isolated demonstration. It does not prove permission to enter the production control. The production agent sign-in succeeds, but the real session endpoint denies this agent access (403). No access policy is changed to bypass that denial.

The normal production sign-in and server-side authorization remain in place. Publishing and merging require the appropriate direct instruction and review.

Reproducible isolated browser fixture (requires Playwright, a headless Chromium executable and the approved ainimation source checkout):

```sh
AINIMATION_WORKTREE=/path/to/ainimation \
PLAYWRIGHT_PATH=/path/to/playwright \
TV_REVIEW_CHROME=/path/to/chromium \
node tools/review-queue-flow.mjs
```

This runner makes no production authentication requests, fabricates no session/access response and writes no external queue. Its default evidence directory is `/tmp/admira-tv-queue-review`. The displayed authorization warning distinguishes the fixture from an authorized production preview.

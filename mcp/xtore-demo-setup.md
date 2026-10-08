# Xtore · Preparar demo / Prepare demo

Entry: https://admira.tv/videoanalytics/xtore/
Catalogue: https://admira.tv/videoanalytics/
Tutorial: https://admira.tv/help/#xtore-preparar-demo
Twin: https://digitaltwin.ieu.ai/
Player: xtore-virtual-zapatillas (virtual browser player; no physical device).

## ES · recorrido

1. En Admira.tv → Analítica de vídeo, pulsa **Preparar demo Xtore**.
2. Pulsa **Preparar demo**. Abre Digital Twin en una pestaña con nombre estable (reutiliza la abierta por este setup), prepara el detector y reanuda el player existente. Conserva su preferencia de silencio.
3. En Digital Twin abre **Store → Entrada → Puerta Cam → Ver stream**. Vuelve al analizador y pulsa **Compartir Puerta Cam**. Elige esa pestaña en el selector de Chrome. Cada nueva captura requiere permiso explícito; no se capturan monitores ni ventanas, ni audio de la cámara.
4. Con un encuadre compatible guardado se recuperan las zonas y se solicita el análisis. Comprueba visualmente la cámara: la proporción no identifica una vista ni detecta cambios de zoom. Si falta la cámara, pulsa **Marcar cámara**, confirma sus cuatro esquinas y después **Iniciar análisis**. iPad y pantalla son opcionales.
5. Si el navegador bloquea el audio, pulsa **Toca para activar el sonido** dentro del player. Si estaba silenciado, actívalo. Espera **Listo para enseñar**.

La cuadrática usa los componentes compartidos admira-nav y admira-frame: **Opciones** izquierda, **Avanzado** derecha y **Experto/CLI** abajo, cerrados al entrar. Se mantienen los controles previos, identidad, encuadres, histórico y CLI nativa. Experto enlaza este contrato; no añade un comando remoto de preparación.

El indicador exige cámara con avance reciente (menos de 1,5 s), encuadre válido, detector disponible, análisis activo, player conectado con reproducción confirmada y avance reciente (las imágenes usan su latido), y audio confirmado sin mute, volumen mayor que cero y sin bloqueo de autoplay. Una cámara o player congelado vuelve a pendiente. **Sonido habilitado** acredita configuración del player, no salida acústica de los altavoces. **Listo** no garantiza que haya personas ni que la inferencia sea correcta. Las pruebas manuales de categorías permanecen en Avanzado, solo con el análisis detenido, sin sumar detecciones ni histórico.

Reintentar detector o reanudar player no borra preferencias, conteos, encuadres ni histórico. Pausar, desconectar, olvidar encuadres y Reset mantienen su comportamiento previo y requieren su propia acción explícita. Cancelar el selector de Chrome deja la demo pendiente.

## EN · walkthrough

1. In Admira.tv → Video Analytics, choose **Prepare Xtore demo**.
2. Click **Preparar demo / Prepare demo**. This opens Digital Twin in a stable named tab (reusing the tab opened by this setup), warms the detector and resumes the existing player, retaining its mute preference.
3. In Digital Twin open **Store → Entrada → Puerta Cam → Ver stream**. Return and click **Compartir Puerta Cam / Share Puerta Cam**. Select that tab in Chrome. Each new capture requires explicit permission; windows, monitors and camera audio are excluded.
4. A compatible saved framing restores its zones and requests analysis. Visually confirm the view: matching aspect ratio does not identify a camera or detect zoom changes. Otherwise use **Marcar cámara / Mark camera**, confirm its four corners, then **Iniciar análisis / Start analysis**. Tablet and display placement are optional.
5. If autoplay is blocked, click **Toca para activar el sonido / Tap to enable sound** inside the player. Unmute if needed. Wait for **Listo para enseñar / Ready to present**.

The shared quadratic shell uses admira-nav and admira-frame: Options left, Advanced right, Expert/CLI below; closed on entry. Existing controls, identity, framing, history and native CLI remain available. Expert links this contract; no remote setup command is introduced.

Readiness requires fresh advancing camera frames (under 1.5 seconds), valid framing, an available detector, active analysis, connected playback with fresh progress (images use their heartbeat), and confirmed player audio with mute off, volume above zero and no autoplay block. A frozen camera or player returns to pending. Enabled sound confirms player configuration, not acoustic output. Ready does not promise people are present or detections are correct. Manual category tests remain in Advanced, only while analysis is stopped, without creating detections or history.

Retrying preparation or resuming the player preserves preferences, counts, saved framing and history. Pause, disconnect, forget framing and Reset retain their existing explicit behavior. Cancelling Chrome's picker leaves setup pending.

## Shared contract / Contrato compartido

Scope: browser UI and documentation. No new MCP tool, no new remote detection, no remote camera permission, no physical-device control, no simulated audience and no changes to global playlists or conditional rules.

IEU automatic Store/Puerta Cam navigation remains pending: https://admira.tv/mcp/ieu-puertacam-autostart.md. This setup opens the public twin only; it does not invent a deep link or bypass IEU authentication. Cross-origin framing and Chrome's picker remain operator steps.

Real MCP help topic: xtore-demo-setup at https://mcp.admira.store/help (and help tool). Existing player API: https://mcp-tv.admira.store/mcp. Playback contract: https://admira.tv/mcp/player-contract.md.

Verification: focused setup, capture-preset, audio and player-controller tests; native panel and public browser checks are recorded in the release evidence. Existing lifecycle failures must be reported separately from this feature's checks.

# Pantalla física y sincro / Physical display and synchronization

ES: AdmiraSignageMac 1.7.4 acepta `display` como ID físico de CoreGraphics. El ID se obtiene de `NSScreenNumber`; no es el número de orden del monitor. En modo ventana, el player ocupa el área visible del monitor elegido; en kiosko, cubre su marco completo. Si el ID no existe, conserva la selección habitual. Solo modifica su propia ventana. Los controles de pausa y standby conservan su comportamiento.

EN: AdmiraSignageMac 1.7.4 accepts `display` as a physical CoreGraphics display ID, obtained from `NSScreenNumber`; it is not the monitor’s array index. Windowed mode fills the selected display’s visible area; kiosk mode fills its full frame. An unavailable ID keeps the regular selection. Only this player's window changes. Pause and standby controls keep their behavior.

```sh
defaults write tv.admira.signage.mac display -string 1
```

ES: También se admite `-display 1` o `ADMIRA_DISPLAY=1`. Reinicia esa instancia después de configurar. En instancias con identificador de bundle independiente, utiliza su propio dominio de preferencias. No cambia la orientación del vídeo ni el layout de otras aplicaciones.

EN: `-display 1` or `ADMIRA_DISPLAY=1` are also supported. Restart that instance after configuring it. Instances with a separate bundle identifier use their own preferences domain. This does not change video orientation or other applications’ layout.

## Starbucks MacStudio · contrato verificado / verified contract

| Pantalla / Display | Screen | Orientación / Orientation | Display ID |
|---|---|---|---|
| Izquierda / Left | macstudio-starbucks-vertical | 1080×1920 | 2 |
| Centro / Center | macstudio-starbucks-horizontal | 1920×1080 | 5 |
| Derecha / Right | macstudio-starbucks-vertical-right | 1080×1920 | 1 |

ES: Cada screen tiene su fuente de sincro `https://brain.digitalavatar.ai/control/playlist?screen=<screen>-tema`. Frappuccino, Horchata y Your Drink Your Story comparten orden y tramos de 7, 9 y 16 segundos; ciclo de 32 segundos y reloj `https://brain.digitalavatar.ai/sync/state`. Las duraciones redondean hacia arriba y conservan el último fotograma hasta el cambio común. `sincro=1` sin tema propio puede cargar el catálogo global: publica y verifica primero las tres fuentes. Las listas verticales y horizontal usan archivos distintos. No modifican Matrix ni el máster global.

EN: Each screen has its own sync source at `https://brain.digitalavatar.ai/control/playlist?screen=<screen>-tema`. Frappuccino, Horchata and Your Drink Your Story share order and 7, 9 and 16 second slots: a 32 second cycle using `https://brain.digitalavatar.ai/sync/state`. Durations round upward and hold the final frame until the common transition. `sincro=1` without its own theme can load the global catalogue: publish and verify the three sources first. Vertical and horizontal lists use different files. Matrix and the global master remain unchanged.

ES: Verifica geometría real de ventanas, proporción de los archivos, `item.sinc.on=1`, índice, tramo y `startedAt` durante una vuelta completa. La telemetría temporal acredita la alineación del reloj; no es una medición de genlock de los paneles físicos.

EN: Verify actual window bounds, file orientation, `item.sinc.on=1`, index, slot and `startedAt` over a full loop. Timing telemetry proves clock alignment; it is not a physical panel genlock measurement.

## V–H–V en dos Macs y Esc / Two Macs and Escape

ES: Kiosko es el modo predeterminado y cubre el marco completo, sin título, Dock ni barra de menús. Para tres instancias simultáneas, cada una necesita bundle, screen y display propios. Configura el mismo `kioskGroup` y deja un único `focusOwner=1` (el central); los laterales usan `focusOwner=0`. Así el central recibe el teclado y los laterales permanecen a pantalla completa sin competir por el foco. Esc y «Salir del kiosko» cierran todos los miembros del grupo local. Sin grupo, mantienen la salida individual. SIGTERM/SIGINT cierran solo la instancia receptora.

EN: Kiosk is the default and covers the full display frame without a title bar, Dock or menu bar. Three simultaneous instances each need their own bundle, screen and display. Set the same `kioskGroup` and one `focusOwner=1` (center); sides use `focusOwner=0`. The center receives keyboard input while the sides remain fullscreen without competing for focus. Escape and “Exit kiosk” close every local group member. With no group they retain individual exit. SIGTERM/SIGINT close only the receiving instance.

```sh
defaults write tv.admira.signage.mac mode -string kiosk
defaults write tv.admira.signage.mac kioskGroup -string starbucks-office
defaults write tv.admira.signage.mac focusOwner -string 1
```

ES: La salida entre Macs requiere un `escapeHook` explícito: ruta absoluta de un ejecutable local de confianza, invocado sin shell con el grupo como único argumento. El cierre remoto no es automático por compartir nombre de grupo. En esta instalación, el helper conecta por SSH al otro Mac y termina únicamente las tres etiquetas Starbucks; el MacStudio tiene una clave restringida a esa orden en el MacMini. Los receptores no vuelven a ejecutar el hook, evitando bucles. No hay KeepAlive: Esc no provoca un rearranque. El helper deja un registro de entrega; si el otro Mac no está conectado, el cierre local ocurre y el remoto queda pendiente de intervención.

EN: Cross-Mac exit requires an explicit `escapeHook`: an absolute path to a trusted local executable, invoked without a shell with the group as its only argument. A shared group name alone does not enable remote exit. Here the helper connects to the peer over SSH and terminates only the three Starbucks labels; MacStudio uses a key restricted to that command on MacMini. Recipients do not run the hook again, preventing loops. No KeepAlive is installed: Escape does not restart players. The helper logs delivery; if the peer is unreachable, local exit happens and remote exit needs intervention.

| Mac | Izquierda / Left | Centro / Center | Derecha / Right |
|---|---|---|---|
| MacMini | display 3 · macmini-starbucks-vertical | display 1 · macmini-starbucks-horizontal | display 2 · macmini-starbucks-vertical-right |
| MacStudio | display 2 · macstudio-starbucks-vertical | display 5 · macstudio-starbucks-horizontal | display 1 · macstudio-starbucks-vertical-right |

ES: Las seis fuentes propias comparten el ciclo 7/9/16 s de 32 s. La orientación V–H–V usa cuatro fuentes verticales y dos horizontales. Las IDs físicas anteriores corresponden a la configuración comprobada, pueden cambiar al reconectar pantallas y deben volver a verificarse.

EN: All six private sync sources share the 7/9/16 s, 32 s cycle. V–H–V uses four vertical sources and two horizontal sources. These physical IDs belong to the verified setup; they may change after reconnecting displays and must be checked again.

ES: El kiosko restaura su propia ventana si estaba minimizada y la coloca en el Space activo como aplicación accesoria; ventana activa no equivale a contenido visible. EN: Kiosk restores its own minimized window and joins the active Space as an accessory app; an active app alone does not prove visible playback.

ES: El kiosko puede compartir el Space de una aplicación ya a pantalla completa, sin cambiar su ventana. EN: Kiosk can join an existing app’s fullscreen Space without modifying its window. AppKit: https://developer.apple.com/documentation/appkit/nswindow/collectionbehavior-swift.struct/canjoinallapplications

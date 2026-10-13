# Pantalla física y sincro / Physical display and synchronization

ES: AdmiraSignageMac 1.7.2 acepta `display` como ID físico de CoreGraphics. El ID se obtiene de `NSScreenNumber`; no es el número de orden del monitor. En modo ventana, el player ocupa el área visible del monitor elegido; en kiosko, cubre su marco completo. Si el ID no existe, conserva la selección habitual. Solo modifica su propia ventana. Los controles de pausa, standby y salida siguen iguales.

EN: AdmiraSignageMac 1.7.2 accepts `display` as a physical CoreGraphics display ID, obtained from `NSScreenNumber`; it is not the monitor’s array index. Windowed mode fills the selected display’s visible area; kiosk mode fills its full frame. An unavailable ID keeps the regular selection. Only this player's window changes. Pause, standby and exit controls remain unchanged.

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

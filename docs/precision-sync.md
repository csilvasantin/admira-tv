# Sincro fina de los players

El modo **Sincro** de `/canal` usa un reloj y un corrector comunes para vídeo y
audio. Se comprueba en la ficha **Informar**: reloj, RTT, incertidumbre estimada,
desfase del medio y velocidad aplicada. No requiere activar otro modo.

## Contrato

`GET https://brain.digitalavatar.ai/sync/clock` devuelve `admira-clock-v1`, con
`serverReceivedAt` y `serverSentAt` en milisegundos UTC, CORS y `no-store`.
El cliente toma nueve mediciones y calcula:

```
offset = ((serverReceivedAt - clientSentAt) + (serverSentAt - clientReceivedAt)) / 2
RTT = (clientReceivedAt - clientSentAt) - (serverSentAt - serverReceivedAt)
```

Usa la mediana de las cinco muestras de menor RTT (mínimo tres válidas). La
incertidumbre publicada es una estimación basada en RTT, dispersión y resolución;
no certifica simetría de red ni exactitud acústica. Después de adquirir el reloj,
la época avanza con `performance.now()`. Los cambios de referencia se aplican a
20 ms/s; una discrepancia validada de más de un segundo readquiere el reloj
directamente para recuperarse de una suspensión. Se remide cada cinco minutos,
al recuperar red y al volver al primer plano.
Si falla, conserva la referencia disponible y declara su antigüedad/fuente.

Cada 250 ms se compara la posición del audio/vídeo con la cronología. El reloj es
común; la corrección depende del motor:

- Chromium, Android WebView y Electron conservan la variante proporcional Android:
  banda ±15 ms, tasa 0,9×–1,1× y seek a partir de 500 ms con cooldown mínimo de 3 s.
  Mide `seeked`, adelanta la siguiente corrección por esa latencia más 40 ms (tope
  2 s) y evita escrituras redundantes de tasa/tono.
- WebKit/Safari y los wrappers Admira macOS/iOS usan la variante de reposicionamiento
  del iOS nativo: tasa fija 1×, banda ±35 ms y saltos espaciados al menos 3 s después
  del asentamiento anterior. Antes de corregir o aprender espera tres intervalos
  de avance real aproximadamente 1× y al menos 750 ms. El siguiente adelanto se
  calcula con el residual estable, no únicamente con el evento `seeked`.

La selección automática reconoce WebKit, incluidos CriOS/FxiOS; excluye Chrome,
Chromium, Edge, Electron y Android. `?syncservo=seek` o `?syncservo=rate` permite
forzar el motor en una prueba. `servo.strategy` declara cuál se está usando.
Pausa del operador, standby, modo local, directo, previo, buffering y autoplay
bloqueado no fuerzan reproducción.

En WebKit el adelanto aprendido se conserva sólo en memoria, por clave publicada
ID+URL+duración, con máximo 32 piezas. Sólo se guarda si el residual asentado queda
dentro de ±35 ms; otro archivo o duración inicia su propia adquisición. No se
persisten calibraciones ni se presupone el mismo coste de decoder entre codecs.
La primera adquisición puede requerir varios saltos y segundos. Una nueva vuelta
puede reutilizar la muestra válida, pero vuelve a medir y adaptar al comportamiento
actual. Esto es adaptación del playhead, no calibración acústica.

Un seek sin terminar en diez segundos se declara fallido. `seeked` mide el final
del seek del elemento; `settledLatencyMs` de WebKit incluye la espera del avance
estable. Ninguno certifica la salida de un fotograma o una muestra por HDMI/altavoz.

Las duraciones publicadas gobiernan los límites. Una duración descubierta en
un decoder no cambia la cronología de ese dispositivo. Las fuentes antiguas sin
duración usan el slot de respaldo del máster (habitualmente 20 s); pueden recortar
una pieza. Hay que publicar duraciones completas para reproducirla entera en sincro.
El grupo MBA conserva sus revisiones inmutables, precarga y activación futura;
esa activación usa el mismo reloj fino que la reproducción.

## Cobertura real

| Motor | Aplicación de este cambio |
| --- | --- |
| Navegadores y `/canal` | Módulo común, sin instalación adicional |
| macOS WKWebView, iOS/Android WebView, Windows/Linux Electron que cargan `/canal` | Adoptan el cambio al actualizar la página |
| iOS nativo `tv.admira.player.ipad.nativo` | Motor AVPlayer separado: afinado NTP previo en `fix/arranque-en-frio-streaming`; esta publicación web no distribuye su binario |
| Android nativo `tv.admira.player` | Motor ExoPlayer separado: afinado NTP previo en `feature/player-android`; esta publicación web no distribuye su APK |
| Apple TV nativo | Adaptador y distribución propios; no queda actualizado por publicar JavaScript |
| Tinta electrónica | Sin audio; no aplica alineación acústica |

## Qué se mide

`item.sinc.precision` en el latido conserva `clock` (fuente, edad, RTT, estimación,
offset y slew), `servo` (identidad de la pieza, modo, drift, velocidad, seeks por pieza y totales,
latencia/adelanto medidos, residual asentado y seeks fallidos), `mediaTime` y,
cuando existe `requestVideoFrameCallback`, `frameDriftMs`. El último es una muestra
del fotograma presentado, no una medición del DAC. No se mide cada heartbeat en
el mismo instante en todos los equipos; se deben correlacionar muestras y piezas.

Dos altavoces pueden tener distintos búferes, procesado y distancia al oyente.
Bluetooth/AirPlay añaden otra latencia. El módulo no crea un AudioContext ni
reescribe la cadena de audio: evita cambiar permisos o bloquear sonido existente.
`outputCalibration: unmeasured` declara expresamente que falta medición acústica.
Una banda objetivo de ±15/35 ms no implica un resultado garantizado de ±15/35 ms.

La prueba física necesita dos emisores identificables, captura simultánea y
comparación de los impulsos; los timestamps de inicio por sí solos no la sustituyen.
La reproducción web depende del decoder y de la planificación del navegador y no
ofrece genlock ni fase de muestras garantizada.

Referencias primarias: [AVPlayer y reloj host](https://developer.apple.com/documentation/avfoundation/avplayer/setrate(_:time:athosttime:)),
[vídeo presentado en el navegador](https://wicg.github.io/video-rvfc/),
[latencia de salida de Web Audio](https://www.w3.org/TR/webaudio/).

## Evidencia de WebKit (29-oct-2026)

Prueba aislada en WKWebView real de MBA Azul con fixture H.264 de 30 s: la variante
proporcional mostró pausas del playhead tras seeks y cambios de tasa y no convergió
con el primer candidato. Eso es asociación observada, no una atribución probada a
una API concreta. La variante fija 1× alcanzó +12,5 a +13,4 ms en los últimos cinco
segundos observados de una pieza después de tres seeks. No acredita todavía salida
acústica ni uniformidad entre archivos. Los tests de modelo reproducen seeked
prematuro, asentamiento posterior, caché por asset y guardias de pausa; la prueba
física de vueltas y cambio de archivo debe acompañar la publicación.

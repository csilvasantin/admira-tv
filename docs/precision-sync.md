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

Cada 250 ms se compara la posición del audio/vídeo con la cronología. Dentro de
±15 ms mantiene 1×; fuera corrige proporcionalmente entre 0,9× y 1,1× conservando
el tono. Desfases de más de 500 ms provocan un seek, con intervalo mínimo de tres
segundos entre saltos. Pausa del operador, standby, modo local, directo, previo,
buffering y autoplay bloqueado no fuerzan reproducción.

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
offset y slew), `servo` (modo, drift, velocidad, número de seeks), `mediaTime` y,
cuando existe `requestVideoFrameCallback`, `frameDriftMs`. El último es una muestra
del fotograma presentado, no una medición del DAC. No se mide cada heartbeat en
el mismo instante en todos los equipos; se deben correlacionar muestras y piezas.

Dos altavoces pueden tener distintos búferes, procesado y distancia al oyente.
Bluetooth/AirPlay añaden otra latencia. El módulo no crea un AudioContext ni
reescribe la cadena de audio: evita cambiar permisos o bloquear sonido existente.
`outputCalibration: unmeasured` declara expresamente que falta medición acústica.
Una banda objetivo de ±15 ms no implica un resultado garantizado de ±15 ms.

La prueba física necesita dos emisores identificables, captura simultánea y
comparación de los impulsos; los timestamps de inicio por sí solos no la sustituyen.
La reproducción web depende del decoder y de la planificación del navegador y no
ofrece genlock ni fase de muestras garantizada.

Referencias primarias: [AVPlayer y reloj host](https://developer.apple.com/documentation/avfoundation/avplayer/setrate(_:time:athosttime:)),
[vídeo presentado en el navegador](https://wicg.github.io/video-rvfc/),
[latencia de salida de Web Audio](https://www.w3.org/TR/webaudio/).

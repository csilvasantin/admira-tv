# La Supercomputer · player admira.tv en los ventiladores de METAHUMAN

Proyecto dirigido por **Woz** (Consejo AdmiraNext). Arrancado el 4 de noviembre de 2026.
Gemelo digital: **https://www.admira.store/supercomputer/** (con sesión; guía en
`csilvasantin/admira-store` · `admira-xp/docs/supercomputer.md`).

METAHUMAN (Windows) lleva 7 ventiladores **Lian Li UNI FAN TL LCD**, cada uno con una
pantalla redonda de 400×400 (USB `04FC:7393`, una interfaz HID por ventilador) y un anillo RGB,
colgando del controlador UNI FAN TL (`0416:7372`): 3 en el puerto 0, 3 en el 1 y 1 en el 2.
Numeración: ventilador 1 = puerto 0, primero de la cadena; el 7 es el del puerto 2.

## Cómo funciona

Cada pantalla se pinta en un Chrome sin ventana a 400×400 (un Chrome por player: en headless
solo pinta la ventana activa de cada navegador) y cada fotograma del screencast (JPEG) se trocea
en informes HID de 512 bytes y va a su ventilador. Si la página no cambia (una imagen fija, o el negro de un ventilador
que espera turno en secuencia), el puente reenvía el último fotograma cada `mantenerMs` (250 ms): sin señal, la pantalla se
suelta del streaming y enseña lo que tiene guardado (el logo de Lian Li y los vídeos de L-Connect). Pasó en PC-COCINA el
6-nov-2026: el reenvío antiguo (cada 2 s y solo al llegar un fotograma) dejaba huecos de 3-5 s y salían «fotogramas raros».

| Modo (`escena.modo`) | También | Qué pinta | Pantalla(s) en admira.tv |
|---|---|---|---|
| `independiente` | independent, autónomo | un canal de admira.tv por ventilador, con sus piezas por `?ids=` | `supercomputer-ventilador-1` … `-7` |
| `repetir` | repeat, espejo | un solo canal cuyos fotogramas van a los 7 | `supercomputer-ventiladores` |
| `extender` | extend, adaptar, adapt, estirar | una pieza estirada sobre los 7 como un mural (`ajuste` cubrir/estirar/contener, `columnas`, `orden`) | — |
| `sincro` | sync, relevo | la pieza pasa de un ventilador al siguiente cada `paso` s sin reiniciarse; varias piezas = carrusel | — |
| `secuencia` | sequence, secuencial, sequential, cadena, chain | la pieza **entera** en el ventilador 1, luego entera en el 2… hasta el último de `orden`, y vuelta a empezar; los demás en negro. Solo usa la primera pieza | — |
| `identificar` | identify | cada pantalla enseña su número, su puerto y su posición | — |

**Secuencia** (llegó de PC-COCINA, probada allí el 6-nov-2026 con un clip de 23,8 s): cada página de escena
precarga la pieza oculta y en marcha, mide `video.duration` y se la manda al puente (`POST /duracion`), que la
guarda en `escena.duracion` (segundos, ≤ 3600) sin subir la revisión. Mientras no se conoce, el relevo usa `paso`.
Si se vuelve a mandar la misma pieza, la duración medida se conserva. Ejemplo: `{"modo":"secuencia","pieza":"<id>"}`.

Disposición física (confirmada el 4-nov-2026 con `identificar` y una foto): vista desde la ventana
principal, 1-2-3 en columna en el panel de cristal de la derecha (delante, 1 arriba, pantallas hacia dentro),
4-5-6 en el suelo (4 detrás a la izquierda, 6 delante a la derecha) y 7 trasero arriba a la izquierda.

Identificar, como extender, sincro y secuencia, lo pinta `escena.html`. Independiente y repetir usan el canal publicado **tal cual** (contrato `mcp/player-contract.md`:
`embed=mupi&clean=1&fit=screen`, `screen`, `circuit`, `machine`, `muted=1`), con su censo, mando y
actualizaciones. Extender, sincro y secuencia los pinta `escena.html`, servida por el propio puente, con un reloj
común (`Date.now()` del PC) y las piezas del Stock bajadas una vez a `%LOCALAPPDATA%\AdmiraVentiladores\medios`.
Circuito `supercomputer`, equipo `METAHUMAN`, UA `AdmiraWindowsPlayer/tl-lcd-2.0`.

**Iluminación** (`luz`): efectos del controlador (apagado, fijo, arcoíris, respirar, ciclo, meteoro,
pista, ola, carrera), `color`, `brillo` 0–4 (o porcentaje), `velocidad` 0–4, `ventiladores` con luz propia
por número y `sigueVideo` (en sincro solo brilla el ventilador que tiene la pieza). «Respirar» es un
efecto de grupo y se aplica al puerto entero. El puente solo envía lo que cambia.

En **secuencia** la luz acompaña siempre al vídeo, sin `sigueVideo`: solo brilla el ventilador que tiene la pieza
y los demás quedan a brillo 0 (se revisa cada 250 ms, como en sincro con `sigueVideo`). Si la luz general es
`apagado` o `respirar` (de grupo: encendería a los vecinos), el activo pasa a `fijo` con su color; sin luz
configurada se usa verde fijo `#00d26a`, brillo 4.

**Otras luces de la caja** (`luz.dispositivos`, PC-COCINA, 6-nov-2026): sin luz propia siguen a la general, como
los ventiladores (no siguen el relevo de sincro/secuencia). `{"efecto":"fijo","color":"#00d26a","dispositivos":{"grafica":{"efecto":"arcoiris"}}}`.

| Clave | Alias | Qué | Cómo |
|---|---|---|---|
| `grafica` | gpu, pcie | cable Strimer Plus de la gráfica | `strimer.mjs`, USB `0CF2:A200`, puertos 6-11 (canal 2) |
| `placa` | atx, 24pin | cable Strimer Plus de 24 pines | mismo Strimer, puertos 0-5 (canal 1) |
| `superiores` | arriba, radiador, techo, top | los ventiladores del radiador (arriba, sin pantalla) | `galahad.mjs`, AIO Galahad II Trinity, USB `0416:7373`, orden `0x85` |
| `bomba` | pump, aio | los aros de la bomba | misma AIO, orden `0x83` (los dos aros) |
| `memoria` | ram, dram | la RAM (en PC-COCINA, 2 × DDR5 Lexar con controlador ENE) | **sin control**: va por SMBus y el puente no tiene driver para ese bus |

Strimer: informe 0xE0; por puerto, `[E0, 0x10|puerto, modo, velocidad, dir, brillo]` por característica y
`[E0, 0x30|puerto, 27 × (R, B, G)]` por salida; luego `[E0, 0x2C, 0x0F, 0xFF]` activa los 12 puertos. 40 ms entre
órdenes. Velocidad y brillo van al revés que en el controlador TL (0 = máximo). Referencia: `strimer_plus.rs` de
[sgtaziz/lian-li-linux](https://github.com/sgtaziz/lian-li-linux) (MIT). Los canales de PC-COCINA se comprobaron
con la webcam apagando uno cada vez. El informe trae `dispositivos` (`conectado`, `via` y `motivo` si no).

Galahad II Trinity: informe 0x01 de 64 bytes `[0x01, orden, 0, 0, 0, longitud, datos…]`; radiador `0x85` con 20 bytes (modo,
brillo 0–4, velocidad 0–4, 4 colores RGB, dirección, apagado, origen 0 = la propia AIO, sin sincro con la bomba, 24 LED) y
bomba `0x83` con 19 (los mismos con el ámbito delante, 2 = los dos aros). El saludo `0x81` da las RPM del radiador y de la
bomba (cada 10 s, con las de los ventiladores TL). Solo luz y lectura: nunca cambia velocidades. Referencia:
`galahad2_trinity.rs` de sgtaziz/lian-li-linux (MIT). En PC-COCINA, con `0x85` en rojo se tiñe de rojo el techo de la caja.
La placa de PC-COCINA (ASRock Polychrome USB `26CE:01A2`) tiene sus zonas en arcoíris, pero apagarla no cambia nada visible:
la memoria no va por ella.

**Audio** (`escena.audio`, PC-COCINA, 6-nov-2026): `{"ventilador": 1, "salida": "", "volumen": 1}`. Como mucho suena
un ventilador (`0` = ninguno, lo de antes; en repetir hay un solo canal y cualquier número es «con sonido»). Solo
su Chrome arranca sin `--mute-audio` (`launchChrome(…, { audio })`), con `muted=0&volume=` en el canal o
`audio=1&volumen=` en `escena.html` (suena la primera pieza; en extender y secuencia es la única). `salida` es el
nombre del dispositivo de Windows, el mismo que enseña Chrome (vacío = el predeterminado): la página lo busca por
nombre y usa `setSinkId`; para eso el puente concede el permiso de micrófono (`Browser.grantPermissions`) solo a
ese Chrome y solo si se pidió una salida concreta. El informe trae `audio.suena` y `audio.salidas` (los puntos de
reproducción de Windows). Cambiar el audio reinicia los dos players afectados. Comprobado en PC-COCINA con el
micrófono de la webcam: −36 dBFS con el ventilador 1 sonando frente a −47 dBFS silenciado.

La lógica de modos, luz y audio vive en `escena.mjs` (sin APIs de Node: la usan el puente, `escena.html` y la nube).

## Gemelo y nube

Cada 3 s el puente manda su informe (escena, luz, RPM, fps, envíos) y una miniatura de cada pantalla
(captura a tamaño real con calidad 40; una captura con `clip`+`scale` repinta la página a escala y el
screencast la mandaba al ventilador) a `https://www.admira.store/supercomputer/api/maquina` con su clave Bearer
(`~/.admira_supercomputer_key`), y recibe lo deseado por el gemelo. Si la revisión deseada es más nueva
que la aplicada, la aplica. La función de admira.store la reenvía al Worker `supercomputer`
(`nube/`, Durable Object; `npx wrangler@4 deploy` desde esa carpeta), que no usa KV.

`nube/worker.mjs` (y `nube-pc-cocina/worker.mjs`) importan `../escena.mjs`: el Worker solo acepta los modos que
conoce la `escena.mjs` con la que se desplegó (con una vieja, `secuencia` da «modo desconocido»). Si cambia
`escena.mjs`, hay que redesplegar el Worker y comprobarlo con una petición real: en PC-COCINA, el 6-nov, el
Durable Object siguió con el código viejo tras desplegar. Con una `escena.mjs` anterior al 6-nov-2026 (tarde), la
nube descarta además `luz.dispositivos` y `escena.audio`, y un cambio desde el gemelo los apaga.
Comprobarlo en `/estado`, que lo contesta el Durable Object (`/salud` solo prueba el Worker): en PC-COCINA el DO
siguió con el código viejo las dos veces que se desplegó el 6-nov, y en las dos se pasó a un DO con otro nombre
(`pc-cocina`, luego `pc-cocina-2`); el puente vuelve a sembrar lo deseado en su siguiente aviso.

Manda siempre lo más reciente: lo que llega del gemelo o de la API local se guarda en
`%LOCALAPPDATA%\AdmiraVentiladores\estado.json`; editar `config.json` también cuenta (su fecha es su revisión).

## Uso

```powershell
npm install
.\lconnect.ps1 pausar      # aviso de Windows; L-Connect deja de mandar sus vídeos y su RGB
npm start                  # emite; Ctrl+C para parar
.\lconnect.ps1 reanudar    # vuelven los vídeos, el RGB y las curvas de L-Connect
```

Arranque automático al iniciar sesión (tarea programada «Admira Player Ventiladores», con
privilegios altos para poder pausar L-Connect; log en `%LOCALAPPDATA%\AdmiraVentiladores\logs\player.log`):

```powershell
.\autoarranque.ps1 instalar   # aviso de Windows; arranca ya. Repetirlo reinicia el player
.\autoarranque.ps1 estado
.\autoarranque.ps1 quitar     # para el player, borra la tarea y reanuda L-Connect
```

Si cambia `config.json` o el código, el player sale y `arrancar.ps1` lo relanza en 5 s (sin elevación).
Si un perfil de Chrome sigue tomado por un Chrome que quedó vivo (pasó en PC-COCINA el 6-nov: el player se reiniciaba
en bucle con «Chrome no abrió el puerto de DevTools»), ese player se abre con el perfil de respaldo `<pantalla>-b`
(`perfil_ocupado` en el log). Los Chrome de un arranque fallido ya no quedan sueltos: `sincronizarPlayers` espera a
que terminen todos antes de dar el fallo.
`npm run dry-run` renderiza sin tocar el USB. `npm test` prueba protocolo, URL, modos, luz, Strimer y audio.

API local (solo `127.0.0.1:4749`):

| Ruta | Qué |
|---|---|
| `GET /health` | fps por pantalla, envíos por ventilador, RPM, estado de la nube |
| `GET /estado` | escena y luz aplicadas, informe completo |
| `POST /escena` | `{"modo":"sincro","pieza":"<id>","paso":3}` · `{"modo":"extend","pieza":"<id>","ajuste":"estirar"}` · `{"modo":"secuencia","pieza":"<id>","audio":{"ventilador":1}}` · … |
| `POST /duracion` | `{"pieza":"<id>","s":23.8}`: la manda `escena.html` en secuencia; solo vale para la pieza de la secuencia en curso |
| `POST /luz` | `{"efecto":"arcoiris","brillo":75}` · `{"efecto":"fijo","color":"#00d26a","ventiladores":{"7":{"color":"#ff0040"}}}` · `{…,"dispositivos":{"grafica":{"efecto":"arcoiris"}}}` |
| `GET /player/<n>.jpg` · `/fan/<n>.jpg` | último fotograma pintado / enviado |

`config.json` (sin secretos, versionado): `escena`, `luz`, `nube` (`{"api": "...", "claveFichero": "~/..."}`),
`screen`, `screenPrefix`, `circuit`, `machine`, `fps` (≤ 30), `quality`, `brightness`, `rotation`
(`{"7": 270}`), `numeros`, `numeracion` y `mantenerMs` (100–2000, 250 por defecto). El formato anterior (`mode` + `ids`) sigue valiendo.

`"numeracion": {"2:0": 7, "2:2": 5}` (PC-COCINA, 6-nov-2026): número lógico por `puerto:posición` (`renumerar` en `core.mjs`).
Sin ella, el número es el orden de la cadena (puerto y posición). En PC-COCINA la cadena del puerto 2 va de arriba abajo
y la columna tiene que subir desde el suelo (el 5 junto al 4, luego el 6 y el 7 arriba), para que la secuencia y el relevo
no salten del 4 al 7. Solo se aplica si el resultado es 1..N sin repetir (si no, `numeracion_error` en el log). La luz y
las RPM siguen yendo por puerto y posición. Ojo: editar `config.json` cuenta como revisión nueva y su escena gana a la del
gemelo al arrancar.

`"numeros": true` (desactivado si no está): cada ventilador enseña su número en un círculo encima del vídeo, arriba
y centrado. Se inyecta por CDP antes que los scripts de la página (`numeroEncima` en `player.mjs`,
`Page.addScriptToEvaluateOnNewDocument` vía la opción `encima` de `openPlayerPage` en `cdp.mjs`), así que
sobrevive a las recargas del canal y no toca `canal.html`. Solo en los players del canal con un único ventilador
(modo independiente): en repetir la misma imagen va a los 7, y las páginas de escena las pinta `escena.html`
(en identificar ya enseña el número). Activo en PC-COCINA desde el 6-nov-2026.

## Relevo con L-Connect

L-Connect 3 emite continuamente a las pantallas (modo sincronizado) y además gobierna el
RGB, la bomba Galahad II Trinity y las curvas de los ventiladores. Si los dos emiten a la vez
se pisan, así que mientras emite admira.tv su servicio queda **pausado** (solo parado: el
tipo de inicio no cambia y vuelve al reiniciar el PC). El player lee cada 10 s las RPM del
controlador y registra `fan_stopped` si algún ventilador marca 0. Nunca fija velocidades.

## Fallos del canal que el puente sortea

Con `?ids=` y arranque en frío, el canal puede quedarse en «DESCARGANDO CONTENIDOS 1/1 · …» con la pieza
ya en disco (no se llama a `maybeResumeCold()`). El puente lo detecta y recarga esa página, como haría
`hardreload`, como mucho una vez por minuto. Reportado en AgoraMatrix; no se parchea `canal.html`.

## Protocolo

Pantalla: informe HID de salida `0x02`, 512 bytes: `[0x02, cmd, tamaño total 4 BE, nº de paquete 3 BE,
longitud 2 BE]` + 501 bytes. Fotograma = JPEG 400×400 con `cmd 0x46` (streaming sin acuse).
`0x3E` lee serie/puerto/posición; el player nunca reescribe la serie.
Controlador: informe `0x01` de 64 bytes `[0x01, cmd, 0, 0, 0, longitud, datos]`. `0xA1` RPM,
`0xA3` luz por ventilador, `0xAD` grupos y `0xB0` luz de grupo (20 bytes: destino, efecto, brillo,
velocidad, 4 colores, dirección, apagado, nº de colores). Referencia:
[sgtaziz/lian-li-linux](https://github.com/sgtaziz/lian-li-linux) (MIT), `tl_lcd.rs`, `tl_fan` y `lianli-shared/rgb.rs`.

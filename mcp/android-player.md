# Player Android · guía operativa para agentes

Revisión 14-09-2026 · TrinityMBP14 · Yokup DCL-d35d57ad72c6b528c2cb0a87.

Esta guía describe el APK oficial `tv.admira.signage`, el canal web que carga y su relación con el player virtual de Xtore Zapatillas. Los estados observados llevan fecha; los ejemplos con `SERIAL`, `SCREEN`, `CIRCUIT` y `MACHINE` requieren valores descubiertos en el equipo, nunca copiados de otro player.

## 1. Entradas y fuentes de verdad

| Necesidad | Fuente |
|---|---|
| APK distribuido y su hash | https://admira.tv/player/android-release.json |
| Descarga | https://admira.tv/player/admira-player.apk |
| Versión web publicada | https://admira.tv/version.json |
| Descubrir herramientas MCP | https://mcp-tv.admira.store/ y `tools/list` en `/mcp` |
| Documentación nativa Android | `player_info {"platform":"android","section":"all"}` |
| Ayuda de uso | https://admira.tv/help/#android-player |
| Configurar playlist | https://admira.tv/parrilla/ con sesión autorizada |
| Mando | https://admira.tv/remotecontrol/ con sesión y alcance sobre la pantalla |
| Analizador de Zapatillas | https://admira.tv/videoanalytics/xtore/ |
| Estado de un equipo | `on_air {"screen":"SCREEN"}` |

Tres versiones independientes: **APK** (Kotlin/WebView y funciones nativas), **web** (`canal.html`, selección y reproducción) y **configuración** (identidad, playlist, modo, emparejamiento). El APK puede seguir en r16 y cargar un canal publicado hoy. Una instalación no modifica por sí sola la programación ni sale de standby.

El 14-09-2026, el manifiesto público declara `versionCode=7`, `versionName=AdmiraNeXTv.2026.15.08.r16`, 2.511.977 bytes y SHA-256 `5463dc627dd3ddeb5135eef61cd3893a568969a3d04c4700ed02312f758c3737`. **Volver a consultar el manifiesto en cada instalación.** El código del 13 de septiembre añade variantes sideload/Play; no acredita un APK público más nuevo.

## 2. Inventario USB y actualización que conserva datos

```sh
adb devices -l
adb -s SERIAL shell getprop ro.product.model
adb -s SERIAL shell getprop ro.build.version.release
adb -s SERIAL shell pm list packages --user 0
adb -s SERIAL shell dumpsys package tv.admira.signage
```

Usar `-s SERIAL` en todas las órdenes. `unauthorized` requiere aceptar la autorización USB en el equipo; `offline` requiere revisar conexión, cable y sesión ADB. En Samsung con perfiles secundarios, especificar `--user 0` evita errores de acceso a otros usuarios. No borrar perfiles para resolverlos.

`tv.admira.signage`, `com.admira.signage` y `com.admira.signage.preview` son paquetes distintos. Un versionCode 9 de una preview no es una actualización del versionCode 7 del APK oficial. Conservar las otras apps salvo encargo explícito de retirarlas.

```sh
curl -fL https://admira.tv/player/android-release.json -o android-release.json
curl -fL https://admira.tv/player/admira-player.apk -o admira-player.apk
shasum -a 256 admira-player.apk
# Comparar SHA-256 y tamaño con android-release.json antes de instalar.
# Si están disponibles Android SDK build-tools:
aapt dump badging admira-player.apk
apksigner verify --print-certs admira-player.apk
adb -s SERIAL install -r admira-player.apk
adb -s SERIAL shell am start -n tv.admira.signage/.MainActivity
adb -s SERIAL shell dumpsys package tv.admira.signage
```

`Success` confirma instalación, no emisión. Verificar versionName/versionCode y lastUpdateTime; abrir ficha local y comprobar contenido. `install -r` conserva datos. No usar `pm clear`, desinstalación, downgrade o una firma diferente como reparación automática: se pueden perder identidad, credenciales de dispositivo, caché y configuración.

`INSTALL_FAILED_UPDATE_INCOMPATIBLE` indica firma incompatible. El sideload actual usa una debug key específica de la máquina de distribución: compilar en otra máquina puede producir un certificado diferente. Obtener el artefacto firmado correcto. La variante Google Play usa otra cadena de distribución; un AAB no se instala con `adb install`.

## 3. Configuración nativa y alcance

El broadcast `tv.admira.signage.SET` admite **solo** seis extras string. Persiste únicamente los suministrados y recarga la actividad.

| Extra | Significado |
|---|---|
| `screen` | Identidad de pantalla; conservar el ID ya dado de alta |
| `machine` | Identidad para telemetría/mando; por defecto `android-<ANDROID_ID>` |
| `circuit` | Circuito; no confundir con screen |
| `tag` | Filtro de contenidos del canal |
| `muted` | `1/true/on/yes` o `0/false/off/no`; por defecto 1 |
| `volume` | 0..1 o porcentaje 0..100; separado del volumen Android |

```sh
# Ejemplo de cambio deliberado; sustituir marcadores y conservar lo no modificado.
adb -s SERIAL shell am broadcast --user 0 \
  -n tv.admira.signage/.ConfigReceiver -a tv.admira.signage.SET \
  --es screen SCREEN --es circuit CIRCUIT --es machine MACHINE \
  --es muted 1 --es volume 50
```

No hay extras nativos `mode`, `audience`, URL arbitraria, token ni pairing. No afirmar éxito por el acuse del broadcast: comprobar la ficha/telemetría tras recarga. El receptor exportado es una superficie local de administración, no una API autenticada de control remoto; ADB y MDM deben permanecer bajo control autorizado.

La URL nativa incluye `embed=mupi`, `fit=screen`, identidad, filtros/audio y `cb`. El User-Agent añade `AdmiraAndroidPlayer/<versión>` y `AdmiraKiosk`. `channel_url` construye un enlace web; no lo instala ni lo inyecta en las preferencias del APK.

## 4. MCP: descubrir, leer y actuar

Endpoint: `https://mcp-tv.admira.store/mcp`. Usar el descriptor vivo y `tools/list`: no deducir herramientas a partir de botones del Help. Ejemplo JSON-RPC de lectura:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"player_info","arguments":{"platform":"android","section":"diagnostics"}}}
```

`player_info` admite `platform: macos|android`, por defecto macos para mantener clientes existentes. Secciones comunes: `all`, `overview`, `features`, `releases`, `install`, `config`. Android añade `controls`, `conditional`, `diagnostics`. Es documentación, no telemetría ni ejecutor ADB.

| Herramienta | Uso y efecto |
|---|---|
| `on_air {screen}` | Lectura: item, estado disponible y telemetría. Comprobar fecha/frescura |
| `airtime_report {circuit}` | Lectura: pases/segundos registrados; no diagnóstico del altavoz |
| `channel_url {screen,circuit,...}` | Lectura: devuelve URL; no inicia una app |
| `player_virtual_list {screen?}` | Lectura del registro, paginada con cursor; no prueba online |
| `player_virtual_register {screen,name,circuit,mode?}` | Escritura autenticada, alta virtual idempotente; no abre navegador |
| `player_virtual_pair {device,screen,revision?}` | Escritura autenticada, vincula el físico; `screen:null` desvincula |
| `player_conditional_status {screen,target}` | Lectura de bus, reglas y modo; no prueba visual |
| `player_xtore_map {}` / `player_embed {screen,circuit}` | Mapas/enlaces del piloto remoto; no sustituyen el perfil musical |
| `player_consume_label {...}` | Escribe una categoría en el bus, puede cambiar emisión real |
| `player_smoke {screen}` | Inyecta etiquetas y comprueba bus; simulación, no detección real |
| `player_conditional_set {...}` | Sustituye reglas del target; no usar para diagnosticar un Fold |
| `player_autolink_run {force?}` | Puede reescribir reglas del piloto Xtanco |
| `player_autolink_notify_test {text?}` | Envía Telegram; requiere autorización de comunicación |

Las escrituras MCP exigen clave de flota válida del agente, sin publicarla en informes, ejemplos o URLs. La sesión del portal y la credencial del dispositivo son contratos distintos. Un 401 no se resuelve quitando la autenticación.

Este MCP no expone `player_install`, `player_resume`, `player_screenshot` ni `player_reboot`. Usar ADB autorizado para instalación/local y el mando autenticado para control web. Las órdenes de mando incluyen `resume`, `standby`, `toggle-mute`, `next` y `hardreload`; confirmar el contrato del mando antes de enviar. `reload` refresca feed; `hardreload` recarga página e interrumpe reproducción.

## 5. Emparejar el Fold con Zapatillas

1. Descubrir **el screen del APK abierto**, mediante doble toque → ficha Contenido en antena o telemetría. No usar otro paquete que esté instalado como sustituto de identidad.
2. Leer `GET https://admira.tv/api/virtual-players?device=SCREEN`: conservar `revision` y `source` anteriores.
3. Leer `player_virtual_list {"screen":"xtore-virtual-zapatillas"}` y confirmar el virtual/circuito correctos.
4. Con autorización sobre ese destino, ejecutar:

```json
{"name":"player_virtual_pair","arguments":{"device":"SCREEN","screen":"xtore-virtual-zapatillas","revision":0}}
```

El `0` es un ejemplo: utilizar la revisión leída. Ante conflicto, releer y resolver la intención; no sobrescribir a otro operador. El canal consulta pairing cada 15 s y recarga al cambiar revisión. Adopta origen de playlist, modo y reglas del virtual, conservando su identidad física. La coincidencia de categoría no promete sincronía exacta de fotogramas.

5. Releer pairing, comprobar la emisión del físico y el estado del bus virtual. Para deshacer, restaurar la asociación anterior con la revisión actual; usar null solo si antes estaba desvinculado.

No cambiar el screen físico a `xtore-virtual-zapatillas`: mezclaría identidades. Un registro virtual no crea hardware ni proof-of-play.

## 6. Cámara → categorías → música

Abrir Digital Twin → Store/Entrada/Puerta Cam. En Xtore, «Arrancar cámara y análisis» requiere seleccionar la pestaña en el selector nativo. Restaura geometría compatible y arranca si el preset es válido; sin marcas queda conectado para encuadrar. «Compartir sin analizar» conserva el arranque manual. No es un HLS que el APK conecte solo.

El detector local COCO reconoce persona/coche/moto/bici. No estima sexo, edad, identidad ni atención; patinetes son manuales. No inferir esos datos a partir de vestimenta, colores de cajas o reglas del piloto genérico.

| Categoría | Regla musical del perfil Zapatillas |
|---|---|
| Persona | Berlin — Take My Breath Away, `1786533143983-n2y09e` |
| Coche / moto | Huey Lewis — The Power of Love, `1786532932584-a1412h` |
| Bici | AZUL Y NEGRO — Me estoy volviendo loco, Pixeria #998, `1789214248874-j6qqjo`, desde el 50% de duración real |
| Sin presencia válida o pieza compatible | Playlist base |

Prioridad bici > moto > coche > persona. Presencia confirmada quieta puede mantener contenido; conteo exige movimiento. Persona+bici pueden contar ambos pasos. Repetir presencia no reinicia la pieza. La base asociada tiene prioridad; sin asociación, el virtual toma los últimos cinco musicales con etiqueta exacta normalizada #musica. No trasladar esa política automáticamente a un físico no emparejado.

El relé `/api/audiencia-virtual` recibe solo `{screen,kind}` desde mismo origen y sesión autorizada. Requiere rol operator/editor/admin/owner, registro virtual y configuración de clave en servidor. Transmite categoría; no imágenes ni cajas. `none` no publica: deja caducar el bus. Que el player local funcione no acredita que el relé esté autenticado.

Los tiempos tienen ámbitos diferentes: presencia local 1,5 s; cola musical de vehículos +2 s (3,5 s total); respaldo/manual del hijo 6 s; TTL de bus remoto 2 s y mínimo neutro 6 s. No resumirlos como un único retorno garantizado. La política `xtanco-totem` genérica y sus carriles Matrix/TopGun por sexo no es la detección local de Zapatillas.

XpaceOS replica player/cámara entre ventanas autorizadas del mismo navegador. Con gemelo enlazado y latidos frescos puede continuar el análisis oculto. Sin enlace fresco se suspende. Pausa manual no se revierte sola. H modifica solo el previo ROI; el iPad conserva el original según la implementación del domingo. H no garantiza anonimización ni es grabación de seguridad.

## 7. Verificación y diagnóstico

| Observación | Comprobación / siguiente acción |
|---|---|
| Fondo vacío, equipo online | Leer standby, pausa y item; standby persiste tras reinstalar |
| Standby verdadero | Reanudar con mando autorizado; verificar item y reproducción, no solo acuse |
| Playlist vacía | Revisar screen, asociación, filtros, catálogo y conectividad antes de editar reglas |
| Hay imagen, no sonido | Mute/volumen del player, volumen multimedia Android, Bluetooth/salida física |
| Bus cambia, físico no cambia | Pairing exacto, última recarga, URL/origen de audiencia y reglas del perfil |
| Local funciona, remoto no | Sesión/rol del relé, configuración servidor, errores 401/403/503 |
| Actualizar APK no cambia web | Comparar playerVersion y webRelease; recarga del canal conservando datos |
| Giro o plegado incorrecto | Revisar superficie activa, orientación del sistema y giro interno del canal por separado |
| Captura inválida | Elegir display y guardar PNG en dispositivo antes de adb pull |
| Dispositivo sin respuesta | Actividad, proceso, logs de ese PID, conectividad y límites del fabricante |

```sh
adb -s SERIAL shell dumpsys activity activities
adb -s SERIAL shell pidof tv.admira.signage
adb -s SERIAL logcat -d --pid=PID
adb -s SERIAL shell dumpsys SurfaceFlinger --display-id
adb -s SERIAL shell screencap -d DISPLAY_ID -p /sdcard/Download/admira-player.png
adb -s SERIAL pull /sdcard/Download/admira-player.png ./admira-player.png
```

En un Fold hay dos displays. Elegir el activo; sin `-d`, Android advierte que la elección no está garantizada. Los logs/capturas pueden contener datos del equipo: adjuntar solo evidencia pertinente, sin credenciales ni otras apps.

Criterios de aceptación independientes: instalación (`Success` + versión), arranque (actividad), conexión (telemetría fresca), selección (item), reproducción (tiempo/fotogramas avanzan), audio (salida observada), condición real (pasante → detección → pieza → retorno) y continuidad (pérdida/recuperación). Un acuse, una miniatura o una prueba simulada no sustituyen el siguiente nivel.

## 8. Evidencia de esta intervención y trabajo posterior

14-09-2026: Galaxy Z Fold5 SM-F946B, Android 16. Reinstalación oficial r16 con hash correcto y `install -r`: Success. Actividad nativa en primer plano; ficha local accesible por doble toque; telemetría informa r16 y web r20 del 13 de septiembre. Estado heredado: standby, sin item; pairing revision 0/source null. No se borraron datos ni se retiraron las otras dos apps. No se acredita plegado físico, audio, cámara en vivo ni reproducción desde la instalación por el mero arranque.

Para mejorar: guardar una referencia antes/después, cambiar una sola capa por prueba, conservar fallback y probar pérdida de red/label. Tests de contratos y mocks no miden precisión del detector en calle. Cada cambio visible debe llevar minitutorial oficial exportado y verificado, identificado como grabación o animación, y quedar vinculado a su misión Yokup.

Código: https://github.com/csilvasantin/admira-player/tree/main/android · https://github.com/csilvasantin/admira-tv · https://github.com/csilvasantin/admira-tv-mcp . Consultar sus revisiones y contratos actuales antes de actuar.

Minitutorial oficial: https://admira.tv/help/tutorials/player-android-usb-mcp.mp4 — guía animada de ADmira Motion, no grabación del dispositivo. Exportación WEBM convertida a MP4 H.264/AAC y fotogramas revisados.

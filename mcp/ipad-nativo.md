# Player nativo de iPad · Admira Player (v0.1 · 9-oct-2026)

Player **nativo** de admira.tv para iPad: SwiftUI + AVPlayer, sin WKWebView. Emite lo mismo que `canal.html` para una
pantalla (su «Por defecto», la parrilla y el Stock), descarga a disco antes de emitir, sigue sin red y **informa a
admira.tv** de lo que emite, así que «Qué emite» (`/emision/`) ve la pantalla viva.

Repositorio **privado** (hace falta acceso de lectura en GitHub):

- https://github.com/csilvasantin/admira-player-ipad — `README.md` (instalar, kiosko, uso en el iPad)
- https://github.com/csilvasantin/admira-player-ipad/blob/main/docs/contrato-player.md — qué hace exactamente el
  player web y qué replica la v1 (§8 alcance, §9 diferencias intencionadas)
- https://github.com/csilvasantin/admira-player-ipad/blob/main/tools/instalar-ipad.sh — compilar, firmar, instalar y
  abrir por USB
- Copia local en el Mac Mini: `~/Documents/Admirito/github-csilvasantin/admira-player-ipad`

Ayuda para personas: https://admira.tv/help/#ipad-nativo · Cómo probar en el iPad por USB:
https://admira.tv/mcp/ipad-pruebas.md

## 1. Qué hace la v1 (resumen del contrato)

| Tema | v1 nativa |
|---|---|
| Lecturas | `GET /api/playlist?screen=…&player=1&w=&h=` cada 30 s · `GET api.admira.store/grid/day?screen=` cada 60 s · Stock (`/stock/list?limit=300`) cada 30 s. Las mismas URLs y pistas que `canal.html` |
| Orden de emisión | «Por defecto» (+ lo dirigido por #hashtag) si tiene piezas y no hay reservas own/paid con creatividad en la franja; si no, Stock (`#default` › cortafuegos › todo, máx. 50) con la parrilla cada 4 piezas, o la 50/50 sola. Paridad con `decide()` de `_emision.js` comprobada en 16 escenarios (`tools/paridad-emision.mjs`) |
| Duraciones | Vídeo hasta el final; imagen por su ranura (9 s o la del borrador/parrilla); audio por su ranura o su duración |
| Caché | **Disco primero**: sólo emite lo descargado; arranque en frío con «DESCARGANDO CONTENIDOS»; descargas reanudables; LRU por bytes (4 GiB) |
| Continuidad | Un cambio de cola **nunca corta** la pieza en curso: entra al acabar. Sin red sigue con la última cola buena (también tras reiniciar la app) |
| Informes | `POST /signage/now` (al empezar cada pieza y latido cada 60 s) · `/control/playlist` (si cambia la lista) · `/screen/cache` (cada 30 s si cambia) · `/emit` (proof-of-play diario) |
| Sonido | **Activado** por defecto (el web arranca silenciado por las políticas del navegador) |
| Servicio | Pulsación larga de 1,5 s: pantalla, versión, qué emite y de qué capa, red, caché, pases de hoy, sonido, ajuste y «Cambiar pantalla». Se cierra sola a los 30 s |

**Fuera de la v1**: sincro, mural extendido, hashtag del mando, Xtore, órdenes del mando (`/locations/cmd`: standby,
siguiente, volumen…), Xperiencias interactivas (se saltan al emitir), capturas `/signage/shot`, cámara/audiencia,
autoactualización. Un vídeo AV1 en un iPad sin decodificador AV1 **se salta** (el web prueba antes `asset-h264.mp4`).

## 2. Verificado

9-oct-2026, «iPad de Admin» (iPad7,1, iPadOS 17.7.11), pantalla `altadis-bcn-001-p1-vertical` (una de las 18 pantallas
**de prueba** de Altadis BCN): emite, y `GET /api/emision?screen=altadis-bcn-001-p1-vertical` muestra
`observado.vivo: true`.

## 3. Instalar

**Una vez por Mac**: Xcode con la licencia aceptada (`sudo xcodebuild -license accept`), la plataforma iOS
(`xcodebuild -downloadPlatform iOS`), XcodeGen (`brew install xcodegen`) y un Apple ID en Xcode → Ajustes → Cuentas.

**Una vez por iPad**:

1. Conectarlo por cable, desbloquearlo y pulsar «Confiar en este ordenador» (con el código).
2. iPadOS 16 o posterior: Ajustes → Privacidad y seguridad → **Modo de desarrollador** (pide reiniciar).
3. Tras la primera instalación: Ajustes → General → **VPN y gestión de dispositivos** → «Apple Development: …» →
   **Confiar**. Hasta entonces iPadOS dice «Desarrollador no fiable» y no abre la app.

**Cada instalación** (desde la carpeta del repo):

```bash
tools/instalar-ipad.sh <pantalla>          # p. ej. tools/instalar-ipad.sh altadis-bcn-001-p1-vertical
```

El script genera el proyecto (XcodeGen), compila y firma para el iPad conectado (`xcodebuild … -allowProvisioningUpdates
-allowProvisioningDeviceRegistration`), instala (`xcrun devicectl device install app`) y abre la app con
`-admira.pantalla <pantalla>`. Variables: `EQUIPO` (por defecto el Personal Team gratuito de Carlos), `BUNDLE`
(`com.csilvasantin.admiraplayer`) y `UDID` (por defecto, el primer iPad emparejado). Sin argumento, la app pide la
pantalla en el primer arranque.

> **Usa una pantalla de pruebas.** La app informa a admira.tv **como esa pantalla** (latido, playlist publicada,
> inventario y proof-of-play). Con el id de una pantalla real de la flota, «Qué emite» y el informe de emisión
> mezclarían este iPad con el player de verdad.

### Caduca a los 7 días

Firma con el **Personal Team gratuito** de Carlos y bundle `com.csilvasantin.admiraplayer`: el perfil dura **7 días**.
La instalación del 9-oct **caduca el 16-oct-2026**; pasado ese día la app no abre. Renovar = conectar el iPad y volver a
ejecutar `tools/instalar-ipad.sh` (o Run en Xcode). No se pierden ni la pantalla configurada ni la caché. Límites del
equipo gratuito: 3 apps por dispositivo y 10 ids de app nuevos por semana.

## 4. Kiosko (Acceso guiado)

iPadOS no deja que una app arranque sola al encender. Para fijarla en pantalla:

1. Ajustes → Accesibilidad → **Acceso guiado**: activarlo y poner un código.
2. Bloqueo automático de la sesión: **Nunca** (la app mantiene la pantalla encendida mientras emite).
3. Abrir Admira Player, **triple clic** en el botón lateral (o el de inicio) → Opciones: desactivar botón
   lateral/superior y volumen; dejar Táctil si se quiere la superposición de servicio → **Iniciar**.
4. Salir: triple clic y el código.

Un kiosko «duro» (que vuelva a la app tras reiniciar) necesita un iPad supervisado (Apple Configurator o MDM) y el
modo de app única (Single App Mode).

## 5. Verificar en «Qué emite»

1. Abrir https://admira.tv/emision/?screen=<pantalla> (sesión del portal) o pedir
   `GET /api/emision?screen=<pantalla>`.
2. `observado.vivo: true` = latido en `/signage/now` hace menos de 5 min; `observado.ahora` = la pieza que el iPad dice
   emitir; `observado.publicada.coincide: true` = su cola es la predicha.
3. En el iPad, pulsación larga de 1,5 s: la superposición dice la capa, la caché y la última sincronización.

Si `vivo` es `false`: la app no está abierta, está sin red, o la firma caducó (la app no abre). Ver
https://admira.tv/mcp/emision.md para el resto de campos.

## 6. Preguntas abiertas (decide Carlos)

- Qué id de pantalla lleva cada iPad (uno por aparato: dos aparatos con el mismo `screen` se pisan).
- Pasar a la firma de pago (equipo Admira Digital Networks S.L., `JTVR8HASG7`, un año) y distribuir por TestFlight.
- Si sustituye al envoltorio WKWebView `admiranext-player-ios`.
- Sonido por defecto (hoy activado en el nativo, silenciado en el web).
- AV1 frente a H.264: usar la variante `asset-h264.mp4` del Stock cuando el iPad no decodifica AV1.
- Nombre definitivo de la app e icono.
- Órdenes del mando en la v2 (standby, siguiente, volumen…), además de sincro, mural y hashtag.

## Relacionado

- Las 18 pantallas de prueba de Altadis BCN (circuito `altadis_bcn`, nombres acabados en «· PRUEBA») se dieron de alta
  en la parrilla el 9-oct y se programaron de verdad con «I want true love · Altadis» (vertical/horizontal) desde
  «Programar players» de Pixeria: https://github.com/csilvasantin/pixeria/blob/main/docs/adaptador.md
- Contrato del player web: https://admira.tv/mcp/player-contract.md

## EN · summary

Native iPad player for admira.tv (private repo `csilvasantin/admira-player-ipad`, SwiftUI + AVPlayer, v0.1 of
9 Oct 2026). It plays the default playlist, grid bookings and Stock exactly like `canal.html` (parity with
`_emision.js` in 16 scenarios), caches to disk first, keeps playing offline and reports to `/signage/now`,
`/control/playlist`, `/screen/cache` and `/emit`, so `/emision/` shows it alive. Verified on 9 Oct on the "iPad de
Admin" (iPadOS 17.7.11) as `altadis-bcn-001-p1-vertical` (`observado.vivo: true`). Install with
`tools/instalar-ipad.sh <screen>` over USB; free Personal Team signing expires after 7 days (current install: 16 Oct
2026) and needs a reinstall. Kiosk via Guided Access. Out of v1: sync, extended wall, remote hashtag, Xtore and remote
commands.

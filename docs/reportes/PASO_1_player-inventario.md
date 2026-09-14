# PASO 1 · Inventario de versiones del player (Android · iOS/Apple · Windows) — 14-sep-2026

Misión FLT-100421 · encargo #3278 (HandON de Carlos vía Neo) · MorfeoMacMini · MacMini.
Fuentes: repos locales `admira-player` (ca0edd0, 13-sep), `admiranext-player-ios` (e867756, 12-sep), `admira-signage-app` (399630b, 6-sep), `admira-tv` (e3d1e17, 7-sep), `pixer-worker`. Cifras con ruta:línea en los inventarios por plataforma que resume este documento.

## 1. Qué player vive en cada plataforma

| Plataforma | Repo / carpeta | Estado | Id de app | Versión declarada | Sello AdmiraRelease |
|---|---|---|---|---|---|
| Android | `admira-player/android` (Kotlin) | **vivo**; publica admira.tv/player | `tv.admira.signage` | versionCode 7 · `AdmiraNeXTv.2026.15.08.r16` (`android/app/build.gradle.kts:18-19`) | el propio versionName |
| Android (antiguo) | `admira-signage-app` (Java) | **retirar**: nadie lo referencia | `com.admira.signage` | versionCode 11 · `AdmiraNeXTv.2026.06.09.r10` | — |
| iOS/iPadOS | `admiranext-player-ios` · target AdmiraNeXTPlayer | **vivo** (commits sep-2026, onboarding, latido nativo) | `tv.admira.player.ipad` | 1.0 (3) · iOS 15+ (`project.yml:15-18`) | `v.12.09.2026.r1.22:30` (`Info.plist:5-6`) |
| iOS (linaje anterior) | `admira-player/AdmiraApple` (iPhone/iPad/Vision) + `AdmiraPlayer` | congelado 14-ago; **colisiona** con el id `tv.admira.player.ipad` | `tv.admira.player.{iphone,ipad,vision}` | 26.08.14 (5/3/3) | — |
| tvOS | `admira-player/AdmiraTV` | player paralelo (AVPlayer, R2 público, sin canal) | `tv.admira.player.tv` | 26.06.27 (1) | — |
| macOS | `admira-player/AdmiraSignageMac` | vivo (kiosko WebView universal) | `tv.admira.signage.mac` | 1.7 (7) | `v.13.08.2026.r13.13:15` |
| Windows / Linux | `admira-player/electron` (Electron) | vivo pero **sin sello ni CI** | `tv.admira.signage` | `1.0.0` (`electron/package.json:4`) mientras admira.tv/player publica `v.26.06.27.r1` | — |
| Web / canal | `admira-tv/canal.html` | base común que embeben todos | — | `v.07.09.2026.r1.06:05` (version.json) | sí |

## 2. Contrato de sincronización (lo que de verdad hace cada uno)

Los shells nativos **no hablan con la API salvo excepciones**: cargan `canal.html` y es el canal quien sincroniza. Excepciones: Android (OTA `GET /player/android-release.json` cada 30 min, SHA-256), iOS (alta `POST api.admira.store/locations/register` en cada arranque), macOS (`?vcheck` cada 600 s y reporte de flota cada 300 s), tvOS (contrato propio: `stock/index.json` en R2, sin canal).

Canal común (`admira-tv/canal.html`): stock `GET api.admira.store/stock/list` cada 30 s · parrilla `GET /grid/day` cada 60 s · playlist por defecto `GET admira.tv/api/playlist?screen=` cada 30 s · sincro `GET brain.digitalavatar.ai/sync/state` cada 30 s · espejo `POST /signage/now` por pieza + 60 s (dedupe 90 s en servidor) · caché `POST /screen/cache` cada 55 s · proof-of-play `POST /emit` con debounce 60 s · mando `GET brain…/control/cmds` 2,5→10 s con credencial `Authorization: Device` (enroll) **y** cola legacy `/locations/cmd` sin auth. Sin versión de API: el versionado va implícito en claves KV (`admira-tv:playout:v1`, `…playlist:default:v1`).

Semántica offline (canal): disco-primero en Cache API `admira-canal-v1`, catálogo en `localStorage['adtv_catalog']`, loop en caché con `source:'cache'`; `?stream=1` la desactiva. Servidor: `/api/playlist` con `seconds` por ítem y `rev` (409 `revision_conflict`); `/grid/playlist` **sin duración** (la descubre el player).

Identidad: por `screen` + `producer`; el servidor reconoce por User-Agent `AdmiraMacOSPlayer/`, `AdmiraAndroidPlayer/`, `Admira(TV|Player)/`. **`AdmiraWindowsPlayer/` y `AdmiraLinuxPlayer/` no estaban en la lista** (arreglado hoy en canal.html: se reportan ya como player nativo con versión).

## 3. Tabla de diferencias

| Aspecto | Android | iOS (vivo) | Windows (Electron) | macOS | tvOS |
|---|---|---|---|---|---|
| URL de arranque | `www.admira.tv/canal.html?embed=mupi&fit=screen…` | `admira.tv/canal.html?clean=1&mobile=1…` | `www.admira.tv` (redirige por UA) | `admira.tv/canal` | no usa canal |
| Formato de versión | `AdmiraNeXTv.AAAA.DD.MM.rN` + versionCode | SemVer 1.0 (3) + AdmiraRelease | SemVer 1.0.0 (publicado v.26.06.27.r1 a mano) | 1.7 (7) + AdmiraRelease | 26.06.27 (1) |
| Latido nativo (`AdmiraNative.beat` / `messageHandlers.beat`) | **no implementado** (solo watchdog) | sí (recarga a 180 s) | no (ping 60 s×3 del main) | — | — |
| OTA / autoupdate | sí, SHA-256, 30 min (variante sideload) | no (TestFlight/App Store) | **no** | recarga web por `?vcheck` | no |
| Caché disco-primero | sí (`fit=screen`, sin stream) | sí | sí | sí | no (sin caché) |
| Identidad `machine` | `android-<ANDROID_ID>` | **no envía `machine`** | hostname si se configura | `player-<host>` estable | ninguna |
| Config de flota | broadcast `tv.admira.signage.SET` | UserDefaults + setup.html | `config.json` / `--screen` / env | `defaults write` | — |
| Firma / distribución | debug key en sideload (**riesgo**), `upload` por entorno para Play | firma automática, team de empresa | **sin firma de código**, sin CI (README promete un workflow inexistente) | zip universal + LaunchAgent | — |
| Tests | 6 JUnit (sin JDK/SDK aquí) + 3 node OK | 0 XCTest; 3+12 node OK | 0 (solo half-size de macOS) | half-size 3/3 | 0 |

## 4. Riesgos a cerrar antes de alinear versiones
1. **Cuatro formatos de versión**: solo `AdmiraRelease` (sello `v.DD.MM.AAAA.rN.HH:MM`) es común a iOS y macOS; Android lo deriva; Windows y tvOS no lo tienen. Propuesta en §5.
2. **Colisión de bundle id** `tv.admira.player.ipad` entre `admiranext-player-ios` y `admira-player/AdmiraApple`: subir a TestFlight desde el repo equivocado es posible. Archivar `AdmiraApple`/`AdmiraPlayer`.
3. **`admira-signage-app`** con versionCode 11 > 7 y otro applicationId: si alguien firma desde ahí, publica una app distinta. Retirar.
4. **APK sideload firmado con debug key** de una máquina: recompilar en otra rompe la OTA de toda la flota. Custodia del keystore en la Cúpula.
5. **Windows sin firma, sin CI, sin OTA, sin sello**: los `.exe` publicados no son reproducibles desde el repo.
6. **Latido nativo ausente en Android y Windows**: el canal lo espera y no lo recibe.
7. **Dos planos de mando** (`/control/cmds` con credencial y `/locations/cmd` sin auth) y reglas de `screen` distintas por endpoint.

## 5. Contrato único propuesto (para el PASO 2 de código; no aplicado aún en nativos)
- **Versión**: un único `AdmiraRelease = v.DD.MM.AAAA.rN.HH:MM` sellado por `tools/sella-players.sh` en los tres shells (Android ya; iOS Info.plist ya; Windows → `package.json.version` + `AdmiraRelease` en `config.js`), y semver alineado **3.0.0** con build = número correlativo compartido (`versionCode` = `CURRENT_PROJECT_VERSION` = build de Electron). El UA lleva siempre `Admira<Plataforma>Player/<AdmiraRelease>`.
- **URL de arranque** única: `https://www.admira.tv/canal.html?embed=mupi&screen=&circuit=&machine=` (sin `stream=1`; `clean/mobile` los deduce el canal por UA).
- **Latido**: los tres shells exponen `AdmiraNative.beat()` (Android `@JavascriptInterface`, Electron por preload/IPC) con recarga a 180 s como iOS.
- **Actualización**: manifiesto firmado por plataforma (`/player/<plataforma>-release.json` con SHA-256) para sideload/Windows; Play/App Store sin OTA propia.
- **Mando**: un solo plano (`/control/*` con credencial de dispositivo) y una sola regla de `screen` (`^[a-z0-9][a-z0-9-]{1,79}$`).

Suites hoy: admira-tv 268/270 (2 rojos ajenos: `rg` no instalado; `orden.test` censo `tester`), pixer-worker 75/75, node de players 21/21; JUnit y Xcode no ejecutables en el MacMini (sin JDK/Android SDK ni Xcode completo).

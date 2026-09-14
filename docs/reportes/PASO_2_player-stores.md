# PASO 2 · Preparación de publicación en Google Play y App Store — checklist de bloqueos (14-sep-2026)

Misión FLT-100421 · encargo #3278 · MorfeoMacMini · MacMini. **Nada se publica sin sello de Carlos.**

## Google Play (Android · `admira-player/android`, variante `play`)
| Punto | Estado | Bloqueo / siguiente paso |
|---|---|---|
| Variante Play sin OTA ni `REQUEST_INSTALL_PACKAGES` | ✅ hecha (13-sep, FLT-100400) | — |
| AAB firmado | ⛔ | `./gradlew bundlePlayRelease` exige `ADMIRA_UPLOAD_STORE_FILE` (keystore de upload); no hay keystore en repo (correcto) ni JDK/SDK en el MacMini. Hace falta la máquina de build con la Cúpula. |
| Play Console: ficha (título, descripciones, categoría) | ⛔ | no existen textos ni assets de listing en el repo |
| Screenshots + feature graphic | ⛔ | no hay carpeta de capturas |
| Política de privacidad | ✅ `admira.tv/player/privacidad.html` (06-09-2026) | enlazar en la ficha |
| Data safety | ⛔ | cuestionario pendiente; base: telemetría a api.admira.store, sin IDs publicitarios |
| Target API | ✅ targetSdk 35 | — |
| Justificaciones | ⚠ | `screenOrientation=fullSensor` y `category HOME` en manifest; app sin UI de configuración → instrucciones para el revisor |
| versionCode de Play vs OTA | ⚠ | comparten contador (`build.gradle.kts:18`): definir cuál avanza |

## App Store (iOS · `admiranext-player-ios`)
| Punto | Estado | Bloqueo / siguiente paso |
|---|---|---|
| ExportOptions TestFlight (`app-store-connect`, firma automática) | ✅ | — |
| Archive reproducible | ⛔ | sin `.xcscheme` compartido; `xcodegen` y Xcode completo no están en el MacMini (solo CLT) |
| Provisioning | ✅ automático, team de empresa | — |
| Export compliance | ✅ `ITSAppUsesNonExemptEncryption=false` | — |
| Privacy manifest `PrivacyInfo.xcprivacy` | ⛔ | usa UserDefaults e `identifierForVendor`: hay que declarar razones |
| Nutrition labels (App Store Connect) | ⛔ | pendiente |
| Screenshots (iPhone/iPad) | ⛔ | no hay |
| `NSAllowsArbitraryLoads=true` | ⚠ | todo va por HTTPS: quitarlo antes de la revisión |
| Colisión de bundle id con `AdmiraApple/AdmiraiPad` | ⛔ | archivar el linaje viejo o cambiarle el id |
| Iconos | ⚠ | solo `AppIcon-1024.png` |
| Autoarranque | ℹ | no existe en iOS (Acceso Guiado/MDM): reflejarlo en la promesa de flota |

## Windows (no hay tienda; distribución propia)
Sin firma de código (SmartScreen), sin CI (el workflow que cita el README no existe), sin sello (`1.0.0` vs `v.26.06.27.r1` publicado), sin autoupdate. Antes de repartir a terceros: certificado OV/EV + timestamp, workflow de build, `windows-release.json` con SHA-256 y autoarranque.

## Qué puede hacer la flota sin Carlos
Redactar ficha y textos de listing, generar capturas desde el canal, añadir `PrivacyInfo.xcprivacy`, quitar `NSAllowsArbitraryLoads`, archivar linajes viejos, implementar `AdmiraNative.beat` en Android y Electron, sellar Electron. Lo que exige a Carlos: keystore de upload (Play), cuenta App Store Connect/TestFlight y el sello para publicar.

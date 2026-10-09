# Probar en el iPad por USB · guía para agentes (9-oct-2026)

Cómo un agente del Mac Mini mira y conduce el **«iPad de Admin»** (iPad7,1, iPadOS 17.7.11) conectado por USB-C, para
verificar páginas de admira.tv en Safari del iPad (p. ej. la parrilla, #65–#67) y el player nativo
(https://admira.tv/mcp/ipad-nativo.md). Todo es local al Mac Mini: no hay servicio remoto ni herramienta MCP para esto.

Herramienta: **pymobiledevice3** 11.26.0 en un entorno virtual propio:

```bash
P=~/Claude/tools/ipad-venv/bin/pymobiledevice3
```

## 1. Requisitos en el iPad (los activa una persona, una vez)

| Ajuste | Dónde (iPadOS 17; en 18+ está en Ajustes → Apps → Safari) | Para qué |
|---|---|---|
| Emparejado con el Mac | Al conectar: «Confiar en este ordenador» + código | Todo |
| Modo de desarrollador | Ajustes → Privacidad y seguridad → Modo de desarrollador (reinicia) | Capturas, abrir apps, instalar el player |
| Inspector web | Ajustes → Safari → Avanzado → Inspector web | `webinspector …` (pestañas, JS, CDP) |
| Automatización remota | Ajustes → Safari → Avanzado → Automatización remota | `webinspector launch` y sesiones `--automation` |

Si `"$P" webinspector opened-tabs` dice que no está habilitado, hay que pedir a Carlos los dos interruptores de Safari;
no hay forma de activarlos desde el Mac.

## 2. Comandos

```bash
"$P" usbmux list                                   # ¿está conectado? UDID, modelo, versión
"$P" mounter auto-mount                            # imagen de desarrollo (hay que repetirlo tras reiniciar el iPad)

"$P" developer dvt screenshot /ruta/captura.png    # captura de pantalla SIN sudo (en iOS 17 abre solo un túnel de usuario)
"$P" developer dvt launch com.apple.mobilesafari   # abrir una app por bundle id
"$P" developer dvt launch com.apple.Preferences
"$P" developer dvt launch com.csilvasantin.admiraplayer   # el player nativo, si está instalado y firmado

"$P" webinspector opened-tabs                      # pestañas de Safari abiertas
"$P" webinspector launch "https://admira.tv/emision/?screen=altadis-bcn-001-p1-vertical"
"$P" webinspector js-shell                         # consola JS contra una página abierta (inspector, sin automatización)
"$P" webinspector js-shell --automation --url "https://admira.tv/help/"   # sesión de automatización nueva
"$P" webinspector cdp                              # puente CDP en http://127.0.0.1:9222/
```

**Puente CDP.** `webinspector cdp` sirve en `http://127.0.0.1:9222/` una portada con las páginas inspeccionables y el
frontal de DevTools conectado directamente al puente (mejor que `chrome://inspect`, que se bloquea con mucho tráfico de
consola). Los clientes compatibles con Chrome (DevTools, VS Code, Playwright o Puppeteer) se conectan por el endpoint
que anuncia `/json/version`. Sirve para leer el DOM, medir (`getBoundingClientRect`), ejecutar JS y ver la red de una
pestaña de Safari del iPad.

`developer screenshot` (lockdown) **no funciona** en este iPad: usar `developer dvt screenshot`.

## 3. Receta típica: verificar una página en el iPad

1. `usbmux list` y `mounter auto-mount`.
2. Abrir la página: `webinspector launch "<url>"` o, si necesita la sesión del portal, pedir a Carlos que la abra en
   Safari con su sesión (ver trampas).
3. Captura: `developer dvt screenshot` y mirarla.
4. Medir con `js-shell` o el puente CDP (anchos de columna, `readyState` de los vídeos, consola).
5. Repetir tras desplegar. Así se diagnosticaron:
   - **#65**: en vertical (ventana de 1024 px) la columna «Orden de emisión» mide ~386 px y las tarjetas salían
     vacías. Se arregló con una consulta de contenedor (`@container`) y `align-content:start` + `flex-shrink:0` en
     `.slot`, el apaño de Safari.
   - **#66/#67**: Safari del iPad no carga el primer fotograma de los `<video>` de las miniaturas (`readyState 0`); se
     pinta la portada del Stock (`poster`/`thumbnail` de `stock.admira.store/stock/index.json`).

## 4. Trampas conocidas

- **Emparejamiento de CoreDevice atascado** (`xcrun devicectl` o la instalación no ven el iPad aunque `usbmux` sí):
  desenchufar, volver a enchufar, desbloquear y pulsar «Confiar» otra vez con el código.
- **«Desarrollador no fiable»** al abrir el player nativo recién instalado: Ajustes → General → VPN y gestión de
  dispositivos → «Apple Development: …» → Confiar. Pasa una vez por equipo de firma.
- **Las sesiones de automatización no tienen cookies.** `js-shell --automation` (y `launch` con Automatización remota)
  abren una sesión limpia: sin la cookie del portal, las páginas con verja (`/parrilla/`, `/emision/`, `/help/`,
  `/users/`…) se quedan en la pantalla de acceso. Para páginas con verja, usar el inspector (sin `--automation`) sobre
  una pestaña donde Carlos ya haya entrado, o probar con pantallas virtuales y páginas públicas. No introducir
  credenciales desde el agente.
- Tras reiniciar el iPad, la imagen de desarrollo se desmonta: `mounter auto-mount` otra vez.
- No hay toques ni teclado nativos (harían falta WebDriverAgent firmado; no está instalado ni se recomienda). En la web,
  conducir por JS/CDP.
- No interrumpir lo que el iPad esté haciendo (descargas, el player emitiendo): una captura no molesta; abrir otra app
  sí saca al player de primer plano.
- La firma gratuita del player nativo caduca a los 7 días (la instalación del 9-oct, el 16-oct): si la app no abre,
  reinstalar con `tools/instalar-ipad.sh`.

## EN · summary

Agents on the Mac Mini drive the USB-connected "iPad de Admin" (iPadOS 17.7.11) with
`~/Claude/tools/ipad-venv/bin/pymobiledevice3`: `developer dvt screenshot` (no sudo), `developer dvt launch <bundle>`,
`webinspector opened-tabs|launch|js-shell` and a CDP bridge with `webinspector cdp` (http://127.0.0.1:9222/). The iPad
needs Developer Mode plus Safari → Advanced → Web Inspector and Remote Automation. Pitfalls: stuck CoreDevice pairing
(unplug, replug, trust again), "Untrusted Developer" for the native player, and automation sessions start without
cookies, so gated admira.tv pages stay on the login gate.

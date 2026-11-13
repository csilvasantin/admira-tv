# Corsair Galleon 100 SD · player de admira.tv (encargo #7569)

El teclado Corsair Galleon 100 SD del Mac Studio es un player más de la flota: la **LCD superior** (720×384) emite el
contenido **horizontal** y las **12 teclas-pantalla** (3 columnas × 4 filas, 160×160) forman un **mosaico vertical**
con la versión 9:16 del mismo contenido. Pantalla: `corsair-galleon-100`.

| Pieza | Dónde | Qué hace |
|---|---|---|
| `/galleon` (`galleon.html` + `assets/galleon-player.mjs`) | admira.tv | Pinta las dos superficies desde la señal de la flota. Playout (Custom · Dual H·V / extendido) manda; en autónomo usa la playlist propia del teclado emparejada H·V (`assets/galleon-schedule.mjs`) y anclada al reloj del servidor. |
| `galleon-usb.cjs` | este directorio → `~/.admira-galleon` | Adaptador USB: Chrome **sin ventana** carga `/galleon?native=1`, lee los fotogramas (`window.admiraGalleonFrames()`) y los vuelca al teclado con `@elgato-stream-deck/node`. Guarda `last-lcd.png` y `last-keys.png` (lo que salió por USB). |
| `macstudio-galleon.command` | este directorio | `instalar · arrancar · parar · estado · captura`. Servicio de usuario `tv.admira.galleon.player`. |
| Gemelo 3D | https://www.admira.store/objeto/galleon-100/ | Misma página `/galleon` dentro del gemelo: por defecto enseña la señal real; la «playlist de prueba» es opcional. |
| Mando | https://admira.tv/mando.html?screen=corsair-galleon-100 | Playlist propia del teclado (Importar #ID). Importa la versión horizontal y la vertical: se emparejan solas (enlace `par-`, mismo título o vecindad). |

## Normas de Carlos que respeta
- Nada encima de sus monitores ni robo de foco: Chrome headless, sin ventana, sin dock.
- **Cede el teclado**: si Elgato Stream Deck o el controlador Starbucks (`AdmiraCorsair/fullscreen`) tienen el USB, espera.
  Mantener la **tecla 12 un segundo** devuelve el teclado a Elgato (Menú Corsair). Un toque breve no hace nada.
- Latido honesto: sólo el adaptador late en `/signage/now`, y marca `standby` cuando el teclado no recibe la señal.
- Sin secretos: no usa ninguna clave.

## Puesta en marcha (Mac Studio)
```bash
tools/galleon-player/macstudio-galleon.command instalar
tools/galleon-player/macstudio-galleon.command estado
tools/galleon-player/macstudio-galleon.command captura   # PNG de lo último volcado por USB
```

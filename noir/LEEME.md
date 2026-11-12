# Kiosko NOIR — prototipo mínimo

Página HTML5 autocontenida para una pantalla Philips con SoC (Android TV o similar, sin Windows). Arranca sola, a pantalla completa, y muestra un local nocturno en 3D con la playlist pública de admira.tv.

**ESCENA DE EJEMPLO.** El local 3D está generado por código con Three.js. **No es el archivo 3D real de la foto de la Philips**, que no tenemos. En `index.html` hay un hueco: asigna `MODELO_GLB_URL` (por ejemplo `./modelo.glb`) para cargarlo con `GLTFLoader`, o `MODELO_SPLAT_URL` cuando exista un splat y un visor vendorizado.

Three.js r187 y el cargador GLTF están en `vendor/`, descargados de jsDelivr, para que la página funcione **sin internet** (salvo la playlist y los vídeos). Ver `vendor/ORIGEN.txt`.

Este prototipo no se ha publicado ni desplegado en ningún servidor de producción.

## Contenido

- `index.html` — la app de kiosko (una sola página).
- `servir.py` — servidor estático local y proxy GET de la playlist (sin claves).
- `vendor/` — Three.js y GLTFLoader con imports relativos.
- `captura.png` — captura de comprobación en local, con la lista real (no es una foto de la sala).

## Cómo se conecta a la playlist

La lista se lee con un GET público, **sin clave ni secreto en el cliente**:

```
GET https://admira.tv/api/playlist?screen=<id>
```

El `id` va en el parámetro `?screen=`. Por defecto es `admiranext03-a` (hoy lleva la «Zona 0 · Previa»).

La respuesta real (comprobada el 12 nov 2026, zona Europe/Madrid) tiene esta forma:

```json
{
  "ok": true,
  "draft": {
    "screen": "admiranext03-a",
    "playlist": "default",
    "name": "Zona 0 · Previa",
    "items": [
      {
        "id": "…",
        "stockId": "…",
        "title": "Beat It",
        "sub": "",
        "lane": "publicidad",
        "seconds": 298.6,
        "asset": "https://stock.admira.store/stock/<id>/asset.mp4?v=…",
        "assetType": "video",
        "tags": ["zona-0-previa"]
      }
    ],
    "rev": 1794478624384,
    "updatedAt": 1794478624384,
    "updatedBy": "…",
    "synthetic": false
  },
  "screenTags": ["…"],
  "auto": []
}
```

Los vídeos se piden a la URL que trae cada `item.asset` (si faltara, se construye `https://stock.admira.store/stock/<id>/asset.mp4`). El índice de referencia del stock es `https://stock.admira.store/stock/index.json`; el kiosko no lo descarga en bucle, porque la playlist ya trae las URLs.

Cada 60 s se vuelve a leer la lista. Si cambia el `rev`, **no se corta el tema que suena**: el recambio se aplica al terminar. Si la red falla, se sigue con la última lista conocida.

## Parámetros de la URL

| Parámetro | Valor | Qué hace |
| --- | --- | --- |
| `screen` | id de pantalla (por defecto `admiranext03-a`) | Qué playlist se pide. |
| `modo` | `escena` (defecto) o `video` | Cómo se ve el vídeo (ver más abajo). |
| `audio` | `1` | El vídeo suena. Por defecto va **silenciado** (el autoplay del navegador lo exige). |
| `api` | URL de la playlist, p. ej. `/api/playlist` | Fuerza el extremo (útil con el proxy de `servir.py`). |

Ejemplos:

```
http://127.0.0.1:8080/
http://127.0.0.1:8080/?screen=admiranext03-a&audio=1
http://127.0.0.1:8080/?modo=video
http://192.168.1.10:8080/?api=/api/playlist
```

## Cómo se ve el vídeo (rendimiento en el SoC)

- **Modo escena (defecto).** El vídeo se proyecta con `VideoTexture` en una pantalla 16:9 con marco de neón, dentro del local. Conserva la estética NOIR (cartel, nevera, persianas, suelo brillante). En un SoC modesto, copiar cada fotograma a la GPU puede bajar los FPS. Si caen de 28, el kiosko pasa solo a un modo bajo: el vídeo se ve como `<video>` DOM encima, con la escena detrás, y se apagan sombras y resplandores extra.
- **`?modo=video`.** El vídeo va casi a pantalla completa (`object-fit: contain`, con un margen para que se vea el local alrededor) y la escena 3D queda detrás. Suele rendir mejor en Android TV, porque el recuadro lo compone el propio navegador y no la textura WebGL.

Los vídeos que no son 16:9 (p. ej. el *Beat It* de la Zona 0, que es 4:3) se ven con bandas negras dentro del marco, sin estirarse.

El vídeo arranca en silencio. Con `?audio=1` intenta sonar; si el navegador lo bloquea sin gesto, se desmutea en el primer toque o tecla.

## Controles

Siguiente, anterior, primero, último y pausa/reanudar. Tres vías:

### En pantalla

Al tocar o mover el ratón aparecen los botones (y el título del tema). Se ocultan a los 4 s. El botón de pausa **sí alterna** entre pausa y reanudar.

### Mando de la tele

- Flecha derecha o `MediaTrackNext`: siguiente.
- Flecha izquierda o `MediaTrackPrevious`: anterior.
- Flecha arriba o `Home`: primero.
- Flecha abajo o `End`: último.
- `OK` / `Enter` / espacio / `MediaPlayPause`: alterna pausa y reanudar.
- `MediaPlay` reanuda; `MediaPause` solo pausa.

### Voz (Web Speech API, `es-ES`, modo continuo)

El **wake word es obligatorio**. Un comando solo se ejecuta si la frase empieza por «hola Admira». Ejemplos: «hola Admira, siguiente», «hola Admira, pausa», «hola Admira reproduce».

Se aceptan variantes habituales del reconocedor, **sin tildes y sin distinguir mayúsculas**: «ola admira», «hola, admira», «hola almira».

Si solo dice «hola Admira», se abre una **ventana de 5 s** para recibir el comando (en ese rato basta con decir «siguiente», sin repetir el wake word). Se muestra «te escucho…».

Sin wake word, la frase **se ignora**. Se puede ver tenue como «ignorado: …».

Comandos (todos exigen el wake word):

| Dices | Qué hace |
| --- | --- |
| siguiente | pasa al siguiente tema |
| anterior | tema anterior |
| primero / primera | primer tema de la lista |
| último / última | último tema |
| pausa / para | **solo pausa**, no alterna |
| reproduce / reproducir / play / sigue | **reanuda** lo que esté en pausa |

Si el navegador no tiene `SpeechRecognition` / `webkitSpeechRecognition`, la voz se oculta y **no da error**. El WebView de Android TV o el de una Philips Professional Display **seguramente no lo tiene**; en esa tele cuenta con el mando o con los botones en pantalla.

## CORS (comprobado, no inventado)

Pruebas con `curl` el 12 nov 2026, zona Europe/Madrid:

- **`https://stock.admira.store`** (índice y `asset.mp4`, también con `Range`) envía `Access-Control-Allow-Origin: *`. Los vídeos se pueden cargar desde cualquier origen (hace falta `crossorigin="anonymous"` para la `VideoTexture`).
- **`https://admira.tv/api/playlist`** sí habla CORS, pero **solo refleja el origen** si es `http://127.0.0.1` o `http://localhost` (con o sin puerto). Desde `http://192.168.x.x`, `https://localhost`, `https://admira.tv`, `https://admira.live` u otro dominio **no envía** `Access-Control-Allow-Origin`. Un kiosko servido en la IP de la red del SoC **no podrá leer la playlist en el navegador**.

Solución, sin poner claves en el cliente:

1. Servir esta carpeta **desde admira.tv** (mismo origen que `/api/playlist`), o
2. Usar un **proxy GET del mismo origen**, como el `servir.py` de esta carpeta: abre `http://<IP-del-SoC>:8080/` y, si hace falta, `?api=/api/playlist`. El kiosko, si el GET público falla, **reintenta solo** contra `/api/playlist`.

`servir.py` no reenvía cabeceras de autenticación ni `X-Notify-Key`. Solo el GET público.

## Cómo desplegarlo en el SoC de la Philips

Sirve la carpeta por HTTP. Los módulos ES (`import`) suelen fallar en `file://`.

```bash
python3 servir.py 8080
# o, solo estático y solo desde localhost:
python3 -m http.server 8080 --bind 127.0.0.1
```

### 1. App de navegador en modo kiosko (Fully Kiosk Browser u otra similar)

En un SoC Android / Android TV, instala un navegador con modo kiosko y pon como URL de inicio `http://<IP>:<puerto>/`. Activa el kiosko / pantalla completa de la propia app, el arranque al encender y, si existe, el bloqueo de la barra de sistema. Ese modo suele ser más fiable que la Fullscreen API del HTML.

### 2. URL en la red, desde el navegador del SoC

Abre la misma URL. Para dejarla de inicio, usa la página de inicio o “abrir al arrancar” de ese navegador, o una app de kiosko. En Android TV algunos navegadores no ofrecen kiosko real.

### 3. Philips Professional Display y CMND

En documentación oficial del fabricante figuran **Custom Dashboard (HTML & APK)**, **Customizable Welcome App** y la importación de un sitio HTML5 en **CMND & Create** para distribuirlo con **CMND & Control**. También se pueden instalar web apps y gestionarlas con **AppControl**. El procedimiento concreto (URL, ZIP, dashboard al encender) depende del modelo y del firmware: consúltalo en el manual de esa unidad. Aquí no se ha verificado un nombre de menú concreto de la tele.

## Avisos

- **Pantalla completa.** Se pide al cargar y, si el navegador la bloquea sin gesto, otra vez al primer toque o tecla. En una tele, usa el kiosko de la app o del SoC.
- **Rendimiento.** El *pixel ratio* está limitado a 1–1,5. Si los FPS bajan de 28, pasa a modo bajo (vídeo en DOM, sin sombras ni resplandor extra).
- **Wake lock.** Puede exigir HTTPS o `localhost` y un gesto.
- **WebGL** hace falta para la escena. Si no hay, se intenta mostrar al menos el vídeo a pantalla completa.
- **Voz.** Suele exigir HTTPS (o localhost) y permiso de micrófono. En el WebView de Android TV o de la Philips, lo normal es que no exista.
- **CORS.** Fuera de `http://127.0.0.1` y `http://localhost`, la playlist de admira.tv no se lee desde el navegador salvo que sirvas la página desde admira.tv o uses el proxy de `servir.py`.

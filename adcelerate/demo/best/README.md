# ADcelerate · Nivel BEST — Plaça de la Vila de Gràcia fotorrealista

Nivel **BEST** de la demo ADcelerate. Carga **en vivo** el globo fotorrealista de
Google (**Photorealistic 3D Tiles**) centrado en la Plaça de la Vila de Gràcia
(41.4002243 N, 2.1575761 E), con un vuelo cinematográfico de entrada estilo
*Google Earth Studio*, el kiosko **News & Coffee · OOH Media** marcado en 3D, y la
atribución de Google que exige la licencia.

Ficheros:
- `index.html` — página autónoma (tokens del gemelo vendorizados, sin dependencias del demo padre).
- `README.md` — esto.

---

## Vía legal elegida (importante)

Se usa el componente **`gmp-map-3d` (Map3DElement)** de la **Maps JavaScript API**
con **Photorealistic 3D Tiles servidos en vivo**. Es la vía **con licencia comercial**:

- **Google Earth Studio NO sirve** para esto: su TOS prohíbe expresamente el uso
  promocional/publicitario (una demo de producto a un cliente como Clear Channel es
  uso comercial). Solo permite noticias, educación, documental, investigación, cine.
- **Map Tiles API / Photorealistic 3D Tiles SÍ**: es un producto de pago de Google
  Maps Platform, con uso comercial permitido siempre que:
  1. Se muestre la **atribución de Google** + los data providers (el componente
     `gmp-map-3d` la pinta solo en la esquina inferior derecha — **no taparla**).
  2. **No se cachee ni pre-renderice** el contenido (la Map Tiles API Policy prohíbe
     pre-fetch/cache/almacenamiento). Por eso esta página sirve todo **en vivo**;
     no guardamos tiles ni grabamos un vídeo del globo.
  3. Se use una **API key con billing** y las restricciones adecuadas.

---

## Alta de la clave (paso a paso, para Carlos / Trinity)

La clave **NO existe en la cúpula** (verificado 2026-07-12). Hay que darla de alta:

1. Ir a **https://console.cloud.google.com/** con la cuenta de Google del proyecto.
2. Seleccionar (o crear) el **proyecto** de facturación de Admira.
3. **APIs & Services → Library** → habilitar **las dos**:
   - **Map Tiles API** (`tile.googleapis.com`)
   - **Maps JavaScript API** (`maps-backend.googleapis.com`)
4. **APIs & Services → Credentials → Create credentials → API key**.
5. **Restringir la clave** (obligatorio, es una clave de navegador y viaja en la URL/HTML):
   - **Application restrictions → Websites (HTTP referrers)** y añadir:
     - `https://admira.tv/*`
     - `https://*.admira-tv.pages.dev/*`
     - (para pruebas locales) `http://localhost/*`
   - **API restrictions → Restrict key** → marcar solo **Map Tiles API** y **Maps JavaScript API**.
6. Si la consola pide **habilitar Billing** (lo hará: Photorealistic 3D Tiles exige
   cuenta de facturación activa), hay que **vincular una cuenta de facturación**.
   Sin billing, la clave devuelve error y la página muestra el aviso «pendiente de alta».
7. Copiar la clave y pasarla a la página por URL:
   `https://admira.tv/adcelerate/demo/best/?key=LA_CLAVE`

> La página lee la clave con
> `new URLSearchParams(location.search).get('key')`.
> Si falta, muestra un aviso elegante y **no rompe**.
> La clave **no se hardcodea** en el repo ni se sube a la cúpula.

---

## Coste estimado (según el estudio previo de la casa)

- Photorealistic 3D Tiles se factura por **sesión** (grupos de peticiones de tiles).
- Estimación: **~6 $ / 1000 sesiones** de ~3 h de uso.
- **1000 sesiones gratis/mes** (crédito recurrente de Google Maps Platform).
- Para una demo puntual a un cliente el coste es **prácticamente nulo** (entra de sobra
  en la franja gratuita). Conviene igualmente el referrer-restrict para evitar abuso.

> Cifras orientativas; confirmar en la calculadora de Google Maps Platform y en la
> factura real, que Google ajusta los SKUs periódicamente.

---

## Integración en la pestaña BEST (pendiente, lo secuencia Trinity)

Hoy la pestaña **Best** del demo padre está bloqueada («en el horno»). Cuando haya
clave, la integración es: cargar `best/index.html` en la vista BEST (iframe o montaje
directo) pasándole `?key=...`. **No** tocar `demo/index.html` desde aquí — lo coordina
Trinity para no chocar con el otro subagente (marco cuadrático + slider 24h).

---

## Notas técnicas

- Canal **`v=beta`** del loader: `gmp-map-3d` aún vive en beta.
- `mode: HYBRID` es **obligatorio** desde feb-2025 (o `SATELLITE`).
- Cámara: `flyCameraTo` (descenso) → `flyCameraAround` (órbita del kiosko).
- Kiosko: `Marker3DInteractiveElement` con `label`. Si más adelante hay un **GLB**
  del kiosko, se cambia por `Model3DElement({ src, position, altitudeMode })` en la
  misma coordenada.

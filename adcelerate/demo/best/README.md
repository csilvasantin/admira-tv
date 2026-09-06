# ADcelerate · Nivel BEST — Plaça de la Vila de Gràcia fotorrealista

Motor fotorreal de la [vista real del universo outdoor](../README.md). La entrada
pública `best/` abre ahora el universo Three.js; este motor se carga solo cuando
el usuario elige acercarse al quiosco. Conserva Google Photorealistic 3D Tiles,
la llegada guiada y los panoramas fechados. El iframe `?embed=1` espera el contexto
validado del parent antes de cargar Google y se destruye al volver al universo.

Ficheros: `index.html` (renderer hijo), `camera-path.js` (trayectoria y esperas),
`../js/outdoor-context.js` (contrato de contexto), `tests/` (pruebas focales).

## Llegada guiada al quiosco (6 de septiembre de 2026)

La entrada recorre tres planos: plaza, aproximación y llegada. Se centra en el
quiosco real **41.4002641, 2.1573332** (`gracia-local.json`, nodo OSM 3350101407),
y termina frente al mostrador. El punto anterior 41.4002243, 2.1575761 sigue
sirviendo solo para la vista amplia de la plaza; no sitúa el modelo.

- **Llegar al frente**: panorama `9xunlB_EXfx7QBkGq7cZfA`, observado en Google
  Maps en **41.4003067, 2.1573298**, heading 238.13°, pitch 2°, zoom 0.
  La foto es de **noviembre de 2017** y muestra el quiosco anterior a News & Coffee.
  La fecha y «Imagen histórica» permanecen visibles. No hay pantallas publicitarias
  superpuestas ni GLB publicitario durante esta llegada al mostrador.
- **Paneles publicitarios · marzo 2023**: conserva el panorama
  `2NoSvJbqMCZ0RXhR8pTSLA`, su encuadre calibrado 49.5° y los dos anuncios vivos.
  Es una cara distinta; las homografías de esos paneles no se aplican al mostrador.
- **Parar**, arrastrar el globo, usar la rueda o las flechas cancelan el recorrido.
  La órbita queda disponible solo por acción explícita y no se encadena a la llegada.

Las etapas usan `CameraOptions.altitudeMode: RELATIVE_TO_GROUND` y esperan
`gmp-animationend` más `gmp-steadychange` con `isSteady === true`. El timeout
pausa sin fingir llegada. El cambio a Street View espera la disponibilidad del
panorama solicitado y sigue siendo cancelable durante la importación o consulta.
`status_changed` confirma la consulta de Street View, no que cada píxel esté ya
renderizado. Las imágenes siempre las sirve Google en vivo; no se precargan ni
almacenan teselas, panoramas o capturas.

Implementación: `camera-path.js`, integración en `index.html`.
Pruebas: `node --test adcelerate/demo/best/tests/camera-path.test.cjs` desde el repo.
Referencia de API: https://developers.google.com/maps/documentation/javascript/reference/3d-map

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

## Configuración de la clave de navegador

La página ya utiliza una clave de navegador configurada para producción. No necesita
una nueva alta para este recorrido. Los pasos siguientes describen el mantenimiento
de una clave autorizada; no se deben ampliar sus restricciones para verificar un cambio:

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
7. La integración utiliza la clave de navegador ya configurada. No transmite claves
   desde parámetros de enlaces públicos al iframe.

> La página lee la clave con
> `new URLSearchParams(location.search).get('key')`.
> Esta posibilidad interna del renderer no se propaga desde la entrada del universo.
> Las restricciones de referrer siguen aplicándose: si localhost no está autorizado,
> verificar mediante un preview permitido del mismo proyecto, sin cambiar la clave.

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

## Integración en el universo outdoor

La integración ya está implementada. El parent conserva la cámara Three, selección,
hora y capas. Tras el handshake se envían aforo base y efectivo y mezcla exacta;
no se redondea la hora a una de las cuatro franjas antiguas. La audiencia sigue
siendo simulada. `Escape` cierra la fotografía. Ver contrato y ciclo de vida en
`../README.md`. Los enlaces `best/?side=panels` o `best/?cal=1` conservan su intención
mediante la entrada del universo, sin transportar claves en los enlaces.

---

## Notas técnicas

- Canal **`v=beta`** del loader: `gmp-map-3d` aún vive en beta.
- `mode: HYBRID` es **obligatorio** desde feb-2025 (o `SATELLITE`).
- Cámara: `flyCameraTo` por etapas → panorama frontal fechado; `flyCameraAround` solo al elegir Órbita.
- Kiosko: `Marker3DInteractiveElement` con `label`. Si más adelante hay un **GLB**
  del kiosko, se cambia por `Model3DElement({ src, position, altitudeMode })` en la
  misma coordenada.

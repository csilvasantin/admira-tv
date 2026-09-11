# Catálogo · Content Catalogue — contenidos directamente desde el folleto

**Qué es.** La app de `admira.tv/contentcatalogue/`: se elige (o se analiza) un folleto,
se lista cada producto con su precio y su promoción, y a la derecha de cada uno hay un
botón **Crear vídeo** que abre el generador TikTok de AdmiraNeXT con el producto ya
cargado. Piloto: catálogo Alcampo del 10 al 23 de septiembre de 2026 (Yokup #3066).

**Piezas.**

| Ruta | Qué hace |
|---|---|
| `index.html` | La app (cabecera + subir folleto + listado). Modo `?app=1` sin marketing. `?catalogo=<id>` abre uno concreto. |
| `catalogos/index.json` | Lista de catálogos disponibles (`id`, `etiqueta`, `validez`, `archivo`…). |
| `catalogos/<id>.json` | Un catálogo: `{catalogo, fuente, validez, tiendas, paginas, productos:[{p, seccion, nombre, marca, detalle, precio, unidad, promo, destacado}]}`. |
| `/functions/contentcatalogue/api/analizar.js` | Pages Function. `GET` → `{configured}`; `POST {pages:[{n, image}]}` (1–4 páginas `data:image/jpeg`) → `{productos}` leídos con Grok (xAI, `json_schema` estricto). Precios verificados con `\d+,\d{2}`. |

**Deep-link al generador (contrato con admiranext.com/tiktok).**
`https://www.admiranext.com/tiktok/?producto=<encodeURIComponent(JSON)>` donde el JSON es el
producto del catálogo más `{catalogo, validez:{desde,hasta}, origen:"admira.tv/contentcatalogue", catalogo_id}`.
Se abre en pestaña nueva. Desde la consola: `ADMIRA_CC.deepLink(ADMIRA_CC.actual().productos[0])`.

**Añadir un catálogo a mano.** Deja el JSON en `catalogos/` y añade su entrada en
`catalogos/index.json`. Si sale del análisis IA, el botón «Descargar JSON del análisis»
te da el fichero ya con el esquema correcto.

**Clave.** `XAI_API_KEY` como secreto del proyecto Pages `admira-tv`
(`wrangler pages secret put XAI_API_KEY --project-name admira-tv`, valor en la bóveda).
Sin clave, la UI avisa «Análisis IA no configurado» y el resto sigue funcionando.

**Estado «creado».** Se guarda en `localStorage` (`admira.contentcatalogue.creados`) por
navegador: clave `<catalogo_id>|<página>|<nombre>` → fecha ISO. Si el Stock tiene la pieza,
manda el Stock (la marca local solo sirve para el estado «en curso»).

**Previo del vídeo (Yokup #3109).** Cada producto tiene una identidad estable en el Stock,
la misma que publica el generador (`tiktok/app.js → fichaProducto` + `claveExterna` del servidor):

```
externalId = claveExterna("admiranext:catalogo:" + slug(catalogo_id) + ":" + slug(nombre))
slug(v)    = NFD sin diacríticos · minúsculas · [^a-z0-9-]+ → "-" · sin guiones en los extremos · 40 chars
claveExterna(v) = NFD sin diacríticos · [^A-Za-z0-9:_-]+ → "-" · sin guiones en los extremos · 120 chars
id del asset = "auto-" + sha256(externalId).hex[0:20]      (p. ej. admiranext:xtore:coche → auto-9a75882d2e3a36bce8e6)
```

La página pregunta `GET https://api.admira.store/stock/exists?externalId=<id>` (CORS abierto;
`{exists,id,url,contentHash,createdAt}`) para todos los productos al cargar (concurrencia 6),
con caché en memoria + `localStorage` (`admira.contentcatalogue.stock`, 5 min). La columna
ANUNCIO tiene tres estados: sin vídeo (Crear vídeo + Copiar guion) · en curso (previo 9:16 vacío
con «Generando…», sondeo cada 15 s durante 15 min; después «sin noticias · reintentar») ·
existe (previo 9:16 de 96×170 con `<video muted playsinline preload="metadata">` desde
`https://api.admira.store/stock/asset/<id>`, se mueve al pasar el ratón, clic = modal con
controles; fecha, «Rehacer» con el mismo deep-link y «Ver en el Stock» → pixeria.com/stock.html).
La cabecera muestra «Con vídeo N de M» y el filtro Vídeo permite «Solo con vídeo» / «Solo sin vídeo».
Depuración desde consola: `ADMIRA_CC.externalId(p)`, `ADMIRA_CC.stockId(eid)`, `ADMIRA_CC.stock()`,
`ADMIRA_CC.sondear()`, `ADMIRA_CC.refrescar()`.

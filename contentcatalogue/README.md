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
navegador: clave `<catalogo_id>|<página>|<nombre>` → fecha ISO.

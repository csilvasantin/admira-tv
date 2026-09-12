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
| `/functions/contentcatalogue/api/analizar.js` | Pages Function. `GET` → `{configured, bbox:true, rejilla:0.1}`; `POST {pages:[{n, image}]}` (1–4 páginas `data:image/jpeg`) → `{productos}` leídos con Grok (xAI, `json_schema` estricto), cada uno con su `bbox`. Precios verificados con `\d+,\d{2}`. |
| `/functions/api/sso/pase.js` | Pase SSO (Yokup #3165). `GET /api/sso/pase?aud=admiranext.com` con la sesión del portal → `{ok, pase, exp, email_masked}`; 401 sin sesión, 403 si el email no está en `ADMIRA_SSO_EMAILS`. Firma/verificación en `functions/_sso-pase.js` (test `functions/_sso-pase.test.mjs`). |
| `/functions/contentcatalogue/api/imagen/[[ruta]].js` | Imagen real del producto (FLT-100318). `POST {catalogo_id, slug, image}` guarda el recorte en R2 (sesión del portal); `GET /contentcatalogue/api/imagen/<catalogo_id>/<slug>` lo sirve público con CORS `*` y caché de 1 día. `_imagen-lib.js` es el código común. |

**Deep-link al generador (contrato con admiranext.com/tiktok).**
`https://www.admiranext.com/tiktok/?producto=<encodeURIComponent(JSON)>` donde el JSON es el
producto del catálogo más `{catalogo, validez:{desde,hasta}, origen:"admira.tv/contentcatalogue", catalogo_id}`.
Viaja `imagen` (URL pública de la foto recortada, ver abajo); NO viaja `bbox` ni los campos internos `_*`.
Se abre en pestaña nueva. Desde la consola: `ADMIRA_CC.deepLink(ADMIRA_CC.actual().productos[0])`.

**Pase SSO al generador (Yokup #3165).** Al pulsar «Crear vídeo», «Rehacer» o el lote de destacados,
la página pide `GET /api/sso/pase?aud=admiranext.com` (`fetch` con `credentials:'include'`) y abre el
deep-link con `&pase=<pase>`; el Generador lo acepta y no vuelve a pedir sesión. La pestaña se abre en
el mismo gesto del clic (`about:blank`) y se navega cuando llega el pase, para que el bloqueador de
ventanas no la tire; en el lote se piden tantos pases como productos (son de un solo uso) antes de las
confirmaciones. Si el pase falla (401 sin sesión, 403 email fuera de lista, red), el deep-link va sin
pase como siempre y sale un aviso discreto («Sin pase: el Generador puede pedir sesión»). Depurar:
`ADMIRA_CC.pase()` (la respuesta del endpoint) y `ADMIRA_CC.abrir(p)`.

*Contrato del pase (fijo, el mismo que verifica admiranext):* `payload = base64url(JSON.stringify({v:1,
email, iat, exp (iat+120 s), nonce (16 hex), iss:"admira.tv", aud:"admiranext.com", origen:"contentcatalogue"}))`,
`firma = base64url(HMAC-SHA256(ADMIRA_SSO_SECRET, payload))`, `pase = payload + "." + firma`; `iat`/`exp`
en segundos Unix; el secreto (hex de 64 chars) se usa como bytes UTF-8 tal cual. Solo se emite con sesión
del portal válida (`readSession` + `hasAnyAccess`) y email en la lista; mismo origen (`Sec-Fetch-Site`);
`Cache-Control: no-store`; el pase nunca se escribe en logs. Secretos del proyecto Pages `admira-tv`:
`ADMIRA_SSO_SECRET` (compartido con admiranext, en la bóveda) y `ADMIRA_SSO_EMAILS`
(`wrangler pages secret put ADMIRA_SSO_EMAILS --project-name admira-tv`, valor
`csilva@admira.com,csilvasantin@gmail.com`, que es también el defecto en código). En local:
`.dev.vars` con un secreto de prueba y la sesión `admira-tv:auth:session:testtoken` del KV local.

**Listado tipo hoja de cálculo (Yokup #3198).** Ocho columnas, una por dato: Pág. · Imagen · Producto ·
Marca · Sección · Precio · Promo · Anuncio. Se manejan como en una hoja de cálculo, sin librerías:

- **Ordenar**: clic en el cabezal = ▲ ascendente, otro clic = ▼ descendente, un tercero = orden de origen.
  Producto/Marca/Sección/Promo van alfabéticos sin acentos; Precio es numérico y deja los «sin precio» al
  final (suba o baje); Anuncio pone primero los que ya tienen vídeo (luego «generando», luego «pulsado»);
  Imagen pone primero los que tienen foto. El cabezal lleva `scope="col"` y `aria-sort`; con el foco en
  él, Enter/Espacio ordena. El orden es estable (empata por la posición de origen).
- **Mover columnas**: arrastrar el cabezal (handle ⋮⋮, drag & drop nativo) o ←/→ con el foco en él. La
  columna arrastrada ocupa el sitio de la columna donde se suelta.
- **Mover filas**: arrastrar el chip de página. La fila ocupa el sitio de la fila donde se suelta y ese
  orden que se ve pasa a ser el **orden manual** del catálogo (anula el orden por columna; se avisa).
- **Anchos**: tirar del borde derecho del cabezal; doble clic en el borde = ancho automático.
- **Restablecer vista**: botón en la barra; vuelve a columnas, orden y anchos de origen.
- **Móvil (<900 px)**: aparece el selector «Orden» en la barra con las mismas opciones que el cabezal.

El orden se calcula sobre TODOS los productos y los filtros/buscador se aplican encima, así que filtrar
nunca cambia el orden elegido; el sondeo del Stock, el previo del vídeo, las miniaturas y los deep-links
siguen igual (las filas siguen llevando `data-i` = índice real del producto). Todo se guarda por catálogo
en `localStorage` `admira.contentcatalogue.tabla.<catalogo_id>`:
`{v:1, cols:[ids], sort:{col,dir}|null, manual:[índices]|null, widths:{id:px}}`; si la vista es la de
origen la clave se borra. Un `manual` cuya longitud no coincide con el catálogo se ignora. Depurar desde la
consola: `ADMIRA_CC.tabla()`, `ADMIRA_CC.ordenar('precio','desc')`, `ADMIRA_CC.moverColumna('precio',2)`,
`ADMIRA_CC.moverFila(5,0)`, `ADMIRA_CC.ordenados()`, `ADMIRA_CC.restablecer()`.

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

**Imagen real del producto (FLT-100318).** Cada producto puede llevar `imagen` (URL pública) y
`bbox` (`{x,y,w,h}` normalizado 0..1 respecto a la imagen de su página: la caja de su fotografía).
La miniatura (72 px) sale en la columna Producto; clic = modal con la página completa y la caja
resaltada (la página se lee de `imagenes.paginas` del JSON, con `{n}`, o de `…/pagina-<n>` junto a
la foto; si no existe, se enseña el recorte solo). El generador recibe `imagen` en el deep-link y la
pinta dentro del anuncio (`crossOrigin="anonymous"`, de ahí el CORS abierto del GET).

*Cómo se obtiene la caja.* `analizar.js` pide a Grok un `bbox` por producto. Sin ayuda las cajas
salen «a columnas» (bien en páginas de 4–7 productos, desplazadas en las densas): la página dibuja
una **rejilla de coordenadas** sobre la copia que envía (líneas cada 0,1 rotuladas `x=…`/`y=…`,
`ADMIRA_CC.rejilla(dataURL)`) y el prompt le dice que lea las coordenadas sobre ella. Con rejilla, en
la página 5 del folleto de Alcampo (13 productos) las 13 cajas caen sobre su producto; en la 2 (7)
las 7. El recorte se hace sobre el lienzo **limpio** con un margen del 3 % (las cajas tienden a
cortar un borde), máx. 512 px de lado, JPEG 0,85 (`ADMIRA_CC.recorta(dataURL, bbox)`).

*Almacén.* Bucket R2 `admira-catalogo-imagenes` (binding `CATALOGO` en `wrangler.toml`), clave
`cc/img/<catalogo_id>/<slug>` (`slug` = la misma receta que el Stock, 40 chars; si dos productos
del catálogo dan el mismo slug, `-2`, `-3`…). Las páginas completas van como `pagina-<n>`.
`POST /contentcatalogue/api/imagen` exige la **misma verja que la página**: la cookie de sesión del
portal (`functions/_auth-session.js`, `readSession` + `hasAnyAccess`) y mismo origen; no hay token
aparte que custodiar. Sin sesión o sin almacén, el análisis sigue: la miniatura se pinta desde el
recorte local (`_local`) y el deep-link va sin `imagen`. Barra de progreso «Recortando N/M» tras la
lectura IA. Sembrado desde la CLI (sin pasar por el POST):
`npx wrangler r2 object put admira-catalogo-imagenes/cc/img/<id>/<slug> --file x.jpg --content-type image/jpeg --remote`.

*Catálogo de Alcampo.* Sembrado el 12-sep-2026 desde las 16 páginas públicas del folleto en Tiendeo
(900×1299, `…/publications/page_assets/178703/<n>/page_<n>_level_4_<hash>.webp`, las URLs salen del
visor): análisis con rejilla, casado con los 159 canónicos por página + nombre normalizado
(similitud ≥ 0,6, +0,25 si el precio coincide) y recorte con margen. El JSON canónico lleva
`imagenes:{origen, paginas, con_imagen}`. Resultado: 159 de 159 con imagen — 151 casados solos y 8
a mano (mismo artículo con otra redacción: «Body Milk Nutritivo NIVEA» ↔ «Cremas corporales y geles
de baño NIVEA», etc.; p. 6, 9 y 12). Para las promos sin precio («2ª unidad -50 %») el prompt pide
también los productos «solo con promoción»; sin eso Grok se saltaba 7 de la página 12.

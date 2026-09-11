# Xtore: player virtual sobre una pestaña autorizada

TrinityMBA16 · v.11.09.2026.r1.16:00 · FLT-100252 / FLT-100256

## Qué implementa

La tarjeta pública de Analítica de vídeo entra en `/videoanalytics/xtore/`.
La landing informativa `/videoanalytics/` se conserva y añade el mismo acceso.
La nueva página es un procesador local público, sin acceso al backend de IEU ni
permisos implícitos para ver sus cámaras. La sesión de IEU permanece en su propia
pestaña. No se modifica ni elimina el auth-gate de las páginas existentes.

El operador abre Digital Twin, selecciona Store → Entrada y muestra Puerta Cam.
Comparte esa pestaña mediante el selector nativo de Chrome, sin audio. Se rechazan
ventanas y monitores, y no se intenta preseleccionar la pestaña ni copiar cookies.
El usuario confirma el recuadro de cámara y las cuatro esquinas del iPad.
El contenido compartido es el fondo; un canvas se transforma con la misma
homografía de cuatro esquinas que usa CanalKiosk. No se controla un iPad físico.

COCO-SSD 2.2.3 con MobileNet v2, sobre TensorFlow.js 4.22.0 (bundle ES2017), analiza solamente el
recorte. Las dependencias tienen versiones fijas e integridad SHA-384. Los pesos
se descargan desde el repositorio oficial de TensorFlow en Google Storage.
El modelo se carga a petición, con errores y tiempos de espera visibles.
El bundle ES2017 evita el shim `Function` del bundle legacy y permite mantener
la CSP sin `unsafe-eval`. Verificar con las cabeceras reales, no solo http.server.

Clases automáticas: person (gris), car (marrón), motorcycle (verde), bicycle (ámbar).
Patinete (violeta) es registro manual explícito; COCO no tiene esa clase.
No clasifica sexo, género, edad, identidad o atención. No se presenta como Astra
ni como un modelo de precisión ya validada. Los bordes rosa/azul requerirían otro
productor evaluado: no se inventan atributos para cumplir la paleta.

Un tracker geométrico exige dos detecciones y desplazamiento (tres para bicis con
confianza inferior al 65 %), conserva continuidad hasta 8 s sin señal y emite una
sola vez por trayectoria. Usa asignación húngara de máxima cardinalidad/mínimo
coste y velocidad acotada; no un emparejamiento greedy que robe otra trayectoria.
Las candidatas de baja confianza conservan posición pero no crean ni confirman
tracks. Tras una salida observada por el borde, el margen se reduce a 1 s.
No es reidentificación y puede duplicar tras ausencias largas o perder pasos rápidos. Una cámara muy lejana,
baja resolución, poca luz, reflejos o movimiento de la escena requieren evaluación.
La vista debe permanecer visible. Pausa al ocultarla, cambiar tamaño de fuente,
perder fotogramas o señal, recalibrar o producirse un error.

La leyenda muestra pasos acumulados de Personas, Coches, Motos, Bicis y Patinetes
(estos últimos manuales). El total es la suma de las cinco categorías; cuenta todos los objetos confirmados
de una captura, no solo la categoría que determina su borde. Una persona sobre
una bici puede contribuir a ambas categorías si ambas detecciones se confirman.
Los contadores viven solo en memoria y se conservan al caducar una captura,
pausar, ocultar, recalibrar o desconectar. Empiezan de cero al conectar una nueva
fuente correctamente o recargar. No se reconstruyen a partir de los eventos de
versiones anteriores ni se almacenan imágenes para reconstruirlos.
Reset pone a cero las cifras actuales, conserva los tracks y no borra el histórico
ni su cola pendiente. Pausar, arrancar y ajustar confianza ya no borran tracks.
Cambiar ROI/tamaño de fuente o desconectar sí invalida la geometría. Son pasos
estimados, no individuos únicos: una ausencia larga o regreso al encuadre puede
producir un nuevo paso. El desglose de sexo/género no se infiere.

## Controles e histórico — ampliación 11 septiembre 2026

Iniciar/Pausar análisis es el primer control de una barra sticky, visible al bajar
por el inspector. Capturas incluye Reset y desplegable Histórico con día y hora
de Europe/Madrid (horas repetidas de cambio horario diferenciadas por UTC).

`history.mjs` consulta y envía únicamente metadatos a `/videoanalytics/api/history`.
El backend Pages Functions utiliza D1 y sesión verificada del portal con rol raíz
owner/admin. Consultas parametrizadas; lotes atómicos; UUID único por evento para
reintentos idempotentes. No recibe fotografías, bbox, texto libre, sexo ni edad.
Solo ACK del servidor confirma persistencia. Una cola en memoria de hasta 2000
eventos protege reintentos durante la vista abierta; NO es almacenamiento durable.
Errores, pendientes y expirados se muestran; beforeunload advierte si hay pendientes.
No se usan localStorage, sessionStorage ni IndexedDB para simular histórico.
Los eventos demasiado antiguos (>7 días para ingesta) no bloquean nuevas remesas;
se informa de que ya no se pueden confirmar/reintentar, no de un borrado remoto.

Consulta entre equipos preparada, pero **base D1 y despliegue aún pendientes de
autorización**. La vista estática local muestra «Servidor de histórico no disponible».
No reconstruye los 103 pasos de capturas anteriores. Instrucciones y límites en
[HISTORY.md](HISTORY.md). Solo un navegador debe analizar una cámara; varios pueden
consultar. Los UUID evitan reintentos, no deduplican dos productores simultáneos.

Patinetes manuales no crean capturas, máscaras ni órdenes de player. No se mapea
skateboard/bicycle/motorcycle a scooter. COCO y DeepLab Pascal no incorporan esa
clase, y el player de Neo aún no tiene orden propia. Grounding DINO Tiny ONNX es
un candidato de evaluación local por vocabulario abierto; no se han descargado
pesos ni validado precisión/latencia ni activado un detector de patinetes.

## Mejora de bicis y tercera superficie — 11 septiembre 2026

`detector.mjs` decodifica la salida cruda de la versión fijada COCO-SSD 2.2.3:
90 clases, 1917 anchors en el modelo comprobado. Conserva puntuaciones de persona
y bici por separado y aplica NMS por categoría (IoU .45), no entre categorías.
El wrapper original elegía una sola clase por anchor y podía suprimir la bici
debajo del ciclista. Contrato inesperado → error y pausa; tensors liberados.

Prueba local con la captura aportada por Carlos, sin subir imágenes: ROI
490 × 355, wrapper original sin bici; adaptador nuevo devuelve bicicleta
score .449962, bbox [14.71, 223.58, 103.22, 47.62]. Sin aumento de tensors vivos.
Esto prueba recuperación de una candidata en esa imagen, no recall en vídeo.

Umbral de bicis independiente (40 % inicial, ajustable 35–80); el resto conserva
65 %. El tracker permite más desplazamiento entre fotogramas de bici/moto,
limita cambios de tamaño, exige tres observaciones a confianza baja y reinicia
evidencia no confirmada tras huecos de más de 3 s (permite inferencia lenta).
No cuenta objetos estáticos ni repite un
track confirmado. Bucle sin pausa extra cuando la inferencia supera 125 ms:
objetivo hasta 8 análisis/s, no garantía de FPS. Diagnóstico visible de candidatas,
mejor score, umbral y duración. Falta medir pasos perdidos/falsos con vídeo real.

La cartelería es una tercera superficie opcional, independiente del iPad.
Cuatro esquinas interiores en sentido horario, homografía 540 × 960, ajuste
numérico opcional. El bucle general arranca automáticamente cuando hay fuente
conectada, cartelería marcada y vista visible, aunque el análisis esté pausado.
Pausar análisis devuelve al bucle sin apagarlo. Ocultar/desconectar/recalibrar
(también mediante coordenadas) retira el iframe. Volver a la vista lo reanuda,
pero no inicia inferencia. Apagar player y los errores requieren Reanudar manual;
no hay reintentos infinitos. Redimensionar invalida las tres zonas.
Nunca se embebe IEU ni se eligen permisos del usuario.

`signage.mjs`/`signage-ui.mjs` montan el player real de Admira.tv con pantalla,
circuito y máquina `xtore-virtual-<uuid>` nuevos; mute, conditional, modeLock,
cam=0, shot=0, rtb=0, stream=1. No se escriben etiquetas en un destino físico. El iframe
es **opaco** (`sandbox=allow-scripts`, SIN allow-same-origin); no comparte DOM,
canvas ni localStorage del portal. No quitar esa protección para resolver CORS.
Los comandos sin imágenes se dirigen al WindowProxy exacto con targetOrigin `*`
(necesario para origen opaco); respuestas requieren origin `null`, ventana exacta
y requestId pendiente aleatorio. `null` por sí solo no autoriza mensajes.

El canal usa la misma versión local/publicada del portal, mediante el opt-in
`xtoreParent=1` y padre exacto validado (Admira/www o localhost con puerto).
Sin filtro `format=9:16`: este parámetro filtraba etiquetas del catálogo, no
la geometría de la superficie. `stream=1` evita esperar CacheStorage inaccesible
desde un origen opaco. No se cambia el comportamiento de disco de otros players.

`player-data.mjs` obtiene únicamente catálogo público y matriz global: dos URLs
fijas, GET sin credenciales ni redirecciones, máximo 2 MiB/10 s, una petición por
recurso y mínimo 2 s entre lecturas. El hijo no elige URL, headers, método ni
pantalla. Cierre aborta y descarta respuestas tardías. No lee ni envía capturas,
histórico, cookies o tokens. CSP habilita solo esos endpoints para esta lectura.
El CLI del opt-in también acepta exclusivamente el padre/origen configurados.

Sin presencia, con criterio desconocido o sin contenido compatible se aplica
el bucle general, no el default contextual de la matriz. Solo una regla de
audiencia concreta con creatividad disponible puede interrumpirlo. No se inventa
edad adulta para persona; clima/geolocalización y condiciones de sexo/edad
desconocidos no disparan reglas. Las directivas remotas genéricas no toman control
del opt-in. Repetir el mismo segmento no reinicia el vídeo. Se conservan las
reglas y el comportamiento de players ordinarios fuera de este opt-in.

Arranque neutro con sondeo idempotente cada 500 ms, mismo requestId, límite 20 s.
No depende del load de recursos secundarios. Pasos confirmados → bici, moto,
coche o persona por prioridad; neutro tras 6 s sin nuevos pasos. Un watchdog
de racha sin ACK vigente cierra a los 2.5 s aunque haya pasos constantes.
ACKs obsoletos no reactivan ni tumban una orden posterior. Se cierra si no hay
confirmación de reproducción/carga en 30 s o si el iframe vuelve a navegar.
`selected` no acredita emisión; `playing`, `poster-loaded` y `document-loaded`
distinguen reproducción/carga de media, miniatura de respaldo e interactivo
cargado (este último no acredita reproducción interna). Además del TTL de 6 s
del padre, el forzado caduca en el hijo y su tick de 2 s lo retira si el padre
no puede enviar el neutral a tiempo.

Prueba real inicial en navegador: el canal remoto opaco respondió ACK neutro,
pero no informó media. Resuelto localmente en esta ampliación: catálogo/reglas
HTTP 200 bajo la CSP de Xtore, iframe opaco y `playing` de al menos dos piezas
distintas (19:33:46 y 19:34:02 Europe/Madrid, 11 septiembre 2026). Captura visual
confirma contenido Xtore. Sin cámara, fotografías ni detecciones simuladas en
la prueba real. La prueba no acredita anuncios por categoría en producción.
El endpoint real `/player/xtanco-totem` de Neo confirma que
Persona/Coche/Moto/Bici aún no tienen asset. No se inyectaron detecciones ni
audiencia simulada en el bus. El smoke creó únicamente players virtuales neutros.
La versión de Neo r10 admite padres admira.tv/www; no debe admitir origin null
como padre. La respuesta opaca y el origen real del padre son cosas distintas.
Incorporado origin/main ab999529 (r10) sin perder mejoras locales. Ajuste adicional
local de canal.html: categoría persona mantiene age=null y gender=null hasta el
motor de reglas, no solo en la entrada. Cross-review independiente aprobado y
89/89 pruebas locales. Cambios locales, aún no publicados; D1 tampoco provisionado.

Suite local ampliada (tracking, decoder, lifecycle, permisos, máscara,
Pixeria, bridge e histórico con SQLite), más cross-review independiente. Verificación real completa
de cámara → categoría → creatividad sigue pendiente de fuente y contenido.

## Objetos sin fondo (vista previa local)

Las ayudas de conteo, privacidad y calibración son desplegables cerrados con ›.
Los estados de carga/error y los controles se mantienen visibles.

«Activar recortes sin fondo» prepara DeepLab 0.2.2 / Pascal cuantizado a 2 bytes,
reutilizando TensorFlow.js 4.22.0. Se comprueba carga e inferencia con un canvas
vacío antes de declarar listo el separador. El modelo es el de TensorFlow,
distribuido por Kaggle; script versionado con SRI y destinos limitados en CSP.
Solo se descargan bibliotecas y pesos: las imágenes se procesan en el navegador.

Cada máscara semántica se intersecta con el bounding box de COCO-SSD. Person,
car, motorbike y bicycle se corresponden con las cuatro clases del contador.
Los píxeles eliminados quedan RGBA=0 (no solo alfa transparente). Se rechazan
máscaras vacías/mínimas; nunca se sustituye una máscara fallida por la foto completa.
No es segmentación de instancias: dos objetos solapados de la misma categoría
pueden aparecer juntos. Los detalles finos pueden perderse y necesitan QA real.

Una segmentación activa y, como máximo, una captura pendiente —la más reciente—
limitan la memoria. El conteo registra todos los pasos aunque se omitan recortes
intermedios. Máximo cuatro objetos por captura, con hora y TTL original de 6 s;
la cola no renueva el TTL. Caducidad, pausa y desconexión invalidan trabajo,
borran fuentes y canvas. Los recortes son locales, no anónimos ni sintéticos.

### Pixeria: original temporal → resultado revisado

Inspeccionados remotos Pixeria 94986870d5fd630add906e21606bdf2ed8ee2152 y
pixer-worker 87a76f704ca484c05910d82784d34cb4bb89920b. Stock publica bytes tal
cual: type=digital-twin no anonimiza y no ofrece borrador privado. /twin/spawn
también persiste originales. No se usa ninguno para subir recortes reales.
El anonimizador requiere archivo/cámara, no tiene receptor de imágenes por
postMessage. Su recorte anterior funciona con fondo uniforme y sus prompts
de preservación de sexo/edad no se reutilizan.

Carlos decidió conservar temporalmente la imagen y retirarla cuando exista la
salida elegida: píxel 8 bits, píxel 16 bits o gemelo sintético. Flujo implementado:

1. «Elegir» bajo un recorte retiene una sola copia en memoria, máximo 3 minutos.
   La selección no envía datos. No se puede sustituir una generación o revisión
   pendiente sin cancelarla/descartarla primero.
2. Selector de estilo, aviso de envío a Pixeria/Gemini y botón «Generar en Pixeria».
   Un POST a https://api.admira.store/image/edit; timeout 90 s, sin reintentos,
   cookies, secretos, redirecciones ni caché. Prompt de objeto nuevo, sin inferir
   sexo/edad ni preservar identidades, matrículas o distintivos. No usa el antiguo
   anonimizador ni guarda el original en Stock o en /twin/spawn.
3. Se valida una respuesta raster acotada y decodificable, diferente del dataURL
   de entrada. Se retira la copia original al terminar, fallar, cancelar, pausar,
   ocultar, cerrar o caducar. Se invalidan respuestas tardías, se limpian arrays,
   canvas y referencias. Una comparación de bytes no certifica anonimización.
4. El resultado tiene vista local de hasta 15 minutos. Requiere revisión explícita
   del operador antes de «Publicar resultado en Stock». Únicamente sus bytes van
   a /stock/publish, type=digital-twin; categoría y estilo quedan en metadatos.
   No se publica al terminar la generación automáticamente.
5. Se valida el acuse real con id y URL exacta api.admira.store/stock/asset/<id>.
   Una respuesta perdida deja publicación incierta y enlace a Stock, sin retry
   automático. Caducar o descartar la vista local no elimina un asset ya publicado.

Garantía limitada de borrado: se retiran las copias controladas por esta sesión;
no es un borrado físico certificado de strings/base64 o buffers internos del
navegador. El handler inspeccionado no escribe imágenes en R2/KV, pero sí envía
el original a Gemini, no implementa borrado en Google ni cancelación del trabajo
remoto. Las condiciones de Gemini permiten registros limitados incluso en servicio
de pago; no se ha verificado la retención efectiva de la cuenta ni de plataforma.
Aviso visible antes de enviar; no afirmar anonimización ni borrado remoto total.

Se reutilizan las APIs existentes de Pixeria: CORS admite Admira.tv/localhost
(OPTIONS verificado), pero los handlers no autentican al operador. No se amplían
esas APIs ni se exponen credenciales. Para un despliegue restringido futuro se
requiere endurecer el servicio/puente autenticado; CORS no es autorización.
No se ha realizado una generación con imágenes reales ni una publicación de prueba.
Contrato/ciclo probados con fixtures sin red; precisión y QA extremo a extremo pendientes.

Referencia de retención: https://ai.google.dev/gemini-api/terms

Referencias del separador:
- https://github.com/tensorflow/tfjs-models/tree/master/deeplab
- https://www.kaggle.com/models/tensorflow/deeplab/tfJs/pascal-1-quantized/2

## Privacidad y límites

- Detección y recortes en canvas/memoria, sin storage. Generación opcional:
  únicamente el recorte elegido sale a Pixeria/Gemini tras aviso y clic.
- Captura visible: 6 s. Original seleccionado: hasta generar/fallar/cancelar o
  3 minutos máximo. Pausar, ocultar o desconectar retira el original temporal.
- En desconexión se paran tracks y se retira el fondo compartido.
- Las descargas del detector/separador contienen bibliotecas/pesos; su ejecución
  no envía fotos. El adaptador de generación es un flujo saliente distinto.
- No se hace proxy del HLS, no se retira X-Frame-Options y no se incrusta IEU.
- No se sirve ninguna captura a otro visitante de la ruta pública.
- El operador debe elegir una pestaña que no contenga otros datos privados.
- Cambiar el encuadre dentro de IEU requiere pausar y recalibrar: no hay telemetría
  del panorama desde una pestaña compartida.

La fuente comprobada no ofrece deep links de escena ni API de iPad expuesta;
el iPad de la imagen es parte de la fotografía. Esta alternativa no es un acceso
automático de un clic al vídeo: la selección de pestaña siempre requiere al usuario.

## Integración MCP / Neo

El iPad y el puente opcional de cartelería se alimentan de los eventos del detector.
No se activa ni se afirma un bus MCP remoto desde el navegador. No se incluyen
secretos de flota. La transformación/publicación de Pixeria es un flujo separado,
con los límites de autenticación y retención descritos arriba.

El MCP de Trinity (`xtore-va-mcp`, v0.2.1, fuera de este repo) ya tiene los colores
y snapshots tipados de vehículo/persona, y entrega de audiencia al contrato de Neo.
Conectar este productor local a ese servidor requiere un transporte autenticado
aprobado (o productor edge autorizado). No transmitir fotos por el canal agregado
`/audience/xtanco-totem`, diseñado solo para cinco campos no visuales.

## Verificación / publicación

```
python3 tools/gen-apps-grid.py --check
node --check videoanalytics/xtore/xtore.mjs
node --test videoanalytics/xtore/*.test.mjs
```

Pruebas de tracking/geometría no equivalen a precisión medida en la calle.
QA manual obligatoria antes de declarar directo validado:

1. Portal → nueva ruta, manteniendo Vídeo y PDF de la tarjeta.
2. Preparar detector: descarga verificada y estado listo / error reintentable.
3. Seleccionar la pestaña IEU en Chrome, calibrar cámara e iPad.
4. Verificar persona, coche, moto, bici, oclusiones y paso con baja iluminación.
5. Ver captura y color correctos, caducidad, pausa, desconexión y cambio de tamaño.
6. Comprobar en producción las cabeceras CSP/Permissions-Policy de la ruta.
7. Activar «Recortes sin fondo» y comprobar los bordes de las cuatro categorías,
   oclusiones, tráfico seguido y caducidad. La carga e inferencia inicial del modelo
   se han probado en navegador con la CSP de la ruta; la calidad en calle sigue
   pendiente. La suite incluye caducidad de una fuente activa
   mientras otra captura espera en cola.
8. Elegir un recorte, comprobar los tres estilos, consentimiento, resultado y
   retirada del original. Revisar contornos/identidad antes de publicar. Confirmar
   en una prueba autorizada que solo el resultado llega a Stock. No marcar esta
   prueba como realizada a partir de mocks o de un OPTIONS correcto.

La publicación sigue el deploy firmado del repo, tras cross-review de Neo.
No ejecutar deploy desde una copia antigua ni sobrescribir su player en curso.

## Grabación de seguridad

No implementada ni activada. Diseño y condiciones de activación en
[SECURITY-RECORDER.md](./SECURITY-RECORDER.md): flujo nativo autorizado, grabador
software siempre encendido, almacenamiento privado dedicado, retención propuesta
28 días, purga y auditoría independientes del navegador. No usar Pixeria ni el
bucket público VIDEOS para originales. No confundirlo con las capturas efímeras.

Referencias primarias:
- https://github.com/tensorflow/tfjs-models/blob/master/coco-ssd/README.md
- https://developer.chrome.com/docs/web-platform/screen-sharing-controls
- https://developers.cloudflare.com/pages/configuration/headers/

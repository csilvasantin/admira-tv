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
La primera vez el usuario confirma el recuadro de cámara y las cuatro esquinas del iPad.
Las marcaciones válidas de cámara, iPad y cartelería se guardan automáticamente
como último preset local y se restauran al volver a compartir una vista compatible.
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
La vista debe permanecer visible para inferir. Ocultación, mute de la fuente o
más de 3 s sin fotogramas suspenden temporalmente un análisis solicitado. Al
volver vídeo fresco en la misma fuente y estar visible, se recupera automáticamente.
Pausa manual, desconexión, recalibración, formato incompatible o error del detector
cancelan esa intención: no se reactivan solos ni se solicita otra captura.

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

## Recuperación y música condicionada — 12 septiembre 2026

Se conserva la intención de análisis durante ocultación, mute temporal, más de
3 s sin fotogramas y cambios proporcionales de tamaño. Un único sondeo de 500 ms
espera vista visible, fuente sin mute, fotograma nuevo, marcas válidas y que termine
la inferencia anterior. No procesa imágenes oculto. Si el navegador pausó el vídeo,
reintenta play en la misma fuente con espera de 2 s, sin pedir otra captura.
Pausa manual, desconexión, recalibración, formato incompatible o error del detector
cancelan la intención. La barra superior muestra si analiza o espera recuperación.

`conditional-music.mjs` entrega cuatro reglas locales exclusivamente para
`xtore-virtual-zapatillas`: persona → Berlin / Take My Breath Away (Top Gun),
ID `1786533143983-n2y09e`; coche y moto → Huey Lewis & The News /
The Power of Love (Regreso al Futuro), ID `1786532932584-a1412h`; bici → Pixeria #998,
AZUL Y NEGRO - Me estoy volviendo loco, vídeo ID `1789214248874-j6qqjo`, URL observada
`https://stock.admira.store/stock/1789214248874-j6qqjo/asset.mp4?v=8878237`.
Nueva regla de bici, misión `DCL-0c79557c38bde9f05e2ec381`: pendiente de publicación
y verificación. Su vídeo inicia al 50 % de la duración real del medio en cada nueva
activación o repetición, nunca a partir de una duración editorial. Renovar la misma
presencia mantiene posición sin volver a buscar la mitad. Esta excepción pertenece
solo al condicional de bici del perfil virtual exacto; no a la playlist base aunque
incluya ese asset, ni a otros players. Persona y bici de un ciclista conservan ambos
pasos si se confirman: la prioridad de bici no elimina el conteo de persona.
Se posiciona antes de reproducir; sin duración válida en 10 s o si falla el seek,
se permite reproducción desde cero con aviso en consola, sin garantizar la mitad
ni evitar autoplay. Duración real observada de #998: 215,434739 s, mitad ≈107,717 s
(1:47,7); es referencia del archivo consultado, no un offset fijo de configuración.
Se resuelven contra el catálogo vigente; solo medios musicales reproducibles HTTPS.
No clasifica sexo/edad, no modifica matriz global ni playlist de Flota. Si falta la
pieza mantiene la base. Prioridad simultánea: bici, moto, coche, persona.
La presencia confirmada renueva la misma categoría cada 1 s sin reiniciar la pieza.
El margen de pérdida es 1,5 s desde el fotograma observado, no desde el fin de la
inferencia. Un temporizador independiente devuelve a base aunque el detector
se quede esperando; si queda otra categoría válida pasa directamente a ella.
El TTL del hijo sigue siendo 6 s de respaldo. Las pruebas manuales conservan
6 s desde el clic, no desde playing: la carga consume parte del plazo.

## Presencia y rectángulos — 12 septiembre 2026

Conteo, presencia y capturas son independientes. `PassageTracker.visible(now)`
devuelve bbox normalizada, número local, confianza, edad del fotograma y confirmación.
Dos observaciones fuertes confirman presencia aun estando quieto (tres para bici
inferior al 65 %); solo movimiento confirmado suma un paso. Tras 1,5 s sin evidencia
fuerte hay que reconfirmar sin olvidar el conteo durante los 8 s de asociación.
Las candidatas débiles no pueden sostener el condicional indefinidamente.
Inferencias de >=1,5 s se descartan; la geometría retenida/predicha no es presencia.

`TrackingOverlay` pinta rectángulos e ID (#1, #2…) con color estable por trayectoria,
no por sexo ni identidad, dentro del ROI y sin interceptar clics. Discontinuo
significa pendiente de confirmar o continuidad breve incierta. Se borra por edad
con temporizador propio aunque no llegue otro fotograma; pausa/calibración limpia
la capa y reconfirma presencia. Reset de cifras mantiene geometría y presencia.
No usa rostros/embeddings, no guarda trayectorias y no envía IDs/cajas al player.
No es identificación; cruces, oclusiones o reentradas pueden cambiar/asociar mal IDs.
Patinetes siguen siendo registro manual sin cajas ni comandos automáticos.
Las capturas de iPad siguen caducando a los 6 s y solo se crean al contar pasos.

«Reglas musicales · probar» ofrece botones explícitos para esas cuatro categorías
y volver a playlist. Solo sin intención de análisis ni calibración; no incrementa
pasos, capturas ni histórico. Solicitar análisis neutraliza una prueba anterior.
No es una herramienta MCP ni evidencia de detección. Las reglas y recuperación
se prueban con fixtures; la reproducción también se verifica con medios reales
y esos botones, sin solicitar captura ni alterar la sesión de vídeo del usuario.

## Último preset y mini mando — 12 septiembre 2026

`preset.mjs` conserva solo geometría normalizada (ROI, cuatro esquinas de iPad
y DS), dimensiones de referencia y fecha. Clave propia
`admira.xtore.zapatillas.calibration.v1`, esquema v1, máximo 4096 caracteres.
Guarda cada marcación válida, también presets parciales; nunca valores iniciales
sin confirmar, imágenes, permisos, identidad, eventos ni credenciales.
Es local a navegador y origen: no se sincroniza con la playlist de Flota ni
entre equipos. Almacenamiento bloqueado, cuota o datos corruptos se explican
sin fingir persistencia. Un fallo de escritura no sustituye el preset anterior.
Olvidar borra únicamente esta clave, no el encuadre activo, contadores o histórico.

Se restaura después del permiso de compartir y de recibir dimensiones válidas,
sin iniciar detección. Admite escalado proporcional con tolerancia del 0,5 %
respecto a la referencia fija de calibración, no respecto al último resize.
Un formato incompatible conserva el preset pero exige nuevas marcas. Un resize
cancela inferencias tardías; si es proporcional conserva las marcas y recupera
solo el análisis previamente activo al llegar vídeo fresco. Si había selección
en curso, esta y el diálogo numérico se cancelan sin reanudar automáticamente.
No detecta giros/zoom del gemelo con igual proporción: el operador debe comprobar
la superposición y remarcar si cambió la vista antes de iniciar análisis.

El perfil musical exacto de Xtore añade Anterior, Siguiente, Sonido/Mute y Repetir
pieza al principio de «Contenido en antena», tanto en presentación previa como
integrada. No es el previo de parrilla de un equipo físico ni amplía controles a
otros perfiles. Doble toque o Ctrl+I abre la ficha; X o Escape con foco dentro la
cierran sin detener música ni desactivar una repetición. La cabecera se arrastra
dentro del player o se mueve con flechas al enfocarla con Tab (10 px; Mayús, 30 px).
Botones nativos y foco visible; toolbar sticky, cuerpo con scroll y posición
limitada al viewport del player (`#wrap`), no al rectángulo editorial del vídeo.
La ficha se mantiene vertical y dispone del alto del visor aunque una pieza
horizontal reduzca o gire el MUPI. Dentro de Xtore sigue proyectándose con el
iframe exterior. Cierre, arrastre y ecualizador sí son comunes al player;
no modifican la homografía/calibración exterior ni acceden al DOM del padre.

Repetir pieza es local y solo para audio/vídeo al terminar naturalmente. Liga
identidad ID/URL y contexto base/condicional; se desarma al cambiar de pieza o
contexto, con Anterior/Siguiente, al desactivarlo o al avanzar por un error.
No se permite en sincro, directo o standby ni para imágenes. Una audiencia válida
puede interrumpirlo y neutral/TTL sustituye la pieza: repetir NO renueva los 6 s
del transporte: solo la presencia fresca renueva. No persiste ni escribe reglas/playlist; cerrar la ficha
no lo desarma. Los callbacks se verifican con `_playTok` y el audio sustituido se
detiene. Mute lee el elemento real y sigue sujeto al permiso de autoplay.

El contador superior «1 de X» corresponde a la playlist efectiva; un condicional
de una sola pieza es «1 de 1». Si no coincide la pieza seleccionada con la posición
de la lista, muestra «— de —», nunca una posición inventada. No es proof-of-play.
AUDIO/LIVE/MUTE ocupa otra fila debajo de las barras del ecualizador. El mando
reutiliza navegación y audio de esta instancia: no añade herramientas MCP, no
modifica Flota ni controla otros equipos. Sin lista, fuera del perfil, con ficha
cerrada, en standby o directo no acepta acciones. «NO DESCARGADO» es falta de
copia offline, no ausencia de reproducción online.

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
Validación de recuperación (11 septiembre, posterior a r12): 100 pruebas Xtore
pasan. En navegador aislado, un catálogo QA falló con HTTP 503 durante los primeros
31 s: se vio el aviso de demora, se mantuvo el iframe y a los 65 s llegó `playing`
con una imagen pública real. En otra ejecución, bucle de dos imágenes → criterio
de coche con regla QA → tercera imagen con `playing, loop=false` → vuelta a
`playing, loop=true` a los 6 s. Criterio de bici sin regla conservó el bucle.
Fixtures y diagnóstico solo en un servidor temporal fuera del repo; no publicados,
sin cámara ni contadores ni pantallas físicas. No acredita detecciones reales ni
que el Chrome de Carlos ya haya cargado la corrección. Los callbacks de una pieza
antigua tampoco pueden avanzar la nueva tras una interrupción válida.

Cuatro esquinas interiores en sentido horario, homografía 540 × 960, ajuste
numérico opcional. El bucle general arranca automáticamente cuando hay fuente
conectada, cartelería marcada y vista visible, aunque el análisis esté pausado.
Pausar análisis devuelve al bucle sin apagarlo. Ocultar/desconectar/recalibrar
(también mediante coordenadas) retira el iframe. Volver a la vista lo reanuda,
pero no inicia inferencia. Apagar player y los fallos del canal de órdenes requieren
Reanudar manual. La demora de media no apaga el player: conserva los reintentos
de catálogo mientras la vista siga activa. Redimensionar invalida las tres zonas.
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
recurso y mínimo 2 s entre lecturas. Hasta 16 lectores concurrentes comparten la
misma operación, cada uno con su requestId; en la ventana de 2 s se reutiliza la
respuesta. Los timeouts responden error sin cuerpo. El hijo no elige URL, headers, método ni
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
No depende del load de recursos secundarios. Presencia confirmada → bici, moto,
coche o persona por prioridad; neutro tras 1,5 s sin presencia válida. Un watchdog
de racha sin ACK vigente cierra a los 2.5 s aunque haya pasos constantes.
ACKs obsoletos no reactivan ni tumban una orden posterior. Si no hay confirmación
de reproducción/carga en 30 s se muestra «Carga demorada» SIN desmontar el iframe;
un evento real posterior puede confirmar la recuperación. Una navegación posterior
del iframe sigue cerrando su canal.
El catálogo Xtore tiene reintento single-flight a 3/6/12/24/30 s tras error,
además del refresco normal. Se normalizan metadatos y se rechaza una sustitución
malformada antes de perder el catálogo anterior. Las reglas son independientes.
La variante H.264 tiene HEAD acotado a 2 s en Xtore (5 s en el canal ordinario),
sin memorizar como inexistente un error de red. Se conserva la superficie anterior
durante esa consulta. El vídeo Xtore sin datos tiene hasta 15 s para cargar;
no se confunde automáticamente el búfer vacío a 3,5 s con un fallo de códec.
No equivale a una playlist offline ni garantiza emisión sin media accesible.
El ACK se muestra separado, dentro de «Conexión con el player»: nunca pisa
el estado de reproducción después de pausar o volver al bucle. Antes de una
primera emisión se indica «Canal conectado · esperando emisión». Seleccionar
una nueva pieza retira el estado anterior y muestra «Cargando contenido ·
emisión pendiente» hasta un evento de carga/reproducción, sin reiniciar plazos.
Registro previo r11 (11 septiembre): 94 pruebas pasaban. En un player real
aislado, el primer arranque no confirmó media en 30 s y cerró; al repetir,
catálogo y reglas respondieron HTTP 200 y hubo contenido visible con `playing`.
Reafirmar neutro conservó el indicador de reproducción. Esto valida la corrección
del indicador, NO demuestra la causa del primer fallo ni la del Chrome de Carlos.
No se recargó su captura ni se introdujeron detecciones simuladas.
`selected` no acredita emisión; `playing`, `poster-loaded` y `document-loaded`
distinguen reproducción/carga de media, miniatura de respaldo e interactivo
cargado (este último no acredita reproducción interna). Además del margen de presencia
de 1,5 s del padre, el forzado caduca en el hijo a los 6 s y su tick de 2 s lo retira si el padre
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

## Help de carga y documentación MCP — 11 septiembre 2026

`Help · carga y reproducción` es un desplegable cerrado en Cartelería condicionada.
Explica los estados, la descarga independiente de pesos, catálogo/reglas JSON y
media online; no promete porcentaje descargado ni funcionamiento offline.
`Preparando bucle general` era un placeholder ambiguo, no telemetría de descarga:
ahora distingue Player en espera/apagado/detenido por error y remite al motivo.
La guía advierte también de pendientes del histórico antes de una recarga.

El MCP local independiente `/Users/Carlos/Claude/xtore-va-mcp` incluye la guía
completa `docs/xtore-help.md`: `get_help` y recurso `admira-va://help` devuelven
el mismo Markdown dentro de JSON, con `documentation_only:true`. No consultan
estado ni red y no controlan la captura. `get_contract` enlaza la guía y separa
el bus legado del postMessage de la web. MCP local 0.2.10, ayuda 2026-09-12.8:
20 herramientas contando
alias y 4 recursos. Clientes ya abiertos requieren reinicio de su proceso MCP
para descubrir la nueva ayuda; no se ha forzado ese reinicio ni un despliegue.

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

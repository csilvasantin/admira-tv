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

Clases: person (gris), car (marrón), motorcycle (verde), bicycle (ámbar).
No clasifica sexo, género, edad, identidad o atención. No se presenta como Astra
ni como un modelo de precisión ya validada. Los bordes rosa/azul requerirían otro
productor evaluado: no se inventan atributos para cumplir la paleta.

Un tracker efímero exige dos detecciones y desplazamiento, elimina tracks a los
1.5 s sin señal y emite una sola vez por track. No es reidentificación y puede
duplicar eventos con oclusiones o perder pasos rápidos. Una cámara muy lejana,
baja resolución, poca luz, reflejos o movimiento de la escena requieren evaluación.
La vista debe permanecer visible. Pausa al ocultarla, cambiar tamaño de fuente,
perder fotogramas o señal, recalibrar o producirse un error.

La leyenda muestra pasos acumulados de Personas, Coches, Motos y Bicis. El total
es siempre la suma de las cuatro categorías; cuenta todos los objetos confirmados
de una captura, no solo la categoría que determina su borde. Una persona sobre
una bici puede contribuir a ambas categorías si ambas detecciones se confirman.
Los contadores viven solo en memoria y se conservan al caducar una captura,
pausar, ocultar, recalibrar o desconectar. Empiezan de cero al conectar una nueva
fuente correctamente o recargar. No se reconstruyen a partir de los eventos de
versiones anteriores ni se almacenan imágenes para reconstruirlos.
Son pasos estimados, no individuos únicos: una pausa, oclusión o regreso al
encuadre puede producir un nuevo paso. El desglose de sexo/género no se infiere.

## Privacidad y límites

- Frames y capturas solo en canvas/memoria. Nada se sube ni se guarda en storage.
- La captura visible caduca en 6 s; al pausar, ocultar o desconectar se borra.
- En desconexión se paran tracks y se retira el fondo compartido.
- Las descargas externas contienen bibliotecas/pesos, nunca fotos de la cámara.
- No se hace proxy del HLS, no se retira X-Frame-Options y no se incrusta IEU.
- No se sirve ninguna captura a otro visitante de la ruta pública.
- El operador debe elegir una pestaña que no contenga otros datos privados.
- Cambiar el encuadre dentro de IEU requiere pausar y recalibrar: no hay telemetría
  del panorama desde una pestaña compartida.

La fuente comprobada no ofrece deep links de escena ni API de iPad expuesta;
el iPad de la imagen es parte de la fotografía. Esta alternativa no es un acceso
automático de un clic al vídeo: la selección de pestaña siempre requiere al usuario.

## Integración MCP / Neo

El player local se alimenta directamente de los eventos de este detector. No se
activa ni se afirma un puente remoto desde el navegador. No se incluyen secretos
de flota ni endpoints de escritura sin autenticar en el cliente.

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

La publicación sigue el deploy firmado del repo, tras cross-review de Neo.
No ejecutar deploy desde una copia antigua ni sobrescribir su player en curso.

Referencias primarias:
- https://github.com/tensorflow/tfjs-models/blob/master/coco-ssd/README.md
- https://developer.chrome.com/docs/web-platform/screen-sharing-controls
- https://developers.cloudflare.com/pages/configuration/headers/

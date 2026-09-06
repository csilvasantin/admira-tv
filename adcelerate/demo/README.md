# Universo outdoor · Vila de Gràcia

La entrada `/adcelerate/demo/` abre el entorno Three.js controlable, centrado en la plaza a las 18:00 y con el reloj detenido. Arrastrar permite orbitar; rueda y botones acercan/alejan. Quiosco y Plaza seleccionan el soporte conocido y su ámbito. Hora y capas abre los controles existentes; Audiencias abre el detalle y la tarjeta mantiene el resumen visible.

La geometría urbana proviene de `data/gracia-local.json` (OpenStreetMap, ODbL). Las extrusiones y sus alturas no tienen validación individual; la plaza y el modelo del quiosco son ilustrativos. No son una réplica catastral. El único soporte identificado es el quiosco OSM 3350101407, `bcn-kiosk-016`, origen 41.4002641 N, 2.1573332 E.

## Humano · exploración fotográfica a pie

Entrada directa: `/adcelerate/demo/?view=human`. El botón **Humano** de la barra y
el antiguo modo humano de Cámara abren esta experiencia; ya no llevan al avatar de
la maqueta. `/adcelerate/demo/` conserva el entorno 3D como vista general.

El modo a pie comienza en los paneles publicitarios del quiosco, en el panorama
Google de marzo de 2023 que tiene conexiones de Street View. W / flecha arriba
avanza por una conexión real próxima al rumbo actual; S / flecha abajo busca una
conexión a la espalda. A / D y flechas izquierda/derecha giran la mirada. También
puede arrastrarse la fotografía y usarse los botones táctiles o elegir una conexión
en **Rutas**. Son transiciones entre fotografías conectadas; no es locomoción
continua sobre una reconstrucción 3D ni permite atravesar lugares sin imágenes.

El HUD muestra rumbo, cambios de vista, fecha de la fotografía actual y un radar
con la dirección y distancia aproximada al nodo OSM del quiosco. No es un mapa de
cobertura. La fecha procede de los metadatos de cada panorama; si no está disponible
se indica. **E · Inspeccionar** aparece en el soporte calibrado; **Ficha del quiosco**
permite consultar su contexto en cualquier momento. La ficha ofrece los paneles y
el mostrador histórico de 2017, que puede carecer de conexiones: **Volver al quiosco**
recupera la entrada conectada. Las superposiciones publicitarias están limitadas al
panorama de los paneles para el que fueron calibradas; no se arrastran a otra calle.

La inspección solo abre información y recomendaciones de demostración. No compra
inventario, no emite anuncios ni contabiliza impactos del recorrido. Se conservan
la hora, aforo, selección y capas del universo. **Mapa 3D** o Escape destruyen el
renderer fotográfico y recuperan la cámara anterior. La tarjeta de audiencia de
la maqueta se oculta durante el modo humano para priorizar la imagen.

El contrato versión 1 añade `walk-command`, `walk-state` y `support-select`.
Los comandos usan una lista cerrada; los estados y el emisor se validan antes de
actualizar el HUD. `js/human-view.js` contiene el HUD y el radar; el renderer hijo
resuelve las conexiones reales y descarta respuestas de navegación obsoletas.

## Recorrido entre quioscos

El selector **Destino** y **Siguiente quiosco** alternan entre Vila de Gràcia y
Jardinets. **Volver al quiosco** regresa a la entrada del destino seleccionado.
Los cambios entre destinos son accesos directos a fotografías verificadas, no
pasos ficticios por la calle. El selector, la ficha, el radar, el título y la URL
siguen el destino actual. Enlaces reproducibles:

- `/adcelerate/demo/?view=human&site=vila`
- `/adcelerate/demo/?view=human&site=jardinets`

El catálogo compartido `js/outdoor-sites.js` identifica las dos entradas. Jardinets
usa el panorama `L6xcO37SQfBmCxsT9lPdjQ` de marzo de 2023, con POV 290° / −6° / 0.9,
comprobado con Street View y la fotografía solicitada. La posición
41.397772717774245, 2.1576335976146668 es la cámara de esa fotografía; el radar la
identifica como **Punto de visita**, no como coordenada inventariada del soporte.
Su ficha muestra **Audiencia pendiente de conectar**, sin heredar la cifra,
mezcla ni recomendación de Vila. La audiencia existente conserva su origen
`bcn-kiosk-016`, separado de `walk-state.siteId`.

El mapa 3D sigue representando Vila. Su tarjeta **Entrar a pie** entra en Vila;
la opción **Humano** de la barra recuerda el último destino de exploración.
El retorno al 3D conserva la cámara, hora, capas y aforo de Vila.

Mantener W/S o un botón de avance mantiene una única intención de movimiento.
Cada imagen debe terminar de cargar antes del siguiente paso: no se acumulan
saltos por repetición del teclado. Soltar la tecla, el puntero, perder la captura
o salir de la ventana cancela la continuación. Las teclas también funcionan
tras pulsar los botones del HUD; los campos de texto y selectores mantienen su
comportamiento nativo. Las rutas siguen siendo conexiones reales de Google.

En el cruce de Mozart, **Rutas → Entrar en Jesús · 2 pasos** aparece solo cuando
existe la primera conexión verificada. El recorrido hace el desplazamiento lateral
y después entra en Jesús, validando ambos enlaces. **Parar recorrido** interrumpe
la continuación; un movimiento manual o cambio de destino también la cancela.

## Audiencia de demostración

La curva de 24 horas y las mezclas de perfiles son datos simulados definidos en `js/main.js`. No existe una fuente telco ni una calibración MITMA. La cifra base puede fijarse manualmente entre 0 y 800; la cifra de personas representadas aplica el factor meteorológico existente. Ambas cifras se muestran con su contexto. La meteo se obtiene de Open-Meteo; activar RT cambia reloj/meteo, no convierte la audiencia en una medición real. El contenido del canal puede ser real y es independiente de la audiencia simulada.

## Vista real opcional

“Acercarme · vista real” carga el motor Google/Street View en un iframe del mismo origen. Conserva la llegada guiada cancelable y las dos fotografías verificadas: mostrador de noviembre de 2017 (imagen histórica) y paneles publicitarios de marzo de 2023. La fecha permanece visible. No se colocan anuncios virtuales sobre la foto del mostrador.

El parent conserva cámara, selección, hora, aforo manual y capas en memoria. El contrato `OutdoorContext` versión 1 transfiere hora, base y cantidad efectiva, mix exacto y capas; se validan origen, ventana emisora y valores. El hijo anuncia `ready` y espera contexto antes de cargar Google. No sustituye la hora por una franja cercana. Mientras la foto está abierta, el renderer Three y su vídeo están pausados. Al volver, se elimina el iframe completo para descartar vuelos, Street View y callbacks tardíos. Escape dentro de la foto también vuelve al universo.

La URL histórica `/adcelerate/demo/best/` redirige al universo antes de iniciar Google. Los enlaces explícitos con `?side=front`, `?side=panels` o `?cal=1` conservan su intención y abren la foto. Solo `?embed=1` dentro de un iframe permanece como hijo; un enlace top-level con ese parámetro también vuelve al universo. No se transportan claves entre enlaces.

## Verificación

Desde la raíz del repositorio:

```sh
node --test adcelerate/demo/tests/*.test.cjs adcelerate/demo/best/tests/*.test.cjs
node --check adcelerate/demo/js/main.js
git diff --check
```

La vista Three puede verificarse con un servidor estático local del repositorio completo. Google requiere un origen autorizado; usar un preview Cloudflare del proyecto existente, sin cambiar las restricciones de la clave. El flujo de despliegue y el sello global siguen siendo los del repositorio.


En la fotografía de 2022 del cruce (`CwrbI-sF75wSN69YO9QYEg`), Google no ofrece
esa salida. **Rutas → Abrir cruce conectado · marzo 2023** cambia explícitamente
al panorama próximo de 2023; no suma un paso ni inventa un enlace de la imagen
anterior. Una vez cargado, ofrece **Entrar en Jesús · 2 pasos** usando las conexiones
verificadas. La fecha visible siempre se obtiene del panorama actual.

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

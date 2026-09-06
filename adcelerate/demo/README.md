# Universo outdoor · Vila de Gràcia

La entrada `/adcelerate/demo/` abre el entorno Three.js controlable, centrado en la plaza a las 18:00 y con el reloj detenido. Arrastrar permite orbitar; rueda y botones acercan/alejan. Quiosco y Plaza seleccionan el soporte conocido y su ámbito. Hora y capas abre los controles existentes; Audiencias abre el detalle y la tarjeta mantiene el resumen visible.

La geometría urbana proviene de `data/gracia-local.json` (OpenStreetMap, ODbL). Las extrusiones y sus alturas no tienen validación individual; la plaza y el modelo del quiosco son ilustrativos. No son una réplica catastral. El único soporte identificado es el quiosco OSM 3350101407, `bcn-kiosk-016`, origen 41.4002641 N, 2.1573332 E.

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

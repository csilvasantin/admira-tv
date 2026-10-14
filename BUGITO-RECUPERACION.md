# Recuperación individual en el laboratorio Bugito

Las cuatro inyecciones pueden acumularse en un player virtual `virtual-lab-*`. Desde la CLI del mando de esa misma pantalla, se retiran independientemente:

| Fallo | Retirar sólo este fallo |
|---|---|
| Formato girado | `fault-rotate off` |
| Cambio de resolución | `fault-canvas off` |
| Popup sobre la emisión | `fault-popup off` |
| Pantalla a medio abrir | `fault-half off` |

Cada retirada conserva el giro del operador, los otros fallos y sus fechas de caducidad. Repetir una retirada es seguro. `fault-clear` mantiene su comportamiento: retira las cuatro inyecciones.

La cola y las salvaguardas existentes siguen exigiendo la pantalla concreta de laboratorio. El player publica las medidas reales del DOM; el vigilante compara cada detector y abre o cierra su incidencia correspondiente en Yokup.

Validación: `node --test canal-fault-superficie.test.mjs canal-fault-rotate.test.mjs canal-remote-ios.test.mjs`. Las pruebas acumulan cuatro fallos y comprueban las cuatro retiradas, la preservación de los fallos restantes y su caducidad, el giro del operador, la idempotencia y el rechazo de broadcasts y destinos ajenos.

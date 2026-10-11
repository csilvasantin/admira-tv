# Proyectos de CarlosGdG

La selección compartida se guarda en Cloudflare desde https://ainimation.studio/taza/.
Elegir proyecto y pulsar Guardar asociación. Starbucks Gestión de colas recibe eventos;
Starbucks Pantalla y música sigue la pantalla configurada. CanalKiosk sigue Jardinets.

El gestor de colas debe enviar POST a
https://playertaza.csilvasantin.workers.dev/api/mug-status con JSON:

```json
{"project":"starbucks-queue","via":"queue-follow","name":"PEDIDO 42","verb":"LISTO"}
```

Si está seleccionado otro proyecto, devuelve ok:false y no publica ni envía el aviso.
El botToken y la clave del bridge no deben distribuirse a productores. No enviar
por Bubble directamente: ese tráfico externo no puede filtrarlo PlayerTaza.
Los productores deben usar la API común. Los GIF, píxeles y actividad directos
no pueden sobreescribir una asociación activa. El Mini comprueba bindingRevision
antes de cada RPC y descarta trabajos de asociaciones anteriores.

Esto es segmentación funcional, no autenticación de productores: las etiquetas
project/via son declaradas por el emisor. Para clientes ajenos al equipo será
necesario asignar credenciales por proyecto antes de dar acceso de escritura.

Validación 2026-10-07: 10 pruebas de Worker y 3 de puente. Prueba pública:
evento de colas rechazado bajo CanalKiosk; evento de kiosk rechazado bajo colas;
PRUEBA COLAS / LISTO aceptado y observado en LEDs de CarlosGdG (slot 1).
La conexión del gestor real de Elon/Jensen queda pendiente de identificar su URL/repo.

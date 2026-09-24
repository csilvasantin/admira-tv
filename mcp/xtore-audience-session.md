# Xtore · audiencia de sesión → XpaceOS y Pixeria

Versión del contrato: `admira.audience-session.v1` · 24/09/2026 · Yokup #240.

## Qué está disponible

- Analizador: https://admira.tv/videoanalytics/xtore/#audience-session
- Help humano: https://admira.tv/help/#xtore-audiencia
- Esquema JSON: https://admira.tv/mcp/xtore-audience-session.schema.json
- Contadores de pasos y sentido, calibración guardada, exportación JSON y mensajes entre ventanas enlazadas.
- XpaceOS, tienda enlazada `xtore-virtual-zapatillas`: modo Real usa `counts.person` como objetivo de visitantes virtuales. El modo de cámara física Exacto sigue separado.
- Pixeria: existe el flujo explícito Anonymizer → Generar → Publicar, con sus APIs actuales. La importación automática de sesiones en Pixeria y su lectura remota por MCP NO están implementadas.

Este recurso es un contrato técnico para agentes, **no un nuevo servidor MCP ni una herramienta remota que pueda leer la memoria de una pestaña**. No inventar `audience_get`, `audience_subscribe` ni llamadas similares. Descubrir las herramientas reales con `tools/list` antes de usarlas.

## Semántica exacta

`counts.person` son pasos confirmados acumulados desde el inicio o Reset de esta sesión. Si vale 9, el objetivo del gemelo es 9 visitantes sintéticos; no 9 más en cada actualización, ni 9 menos las salidas. No son personas únicas ni ocupación física de Santa Rosa 19.

- **Personas entran** (`directions.enter`): movimiento desde el fondo de la calle hacia la cámara.
- **Personas salen** (`directions.exit`): movimiento desde la cámara hacia el fondo.
- **Sin dirección** (`directions.unknown`): pasos confirmados sin trayectoria suficiente o lateral. Puede reducirse cuando se resuelve su sentido.
- Invariante: `enter + exit + unknown === counts.person`.
- `car`, `motorcycle`, `bicycle` son pasos acumulados; `scooter` es confirmación manual. No restar ni sumar vehículos al público de la tienda.

No calcular aforo como `enter - exit`. No identificar caras, edad o género; estos datos no existen en este contrato. Una persona que reaparece tras perderse la continuidad puede contarse otra vez. Una vuelta en U no genera una segunda dirección sobre la misma trayectoria ya clasificada.

## Contar el sentido

Se usa el centro inferior de la caja de persona dentro del recorte. Eje normalizado: punto del fondo → punto cercano a cámara. Por defecto arriba → abajo. Para cámara oblicua, abrir «Audiencia de sesión · XpaceOS y Pixeria» y pulsar «Marcar sentido · fondo → cámara»: dos puntos dentro del recuadro. Se guarda con el encuadre local.

Clasificación tras al menos 3 observaciones fuertes, 300 ms y desplazamiento proyectado ≥0,08 del recorte, predominante sobre el lateral (factor 1,25). Pausas/oclusiones ≥1,5 s requieren una nueva trayectoria continua. Una clasificación por paso. Ajustar la dirección no reconstruye el pasado; Reset inicia otra sesión para una medición limpia. Precisión pendiente de validación con recorridos reales etiquetados.

## Ciclo de sesión

- UUID nuevo al cargar la página, conectar otra fuente con éxito o pulsar Reset.
- Pausa, reanudación y pérdida temporal de señal conservan sesión y totales.
- `revision` crece al cambiar contadores o calibración. `updatedAt` fecha ese cambio; no se rejuvenece con el latido. `state` puede cambiar sin alterar el total.
- `startedAt`, `updatedAt` y el `ts` del sobre son milisegundos Unix.
- La sesión reside en memoria: una recarga no conserva el 9 anterior. El histórico privado de pasos es independiente; las nuevas direcciones no se archivan allí todavía.

## Transporte XpaceOS, implementado

Abrir «Abrir gemelo · zapatillas» desde el analizador o «Conectar player y cámara» desde el gemelo. El enlace usa `window.opener`, origen exacto, pantalla y nonce `twinSession` UUID. URL del gemelo:

`https://www.xpaceos.com/admira-xp/?autostart=xtanco&virtualPlayer=xtore-virtual-zapatillas&twinOrigin=https%3A%2F%2Fadmira.tv&twinSession=<UUID>`

No construirla en otra ventana sin el handshake. Los dos botones de gemelo actuales abren el mismo Xtanco enlazado. Orígenes de producción permitidos: `https://admira.tv`, `https://www.admira.tv` y XpaceOS con/sin www, según emisor. Localhost únicamente entre entornos de desarrollo.

Sobre del evento:

```json
{
  "source": "admira-xtore-twin",
  "screen": "xtore-virtual-zapatillas",
  "session": "00000000-0000-0000-0000-000000000001",
  "event": "statistics",
  "seq": 12,
  "ts": 1790244000100,
  "passages": {"person": 9, "car": 0, "motorcycle": 0, "bicycle": 2, "scooter": 0},
  "audience": {
    "schema": "admira.audience-session.v1",
    "sessionId": "00000000-0000-0000-0000-000000000002",
    "startedAt": 1790243900000,
    "revision": 11,
    "updatedAt": 1790244000000,
    "site": "admira-xperience-santa-rosa-19",
    "source": "puerta-cam",
    "screen": "xtore-virtual-zapatillas",
    "metric": "cumulative-passages",
    "state": "analyzing",
    "counts": {"person": 9, "car": 0, "motorcycle": 0, "bicycle": 2, "scooter": 0},
    "directions": {"enter": 4, "exit": 3, "unknown": 2},
    "directionAxis": [[0.5, 0], [0.5, 1]],
    "directionMeaning": {"enter": "toward-camera", "exit": "toward-street-end"}
  }
}
```

Ejemplo sintético, no captura ni valores actuales. `session` autentica el emparejamiento; `audience.sessionId` identifica el conteo y cambia con Reset. No son intercambiables.

El receptor comprueba ventana/origen/pantalla/nonce, secuencia y edad del sobre. Recibe un snapshot cada 500 ms; **reemplaza**, no suma. Rechaza revisiones regresivas y cambios contradictorios con la misma revisión. El contador deja de estar disponible tras 4 s sin latido. `traffic` describe posiciones efímeras; `camera.counts` presencia instantánea. Ninguno reemplaza `audience.counts`.

Modo Real en la tienda enlazada: objetivo `min(counts.person, 80)` visitantes, total exacto visible sin capar. Ajuste progresivo: clientes en compra/cola pueden terminar antes de salir. Staff no cuenta como visitantes. Sin snapshot compatible/fresco, se muestra ausencia de datos y objetivo cero, sin pasar a simulación aleatoria ni a la otra cámara. El modo Juego recupera su simulación. Los personajes y sus compras son simulación, no personas ni ventas reales. El contador «Sesión/Virtuales» compara dato y representación actual.

## Pixeria y MCP: conexión disponible y trabajo del mantenedor

Endpoints documentados en los portales actuales:

```json
{"mcpServers":{
  "xpaceos":{"url":"https://mcp.admira.store/mcp"},
  "pixeria":{"url":"https://mcp-pixeria.admira.store/mcp"}
}}
```

Confirmar disponibilidad y argumentos con `initialize` + `tools/list`; no se ha certificado aquí una llamada autenticada a esos servidores. El portal de Pixeria documenta `search_stock`, `stock_stats`, `get_asset`; XpaceOS documenta `publish_asset`, `screen_now` y `help`, entre otras. Ninguna de esas herramientas consume por sí sola la sesión de esta pestaña.

Hoy puede exportarse el snapshot con **Exportar audiencia de sesión · JSON**, para revisión o para que el mantenedor implemente el receptor. No subir ese archivo al Stock como si fuera una imagen ni afirmar que Pixeria lo ha importado.

El flujo de imagen existente es independiente: botón Generar usa `POST https://api.admira.store/image/edit` con original efímero, categoría y estilo; Publicar usa `POST /stock/publish` con el resultado sintético. No ejecutar Generar/Publicar por un latido, ni recrear la identidad de una persona. El incremento de público solo debe cambiar el número de visitantes genéricos, no generar N imágenes ni cargar N veces el mismo asset.

Para habilitar recepción de sesión en Pixeria o un MCP remoto, el mantenedor debe:

1. Añadir un receptor autenticado y acotado por cuenta, sitio y sesión. Validar el esquema y límites; separar endpoint de métricas de endpoints de imágenes.
2. Guardar/upsert por `sessionId` y `revision`, reemplazando snapshots. Misma revisión/mismo cuerpo = éxito sin duplicar; misma revisión/diferente cuerpo = conflicto; revisión inferior = rechazar. No usar el UUID como credencial. Nueva sesión debe seleccionarse explícitamente, no sumarse a la anterior.
3. Exponer una lectura de sesión y sus estados mediante MCP, anunciarla en `tools/list` y su Help. Cualquier cambio de contenido debe seguir las autorizaciones existentes del producto. No colocar claves de flota en el navegador.
4. Seleccionar assets sintéticos existentes por categoría; mantener la procedencia de sesión separada del asset. No enviar imágenes, cajas, identidades ni atributos personales en este contrato agregado.
5. Probar 9 repetido → 9, Reset → 0 con nuevo UUID, pausa sin pérdida, desconexión → sin señal, replay rechazado y error recuperable. Solo entonces cambiar el estado de integración Pixeria a implementada.

## Verificación y recuperación

Pruebas automatizadas: aproximación, alejamiento, lateral/ruido, eje diagonal, gap, reinicio y compatibilidad de encuadres. Prueba de gemelo con datos sintéticos 9 y Reset 0; no acredita precisión de Puerta Cam real. Para validar en tienda: una persona camina en cada sentido y se compara conteo manual con el nuevo contador.

Si se ve «—», comprobar enlace y pestaña del analizador; no interpretarlo como cero observado. Si direcciones quedan a cero con pasos >0, revisar eje y continuidad. Si se usa una versión antigua del analizador, el contador histórico de pasos sigue siendo compatible, pero el nuevo modo de sesión espera `audience` v1.

## Demo de cuatro pantallas (24/09/2026, Yokup #248)

En el Xtanco enlazado, clic en la cámara de la esquina (`camCPMClick`) alterna demo. Alternativa accesible: Player y cámara → Activar/Desactivar demo zapatillas. Estado local en memoria, desactivado tras recarga; desconectar conserva el modo mostrando sin señal.

Superficies fijas: DS1 = player actual; DS2 = recorte original de Puerta Cam (vídeo identificable); TFT pared larga = snapshot de sesión; gestor de turnos detrás del mostrador = geometría y categorías exclusivamente sobre fondo neutro. No usa el borrado por fondo temporal del analizador y no reutiliza imágenes originales ni modificadas. No lo confundir con anonimizar la pantalla2 ni el resto del producto.

No requiere herramientas MCP nuevas: consume los eventos existentes `playback`, `camera`, `traffic` y `statistics` de la ventana autenticada. Camera/traffic caducan a1,5s; statistics a4s. Player conserva su TTL propio. No señales = pantalla de espera, nunca fallback a vídeo del juego. Desactivar restaura la función normal de cada superficie. Se suspenden temporalmente los overlays que taparían las pantallas; no se modifican sus reglas de emisión ni se manda contenido a pantallas físicas. Help: https://admira.tv/help/#xtore-demo-pantallas

### Arranque y disponibilidad de cámaras (corrección 24/09/2026)

El recorte original se envía desde el inicio solicitado del análisis, antes de esperar el modelo. La preparación se divide en descarga medida (fase 4/5, máximo 180 s) y calentamiento del motor (fase 5/5, máximo 45 s). Los metadatos de trayectorias solo nacen de inferencias reales; la cámara de recuadros permanece en espera hasta entonces. Pausa, desconexión, pérdida de fuente o calibración cancelan el envío. Se mantienen los TTL de cámara/tráfico y el origen de captura; no se concede ni persiste permiso de captura. Recargar el analizador crea una sesión nueva, requiere volver a compartir Digital Twin 360 y recupera el encuadre compatible.

[Guía animada de arranque](https://admira.tv/apps/video/xtore-camara-arranque.mp4), no grabación real.

### Barra de sesión y etiquetas de trayectoria

El HUD del Xtanco enlazado se titula Pasos de sesión / Session passages. Usa un único snapshot validado para counts.person, car, motorcycle y bicycle; tras caducar, las cuatro cifras son —, nunca un cero inventado. En otras tiendas mantiene el aforo físico sin columnas de vehículos. Las etiquetas de vídeo dicen Persona · ID N: trackId es secuencial entre categorías, no total, identidad ni personas únicas. El contador de pasos solo incluye trayectorias confirmadas y con desplazamiento; Reset conserva la secuencia de IDs.

## Control manual de demo: /resetaudiencia (Yokup #274)

Comando local del CLI inferior de XpaceOS, disponible también a través del dispatcher existente xtAPI. No se anuncia una nueva tool MCP remota.

- `/resetaudiencia N`: entero decimal de 0 a 100; fija visitantes virtuales, conserva personal, cámara y snapshot agregado. Cero elimina inmediatamente visitantes, sin registrar ventas ficticias. Valores fuera de rango o fraccionarios se rechazan sin mutación.
- `/resetaudiencia auto`: borra el override y devuelve control al modo CAM seleccionado. En Xtore enlazado Real usa counts.person reciente (máximo automático 80); sin señal no inventa público.
- Sin argumento: consulta modo y sintaxis.

Requiere partida activa y tienda abierta. G.manualAudienceTarget tiene prioridad frente a camApplyToStore y el cap horario. Reconciliación cada segundo; G.peopleOverride impide nuevas entradas sobre el objetivo. Persistencia en guardado de partida, no entre partidas nuevas de autostart. `/aforo real|exacto|fake` y `/people store` válido liberan este override. No modifica sessionId, revision, counts, direcciones, trayectorias o segmentación. No debe interpretarse como aforo observado ni enviarse a Pixeria como dato medido. Los visitantes añadidos son sintéticos y no consumen check-ins pendientes del club.

Con 100 visitantes puede haber solapamiento inicial y menor rendimiento. Pruebas: 0 elimina incluso cola/compra conservando personal; 100 se mantiene ante mensajes nuevos; auto recupera 36 del snapshot de prueba; entradas inválidas no mutan; CLI real verificado 0 y 100.

[Help](https://admira.tv/help/#xtore-resetaudiencia) · [Guía animada](https://admira.tv/apps/video/xtanco-resetaudiencia.mp4).

## Comportamiento de visitantes virtuales (Yokup #278)

Las visitas tienen una misión local: buscar un producto, comparar o acompañar. Itinerario finito de uno a tres muebles distintos, reserva de punto de observación fuera del acceso y pausa de 120–240 ticks (2–4 s a60Hz); destino bloqueado se abandona tras900 ticks, fase de exploración limitada a5400 ticks. Sin visitas accesibles no hay compra simulada. La atención conserva el checkout existente y su probabilidad de conversión.

La navegación conserva durezas y radio corporal. Ante estancamiento recalcula un camino que considera otros visitantes; la separación no deshace un paso ya avanzado hacia una esquina. Admisiones dosificadas (grupos existentes admitidos juntos), colas alejadas de la puerta y votación al paso. camForceExact llama siempre a startCustomerLeave para que la reducción de audiencia tenga trayecto y destino exterior. No modifica los snapshots ni cuenta esas salidas virtuales como personas salen de Puerta Cam.

Un layout cerrado sigue sin ruta: no se concede permiso de atravesar sólidos. En manual/Real el reconciliador conserva el objetivo reponiendo bajas, aunque cada individuo finalice su visita. Contrato de mensajes y herramientas MCP sin cambios.

Pruebas: entradas/salidas mixtas, diez llegadas coincidentes,24 visitas completas sin saltos ni segmentos dentro de muebles, tres destinos distintos con pausas acotadas, layout imposible sin venta y reducción de cámara con salida completa. [Help](https://admira.tv/help/#xtore-visitas) · [Guía animada](https://admira.tv/apps/video/xtanco-visitas-con-objetivo.mp4).

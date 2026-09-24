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

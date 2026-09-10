# AdmiraNeXT · interactividad de canales y Ojo de Dios

Revisión de handON del 10 de septiembre de 2026 por OraculoMacMini (Codex).
Misión Yokup: `DCL-82362de287df9c1d4211f322`, proyecto `admira-tv`.
Código revisado: `acd41f5f8a76656f7280842207527de37e8a0e4f`.

## Situación comprobada

La [demo de Jardinets](https://admira.tv/adcelerate/demo/?view=human&site=jardinets)
permite explorar una fotografía Street View de marzo de 2023, elegir entre diez
personajes numerados y operar el poste que regula los peatones. Se ven el soporte
publicitario, el plano cenital con tres quioscos y los controles de recorrido.
La calle es una fotografía histórica; los gustos de los personajes son asignaciones
de demostración. Esta revisión no acredita detección de transeúntes reales.

Hay dos mecanismos de interactividad en el código:

| Entrada | Selección de contenido | Destino |
| --- | --- | --- |
| Pulsar un personaje o mover el poste | Coincidencia exacta de etiquetas `musica` y `1`…`10` del Stock | Player local `jardinets-main` y orden al circuito `ipad-admin`, pantalla `ipad-admin-mupi` |
| Cambio del perfil dominante de la audiencia simulada | Clasificación heurística por título/etiquetas; selección rotativa dentro de la programación del quiosco | Canal del gemelo y orden al dispositivo asociado al quiosco |

El catálogo público consultado contiene 948 elementos. El resolvedor actual encuentra
las diez correspondencias musicales sin ausencias ni ambigüedades. Los artistas
asignados son White Rabbit / The Matrix, Rage Against the Machine, Westlife, *NSYNC,
The Communards, Guns N’ Roses, Berlin, Huey Lewis & The News, Benson Boone y Blur.
Es una asignación editorial; no una inferencia sobre los gustos de las personas de
la fotografía. La clasificación por perfiles tampoco constituye medición real.

La música individual se repite localmente y reenvía la orden al comenzar otra vuelta.
Al retirar la selección se recupera el player local anterior. El retorno remoto
depende del comportamiento del canal al finalizar su interrupción; el gemelo no
envía una orden explícita de restauración en `stopMappedMusic()`.

## Hueco prioritario: confirmar lo que ocurre en la pantalla

`mandarAlaPantalla()` envía `play<num>` a `/locations/cmd` y devuelve únicamente
`response.ok`. No conserva el identificador de la orden ni consulta su resultado.
El estado musical visible procede del player local. Por tanto, verlo reproducirse
en el gemelo no demuestra que lo esté haciendo el iPad.

El canal ya tiene infraestructura de acuses (`/locations/cmd/ack`, outbox persistente,
identidad de cola y acción). Conviene reutilizarla, pero también revisar su semántica:
la ruta genérica de `executeQueuedCommand()` llama a `runCli()` y responde
`executed`; ese acuse, por sí solo, no demuestra un evento de reproducción del medio.
Hay que correlacionar la orden con la pieza y la confirmación efectiva del player.

Otro límite al crecer: los destinos están escritos en `SITE_SCREEN` y `SITE_CIRCUIT`
para tres quioscos. El mapa todavía no constituye un inventario mundial conectado.

## Siguiente incremento propuesto

Convertir Jardinets en el primer soporte con una cadena comprobable:

**señal → regla → contenido → orden → confirmación del player → retorno a programación**.

1. En la ficha del soporte, mostrar el canal/dispositivo asociado y la procedencia
   de la señal: simulación, interacción voluntaria o fuente real identificada.
2. Mostrar la decisión: regla aplicada, pieza elegida, prioridad y duración de la
   interrupción. Mantener separados el personaje elegido y el perfil simulado.
3. Conservar el identificador de la orden y presentar estados distintos: enviada,
   recibida, reproduciendo, fallida o sin confirmación. Una respuesta HTTP correcta
   no debe rotularse como reproducción real.
4. Dar a la intervención una duración máxima y una restitución explícita y
   verificable. Resolver cambios rápidos, dos operadores y desconexión sin que
   una respuesta antigua restaure una selección descartada.
5. Registrar señal, regla, contenido, soporte, actor, tiempos, resultado y retorno.
   Vincular los cambios de producto a su misión Yokup; el registro operativo de
   reproducción debe conservar su propia correlación por orden y dispositivo.

Aceptación: dos selecciones rápidas terminan en la última pieza; un iPad sin
conexión aparece sin confirmación; un fallo de carga no aparece como reproducción;
al vencer o cancelar la intervención se verifica el retorno al canal. La vista del
gemelo y la del dispositivo deben distinguirse incluso cuando divergen.

Después de validar esta unidad, sustituir los tres destinos fijos por un inventario
de soportes con ubicación, circuito, canal, capacidades y estado. Esa es la base
para ampliar el Ojo de Dios a otros emplazamientos sin duplicar lógica por ciudad.

## Evidencia y límites de esta revisión

- Navegador: apertura y lectura de controles de la URL de Jardinets; inspección
  visual del soporte, los diez personajes y el plano cenital.
- Catálogo: lectura del índice público y ejecución del resolvedor real con 10/10
  correspondencias válidas.
- Pruebas existentes: 29 correctas, cero fallos, en `pedestrian-music`,
  `channel-renderer`, `screen-player` y `screen-audio`.
- No se enviaron órdenes manuales de reproducción a dispositivos durante la revisión.
  La ruta a la pantalla real se verificó en código; no se acredita una prueba física
  de extremo a extremo ni el estado actual del iPad.
- No se implementó aún el incremento propuesto. Esta entrega documenta el estado
  comprobado y los criterios para la siguiente implementación.

Entradas principales: `adcelerate/demo/js/interactive-scene.js`,
`adcelerate/demo/js/pedestrian-music.js`, `adcelerate/demo/best/index.html`
(`mappedMusic`, `mandarAlaPantalla`, `viandanteTick`) y `canal.html`
(`executeQueuedCommand`, `ackQueuedCommand`, `pollCmd`).

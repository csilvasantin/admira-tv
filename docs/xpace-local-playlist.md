# Playlists por establecimiento / Venue playlists

Misión Admira Hoy349 · DCL-797cc567ad5030dc8147416d. La interfaz se entrega en Admira Store; este cambio publica primero la autoridad y las guardas de Admira TV.

## ES

Cada playlist pertenece a un proyecto, un establecimiento registrado y un canal (`music` o `screen-<surfaceId>`). AdmiraNext comprueba el acceso comercial y firma un permiso de 60 segundos; Admira TV verifica firma, contexto, operación e inventario antes de resolver el destino. El cliente nunca elige una pantalla física. Un lector puede consultar, pero no añadir ni quitar. Los permisos de agentes/editor no permiten asociar hardware.

`POST /api/xpace-playlists` acepta `resolve`, `add` y `remove`. Añadir exige un ID de Stock compatible: audio/vídeo en música, imagen/vídeo en señalización. Quitar elimina sólo la asociación. Los cambios usan la revisión esperada, UUID de petición y transacción D1: una revisión antigua devuelve conflicto; repetir el mismo comando devuelve su recibo, y reutilizar su UUID con otro cuerpo se rechaza. La asociación, el primer cambio y su recibo se crean juntos. El historial conserva las revisiones anteriores.

Los establecimientos virtuales reciben una identidad propia generada en servidor. Se adopta una vez la selección histórica conocida por servidor; una selección Stock ambigua conservada en el navegador necesita adopción explícita de sus IDs en el local abierto. Nunca se reutiliza una lista mutable de otro establecimiento. Las exclusiones son de la playlist, sin cambiar etiquetas de Stock. Retirar la última pieza guarda un vacío deliberado: no reaparecen contenidos automáticos ni sintéticos.

Las pantallas asociadas son opt-in. D1 pasa a ser su autoridad única: las escrituras antiguas, la importación y la reconciliación KV llevan protección dentro de la transacción SQL. Las pantallas ajenas conservan su comportamiento anterior. La fuente física inicial autorizada es sólo `starbucks / alsea-sbux-021 / music` → `iphone17-mupi`. iPad, colas y eInk quedan fuera de este editor.

### Activación administrativa

Aplicar `migrations/programacion/0002_xpace_playlist.sql` después de publicar las guardas. La asociación se prepara con `preparePhysicalPlaylist`, deja estado `preparing` y bloquea escritores antiguos. Esperar 30 segundos de drenaje, volver a consultar el borrador legado internamente y contrastar su revisión y sus IDs efectivos ordenados. `activatePhysicalPlaylist` adopta las seis piezas manuales y mantiene la automática por pantalla en una sola transacción. Si cambia la fuente o falla la comprobación, no activar. Nunca usar la opción interna `legacyOnly` desde HTTP.

Existe una ruta separada `POST /api/xpace-playlist-admin` para sesión humana owner/admin de TV, mismo Origin y cabecera `X-Admira-Playlist-Admin: 1`. Bearer/editor/viewer/agente se rechazan. Los helpers también pueden usarse por un operador con acceso administrativo D1 auditado. La API de edición normal rechaza preparar/activar antes de tocar el binding.

Después de activar, comprobar siete IDs y orden tanto en `/api/playlist?screen=iphone17-mupi` como en la lectura scoped. Relanzar la WebView para incorporar el consumidor nuevo; no acreditar entrega física hasta verificar recibos. Guardado en D1 y emisión real son estados distintos.

`canal.html` espera la primera respuesta válida de su pantalla antes de emitir. Un vacío válido detiene y libera medios, publica playlist `[]` y `item:null, standby:false`, y conserva el latido. Un error de red no se interpreta como vacío. El primer vacío también se publica en el mando; no se conserva una pieza retirada como ON AIR.

En un canal de música asociado, los audios se reproducen hasta su final real, aunque Stock no publique su duración. El avance local usa `ended`, sin recortar pausas o buffering por un temporizador ni por el límite editorial de tres minutos. La guardia sigue recuperando medios atascados, y cambiar de pieza libera el medio anterior. Los canales de señalización conservan su duración editorial.

El registro de flota virtual es una proyección auxiliar de la autoridad D1. Utiliza su identidad local como circuito; no reutiliza el circuito comercial compartido. Si la flota no responde, el guardado confirmado sigue siendo válido y la siguiente consulta reintenta el registro (`registry.status: pending`); no se acredita asociación física.

## EN

Each playlist belongs to a registered project, venue and channel (`music` or `screen-<surfaceId>`). AdmiraNext checks commercial access and issues a 60-second signed grant. TV validates its scope, context, operation and surface inventory; clients cannot choose physical screens. Read access does not grant editing or hardware association.

`POST /api/xpace-playlists` supports `resolve`, `add` and `remove`. Music accepts Stock audio/video; signage accepts image/video. Removal deletes an association, never Stock content. D1 transactions enforce expected revisions and request UUIDs. Identical retries return the original receipt; a reused UUID with a different body conflicts. Initial authority, mutation and receipt are atomic, with revision history retained.

Virtual venues get their own server-generated identity. Known historical selections are adopted once; ambiguous browser Stock selections require explicit adoption of validated IDs in the current venue. No venue follows another venue's future edits. Automatic exclusions belong to the playlist. Removing its last item stores an intentional empty list, without automatic, synthetic or default fallback.

For associated opt-in screens, D1 is the only playlist authority. Legacy writers, importers and reconciliation are fenced within SQL transactions. Other screens retain their existing behavior. The initial physical association is exclusively `starbucks / alsea-sbux-021 / music` → `iphone17-mupi`; iPad, queue and eInk are excluded.

Hardware preparation/activation requires separate human TV owner/admin authorization or audited administrative D1 access. Apply migration0002 after guards are live, prepare the binding, drain old writers for 30 seconds, validate the fresh legacy revision and ordered effective IDs, then atomically adopt six manual items plus the existing screen automatic item. A changed source blocks activation. Normal editor grants cannot prepare or activate hardware.

Reload the physical WebView after publication and verify its receipts before claiming delivery. D1 persistence is separate from physical playback. The player waits for a valid screen response before starting; an intentional empty list stops/releases media, publishes `items:[]` and neutral `item:null, standby:false`, and keeps the device heartbeat. Network errors do not mean empty.

Associated music channels play audio to its natural end even when Stock has no duration metadata. Local advancement uses `ended`, so a timer or the three-minute editorial guard cannot cut buffering or pauses short. Progress monitoring still recovers stalled media, and switching tracks releases the previous media. Signage channels retain editorial audio slots.

The virtual fleet registry is an auxiliary projection of D1 authority. It uses its local identity as its circuit, preserving the commercial circuit separately. An unavailable registry cannot invalidate a confirmed save; subsequent reads retry registration (`registry.status: pending`) without claiming physical association.

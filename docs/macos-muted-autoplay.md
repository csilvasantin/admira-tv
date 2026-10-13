# macOS · Autoarranque silenciado / Muted autoplay

ES: El player nativo 1.7.1 conserva la playlist asignada a cada screen. Si WebKit rechaza el autoarranque de un vídeo silenciado con NotAllowedError, la app lo inicia una vez mediante callAsyncJavaScript. El vídeo debe estar conectado, listo, sin error ni final, y ser el vídeo directo de #stage en /canal o /canal.html de admira.tv. Pausa del mando, standby, audio audible y medios de iframe quedan fuera. Un segundo rechazo queda en el registro; no se concede una autorización de cámara, micrófono ni administrador.

EN: Native player 1.7.1 preserves each screen's assigned playlist. If WebKit rejects muted video autoplay with NotAllowedError, the app starts it once through callAsyncJavaScript. The video must be connected, ready, healthy, not ended and the direct #stage video on admira.tv /canal or /canal.html. Remote pause, standby, audible audio and iframe media are excluded. A second denial is logged; no camera, microphone or administrator permission is granted.

## Uso / Usage

ES: Asigna la playlist al screen exacto desde Parrilla → Por defecto. No uses el hashtag genérico de marca cuando quieres una selección concreta. Conserva la opción silenciada y abre el player habitual. Verifica movimiento visible y una vuelta completa; el acuse del mando y el título en antena no prueban vídeo.

EN: Assign the playlist to the exact screen through Rundown → Default. Use an exact list rather than a general brand tag. Keep muted playback and start the regular player. Verify visible motion and a full loop; command acknowledgement and now-playing titles do not prove video playback.

## Verificación / Verification

ES: Prueba previa en MacMini con vídeo real: currentTime avanza y WebKit entrega fotogramas sin clic. MBP16, screen macbookpro16, detectó bajo consumo en corriente y NotAllowedError incluso en mute; la prueba de recuperación nativa consiguió reproducción y avance a la siguiente pieza sin intervención local. La playlist vigente de ese equipo contiene las tres adaptaciones Starbucks horizontales 16:9. No se modifica el estado Matrix ni se enlaza el Mac a IDs de pantallas virtuales de la tienda.

EN: MacMini preflight with real video: currentTime advances and WebKit produces frames without a click. MBP16 screen macbookpro16 reported low-power AC mode and muted NotAllowedError; native recovery started playback and advanced to the next item without local interaction. Its current playlist contains the three horizontal 16:9 Starbucks adaptations. Matrix state and virtual store screen identities are unchanged.

Mando / Remote: https://admira.tv/remotecontrol/?screen=macbookpro16
Playlist: https://admira.tv/api/playlist?screen=macbookpro16
Telemetría / Telemetry: https://api.admira.store/signage/now?screen=macbookpro16
Contenido / Content: Stock 1791911750081-gwi050 (Frappuccino), 1791911786480-11avm9 (Horchata), 1791911820935-6aajy5 (Your Drink Your Story).

No se añaden comandos ni contratos MCP / No commands or MCP contracts are added. Los controles de playlist, mute, pause/play y standby conservan sus APIs / Playlist, mute, pause/play and standby APIs retain their contracts.

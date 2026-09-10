# Jardinets: interfaz y personaje 1

Misión Yokup: DCL-64b79f7dc62d5f01f867e3ab. Responsable: TrinityMBP14 · MacBookProNegro14.

Demo: https://admira.tv/adcelerate/demo/?view=human&site=jardinets&travel=walk&speed=1

1. Al entrar, el menú está oculto. H lo muestra y lo vuelve a ocultar. S controla los marcadores de selección por separado.
2. El slider del poste conserva diez niveles y control de teclado, pero no dibuja números.
3. Arrastra al personaje 1 de la chaqueta marrón. Durante el gesto aparece la zona del kiosco. Al soltar dentro se reproduce «Berlin - Take My Breath Away (Official Video - Top Gun)».
4. Retíralo de esa zona para restaurar la programación de la demo. Escape o la cancelación del gesto devuelven la posición anterior.

Vídeo: https://admira.tv/adcelerate/demo/tutorials/jardinets-persona1-topgun.mp4

El minitutorial se exportó con ADmira Motion del generador oficial https://www.admiranext.com/tiktok/. Es una guía animada, no una grabación de pantalla. Exportación WEBM convertida a MP4 H.264/AAC; duración 15,189 s, 1080×1920. Fotogramas revisados a los 6 y 12 segundos.

## Alcance y comprobación

El arrastre se aplica al personaje 1 en el panorama de Jardinets indicado. Las demás personas conservan su selección por clic. Es una capa 2D anclada al panorama; la posición se reinicia al cambiar de panorama o recargar. No es un modelo 3D ni reconocimiento de personas. Se utiliza la captura aportada con una máscara CSS; el intento de extracción con ImageGen no produjo alfa real y no se publicó.

Top Gun se asigna explícitamente al gesto sin modificar las etiquetas del catálogo: el vídeo conserva #7 para los usos anteriores. Si falta el vídeo, se muestra el error y no se sustituye por otro. Retirar al personaje restaura el reproductor de la demo; el player físico sigue su mecanismo de sincronización existente. Se verificó reproducción en navegador y aceptación de la orden al player `ipad-admin-mupi`; no se observó directamente el dispositivo físico.

Validación: 121 pruebas automatizadas correctas. Gesto de entrada y retirada comprobado en fixture interactivo y en admira.tv. H comprobado en ambos sentidos. Los logs del reproductor registraron el ID `music:1786533143983-n2y09e` en estado `playing`, duración 251,33 s y audio habilitado. La carga local del panorama está restringida por el referer de Google Maps, por eso la comprobación integral se realizó en producción.

Guion: «Admira.tv · Jardinets: menú oculto al entrar. Pulsa H para mostrar el menú. Arrastra al personaje 1 delante del quiosco. Al soltar, suena Top Gun. Retíralo para restaurar la programación. Slider sin cifras. Prueba en admira.tv/adcelerate/demo».

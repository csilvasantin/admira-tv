# Jardinets: diez personajes y control con cursores

Misión Yokup: DCL-0b0258a5587b9b56e9cbbee7. Responsable: TrinityMBP14 · MacBookProNegro14.

Demo: https://admira.tv/adcelerate/demo/?view=human&site=jardinets&travel=walk&speed=1

## Uso

- Arrastra cualquiera de los diez personajes numerados. Cada uno conserva su propia posición y su música de catálogo.
- Suelta un personaje en la zona de escucha frente al kiosco para activar su vídeo. El personaje 1 conserva la asignación especial de Top Gun. Las etiquetas existentes del catálogo no se modifican.
- Si llegan varias personas, suena la última que haya entrado. Al retirar a la que suena, recupera la anterior que siga en la zona; sin ocupantes, restaura la programación de la demo.
- Selecciona al personaje 1 con un clic: aparece el contorno de selección. Usa ← ↑ ↓ → para caminar. Mantener una tecla produce movimiento continuo; las diagonales conservan la velocidad.
- El ciclo de ocho fases articula las piernas y el cuerpo según la distancia recorrida. Al soltar las flechas, queda en reposo. Escape cancela un arrastre o deselecciona al personaje y devuelve las flechas al paseo.
- H conserva el menú oculto por defecto y permite mostrarlo. S oculta marcadores, conserva las personas desplazadas y libera la selección. El slider mantiene sus niveles sin dibujar números.

## Alcance

Las diez selecciones corresponden al panorama registrado de Jardinets. Son recortes 2D de la fotografía, no modelos 3D, detección de transeúntes en vivo ni captura de movimiento. La fase de marcha utiliza articulación 2D de la imagen del personaje 1: todavía no tiene vistas laterales/traseras ni colisiones físicas. El resto se desplaza mediante arrastre y mantiene su pose fotográfica. La selección 6 conserva el grupo sentado que ya estaba asociado a esa región.

Las posiciones son temporales: se reinician al cambiar de panorama o recargar. Los controles no capturan las flechas mientras se escribe en un campo o se utiliza un slider. Se detiene la marcha al perder el foco o esconder la pestaña; la preferencia de movimiento reducido conserva el desplazamiento sin animación de piernas.

La activación usa el reproductor y el envío al player físico existentes. La comprobación visual se realiza en navegador; que una orden sea aceptada no demuestra por sí solo lo que está mostrando el dispositivo físico.

## Evidencias

127 pruebas automatizadas correctas. Prueba interactiva de entrada al kiosco de las diez selecciones, posiciones independientes y retorno a la música del ocupante anterior. Los cuatro cursores modifican la posición del personaje 1 y no alcanzan el receptor de navegación de cámara; Escape libera las teclas. Ocho fases revisadas en la página de poses de la propia implementación.

Fases: https://admira.tv/adcelerate/demo/best/tests/walk-poses.html

Minitutorial: https://admira.tv/adcelerate/demo/tutorials/jardinets-personas-videojuego.mp4

El tutorial es una guía animada exportada con ADmira Motion en https://www.admiranext.com/tiktok/, no una grabación de la demo. Se conserva el guion y se revisa el MP4 exportado.

Guion: «Jardinets: diez personajes en movimiento. Arrastra al quiosco. Selecciona al 1: muévelo con flechas. Música por personaje. Ocho fases de paso para el uno. Escape devuelve el control al paseo. admira.tv/adcelerate/demo».

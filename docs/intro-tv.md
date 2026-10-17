# Intro en vídeo de la portada · Homepage video intro

admira.tv · NeoMacStudio · MacStudio · 17-oct-2026.

## Español

La portada de admira.tv abre con la intro «Todo en orden» con el look de admira.tv y su propia historia. Carlos eligió el 17-oct-2026 «Pantallas que responden». Son 15 segundos:
- un reloj marca las 09:58: «La tienda abre a las 10:00»;
- fallan las pantallas (en negro), los vídeowalls (desincronizado), los tótems (sin contenido) y los escaparates (contenido caducado);
- pasa la línea «ADMIRA.TV» y quedan emitiendo, sincronizado, en directo y actualizado: «Resuelto antes de abrir»;
- «Pantallas, vídeowalls, tótems y escaparates. Veinte soluciones conectadas para crear, operar y medir experiencias digitales.»;
- cierra con «Espacios que **responden**.» (con «responden» en rojo, como en la portada), «Admira Xperience · espacio, contenido y contexto» y «admira.tv».

Lleva el fondo oscuro con rejilla de puntos, titulares blancos en la letra del sistema y los acentos verde (`#3df08a`) y rojo (`#ff4b55`) de la portada.

- **Cuándo:** una vez por sesión y por idioma (`sessionStorage`, `admiratv_intro_a`).
  - El idioma es el de la portada: `?lang=`, luego `admtv-lang` y, si no hay nada, español.
  - Al cambiar con la píldora ESP/ENG (`admira:languagechange`), sale en el idioma nuevo si aún no se ha visto en él.
  - Si está en marcha, el vídeo y la música cambian de idioma en el mismo segundo.
- **Cuándo no:** con «reducir movimiento», con una marca blanca activa (`?marca=<id>`, `?project=`, `mb:marca`) o con `?intro=0`. `?marca=admira` es el modo por defecto. `?intro=1` la fuerza.
- **Música:** una por idioma: castellano «Tic-tac y campanas» e inglés «Pulso». Si el navegador no deja sonar, queda el botón «🔊 Activar sonido». `?musica=campanas|pulso|0`.
- **Ficheros:**
  - `assets/intro-tv/intro.js`;
  - en `media/intro-tv/`: vídeos `intro-tv-a-{es,en}-{1080,720}.mp4` y músicas `musica-campanas.mp4` y `musica-pulso.mp4`;
  - van en `media/` y no en `assets/` porque el `_headers` de admira.tv sirve todo `/assets/*` como `application/javascript` con `nosniff`;
  - las músicas van en `.mp4` porque Cloudflare no sirve `.m4a` por rangos.
- **Cómo se hizo:**
  - es la misma maqueta animada que las intros de xpaceos.com, admira.store y admira.studio, con `?tema=tv`;
  - se capturó fotograma a fotograma a 30 fps y se codificó en H.264 con AVFoundation.
- **Pruebas:** `intro-tv.test.mjs`.

## English

The admira.tv homepage opens with a 15-second intro in admira.tv's look:
- screens, video walls, totems and shop windows fail before opening;
- the «ADMIRA.TV» line sweeps through and everything is on air;
- it ends with «Spaces that **respond**.».

It plays once per session and per language, follows the ESP/ENG pill (`admira:languagechange`) and switches video and music at the same second if it is playing. It is skipped with reduced motion or an active white-label brand. Music is one per language. `?intro=0|1` and `?musica=campanas|pulso|0` are supported.

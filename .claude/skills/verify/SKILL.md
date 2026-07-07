---
name: verify
description: Receta de verificación runtime del canal (canal.html) en este repo — server estático :8811 + preview tools, sin build.
---

# Verificar el canal (admira-tv)

Sitio 100% estático, sin build. El canal vive en `canal.html`.

## Lanzar

- `preview_start` con la config `admira-tv-static` de `.claude/launch.json`
  (python3 http.server en 127.0.0.1:8811).
- URL de pruebas: `http://127.0.0.1:8811/canal.html?screen=test-keys&clean=1`
  (`clean=1` quita la barra de navegación y el chrome de portería).
- El feed real carga solo (índice del Stock vía api.admira.store / R2);
  espera a `playlist.length > 0` antes de sondear.

## Flujos que merece la pena conducir

- Controles ocultos de testing: despachar
  `new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true})`
  (y Left/Up/Down) sobre `window`; leer el toast `#testHud` del DOM
  (2 líneas: nombre·peso·x/y y #tags).
- Guards: flecha SIN shift no mueve `cur`; con foco en un `<input>`
  tampoco (crear input, focus, despachar sobre él).
- Peso vía HEAD: los items del índice traen `size`; para probar el
  fallback usa un objeto sin `size` con url del pub R2
  (`pub-bf043a4d….r2.dev` da content-length a HEAD; `api.admira.store`
  devuelve 404 a HEAD y NO expone content-range → '?').

## Gotchas

- El HUD es efímero (~2,5 s): dispara el evento y captura/lee el DOM en
  la MISMA tanda de tool calls o llegarás tarde.
- El marcador de versión es el comentario `<!-- BUILD canal v.DD.MM.AAAA.rN -->`
  (línea ~24); en prod se verifica con `curl -s https://www.admira.tv/canal.html | grep BUILD`.
- Deploy = commit/tag a mano + `./deploy.sh` (Cloudflare Pages es el origen).

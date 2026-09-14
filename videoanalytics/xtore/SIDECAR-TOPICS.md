# Sidecar edge Puerta Cam → topics anónimos (sexo · franja de edad)

Jobs #3275 · FLT-100418 · MorfeoMacMini · MacMini · 14-sep-2026. **Estado: contrato listo, banco bloqueado con siguiente paso.** Este documento no es una certificación de cumplimiento.

## Qué pide
Que el borde (un equipo cerca del stream, sin caras a la nube, sin identificación biométrica) publique en el bus de audiencia de la pantalla dos *topics* anónimos, `sex` y `age_band`, que el condicional del player (Neo) pueda usar como usa hoy `kind`. Criterio: etiqueta publicada en el topic en menos de 2 s en banco, o bloqueo honesto con siguiente paso.

## Contrato (bus v2.2, `POST https://mcp-tv.admira.store/audience/<screen>`)
```json
{ "kind": "person", "sex": "f", "age_band": "adulto", "confidence": 0.7, "source": "puertacam-edge", "ts": "2026-09-14T18:40:00Z" }
```
- `kind`: `person | car | motorcycle | bicycle` (como hoy). `sex` y `age_band` solo tienen sentido con `person`; en el resto viajan `u` / `unknown`.
- `sex`: `f | m | u`. `age_band`: `nino | joven | adulto | senior | vejez | unknown` — el mismo vocabulario de segmentación de Pixeria (`SEG_AUD`, `SEG_AGE`), así el condicional y `pickCreative` lo entienden sin traducción.
- `confidence`: 0–1 de la decisión del borde; por debajo de un umbral el productor manda `u`/`unknown`, no adivina.
- TTL del bus: 2 s (como hoy). Nunca viajan imágenes, recortes, cajas, embeddings ni identificadores de persona. No hay reidentificación ni conteo por identidad.
- Relé del portal (`/api/audiencia-virtual`): por defecto sigue rechazando `sex`/`age_band` (decisión del 13-sep). Solo con `XTORE_AUDIENCE_TOPICS=sex,age_band` en el servidor los acepta, validados contra este vocabulario, y solo para `person`. Es un interruptor de política, no de código.

## Por qué hoy no hay banco (bloqueo honesto)
1. **No hay productor con acceso al stream.** La fuente directa de Puerta Cam exige autenticación y no existe ningún productor autorizado (ver `SECURITY-RECORDER.md`). Xtore analiza una *pestaña compartida* del Digital Twin, en el navegador del operador.
2. **El analizador actual no clasifica sexo ni edad.** Xtore usa COCO-SSD/MobileNet v2 en TensorFlow.js: personas, coches, motos, bicis. Su README lo dice explícitamente y advierte que no se inventan atributos.
3. **El MacMini no tiene runtime de visión** (sin OpenCV, mediapipe, onnxruntime ni insightface) y no tiene cámara. No se puede montar un banco real esta noche sin instalar un stack nuevo y sin metraje con consentimiento.
4. **Lab ≠ campo.** Puerta Cam es una cámara de calle: caras pequeñas, contraluz, gorras, mascarillas, grupos. Los estimadores de edad/sexo por cara degradan fuerte en esas condiciones y sesgan por grupo; en campo habrá que medir tasa de `unknown` y error por franja antes de dejar que muevan contenido.

## Siguiente paso (propuesta)
- **Productor edge** en el equipo que ya ve el stream (el Mac que comparte la pestaña o un mini-PC junto a la cámara), en el navegador junto a Xtore: detector de cara ligero + estimador de edad/sexo en TensorFlow.js/ONNX **en el dispositivo**, decisión por trayectoria (no por fotograma), umbral de confianza y publicación al bus con `confidence`. Sin guardar recortes.
- **Banco**: metraje propio con consentimiento o maniquíes/fotos impresas delante de la cámara; medir latencia detección→topic (objetivo < 2 s), tasa de `unknown` y confusión por franja. Documentar límites antes de campo.
- **Gate de política**: Carlos decide si el relé y el bus aceptan `sex`/`age_band` (ventana abierta). Trinity (analizador) y Neo (player) avisados con este contrato.

# Sidecar edge Puerta Cam → topics anónimos (sexo · franja de edad)

Jobs #3275 · FLT-100418 (14-sep-2026), Jobs #3351 · FLT-100472 (15-sep-2026) y Jobs #3376 · FLT-100493 (16-sep-2026) · MorfeoMacMini · MacMini. **Estado 16-sep: el topic está VIVO en banco (productor edge con fixture en el MacMini) y el player real de Neo lo consume en < 1 s; el clasificador real de sexo/edad en el borde sigue bloqueado (ver abajo).** Este documento no es una certificación de cumplimiento.

## 16-sep · Topic VIVO en banco (FLT-100493)
- **Qué cambia respecto al 15-sep.** Entonces el productor era un banco de una pasada (7 labels y fin). Hoy hay un **productor edge continuo** en el MacMini (`admira-tv-mcp/tools/sidecar-edge.mjs`) que mantiene el topic `sex`/`age_band` vivo en la pantalla de banco `puertacam-bench` reproduciendo en bucle un **fixture** con el formato canónico de este documento. Neo puede leerlo cuando quiera: `GET https://mcp-tv.admira.store/audience/puertacam-bench`, SSE `…/audience/puertacam-bench/stream`, o directamente el canal `https://admira.tv/canal.html?screen=puertacam-bench&circuit=xtanco&mode=conditional&audience=remote&muted=1`. Ni el worker (bus `v.16.09.2026.r2`) ni `canal.html` se han tocado.
- **Fixture canónico** (`admira-tv-mcp/tools/fixtures/puertacam-scenes.json`, 74 s en bucle): mujer adulta · hueco · hombre senior · hueco · coche · hueco · hombre joven **por debajo del umbral** (sale `u`/`unknown`: no se adivina) · hueco · mujer `vejez` · hueco · niño/a sin sexo (`u`/`nino` → Persona) · hueco · moto · hueco · bici · hueco · hombre adulto (escrito `adult`, se publica `adulto`) · hueco. Cada escena publica un label por segundo con `ts` = ahora (periodo < TTL 2 s); en los huecos no se publica y el bus cae a `neutral`/`playlist`. Es un fixture: **no sale de ninguna cámara ni de ninguna cara**.
- **Lo que viaja, exactamente** (`labelDeEscena`, probado): `{"kind","sex","age_band","confidence","source":"puertacam-fixture","ts"}` y nada más. Si a la escena (o a la línea JSONL de un clasificador futuro) le llegan `image`, `crop`, `bbox`, `embedding`, `person_id` o `track_id`, se descartan antes de salir del proceso. `age_band` se publica siempre en Pixeria (`nino|joven|adulto|senior|vejez|unknown`); en `car|motorcycle|bicycle` viajan `u`/`unknown`.
- **Costura para el clasificador real**: `sidecar-edge.mjs --source jsonl` lee de stdin una decisión por línea `{kind, sex, age_band, confidence}` y la publica con las mismas guardas. Cuando exista el estimador en el borde, no hay que escribir otro publicador.
- **Evidencia 16-sep (banco, 100 s = más de un ciclo, `tools/sidecar-observe.mjs`, lectura pública sin clave):**

| label (kind/sex/age_seg) | carril | `__xplCam` que pone canal r66 | visible por sondeo 500 ms p50 / max | visible por SSE p50 / max |
|---|---|---|---|---|
| person/f/adulto | TopGun | {gender:f, age:adulto} | 101 / 103 ms | 151 / 274 ms |
| person/m/senior | Matrix | {gender:m, age:senior} | 114 / 114 ms | 221 / 295 ms |
| person/u/unknown (bajo umbral) | Persona | {gender:null, age:null} | 139 / 526 ms | 175 / 278 ms |
| person/f/vejez | TopGun | {gender:f, age:vejez} | 145 / 538 ms | 161 / 258 ms |
| person/u/nino | Persona | {gender:null, age:nino} | 157 / 549 ms | 264 / 375 ms |
| car/u/unknown | Coche | {kind:car} | 121 / 129 ms | 89 / 183 ms |
| motorcycle/u/unknown | Moto | {kind:motorcycle} | 78 / 89 ms | 165 / 285 ms |
| bicycle/u/unknown | Bici | {kind:bicycle} | 72 / 81 ms | 75 / 150 ms |
| person/m/adulto | Matrix | {gender:m, age:adulto} | 76 / 82 ms | 145 / 238 ms |

  34 labels, todos visibles < 2 s (sondeo p50 121 / p95 545 / max 549 ms; SSE p50 175 / max 375 ms); carriles correctos y `neutral (playlist)` entre escenas. Publicación edge → bus p50 73 / p95 91 / max 413 ms, 0 rechazos en 2 ciclos.
- **Lado del player (Neo), canal r66 `v.16.09.2026.r6` abierto con `?audience=remote`, sin tocarlo:** 526 sondeos / 526 ok; `window.__xplCam` pasa a `{kind:'bicycle'}` **180 ms** después del label, a `{gender:'m', age:'adulto', kind:'person'}` en **563 ms** y a `{gender:'f', age:'adulto'}` en **368 ms**; vuelve a `null` (carril neutro) 2,1–2,6 s después del último label, que es el TTL de 2 s más un sondeo. Con la r66 la franja llega de `decision.age_seg` y el `unknown` ya no se convierte en adulto (encargo #3355, cerrado por Neo). **Criterio de Jobs (Neo consume sex/age del sidecar en banco < 2 s, topic vivo): cumplido.**
- **Cómo se arranca y se para** (MacMini): `node tools/sidecar-edge.mjs puertacam-bench --minutes 180 --status ~/.fleet/sidecar/puertacam-bench.status.json`; se apaga solo. No es un LaunchAgent a propósito: un productor perpetuo dejaría la pantalla de banco «viva» en `/signage/screens` y gastaría ~86 k peticiones/día en el worker. Para un banco se arranca, se mide y se apaga.
- **Límites que quedan (honestos).** (1) Sigue sin haber clasificador de sexo/edad en el borde ni acceso autorizado al stream de Puerta Cam: el fixture demuestra **transporte y consumo**, no percepción. (2) Lab ≠ campo: en calle habrá caras pequeñas, contraluz, gorras y grupos; hay que medir tasa de `unknown` y error por franja con metraje consentido antes de dejar que la edad mueva contenido. (3) El relé del portal sigue cerrado por política (`XTORE_AUDIENCE_TOPICS`). (4) La pantalla de banco figura como viva en `/signage/screens` mientras el productor corre.

## 15-sep · Qué se cerró (FLT-100472)
- **Rotura encontrada y arreglada.** El relé del portal y este contrato hablan el vocabulario de Pixeria (`nino|joven|adulto|senior|vejez|unknown`); el bus de audiencia (`mcp-tv.admira.store`) solo admitía inglés (`child|youth|adult|senior|unknown`). Un label `age_band:"adulto"` moría con `400 age_band inválido` (comprobado en vivo el 15-sep contra la pantalla de banco) y el player nunca veía la edad. Desde `admira-tv-mcp v.15.09.2026.r1` el bus acepta **los dos vocabularios**, guarda el canónico inglés en `label.age_band` (+ `elder` = `vejez`) y expone **`age_seg` (Pixeria)** en `label`, en `decision`, en el SSE `/stream` y en `/player/<screen>/health`. Sin label fresco, `decision.age_band` y `decision.age_seg` son `null`.
- **Formato final del topic** (lo que publica el sidecar y lo que lee el player):
```json
POST /audience/<screen>   {"kind":"person","sex":"f","age_band":"adulto","confidence":0.7,"source":"puertacam-edge","ts":"2026-09-15T07:21:55Z"}
GET  /audience/<screen>   {"fresh":true,"label":{"kind":"person","sex":"f","age_band":"adult","age_seg":"adulto",…},
                           "decision":{"lane":"TopGun","creative":"Top Gun","kind":"person","sex":"f","age_band":"adult","age_seg":"adulto","age_ms":109,"hold_ms":0}}
```
  `age_seg` es exactamente el valor que casan las reglas `age` de la matriz del condicional (`player_conditional_set {with_age}` genera ahora las cinco franjas × sexo). **Solo `kind` + `sex` deciden el carril** (P0); la edad viaja para las reglas del player. La edad, como el sexo, solo aplica a `person`: en `car|motorcycle|bicycle` viaja `unknown`.
- **Banco (15-sep, pantalla `puertacam-bench`, DO propio: no toca `xtanco-totem`).** `admira-tv-mcp/tools/sidecar-bench.mjs` publica 7 labels y mide publicar → visible en `GET` (lo que sondea `canal.html?audience=remote` cada 500 ms):

| label (kind/sex/age_band) | decisión vista | publicar ms | visible ms |
|---|---|---|---|
| person/f/adulto | TopGun · f · adulto · adult | 467 (frío) | 507 |
| person/m/senior | Matrix · m · senior · senior | 72 | 109 |
| person/u/nino | Persona · u · nino · child | 73 | 115 |
| person/f/vejez | TopGun · f · vejez · elder | 74 | 109 |
| person/m/youth | Matrix · m · joven · youth | 81 | 132 |
| person/f/— | TopGun · f · unknown · unknown | 74 | 119 |
| car/u/joven | Coche · u · unknown · unknown | 73 | 106 |

  Segunda pasada en caliente: peor caso 277 ms. Tras el TTL de 2 s: `neutral · playlist`, `age_seg:null`.
- **Lado del player (Neo), sin tocar `canal.html`.** Playwright abre `canal.html?screen=puertacam-bench&circuit=xtanco&mode=conditional&audience=remote` y se publican labels: `person/f/vejez` → `window.__xplCam = {gender:'f', age:'vejez', kind:'person'}` en **297 ms**; `m/nino` 117 ms; `u/joven` 145 ms; tras el TTL `__xplCam` vuelve a `null` y el carril a `neutral`. **Criterio de Jobs (Neo consume sex/age del sidecar en banco < 2 s): cumplido con productor simulado.**
- **Límites que quedan (honestos).** (1) El productor del banco es un simulador: no hay clasificador de sexo/edad en el borde ni acceso al stream de Puerta Cam (bloqueo de abajo, sin cambios). (2) El relé del portal sigue cerrado por política: sin `XTORE_AUDIENCE_TOPICS=sex,age_band` no reenvía los topics. (3) En `canal.html` un `age_band` desconocido cae hoy a `adulto` por defecto (`AUD_AGE_MAP[...] || 'adulto'`): pedido a Neo (encargo #3355) que lea `decision.age_seg` y que `unknown` no se convierta en adulto. (4) La pantalla de banco aparece unos minutos como pantalla viva en `/signage/screens` mientras dura la prueba.



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

# Histórico privado de pasos Xtore

Estado 13/09/2026: persistencia autorizada por Carlos y activada en producción en
r11 (commit `1e57db4`, despliegue Cloudflare `8ddecd35`). El navegador confirmó
«Histórico sincronizado» con 17 pasos; una consulta remota posterior, solo de
agregados, verificó 21 pasos guardados: 19 personas y 2 bicicletas, origen detector.
Son comprobaciones puntuales de una cámara que continúa analizando, no cifras fijas.
No es grabador de seguridad ni conserva capturas. La retención de originales de
seguridad sigue fuera de este módulo y no está activada.

## Contrato

- Ruta same-origin `GET/POST /videoanalytics/api/history`.
- Reutiliza cookie HttpOnly `__Host-atv_session`, `readSession` y
  `accessFor(env, email, 'admira-tv', true)`: solo propietarios/administradores raíz.
  No autoriza mediante email enviado en JSON, token en URL o almacenamiento del navegador.
- POST requiere Origin exacto y Content-Type JSON. No CORS público.
- Binding D1 específico `VIDEO_ANALYTICS_DB`; si falta, 503, nunca almacenamiento alternativo.
- Tabla `xtore_passages`: UUID v4 de evento, clase, timestamp milisegundos, origen
  detector/manual. No ID de persona, trayectoria, cámara arbitraria, identidad ni imagen.
- UUID idempotente: el mismo envío se reintenta con los mismos IDs. No modifica
  eventos anteriores. Inserciones parametrizadas en batch D1 atómico.
- GET retorna agregados por hora UTC, clase y origen. El cliente presenta días y
  horas Europe/Madrid. Rango máximo 32 días; la UI consulta los últimos 31.
- POST admite hasta 100 eventos / 32 KiB, timestamps hasta 7 días atrás y 60 s
  futuros. Scooters solo manuales hasta validar un detector propio.
- Respuestas privadas `no-store`; no se publican imágenes ni datos en Pixeria.

## Configuración y verificación en producción

- D1 dedicada `admira-xtore-history`, ID `1908cb29-fccf-418f-915c-4c0cbeb1376a`,
  región WEUR; binding `VIDEO_ANALYTICS_DB` publicado desde `wrangler.toml`.
- Migración `drizzle/0000_xtore_passages.sql` aplicada. El esquema está en
  `db/schema.ts`; SQL y snapshots se generaron con drizzle-kit. Las migraciones
  aplicadas deben ser inmutables. No se crean tablas dentro de handlers HTTP.
- Comprobaciones reales del 13/09/2026: petición sin sesión rechazada con 401;
  cliente autorizado con ACK y estado «Histórico sincronizado»; D1 con 21 filas
  verificadas mediante `COUNT(*)` agrupado por clase y origen, sin leer eventos
  individuales ni escribir datos. El total puede crecer con el análisis activo.
- Los rechazos por rol/origen, la idempotencia y la consulta desde otro usuario
  autorizado están cubiertos por pruebas locales. No se presentan como pruebas
  realizadas desde un segundo equipo en producción.

Para próximas publicaciones, revisar el empaquetado y coordinar el sello de
versión, excluyendo `jobs-evidencias/` y cambios ajenos. Validar con pasos reales
de la cámara; no inyectar detecciones de prueba en producción. Una prueba SQLite
no acredita por sí sola el circuito remoto cámara → servidor → player.
El módulo usa únicamente Web APIs y D1, sin requerir `nodejs_compat`.

## Operación y límites

- Un único productor de análisis por cámara. Otros equipos pueden consultar el
  histórico, pero analizar el mismo stream a la vez suma observaciones distintas:
  los UUID deduplican reenvíos, no observadores ni personas mediante biometría.
- Reset reinicia solo cifras actuales; conserva seguimiento, histórico y cola.
  Una nueva conexión reinicia cifras/tracks, no borra servidor.
- Cola temporal: máximo 2000 eventos, sin imágenes; conserva IDs ante respuesta
  ambigua. Solo confirma guardado tras ACK. Al cerrar/recargar se pierde lo que
  no haya recibido el servidor; se advierte antes de salir cuando es posible.
- Eventos de cola >7 días salen del reintento con aviso de estado no confirmado;
  no se certifica su ausencia o borrado en servidor si hubo un envío ambiguo.
- Histórico almacenado exclusivamente en D1. Los 31 días son una ventana de
  consulta, no una promesa de borrado automático. No hay endpoint DELETE ni
  política de purga automática activada: definirla antes del uso prolongado.
- No recupera pasos previos que solo estaban en memoria o en capturas de pantalla.
- El contador de patinetes es manual y puede requerir revisión si COCO confundió
  ese vehículo con bici/moto/persona. No anuncia reconocimiento automático.

## Pruebas

`node --test videoanalytics/xtore/*.test.mjs`

Incluye SQLite real temporal, reapertura en disco, otro administrador, rechazo
de fotografías/atributos, origen/sesión/roles, idempotencia y límites, errores
visibles, carreras de cola, cierre de sesión, fechas Madrid y nuevo tracking.
Fixtures aislados: no usan cookies reales ni modifican el stream o bus del player.

Fuentes técnicas: [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/),
[Pages D1 bindings](https://developers.cloudflare.com/pages/functions/bindings/),
[COCO clases](https://github.com/tensorflow/tfjs-models/blob/master/coco-ssd/src/classes.ts),
[Grounding DINO candidato](https://huggingface.co/onnx-community/grounding-dino-tiny-ONNX).

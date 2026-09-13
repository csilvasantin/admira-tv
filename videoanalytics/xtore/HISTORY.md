# Histórico privado de pasos Xtore

Estado 13/09/2026: D1 dedicada creada y migrada vacía; binding preparado en wrangler.toml.
Carlos ha autorizado explícitamente la persistencia y su activación en producción.
El binding se publica en r11; comprobar ACK real antes de afirmar que una sesión está guardada.
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

## Antes de producción (requiere autorización)

1. Crear una D1 privada dedicada, por ejemplo `admira-xtore-history`. No reutilizar
   KV de leads/ACL para contadores: no ofrece la idempotencia transaccional requerida.
2. Añadir a `wrangler.toml` el binding `VIDEO_ANALYTICS_DB`, nombre real e ID
   devuelto al crear la base, y `migrations_dir = "drizzle"`. No introducir un ID
   ficticio en la configuración de despliegue.
3. Aplicar la migración `drizzle/0000_xtore_passages.sql` usando el flujo de
   migraciones D1 de Wrangler. No crear tablas dentro de handlers HTTP.
4. Publicar únicamente los archivos propios revisados, excluyendo siempre
   `jobs-evidencias/` y cualquier cambio ajeno; subir sello de versión coordinado
   con Neo. No lanzar despliegue global del worktree sin revisar su empaquetado.
5. Verificar: anónimo 401; usuario no administrador 403; owner/admin 200;
   origen distinto 403; reintento de mismo UUID no suma; segundo equipo con
   sesión autorizada ve los mismos agregados tras Actualizar.
6. Validar con la cámara los pasos reales y posibles oclusiones. No inyectar
   detecciones de prueba en la producción ni dar una prueba SQLite por prueba
   de Cloudflare remoto/cámara → player.

El esquema está en `db/schema.ts`; SQL y snapshots Drizzle se generaron localmente
con drizzle-kit. La migración 0000 se aplicó en admira-xtore-history (1908cb29-fccf-418f-915c-4c0cbeb1376a). Las migraciones aplicadas deben
ser inmutables. El módulo usa únicamente Web APIs y D1, sin requerir nodejs_compat.

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

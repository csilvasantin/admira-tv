# Puente PlayerTaza en Mac Mini

Reconstruido el 7 de octubre de 2026 a partir del Worker publicado y del
[SDK oficial Bubble](https://doc.jeejio.com/development/bubble_bot_dev).
Node 22 o posterior. `bash install-mini.sh` instala el SDK y un LaunchAgent
con arranque al inicio de sesión y reinicio si el proceso termina.

Destino único: **CarlosGdG**, binding slot **1**, verificado visualmente en Bubble el 7 de octubre de 2026. Identificador histórico:
`11ZKCBTTUX1FRG00065F`. La asociación histórica situaba CarlosGdG en el slot 2, pero la cuenta actual
lo muestra en el slot 1 y el segundo vacío. No registra de nuevo los slots. El alias visible de la taza no identifica por sí solo
el dispositivo remoto: el slot se debe comprobar en la cuenta Bubble.

Configuración privada fuera de Git: `config.private.json`, permisos 0600.
Requiere la clave del puente del Worker (`bridgeKey`), el token **propio**
del bot PlayerTazaAdmira (`botToken`) y el objeto `ctx.chat` de la conversación
vinculada (`chat`, con id y type). El chat se puede recuperar enviando `/start`
en la conversación privada del bot desde Bubble; se guarda solo el primero y
nunca reemplaza una conversación ya configurada. No usar tokens incluidos en ejemplos del SDK.
Si falta algún campo, el proceso queda activo en `awaiting_configuration`
y no anuncia capacidad de envío. La configuración se relee cada tres segundos.

Estado local: `curl http://127.0.0.1:4748/health`.
Logs sin tokens: `logs/bridge.log`, `logs/error.log`.
Servicio: `launchctl print gui/$(id -u)/com.admira.playertaza-bubble`.
Parar: `launchctl bootout gui/$(id -u)/com.admira.playertaza-bubble`.
Reiniciar: `launchctl kickstart -k gui/$(id -u)/com.admira.playertaza-bubble`.

La cola y la URL pública del GIF siguen en Cloudflare. El Mini mantiene el
consumidor y el SDK mantiene el receptor de respuestas RPC. HTTP 201 no es
recepción física: un timeout se registra como `uncertain`; un RPC 200 se
registra como `sent_to_bubble`, pendiente de comprobación visual por cámara.
Solo se admiten GIF 32×16, como máximo 40 KiB, desde la URL de trabajo del Worker.
Durante un envío no reclama otros trabajos. Los reintentos del informe no
repiten el RPC en la taza.

Pruebas: `node --test core.test.mjs`.
No hay secretos de Bubble ni del Worker en este repositorio.

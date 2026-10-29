# Sincro automática en los cuatro MBA

Azul, Crema, Rosa y Plata incorporan automáticamente las nuevas imágenes y vídeos
aptos del Stock cuando están en modo sincro. En el mando de cada equipo puede
enviarse `/sincro`; las cuatro apps de esta instalación conservan además
`sincro=1` en sus preferencias de arranque.

El grupo usa una única fuente de emisión, con las 50 piezas más recientes que
están listas. Una incorporación desplaza la pieza más antigua cuando ya hay 50.
El servicio revisa el catálogo aproximadamente cada minuto. Primero valida la
duración del vídeo y prepara una revisión; la publica con una hora de entrada
común al menos 90 segundos después. Los players consultan cada 30 segundos y
preparan la incorporación antes de esa hora. No hay que republicar cuatro listas
ni reiniciar las apps al añadir contenido.

Una incorporación normal tarda unos minutos, dependiendo de la disponibilidad
del catálogo y del archivo. Los vídeos cuya duración no se puede medir quedan
pendientes y se reintentan, sin bloquear las demás piezas. Se admiten vídeos MP4
con metadatos legibles dentro del límite de lectura y archivos de imagen; otros
contenedores de vídeo pueden quedar pendientes. Un corte de red conserva la
última revisión disponible: un equipo desconectado no puede recibir una revisión
nueva hasta recuperar la conexión.

La comprobación consiste en ver la misma pieza y tramo en las cuatro pantallas,
su avance y el cambio común de revisión. La telemetría `item.sinc` publica
`on`, `modo`, `idx`, `slot`, `n`, `group` y `revision`. Una coincidencia temporal
por software no acredita genlock físico de los paneles. El sonido conserva el
ajuste de cada player; esta instalación está silenciada.

## Mantenimiento

`GET https://brain.digitalavatar.ai/sync/mba/state?screen=macbookairazul`
devuelve el estado común: `active`, `pending`, hora `epochMs`, errores de
actualización y piezas pendientes de validar. Los otros tres nombres admitidos
son `macbookaircrema`, `macbookairrosa` y `macbookairplata`.

El Durable Object `MBAAutoSync` mantiene la única revisión del grupo y una alarma
de actualización. La duración se conserva por ID y URL exacta del archivo. Las
fuentes `*-tema` anteriores quedan como respaldo; no gobiernan la actualización
automática mientras el nuevo servicio está disponible.

Para revertir, publicar el release anterior del canal devuelve a esos temas
estáticos. El servicio nuevo puede permanecer sin afectar al máster global, a
otros players ni a los demás kioskos.

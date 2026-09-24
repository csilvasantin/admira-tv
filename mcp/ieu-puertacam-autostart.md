# IEU · arranque automático de Store y Puerta Cam

**Estado: especificación para implementar en IEU; NO está activado.**
24 de septiembre de 2026 · revisión 1 · TrinityMBP14.
Encargo de Carlos para el compañero que mantiene `digitaltwin.ieu.ai`.
Seguimiento: [Yokup #154](https://www.yokup.com/tareas?mission=DCL-8f689f37606366ec97919dff).

## Resultado solicitado

Al abrir https://digitaltwin.ieu.ai/ e iniciar sesión con la cuenta Admira de
Carlos, entrar en **Store (Santa Rosa 19)**, seleccionar **Entrada**, orientar
el panorama hacia **Puerta Cam** y abrir su vídeo de la calle. Debe suceder también
al volver a cargar con una sesión válida, sin repetir esos clics. Configurar la
cuenta exacta comunicada en Yokup; no aplicar a todo el dominio de correo.

Conservar los controles para cerrar el vídeo, mirar otra zona, cambiar de escena
u oficina. La automatización se ejecuta una vez por entrada al visor, no en cada
refresco de dispositivos. Si Carlos cierra el vídeo, no volver a abrirlo hasta
una nueva entrada o hasta que pulse «Abrir Puerta Cam».

## Lo comprobado el 24 de septiembre

- La sesión autenticada muestra Store, escenas Entrada/Centro/Fondo y el
  dispositivo Puerta Cam con acción «Ver stream» y estado «transmitiendo».
- El frontend público `/assets/index-CFOIIPyp.js` conserva la oficina mediante
  `dt.current_site`. La escena seleccionada y `streamWindow` son estado de la
  aplicación; no se encontró un arranque de cámara asociado al usuario.
- La aplicación obtiene el usuario mediante `GET /auth/me`, las oficinas mediante
  `GET /hub/sites`, y usa el contexto de oficina para las llamadas `/api/*`.
- El visor ya expone `focusDevice(deviceId)`; la selección de un dispositivo desde
  el panel lo utiliza para orientar la vista. Reutilizarlo, sin grados fijos.
- El controlador de stream solicita la acción `get_live_stream`, comprueba
  `per_device_results` y abre una ventana con `live_webrtc_url` y/o
  `live_hls_proxy_path`. Reutilizar ese controlador y su tratamiento de errores.
- El OpenAPI público del gateway 0.4.0 no documenta preferencias personales de
  arranque. Una configuración nueva necesita implementación, no un parámetro de
  URL inventado ni una llamada a una herramienta MCP inexistente.

Estas observaciones provienen del frontend publicado y de la interfaz. No se
dispone del repositorio fuente IEU ni se han publicado cambios en ese servicio.
Los nombres minificados no son puntos de integración estables: localizar sus
componentes originales en el repositorio del compañero.

## Implementación en el repositorio IEU

1. **Preferencia por usuario.** Guardar en el backend una preferencia de inicio
   vinculada al usuario autenticado de Carlos, habilitada para este encargo:
   oficina, escena y cámara por sus IDs reales, más `openStream: true`.
   Resolver inicialmente esos IDs dentro de los recursos autorizados de
   Store → Entrada → Puerta Cam y guardarlos. No usar la primera oficina/cámara
   ni comparar solamente el nombre en cada arranque. Si hay ambigüedad, detener
   la configuración y mostrarla; no escoger otro recurso.
2. **Después de autenticación.** Consultar la preferencia una vez que `/auth/me`
   haya confirmado el usuario. La identidad sale de la sesión validada, no de
   un email recibido por query string o del almacenamiento del navegador.
   Aplicar la oficina preferida aunque hubiera otra oficina recordada, solo para
   este arranque. Las demás cuentas conservan su comportamiento actual.
3. **Esperar los datos correctos.** Seleccionar Store con el controlador existente,
   invalidar/recargar sus consultas y esperar escenas y snapshot de esa oficina.
   Confirmar que Entrada y Puerta Cam siguen existiendo y son accesibles. No
   evaluar los datos antiguos de otra oficina durante la transición.
4. **Escena y giro.** Seleccionar Entrada y Puerta Cam; esperar a que el panorama
   y los marcadores estén listos y llamar a `focusDevice(cameraId)`. Usar el punto
   del dispositivo en esa escena. No modificar `initial_view` global: cambiaría
   el encuadre para otros usuarios. No simular arrastres por coordenadas de pantalla.
5. **Vídeo.** Invocar una sola vez el controlador existente de «Ver stream» para
   ese dispositivo. Mantener autenticación y permisos existentes. Validar la
   respuesta de la cámara elegida y abrir su ventana solo si sigue vigente ese
   arranque. No encender/apagar relés, luces, climatización o el PC STORE-SNEAKER.
6. **Cancelación y fallos.** Cancelar la secuencia si cambia usuario, oficina,
   escena o dispositivo por iniciativa de la persona, si cierra sesión o sale
   del visor. Ignorar respuestas tardías; abortar consultas cuando sea posible.
   Evitar dos aperturas por remontaje/React StrictMode con un coordinador de
   arranque idempotente y limpieza. No reintentar la orden indefinidamente:
   mostrar «No se ha podido abrir Puerta Cam» y un botón de reintento explícito.
7. **Preferencia editable.** Añadir «Inicio: Store → Entrada → Puerta Cam», con
   opción de desactivar/restaurar el comportamiento anterior. Cambiar esta
   preferencia no cambia roles, acceso a oficinas ni permisos de cámara.

Secuencia orientativa (pseudocódigo, no es una API disponible):

```text
sesión validada → preferencia del usuario → oficina autorizada
→ snapshot y escenas de Store → Entrada → visor listo
→ seleccionar Puerta Cam → focusDevice → get_live_stream → ventana de vídeo
```

Mantener los identificadores concretos y la cuenta configurada en el entorno
autorizado. No incluir cookies, tokens, credenciales ni URLs privadas del stream
en la documentación pública, en parámetros de un enlace o en el informe.

## Relación con la segmentación automática

Este cambio abre la fuente de cámara; **no conecta por sí solo el analizador de
admira.tv ni demuestra segmentación**. El flujo actual de Xtore analiza una
pestaña compartida: el navegador exige que el operador elija la pestaña de IEU y
autorice la captura. Ese selector no se elimina con este arranque.

Con la fuente y el encuadre preparados, Xtore decide automáticamente por presencia
confirmada: no requiere pulsar personas como en la experiencia interactiva de
Jardinets. El detector actual distingue personas/coches/motos/bicis; no estima
sexo, edad ni identidad. Sin presencia válida vuelve a la playlist base.
La integración futura con una fuente directa autorizada es otro alcance y debe
usar un contrato de cámara de IEU; no copiar sesiones ni incrustar URLs privadas.

## Pruebas de aceptación antes de publicar

| Caso | Resultado requerido |
|---|---|
| Login de la cuenta configurada, navegador nuevo | Store → Entrada → giro a Puerta Cam → vídeo visible sin clics adicionales |
| Recarga con sesión válida y otra oficina recordada | Misma secuencia, una única apertura |
| Otra cuenta | Sin selección forzada ni stream automático |
| Permiso revocado o cámara/escena eliminada | Error claro; no abre otra cámara ni cambia permisos |
| Red/datos/visor lentos, StrictMode | Espera el recurso correcto; una sola orden; sin bucle de reconexiones |
| Cambio de oficina/cuenta durante arranque | Respuesta antigua ignorada, sin ventana de la oficina anterior |
| Cerrar stream y esperar varios refrescos | Permanece cerrado |
| Preferencia desactivada | Se conserva el arranque anterior |
| Stream conectado | Fotogramas avanzan; una respuesta OK o «transmitiendo» sola no basta |

Añadir pruebas unitarias de selección por cuenta, cancelación, datos atrasados y
apertura única, y una prueba de navegador con login real. Registrar versión,
commit y resultado de cada caso en la misma misión Yokup. Si no hay personas en
la calle, anotar que no se pudo comprobar reacción del player; no simular pasos
y presentarlos como observación real.

## Entrega y minitutorial cuando esté implementado

Publicar IEU por su proceso habitual; conservar el enlace de Jardinets a IEU.
Verificar login y recarga en la URL productiva antes de cerrar la misión.
Generar con https://www.admiranext.com/tiktok/ el minitutorial de la mejora,
revisar el vídeo exportado y guardar su URL duradera en Yokup.

Guion preparado para esa entrega: «Desde la zapatilla superior de Jardinets,
abre la tienda e inicia sesión con tu cuenta Admira. IEU selecciona Store,
mira hacia la puerta y abre Puerta Cam. Puedes cerrarla o desactivar este inicio
en tu preferencia. Para analizar en Xtore, comparte la pestaña mediante el
selector del navegador; después el contenido cambia con la presencia detectada».

**Hoy se entrega la guía, no la automatización ni un vídeo generado.** Si se usa
una animación para el tutorial, identificarla como animación; no como grabación
de una prueba real. Si falla la exportación, conservar el guion y registrar el
paso pendiente.

# Grabador privado de seguridad — diseño pendiente de activar

Solicitud de Carlos, 11 septiembre 2026: conservar la apariencia original,
sin NVR existente, durante como máximo un mes. **No hay grabación activa** en
esta versión. Ni el canvas de seis segundos ni un Digital Twin son un archivo
de seguridad. Este documento no es una certificación de cumplimiento.

## Bloqueos comprobados

- El sitio no tiene almacenamiento privado de seguridad. El binding R2 `VIDEOS`
  corresponde a vídeos públicos de la web y no debe reutilizarse.
- La fuente directa de Puerta Cam requiere autenticación; no hay un productor
  autorizado conectado. El MCP actual configura referencias, no graba vídeo.
- La pestaña compartida se interrumpe al ocultar/cerrar o suspender el ordenador.
  Grabar únicamente detecciones además perdería incidentes cuando el detector
  falle. No equivale a seguridad continua.

## Separación de finalidades

| Flujo | Material | Destino | Conservación |
|---|---|---|---|
| Analítica / iPad | Fotogramas temporales, cajas de detección | Memoria local | 6 segundos |
| Pixeria opcional | Recorte enviado para transformación | Servicio de generación; Stock solo tras revisar el resultado | Política independiente; no es seguridad |
| Seguridad propuesta | Segmentos originales de la cámara, sin IA ni sobreimpresiones | Almacén privado dedicado | Propuesta 28 días; nunca superar un mes |

No etiquetar a alguien como ladrón por su aspecto. La detección genera eventos
person/vehicle, y un operador revisa un incidente. No hay reconocimiento facial,
listas de personas, sexo/edad inferidos ni búsqueda de identidades.

## Implantación propuesta (no ejecutada)

1. Confirmar responsable del tratamiento, encuadre y legitimación. Reducir la vía
   pública al mínimo imprescindible para la seguridad del acceso; revisar cartel
   e información. El máximo mensual no autoriza por sí solo cualquier encuadre.
2. Obtener acceso explícito de IEU a Puerta Cam (RTSP/HLS/ONVIF según lo que
   realmente ofrezca). Credenciales en el almacén de secretos, no en HTML ni
   URLs públicas. No copiar cookies de Chrome ni eludir su autorización.
3. Instalar un grabador software en un equipo/servicio siempre encendido.
   Ingesta independiente de la IA y del navegador, con reintento acotado,
   detección de huecos, reloj UTC sincronizado y alerta de pérdida de fuente.
   Conservar el flujo nativo cuando el formato lo permita; cualquier recodificado
   debe quedar identificado. No mejorar ni recrear rasgos con IA.
4. Crear un almacén privado específico en la región/jurisdicción aprobada,
   sin dominio público ni acceso r2.dev. Cifrado, credenciales limitadas al
   productor, autenticación de lectores y registro de lecturas/exportaciones.
   No mezclar material con Stock, el catálogo o el bucket de vídeos públicos.
5. Registrar por segmento: ID opaco, cameraId interno, inicio/fin UTC, fecha
   de recepción, formato/resolución, bytes, SHA-256 y fecha de eliminación.
   Hash + auditoría permiten comprobar integridad, no certifican por sí solos
   autenticidad, autoría ni validez probatoria. Reproducción y exportación solo
   para operadores autorizados; no generar enlaces públicos persistentes.
6. Definir el límite en el servidor: propuesta de acceso durante 28 días,
   con purga independiente del navegador y margen antes del mes. En R2,
   lifecycle es una red de seguridad, no un reloj exacto: Cloudflare indica
   eliminación *habitual* dentro de 24 h de la expiración, que puede tardar más.
   Por eso se requiere un purgador programado, comprobación de eliminación,
   alertas de retraso y bloqueo de lectura a vencimiento. Probar fallo del
   purgador, backups, temporales y reintentos antes de afirmar retención máxima.
7. Una reserva por incidente/requerimiento no amplía toda la retención: requiere
   expediente, motivo, alcance y revisión autorizada. No crear excepciones
   indefinidas ni entregar automáticamente imágenes a terceros.

## Puerta de activación

No habilitar «Grabando» hasta demostrar con material de prueba no personal:
fuente autorizada → segmento legible sin alterar → escritura privada → lectura
autenticada → rechazo anónimo → eliminación verificable independiente del
navegador. Añadir prueba de reinicio, interrupción de red, duplicados,
caducidad, auditoría y parada. Dimensionar capacidad a partir del bitrate real,
no de un supuesto: bytes ≈ bitrate × segundos / 8, más margen.

Pendiente de Carlos: autorizar la nueva infraestructura privada y concretar el
equipo siempre encendido / contacto de IEU que facilite el acceso a la cámara.
No se han creado buckets, claves, grabaciones ni despliegues de este diseño.

## Fuentes verificadas

- [AEPD: captación de vía pública](https://www.aepd.es/preguntas-frecuentes/8-videovigilancia/FAQ-0804-se-puede-grabar-la-via-publica-con-fines-de-seguridad).
- [LOPDGDD, artículo 22](https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673#a2-4).
- [Cloudflare R2: comportamiento de lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

# Señal de reposo · #7487 + complemento #7489

Versión del emisor: `2026.11.10.2`. **Integración pendiente; no instalado en el PC.**

`senal_reposo.py` escribe junto al módulo, por defecto en
`C:\Users\csilv\admira-tv\tools\streamdeck-bridge\reposo.json`.
Respeta `ADMIRA_SD_REPOSO` y permite pasar una ruta explícita. No usa claves.
No cambia `puente.py`, las tareas de Windows ni el perfil Elgato.

El detector real del salvapantallas debe crear **una sola instancia** del emisor
para el Stream Deck XL `CL37J1A02733` y llamar a:

```python
from senal_reposo import SenalReposo

senal = SenalReposo()
# SOLO tras confirmar que Elgato ha entrado en su salvapantallas:
senal.entrar_salvapantallas()
# SOLO al recibir una pulsación física de cualquier tecla de ese deck:
senal.pulsar_tecla()
# Al cerrar el detector:
senal.cerrar()
```

- Entrar: `{"estado":"reposo","desde":<ms epoch>,"fuente":"elgato-screensaver"}`.
- Tecla: `{"estado":"activo","desde":<ms epoch>}`.
- Refresco: cada 5 s, conservando `desde`. Se refresca también activo para
  reintentar un fallo temporal de escritura al salir del salvapantallas.
- Publicación: temporal exclusivo en la misma carpeta, flush/fsync, cierre y
  `os.replace`; reintento con espera variable durante un máximo de 2 s si Windows
  bloquea el rename. Un fallo mantiene intacto el JSON anterior y se comunica al
  llamador; el refresco sigue intentando publicar el estado más reciente.
- En Windows, un lector también puede recibir temporalmente acceso denegado
  durante un reemplazo. El puente ya captura errores de lectura y vuelve a
  intentarlo en el siguiente latido; una lectura completada recibe JSON entero.
- Cierre normal: retira el fichero para que deje de viajar el estado anterior.
  Un cierre abrupto puede dejarlo: el consumidor debe comprobar su antigüedad.

## Límites y verificación pendiente

Este módulo **no detecta** el salvapantallas nativo, no genera el GIF ni configura
el reposo de 3 minutos. No deduce el estado del deck a partir de la inactividad
del PC. No usa ni simula ratón, teclado o foco de Carlos.

Falta recuperar del PC los ficheros sin commit del player de #7487, conectar los
eventos reales de Elgato, revisar el arranque único y verificar en Windows:
entrada real → JSON reposo; refrescos separados por menos de 15 s; tecla real →
JSON activo. Las pruebas de este PR son locales con eventos invocados por test.
No son una foto física ni acreditan la integración con Elgato.

La caducidad de 15 s del gemelo se aplica a `ts`. La versión de `puente.py`
fusionada en #137 vuelve a fechar con la hora actual un fichero antiguo, sin
validar su mtime. Se ha comunicado a Woz: un emisor detenido abruptamente podría
mantener un reposo aparente mientras ese puente continúe activo. Este PR no
modifica ese fichero, por orden de Carlos.

Prueba local (sin dependencias externas):

```sh
python3 tools/streamdeck-bridge/test_senal_reposo.py
```

La comprobación `Stream Deck rest signal` ejecuta estos mismos casos en GitHub
Actions con Windows y Linux. Tampoco conecta a un dispositivo físico.

Referencia oficial para configurar el GIF: Preferencias → General → Set
Screensaver y Sleep After, según la [guía de Elgato](https://help.elgato.com/hc/en-us/articles/26543873678477-Elgato-Stream-Deck-How-to-set-an-Image-or-GIF-as-a-Screensaver).
El tiempo concreto ofrecido en el PC sigue pendiente de comprobar.

## Guion del minitutorial oficial (pendiente de implementación)

Destino: https://www.admiranext.com/tiktok/. Aún sin vídeo exportado.

1. Ubicación: Stream Deck XL de AdmiraNeXT01, serie CL37J1A02733.
2. Esperar el intervalo de reposo aplicado en Elgato sin tocar el equipo.
3. Al entrar el salvapantallas, ver la playlist en las 32 teclas y comprobar
   `reposo.json` en estado reposo, con refresco cada 5 s.
4. Pulsar una tecla del deck: vuelve al perfil y el JSON pasa a activo.
5. Límites: GIF sin audio y pendiente de regeneración si cambia la playlist;
   el tiempo nativo de Elgato debe verificarse; la señal del gemelo requiere el
   puente y la caducidad correctos. Usar captura real para acreditar el resultado.

No presentar este guion ni las pruebas locales como una grabación del equipo.

# Player admira.tv en los ventiladores de METAHUMAN

Proyecto dirigido por **Woz** (Consejo AdmiraNext). Arrancado el 4 de noviembre de 2026.

METAHUMAN (Windows) lleva 7 ventiladores **Lian Li UNI FAN TL LCD**, cada uno con una
pantalla redonda de 400×400 (USB `04FC:7393`, una interfaz HID por ventilador) colgando
del controlador UNI FAN TL (`0416:7372`): 3 en el puerto 0, 3 en el 1 y 1 en el 2.

## Cómo funciona

El canal (`canal.html`) corre **tal cual** en Chrome sin ventana a 400×400, con el
contrato público del player (`mcp/player-contract.md`): `embed=mupi&clean=1&fit=screen`,
`screen`, `circuit`, `machine`, `muted=1`. Cada fotograma del screencast de DevTools
(JPEG) se trocea en informes HID de 512 bytes y se manda a la pantalla del ventilador.
No hay copia del player: censo, órdenes del mando, playlist, sincro y actualizaciones
son las del canal publicado.

| Modo (`config.json`) | Pantalla(s) en admira.tv |
|---|---|
| `espejo` (por defecto) | `metahuman-ventiladores`: los 7 pintan lo mismo |
| `independiente` | `metahuman-ventilador-1` … `-7`, una por ventilador |

Circuito `metahuman-ventiladores`, equipo `METAHUMAN`. El canal se identifica como
`AdmiraNeXT Windows Player` versión `tl-lcd-1.0` (token `AdmiraWindowsPlayer/` en el UA).
Numeración: ventilador 1 = puerto 0, primero de la cadena; el 7 es el del puerto 2.

## Uso

```powershell
npm install
.\lconnect.ps1 pausar      # aviso de Windows; L-Connect deja de mandar sus vídeos
npm start                  # emite; Ctrl+C para parar
.\lconnect.ps1 reanudar    # vuelven los vídeos, el RGB y las curvas de L-Connect
```

`npm run dry-run` renderiza sin tocar el USB (sirve para probar el canal con L-Connect activo).
`npm test` prueba el protocolo y la URL.

Estado local: `http://127.0.0.1:4749/health` (fps por pantalla, envíos por ventilador, RPM).
Último fotograma: `/player/1.jpg` (lo que pinta el canal) y `/fan/<n>.jpg` (lo enviado al ventilador n).

`config.json` (opcional, fuera de Git) admite `mode`, `screen`, `screenPrefix`, `circuit`,
`machine`, `fps` (≤ 30), `quality`, `brightness` y `rotation` (`{"7": 270}`). Sin `brightness`
ni `rotation` no se tocan los ajustes que dejó L-Connect en cada pantalla.

## Relevo con L-Connect

L-Connect 3 emite continuamente a las pantallas (modo sincronizado) y además gobierna el
RGB, la bomba Galahad II Trinity y las curvas de los ventiladores. Si los dos emiten a la vez
se pisan, así que mientras emite admira.tv su servicio queda **pausado** (solo parado: el
tipo de inicio no cambia y vuelve al reiniciar el PC). El player lee cada 10 s las RPM del
controlador, sin escribir nada, y registra `fan_stopped` si algún ventilador marca 0.

## Protocolo

Informe HID de salida `0x02`, 512 bytes: `[0x02, cmd, tamaño total 4 BE, nº de paquete 3 BE,
longitud 2 BE]` + 501 bytes. Fotograma = JPEG 400×400 con `cmd 0x46` (streaming sin acuse).
`0x3E` lee serie/puerto/posición; el player nunca reescribe la serie. Referencia:
[sgtaziz/lian-li-linux](https://github.com/sgtaziz/lian-li-linux) (MIT), `tl_lcd.rs` y `tl_fan`.

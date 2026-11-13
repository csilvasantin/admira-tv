#!/bin/bash
# Corsair Galleon 100 SD como player de admira.tv en el Mac Studio (encargo #7569, Neo, 13-nov-2026).
# Uso:  ./macstudio-galleon.command [instalar|arrancar|parar|estado|captura]
#   instalar → dependencias en ~/.admira-galleon (npm), copia del adaptador y servicio de usuario
#              tv.admira.galleon.player (arranca al iniciar sesión y se recupera si cae). Luego arranca.
#   arrancar → refresca la copia del adaptador desde este repo y (re)lanza el servicio.
#   parar    → detiene el servicio; el teclado queda libre para Elgato.
#   estado   → status.json y últimas líneas del registro.
#   captura  → guarda en ~/Pictures/AdmiraCapturas lo último volcado por USB (LCD y mosaico de teclas).
# Normas (Carlos): nada aparece en los monitores (Chrome headless) ni se roba el foco; si Elgato Stream Deck o el
# controlador Starbucks tienen el USB, el adaptador espera sin tocarlo; mantener la tecla 12 un segundo devuelve el
# teclado a Elgato. No se imprime ningún secreto. Sólo corre en el equipo donde se lanza (no toca el Mac Mini).
set -euo pipefail
ACTION="${1:-estado}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME="${ADMIRA_GALLEON_HOME:-$HOME/.admira-galleon}"
LABEL="tv.admira.galleon.player"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE="${ADMIRA_GALLEON_NODE:-}"
if [ -z "$NODE" ]; then
  if [ -x "$HOME/.local/node/bin/node" ]; then NODE="$HOME/.local/node/bin/node"; else NODE="$(command -v node || true)"; fi
fi
[ -x "${NODE:-}" ] || { echo "✖ no encuentro node (ADMIRA_GALLEON_NODE=/ruta/a/node)"; exit 1; }
[ -d "/Applications/Google Chrome.app" ] || { echo "✖ falta Google Chrome en /Applications (el adaptador lo usa sin ventana)"; exit 1; }

copia() { mkdir -p "$RUNTIME"; cp "$HERE/galleon-usb.cjs" "$HERE/galleon-frames.cjs" "$HERE/package.json" "$RUNTIME/"; }

plist() {
  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$RUNTIME/galleon-usb.cjs</string></array>
  <key>WorkingDirectory</key><string>$RUNTIME</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string><key>ADMIRA_GALLEON_HOME</key><string>$RUNTIME</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
  <key>StandardOutPath</key><string>$RUNTIME/launchd.log</string>
  <key>StandardErrorPath</key><string>$RUNTIME/launchd.log</string>
</dict></plist>
PLIST
}

parar() { launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true; }
arrancar() { copia; plist; parar; launchctl bootstrap "gui/$(id -u)" "$PLIST"; echo "✓ $LABEL en marcha · registro: $RUNTIME/player.log"; }

case "$ACTION" in
  instalar)
    copia
    echo "→ dependencias (npm) en $RUNTIME…"
    (cd "$RUNTIME" && npm install --no-audit --no-fund --loglevel=error)
    arrancar ;;
  arrancar) arrancar ;;
  parar) parar; echo "✓ $LABEL parado; el teclado queda libre" ;;
  estado)
    launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E "state =|pid =" || echo "· servicio no cargado"
    [ -f "$RUNTIME/status.json" ] && python3 -m json.tool "$RUNTIME/status.json" || echo "· sin status.json"
    [ -f "$RUNTIME/player.log" ] && tail -n 15 "$RUNTIME/player.log" || true ;;
  captura)
    [ -f "$RUNTIME/last-lcd.png" ] || { echo "✖ todavía no ha salido ningún fotograma por USB"; exit 1; }
    out="$HOME/Pictures/AdmiraCapturas"; mkdir -p "$out"; ts="$(date +%Y%m%d-%H%M%S)"
    cp "$RUNTIME/last-lcd.png" "$out/galleon-$ts-lcd.png"; cp "$RUNTIME/last-keys.png" "$out/galleon-$ts-teclas.png"
    echo "$out/galleon-$ts-lcd.png"; echo "$out/galleon-$ts-teclas.png" ;;
  *) echo "uso: $0 [instalar|arrancar|parar|estado|captura]"; exit 2 ;;
esac

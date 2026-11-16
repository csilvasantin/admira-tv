#!/bin/bash
# Corsair Galleon 100 SD como player de admira.tv en el Mac Studio (encargo #7569, Neo, 13-nov-2026).
# Uso:  ./macstudio-galleon.command [instalar|navegador|arrancar|parar|estado|captura]
#   instalar → dependencias en ~/.admira-galleon (npm), Chrome for Testing propio, copia del adaptador y servicio de
#              usuario tv.admira.galleon.player (arranca al iniciar sesión y se recupera si cae). Luego arranca.
#   navegador→ (re)instala sólo el Chrome for Testing del adaptador en ~/.admira-galleon/browsers.
#   arrancar → refresca la copia del adaptador desde este repo y (re)lanza el servicio.
#   parar    → detiene el servicio; el teclado queda libre para Elgato.
#   estado   → status.json y últimas líneas del registro.
#   captura  → guarda en ~/Pictures/AdmiraCapturas lo último volcado por USB (LCD y mosaico de teclas).
# Normas (Carlos): nada aparece en los monitores (Chrome headless) ni se roba el foco; si Elgato Stream Deck o el
# controlador Starbucks tienen el USB, el adaptador espera sin tocarlo; mantener la tecla 12 un segundo devuelve el
# teclado a Elgato. No se imprime ningún secreto. Sólo corre en el equipo donde se lanza (no toca el Mac Mini).
# El adaptador usa su propio Chrome for Testing (otro bundle id): con el Google Chrome de /Applications lanzado sin
# ventana, macOS lo daba por «ya abierto» y el Dock dejaba de abrir el Chrome de Carlos (16-nov-2026).
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

chrome_bin() { ls -d "$RUNTIME"/browsers/chrome/mac*/chrome-mac-*/"Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" 2>/dev/null | sort -V | tail -n 1; }
navegador() {
  echo "→ Chrome for Testing (estable) en $RUNTIME/browsers…"
  (cd "$RUNTIME" && "$NODE" node_modules/.bin/browsers install chrome@stable --path "$RUNTIME/browsers" >/dev/null)
  [ -n "$(chrome_bin)" ] || { echo "✖ no se ha podido instalar Chrome for Testing"; exit 1; }
  echo "✓ $(chrome_bin)"
}

copia() { mkdir -p "$RUNTIME"; cp "$HERE/galleon-usb.cjs" "$HERE/galleon-frames.cjs" "$HERE/package.json" "$RUNTIME/"; }

plist() {
  local chrome; chrome="$(chrome_bin)"
  [ -n "$chrome" ] || echo "⚠ sin Chrome for Testing: el adaptador usará /Applications/Google Chrome y el Dock no abrirá Chrome; ejecuta '$0 navegador'"
  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$RUNTIME/galleon-usb.cjs</string></array>
  <key>WorkingDirectory</key><string>$RUNTIME</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string><key>ADMIRA_GALLEON_HOME</key><string>$RUNTIME</string>${chrome:+<key>ADMIRA_GALLEON_CHROME</key><string>$chrome</string>}</dict>
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
    navegador
    arrancar ;;
  navegador) navegador ;;
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
  *) echo "uso: $0 [instalar|navegador|arrancar|parar|estado|captura]"; exit 2 ;;
esac

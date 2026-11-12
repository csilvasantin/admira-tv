#!/bin/bash
# Admira.tv player en el Mac Studio (3 monitores: 1 vertical izq. · 2 central horizontal · 3 vertical dcha.).
# Uso:  ./macstudio-player.command [sencillo|secuencia|extendido|cerrar] [--force]
# Siempre abre LOS TRES players (macstudio-1 izq. · macstudio-2 central · macstudio-3 dcha.); el formato se cambia
# después desde el panel sin relanzar:
#   sencillo   → macstudio-1 y macstudio-3 arrancan apagadas (standby, negro); sólo emite la central.
#   secuencia  → las tres encendidas, cada una con su player (autónomo o sincronizado en https://admira.tv/players).
#   extendido  → las tres encendidas; el mural se activa en https://admira.tv/players → Extendido →
#                «Tiras V·H·V (Mac Studio)» y cada pantalla pinta su tira (la central estirada).
#   Encender/apagar laterales sin relanzar: https://admira.tv/mando.html?screen=macstudio-1 (⏻) y ...=macstudio-3.
#   cerrar     → cierra las ventanas del player abiertas por este lanzador.
# Normas: Chrome, perfiles propios (no toca las ventanas de Carlos), y NO se aplica si hay actividad de
# teclado/ratón en los últimos 60 s (salvo --force). Sólo corre en el equipo donde se lanza (no toca el Mac Mini).
set -euo pipefail
MODE="${1:-sencillo}"; FORCE="${2:-}"
FIREFOX="/Applications/Firefox.app/Contents/MacOS/firefox"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# Navegador: Firefox (perfiles propios). Si Firefox tiene una actualización preparada, cada instancia nueva
# se queda colgada esperando al actualizador (12-nov-2026: 0 ventanas + aviso de red local): entonces se usa
# Chrome con perfiles propios (--app, posición y tamaño por argumentos, sin permiso de Accesibilidad).
BROWSER="${ADMIRA_PLAYER_BROWSER:-chrome}"   # Mac Studio: Chrome (--app/--kiosk coloca sin Accesibilidad)
if [ "$BROWSER" = "auto" ]; then
  st="$(cat "$HOME/Library/Caches/Mozilla/updates/Applications/Firefox/updates/0/update.status" 2>/dev/null || true)"
  if [ -x "$FIREFOX" ] && [ -z "$st" ]; then BROWSER=firefox; elif [ -x "$CHROME" ]; then BROWSER=chrome; else BROWSER=firefox; fi
fi
BASE="https://admira.tv/canal.html"
PROFILES="$HOME/.admira-player/profiles"; PIDS="$HOME/.admira-player/pids-macstudio"
mkdir -p "$PROFILES" "$PIDS"

idle_s() { ioreg -c IOHIDSystem | awk '/HIDIdleTime/ && !d {print int($NF/1000000000); d=1}' || true; }
if [ "$MODE" != "cerrar" ] && [ "$FORCE" != "--force" ]; then
  i="$(idle_s)"; if [ "${i:-0}" -lt 60 ]; then echo "· Carlos está usando el equipo (inactivo ${i}s < 60s): no abro nada. Repite con --force si quieres."; exit 3; fi
fi

close_all() { for f in "$PIDS"/*.pid; do [ -f "$f" ] || continue; kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done; }

# Marcos de pantalla (coordenadas de System Events: origen arriba-izquierda) ordenados de izquierda a derecha.
frames() { osascript -l JavaScript <<'JXA'
ObjC.import('AppKit');
const s=$.NSScreen.screens, n=s.count, mainH=s.objectAtIndex(0).frame.size.height, out=[];
for(let i=0;i<n;i++){const f=s.objectAtIndex(i).frame; out.push({x:f.origin.x, y:mainH-(f.origin.y+f.size.height), w:f.size.width, h:f.size.height});}
out.sort((a,b)=>a.x-b.x); JSON.stringify(out);
JXA
}

open_player() { # $1=screen id  $2=standby(0|1)  $3=x $4=y $5=w $6=h
  local id="$1" sb="$2" prof="$PROFILES/$1"; shift 2; mkdir -p "$prof"
  local url="$BASE?screen=$id&clean=1&fit=screen&standby=$sb"
  if [ "$BROWSER" = "chrome" ]; then
    # ADMIRA_PLAYER_DEBUG=1 → DevTools sólo en 127.0.0.1:922N (diagnóstico local, sin exponer nada a la red).
    local dbg=(); [ "${ADMIRA_PLAYER_DEBUG:-0}" = 1 ] && dbg=(--remote-debugging-address=127.0.0.1 --remote-debugging-port="922${id##*-}")
    "$CHROME" ${dbg[@]+"${dbg[@]}"} --user-data-dir="$prof-chrome" --no-first-run --no-default-browser-check --disable-session-crashed-bubble \
      --autoplay-policy=no-user-gesture-required --app="$url" --window-position="$1,$2" --window-size="$3,$4" --kiosk >/dev/null 2>&1 &
    echo "$!" > "$PIDS/$id.pid"; echo "  ✓ $id (Chrome) → ${3}×${4} en ($1,$2) · standby=$sb"; sleep 2; return 0
  fi
  printf 'user_pref("browser.shell.checkDefaultBrowser", false);\nuser_pref("browser.sessionstore.resume_from_crash", false);\nuser_pref("media.autoplay.default", 0);\nuser_pref("browser.startup.homepage_override.mstone", "ignore");\nuser_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);\n' > "$prof/user.js"
  "$FIREFOX" --no-remote --new-instance -profile "$prof" "$url" >/dev/null 2>&1 &
  local pid=$!; echo "$pid" > "$PIDS/$id.pid"
  # Espera a la ventana y la coloca en su monitor sin teclas (no roba el teclado).
  for _ in $(seq 1 40); do
    if osascript -e "tell application \"System Events\" to tell (first process whose unix id is $pid) to set {position, size} of window 1 to {{$1, $2}, {$3, $4}}" >/dev/null 2>&1; then
      osascript -e "tell application \"System Events\" to tell (first process whose unix id is $pid) to set value of attribute \"AXFullScreen\" of window 1 to true" >/dev/null 2>&1 || true
      echo "  ✓ $id → ${3}×${4} en ($1,$2) · standby=$sb"; return 0; fi
    sleep 0.5
  done; echo "  ✖ $id: la ventana no apareció (¿permiso de Accesibilidad para Terminal?)"
}

# Pantalla de cine: si existe el atajo «Admira Cine» (Atajos → Activar enfoque No molestar), se ejecuta
# para que ningún aviso tape el player. macOS no deja activar un Enfoque sin ese atajo creado una vez a mano.
cine() { shortcuts list 2>/dev/null | grep -qx "Admira Cine" && shortcuts run "Admira Cine" >/dev/null 2>&1 && echo "· No molestar activado (atajo Admira Cine)" || true; }
close_all
[ "$MODE" = "cerrar" ] && { echo "✓ players cerrados"; exit 0; }
F="$(frames)"; N="$(python3 -c 'import json,sys;print(len(json.loads(sys.argv[1])))' "$F")"
echo "· $N monitores: $F · navegador: $BROWSER"
get() { python3 -c 'import json,sys;f=json.loads(sys.argv[1])[int(sys.argv[2])];print(int(f["x"]),int(f["y"]),int(f["w"]),int(f["h"]))' "$F" "$1"; }
center=$(( N>=3 ? 1 : 0 ))
case "$MODE" in
  sencillo|secuencia|extendido) ;;
  *) echo "Modo desconocido: $MODE"; exit 2 ;;
esac
if [ "$N" -lt 3 ]; then open_player macstudio-2 0 $(get 0); exit 0; fi
# Orientación real: V·H·V = laterales verticales (h>w) y central apaisada (w>h). Si no cuadra se avisa (no se aborta).
python3 -c 'import json,sys;f=json.loads(sys.argv[1]);ok=f[0]["h"]>f[0]["w"] and f[2]["h"]>f[2]["w"] and f[1]["w"]>f[1]["h"];print("· orientación V·H·V comprobada" if ok else "⚠ los monitores no están en V·H·V: "+sys.argv[1])' "$F"
cine
SB=$([ "$MODE" = "sencillo" ] && echo 1 || echo 0)
open_player macstudio-2 0 $(get 1); open_player macstudio-1 "$SB" $(get 0); open_player macstudio-3 "$SB" $(get 2)
[ "$MODE" = "extendido" ] && echo "· Mural: https://admira.tv/players → Extendido → macstudio-1, macstudio-2, macstudio-3 → «Tiras V·H·V (Mac Studio)»."
exit 0

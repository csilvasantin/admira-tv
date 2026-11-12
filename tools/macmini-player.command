#!/bin/bash
# Admira.tv player en el Mac Mini (3 monitores: 1 vertical izq. · 2 central horizontal · 3 vertical dcha.).
# Uso:  ./macmini-player.command [sencillo|secuencia|extendido|cerrar] [--force]
#   sencillo   → un player (macmini-2) en la pantalla central.
#   secuencia  → un player por pantalla: macmini-1, macmini-2, macmini-3 (cada uno autónomo o sincronizado
#                según https://admira.tv/players).
#   extendido  → los mismos tres players; el mural V·H·V se activa en https://admira.tv/players
#                (Extendido · tiras V·H·V) y cada pantalla pinta su tira (la central estirada).
#   cerrar     → cierra las ventanas del player abiertas por este lanzador.
# Normas: Firefox, perfiles propios (no toca las ventanas de Carlos), y NO se aplica si hay actividad de
# teclado/ratón en los últimos 60 s (salvo --force). No toca el Mac Mini Grande: sólo corre donde se lanza.
set -euo pipefail
MODE="${1:-sencillo}"; FORCE="${2:-}"
FIREFOX="/Applications/Firefox.app/Contents/MacOS/firefox"
BASE="https://admira.tv/canal.html"
PROFILES="$HOME/.admira-player/profiles"; PIDS="$HOME/.admira-player/pids"
mkdir -p "$PROFILES" "$PIDS"

idle_s() { ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}'; }
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

open_player() { # $1=screen id  $2=x $3=y $4=w $5=h
  local id="$1" prof="$PROFILES/$1"; mkdir -p "$prof"
  printf 'user_pref("browser.shell.checkDefaultBrowser", false);\nuser_pref("browser.sessionstore.resume_from_crash", false);\nuser_pref("media.autoplay.default", 0);\nuser_pref("browser.startup.homepage_override.mstone", "ignore");\nuser_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);\n' > "$prof/user.js"
  "$FIREFOX" --no-remote --new-instance -profile "$prof" "$BASE?screen=$id&clean=1&fit=screen" >/dev/null 2>&1 &
  local pid=$!; echo "$pid" > "$PIDS/$id.pid"
  # Espera a la ventana y la coloca en su monitor sin teclas (no roba el teclado).
  for _ in $(seq 1 40); do
    if osascript -e "tell application \"System Events\" to tell (first process whose unix id is $pid) to set {position, size} of window 1 to {{$2, $3}, {$4, $5}}" >/dev/null 2>&1; then
      osascript -e "tell application \"System Events\" to tell (first process whose unix id is $pid) to set value of attribute \"AXFullScreen\" of window 1 to true" >/dev/null 2>&1 || true
      echo "  ✓ $id → ${4}×${5} en ($2,$3)"; return 0; fi
    sleep 0.5
  done; echo "  ✖ $id: la ventana no apareció (¿permiso de Accesibilidad para Terminal?)"
}

close_all
[ "$MODE" = "cerrar" ] && { echo "✓ players cerrados"; exit 0; }
F="$(frames)"; N="$(python3 -c 'import json,sys;print(len(json.loads(sys.argv[1])))' "$F")"
echo "· $N monitores: $F"
get() { python3 -c 'import json,sys;f=json.loads(sys.argv[1])[int(sys.argv[2])];print(int(f["x"]),int(f["y"]),int(f["w"]),int(f["h"]))' "$F" "$1"; }
center=$(( N>=3 ? 1 : 0 ))
case "$MODE" in
  sencillo) open_player macmini-2 $(get $center) ;;
  secuencia|extendido)
    [ "$N" -ge 3 ] || { echo "✖ hacen falta 3 monitores"; exit 1; }
    open_player macmini-1 $(get 0); open_player macmini-2 $(get 1); open_player macmini-3 $(get 2)
    [ "$MODE" = "extendido" ] && echo "· Mural: https://admira.tv/players → Extendido → macmini-1, macmini-2, macmini-3 → «Tiras V·H·V (Mac Mini)»." ;;
  *) echo "Modo desconocido: $MODE"; exit 2 ;;
esac

#!/bin/bash
# Salvapantallas admira.tv (Mac Mini / Mac Studio) (LaunchAgent de usuario tv.admira.screensaver, cada 5 s).
#  · ≥ IDLE_ON s sin teclado/ratón (600 = 10 min) → abre los 3 players (macmini-player.command, modo MODE);
#    el formato (Custom · Dual H·V, extendido…) lo pone el panel https://admira.tv/players, no este script.
#  · actividad otra vez (HIDIdleTime < IDLE_OFF s) con players abiertos → los cierra (cerrar) y vuelve el escritorio.
#  · Apagar:  touch ~/admira-tv/screensaver-off      Encender: rm ~/admira-tv/screensaver-off
#  · Ajustes: ~/admira-tv/screensaver.conf (IDLE_ON=600 IDLE_OFF=10 MODE=secuencia LAUNCHER=… PIDS=…). Log: ~/admira-tv/screensaver.log
set -uo pipefail
D="$HOME/admira-tv"; LOG="$D/screensaver.log"; PIDS="$HOME/.admira-player/pids"; STATE="$D/.screensaver-state"
IDLE_ON=600; IDLE_OFF=10; MODE=secuencia
# Por equipo (screensaver.conf): LAUNCHER=macmini-player.command|macstudio-player.command · PIDS=~/.admira-player/pids[-macstudio]
LAUNCHER="$D/macmini-player.command"
[ -f "$D/screensaver.conf" ] && . "$D/screensaver.conf"
case "$LAUNCHER" in /*) ;; *) LAUNCHER="$D/$LAUNCHER";; esac
log(){ echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
[ -f "$D/screensaver-off" ] && { [ "$(cat "$STATE" 2>/dev/null)" != off ] && { log "· desactivado (screensaver-off)"; echo off > "$STATE"; }; exit 0; }
[ "$(cat "$STATE" 2>/dev/null)" = off ] && { log "· activado"; echo idle > "$STATE"; }
idle="$(ioreg -c IOHIDSystem | awk '/HIDIdleTime/ && !d {print int($NF/1000000000); d=1}' || true)"; idle="${idle:-0}"
open_n=0; for f in "$PIDS"/*.pid; do [ -f "$f" ] && kill -0 "$(cat "$f")" 2>/dev/null && open_n=$((open_n+1)); done
if [ "$open_n" -gt 0 ]; then
  if [ "$idle" -lt "$IDLE_OFF" ]; then
    log "◼ actividad (inactivo ${idle}s) → cierro $open_n players"; "$LAUNCHER" cerrar >> "$LOG" 2>&1; echo idle > "$STATE"
  fi
  exit 0
fi
if [ "$idle" -ge "$IDLE_ON" ]; then
  log "▶ ${idle}s sin actividad → abro players ($MODE)"
  "$LAUNCHER" "$MODE" --force >> "$LOG" 2>&1 || log "✗ el lanzador salió con $?"
  echo playing > "$STATE"
fi
exit 0

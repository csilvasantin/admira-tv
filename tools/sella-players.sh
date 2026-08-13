#!/usr/bin/env bash
# sella-players.sh [sello] — pone EL MISMO sello a los tres players.
#
# Los sites llevan v.DD.MM.AAAA.rN.HH:MM desde la norma 07 y se puede saber de un
# vistazo qué está publicado. Los players no: macOS iba por 1.2/1.3/1.7 según
# dónde mirases, Android por 1.3 y iOS por 1.0. Tres productos de la misma casa
# contando su versión de tres maneras, y ninguna comparable con la del canal que
# emiten. Esto lo unifica.
#
# DÓNDE VIVE EL SELLO, Y POR QUÉ NO EN EL MISMO SITIO EN TODAS:
#   · Apple exige que CFBundleShortVersionString sean como mucho TRES enteros
#     separados por puntos. Un sello ahí hace que App Store Connect rechace la
#     subida — y el player de iOS se reparte por TestFlight. Así que en iOS y
#     macOS la versión nativa se queda numérica y el sello va en AdmiraRelease.
#   · Android deja versionName en texto libre, así que ahí el sello ES la versión
#     visible. versionCode sigue siendo un entero creciente: es lo que Android
#     compara para decidir si una instalación es más nueva, y no admite otra cosa.
#   · AdmiraRelease está en las TRES: es la clave comparable entre plataformas.
#
# Uso:  tools/sella-players.sh                 → sello nuevo con la hora de ahora
#       tools/sella-players.sh v.13.08.2026.r2.10:30
set -euo pipefail

REPOS="$HOME/Documents/New project/csilvasantin-repos"
AND="$REPOS/admira-signage-app"
MAC="$REPOS/admira-player"
IOS="$REPOS/admiranext-player-ios"

SELLO="${1:-v.$(date +%d.%m.%Y).r1.$(date +%H:%M)}"
# La hora se valida de verdad: con [0-9]{2}:[0-9]{2} colaba un «99:99» y el sello
# quedaba sellado con una hora que no existe.
if ! printf '%s' "$SELLO" | grep -qE '^v\.(0[1-9]|[12][0-9]|3[01])\.(0[1-9]|1[0-2])\.[0-9]{4}\.r[0-9]+\.([01][0-9]|2[0-3]):[0-5][0-9]$'; then
  echo "✖ sello inválido: '$SELLO' — se espera v.DD.MM.AAAA.rN.HH:MM" >&2; exit 2
fi
echo "→ sello: $SELLO"

# ── Android ────────────────────────────────────────────────────────────────
# versionName = el sello. versionCode sube de uno en uno: si no crece, Android
# considera la nueva instalación «no más nueva» y ni siquiera ofrece actualizar.
G="$AND/app/build.gradle"
if [ -f "$G" ]; then
  CODE="$(sed -nE 's/.*versionCode ([0-9]+).*/\1/p' "$G" | head -1)"
  YA="$(sed -nE 's/.*versionName "([^"]*)".*/\1/p' "$G" | head -1)"
  # IDEMPOTENTE: re-sellar con el MISMO sello no sube el versionCode. Sin esto,
  # repetir el comando dejaba el repo en un code que no existe publicado (paso:
  # el APK en produccion era el 5 y el repo decia 6, que es justo la clase de
  # descuadre que este script viene a matar).
  if [ "$YA" = "$SELLO" ]; then NEXT="$CODE"; else NEXT=$(( CODE + 1 )); fi
  python3 - "$G" "$SELLO" "$NEXT" <<'PY'
import io, re, sys
ruta, sello, code = sys.argv[1], sys.argv[2], sys.argv[3]
t = io.open(ruta, encoding='utf-8').read()
t = re.sub(r'versionCode \d+', f'versionCode {code}', t, count=1)
t = re.sub(r'versionName "[^"]*"', f'versionName "{sello}"', t, count=1)
io.open(ruta, 'w', encoding='utf-8').write(t)
PY
  echo "  ✓ Android  versionName=$SELLO · versionCode=$NEXT"
fi

# ── macOS e iOS ────────────────────────────────────────────────────────────
# La versión numérica no se toca aquí; lo que se sella es AdmiraRelease.
for PLIST in "$MAC/AdmiraSignageMac/Info.plist" "$IOS/AdmiraNeXTPlayer/Info.plist"; do
  [ -f "$PLIST" ] || continue
  plutil -replace AdmiraRelease -string "$SELLO" "$PLIST" 2>/dev/null \
    || plutil -insert AdmiraRelease -string "$SELLO" "$PLIST"
  echo "  ✓ $(basename "$(dirname "$PLIST")")  AdmiraRelease=$SELLO"
done

# ── Comprobación: se relee lo escrito, no se da por bueno ──────────────────
echo "→ verificación"
FALLO=0
A="$(sed -nE 's/.*versionName "([^"]*)".*/\1/p' "$G" 2>/dev/null | head -1)"
[ "$A" = "$SELLO" ] || { echo "  ✖ Android dice '$A'"; FALLO=1; }
for PLIST in "$MAC/AdmiraSignageMac/Info.plist" "$IOS/AdmiraNeXTPlayer/Info.plist"; do
  [ -f "$PLIST" ] || continue
  V="$(plutil -extract AdmiraRelease raw "$PLIST" 2>/dev/null || true)"
  [ "$V" = "$SELLO" ] || { echo "  ✖ $PLIST dice '$V'"; FALLO=1; }
done
[ "$FALLO" = 0 ] && echo "  ✓ los tres players dicen $SELLO" || exit 1

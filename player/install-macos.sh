#!/bin/bash
# Instalador web del player Admira Signage (macOS).
# Se baja con curl, que NO marca el fichero con quarantine → sin aviso de Gatekeeper.
#   curl -fsSL https://admira.tv/player/install-macos.sh | bash
set -euo pipefail

VERSION="v.26.06.26.r2"
URL="https://pub-9a6a58b67f2c4ed990b1ff036631ff33.r2.dev/AdmiraSignageMac-${VERSION}.zip"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "→ Descargando AdmiraSignageMac ${VERSION}…"
curl -fsSL "$URL" -o "$TMP/app.zip"

echo "→ Instalando en /Applications…"
ditto -xk "$TMP/app.zip" "$TMP/x"
rm -rf "/Applications/AdmiraSignageMac.app"
cp -R "$TMP/x/AdmiraSignageMac.app" /Applications/
# Belt-and-suspenders por si el origen marcó quarantine.
xattr -dr com.apple.quarantine "/Applications/AdmiraSignageMac.app" 2>/dev/null || true

echo "✓ Instalada. Abriendo el kiosko (salir: tecla Escape)…"
open "/Applications/AdmiraSignageMac.app"

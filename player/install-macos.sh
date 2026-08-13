#!/bin/bash
# Instalador web del player Admira Signage (macOS).
# Se baja con curl, que NO marca el fichero con quarantine → sin aviso de Gatekeeper.
#   curl -fsSL https://admira.tv/player/install-macos.sh | bash
set -euo pipefail

# El sello es el mismo de los sites y el que lleva dentro la app en AdmiraRelease.
# Se sirve desde el propio sitio (Cloudflare Pages) y no desde R2: el bucket
# repartía la v.26.07.10.r1 —la app 1.2, de julio— cuando en campo ya había
# equipos con la 1.3, así que el "instalador" DEGRADABA la máquina. R2 sigue
# siendo el sitio correcto para binarios que crecen; volver allí cuando haya
# sesión de wrangler, que el token de la bóveda solo alcanza para Pages.
VERSION="v.13.08.2026.r4"
URL="https://admira.tv/player/AdmiraSignageMac-${VERSION}.zip"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "→ Descargando AdmiraSignageMac ${VERSION}…"
curl -fsSL "$URL" -o "$TMP/app.zip"

echo "→ Instalando en /Applications…"
ditto -xk "$TMP/app.zip" "$TMP/x"
# Si el player está emitiendo, el cp sobre el .app en uso deja un binario a
# medias y la app muere al siguiente arranque: se para antes de tocar nada.
pkill -x AdmiraSignageMac 2>/dev/null && sleep 2 || true
rm -rf "/Applications/AdmiraSignageMac.app"
cp -R "$TMP/x/AdmiraSignageMac.app" /Applications/
# Belt-and-suspenders por si el origen marcó quarantine.
xattr -dr com.apple.quarantine "/Applications/AdmiraSignageMac.app" 2>/dev/null || true

echo "✓ Instalada. Abriendo el kiosko (salir: tecla Escape)…"
open "/Applications/AdmiraSignageMac.app"

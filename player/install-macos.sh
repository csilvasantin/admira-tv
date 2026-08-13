#!/bin/bash
# Instalador web del player Admira Signage (macOS).
# Se baja con curl, que NO marca el fichero con quarantine → sin aviso de Gatekeeper.
#   curl -fsSL https://admira.tv/player/install-macos.sh | bash
set -euo pipefail

# El sello es el mismo de los sites y el que lleva dentro la app en AdmiraRelease.
# El binario vive en R2, no en el repo: 5,6 MB por release en git se acumulan para
# siempre. Bucket admira-player de la cuenta de Cloudflare que despliega admira.tv.
# OJO, el bucket viejo (pub-9a6a58b6…) que repartía la v.26.07.10.r1 —la app 1.2 de
# julio, que DEGRADABA equipos que ya tenían la 1.3— está en otra cuenta a la que
# no llegamos desde aquí; sus URLs siguen vivas y sirviendo lo viejo. No apuntes ahí.
VERSION="v.13.08.2026.r4"
URL="https://pub-a2bb574b0bf64e7d9a063838eb29ce7c.r2.dev/AdmiraSignageMac-${VERSION}.zip"
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

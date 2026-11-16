#!/usr/bin/env bash
# Empaqueta la app personalizada de Samsung Color E-Paper (EMDX) y deja lo que el panel descarga:
#   /tizen-epaper/sssp_config.xml  +  /tizen-epaper/AdmiraEink.wgt
# En la app Samsung E-Paper: Content Source → Custom → Custom app URL = https://www.admira.tv/tizen-epaper
# Uso: tools/tizen-epaper/build.sh [versión]   (súbela siempre que cambie src/: el panel solo reinstala si cambia <ver>)
set -euo pipefail
cd "$(dirname "$0")"
VER="${1:-1.0.0}"; OUT="../../tizen-epaper"; mkdir -p "$OUT"
python3 - <<'PY'
from PIL import Image, ImageDraw
im = Image.new('RGB', (512, 512), (255, 255, 255)); d = ImageDraw.Draw(im)
d.rectangle([40, 40, 472, 472], outline=(0, 0, 0), width=24); d.rectangle([120, 200, 392, 312], fill=(0, 0, 0))
im.save('src/icon.png')
PY
sed -i '' -E "s/(id=\"http:\/\/admira.tv\/AdmiraEink\" version=\")[^\"]+/\1$VER/" src/config.xml
rm -f "$OUT/AdmiraEink.wgt"
(cd src && zip -q -X -r "../$OUT/AdmiraEink.wgt" config.xml index.html icon.png)
SIZE=$(stat -f%z "$OUT/AdmiraEink.wgt" 2>/dev/null || stat -c%s "$OUT/AdmiraEink.wgt")
printf '<?xml version="1.0" encoding="UTF-8"?>\n<widget>\n\t<ver>%s</ver>\n\t<size>%s</size>\n\t<widgetname>AdmiraEink</widgetname>\n\t<webtype>tizen</webtype>\n</widget>\n' "$VER" "$SIZE" > "$OUT/sssp_config.xml"
echo "AdmiraEink.wgt $VER · $SIZE bytes"

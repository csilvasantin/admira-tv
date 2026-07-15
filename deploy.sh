#!/usr/bin/env bash
# Publica admira.tv. Desde 01-jul-2026 el ORIGEN de producción es CLOUDFLARE PAGES
# (custom domains admira.tv + www.admira.tv → proyecto admira-tv). GitHub Pages YA NO sirve
# el dominio; el `git push` queda solo como backup de código + tags.
# Uso: ./deploy.sh            (push a GitHub [backup] + deploy a Cloudflare Pages)
#      ./deploy.sh cf         (solo Cloudflare Pages)
# Commit/tag se hacen antes a mano (versión v.DD.MM.AAAA.rN); esto solo PUBLICA.
set -euo pipefail
cd "$(dirname "$0")"
MODE="${1:-both}"

if [ "$MODE" = "both" ]; then
  echo "→ GitHub (sincronía + push de código + tags)…"
  # GUARDA ANTI-PISADA: si otra máquina pusheó mientras trabajabas, desplegar tu estado local
  # PISA producción con una versión vieja (pasó el 15-jul-2026: se perdió /usuarios). Comparamos
  # local vs origin/main y ABORTAMOS si hay que rebasar — nunca desplegamos un árbol desactualizado.
  git fetch -q origin main
  LOCAL="$(git rev-parse @)"; REMOTE="$(git rev-parse origin/main)"; BASE="$(git merge-base @ origin/main)"
  if [ "$LOCAL" = "$REMOTE" ]; then
    echo "  ✓ al día con origin/main"
  elif [ "$REMOTE" = "$BASE" ]; then
    echo "  → subiendo commits locales…"
    git push origin main --follow-tags || { echo "  ✖ push RECHAZADO (otra máquina se adelantó). Haz: git pull --rebase && ./deploy.sh"; exit 1; }
  elif [ "$LOCAL" = "$BASE" ]; then
    echo "  ✖ origin/main va POR DELANTE (otra máquina ya desplegó). NO piso producción."
    echo "    Haz:  git pull --rebase && ./deploy.sh"; exit 1
  else
    echo "  ✖ local y origin/main DIVERGEN. Haz:  git pull --rebase && ./deploy.sh"; exit 1
  fi
fi

echo "→ Cloudflare Pages (deploy, ORIGEN de producción)…"
# Desde 07-jul-2026 hay wrangler.toml (proyecto + output dir + binding KV LEADS de /lead):
# el proyecto y el directorio salen de la config; no repetir por CLI.
npx wrangler pages deploy --branch=main --commit-dirty=true

echo "✓ Producción: https://admira.tv (Cloudflare Pages) · mirror https://admira-tv.pages.dev"

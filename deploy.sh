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
  echo "→ GitHub (push de código + tags, backup)…"
  git push origin main --follow-tags || echo "  (nada que pushear o ya al día)"
fi

echo "→ Cloudflare Pages (deploy, ORIGEN de producción)…"
# Desde 07-jul-2026 hay wrangler.toml (proyecto + output dir + binding KV LEADS de /lead):
# el proyecto y el directorio salen de la config; no repetir por CLI.
npx wrangler pages deploy --branch=main --commit-dirty=true

echo "✓ Producción: https://admira.tv (Cloudflare Pages) · mirror https://admira-tv.pages.dev"

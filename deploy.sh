#!/usr/bin/env bash
# Despliegue instantáneo de admira.tv a Cloudflare Pages (proyecto: admira-tv).
# Uso: ./deploy.sh   (publica el contenido del repo en segundos)
set -euo pipefail
cd "$(dirname "$0")"
npx wrangler pages deploy . --project-name=admira-tv --branch=main --commit-dirty=true
echo "✓ Publicado en https://admira.tv (y https://admira-tv.pages.dev)"

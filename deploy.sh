#!/usr/bin/env bash
# Publica admira.tv en LAS DOS: GitHub Pages (lento) + Cloudflare Pages (instantáneo).
# Uso: ./deploy.sh            (publica en ambas)
#      ./deploy.sh cf         (solo Cloudflare, instantáneo)
# Commit/tag se hacen antes a mano (versión v.DD.MM.AAAA.rN); esto solo PUBLICA.
set -euo pipefail
cd "$(dirname "$0")"
MODE="${1:-both}"

if [ "$MODE" = "both" ]; then
  echo "→ GitHub Pages (push)…"
  git push origin main --follow-tags || echo "  (nada que pushear o ya al día)"
fi

echo "→ Cloudflare Pages (deploy)…"
npx wrangler pages deploy . --project-name=admira-tv --branch=main --commit-dirty=true

echo "✓ Cloudflare (rápida): https://admira-tv.pages.dev"
[ "$MODE" = "both" ] && echo "✓ GitHub (admira.tv): se actualiza en unos minutos"

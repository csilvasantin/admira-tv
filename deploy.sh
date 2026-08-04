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

# ── FIRMA DEL RELEASE (regla 08 de admiranext.com/normativa) ────────────────
# Toda publicación lleva la firma del responsable REAL y del equipo físico desde
# el que se cerró. Se exige por entorno para que nadie publique en nombre de otro
# sin darse cuenta, y se contrasta con release-signature.json, que va commiteado.
: "${ADMIRA_RELEASE_AGENT:?Define ADMIRA_RELEASE_AGENT con el agente responsable (ej. MorfeoMacMini)}"
: "${ADMIRA_RELEASE_MACHINE:?Define ADMIRA_RELEASE_MACHINE con el equipo fisico (ej. MacMini)}"

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

echo "→ Rejilla de soluciones…"
# Las tarjetas de la home se GENERAN desde apps/public-catalog.json. Si alguien
# toca el catálogo y no regenera, la home diría algo distinto del catálogo: se
# para la publicación en vez de servir la contradicción.
python3 tools/gen-apps-grid.py --check

echo "→ Firma del release…"
# El sello canónico es el del index.html: la firma se deriva de él, nunca al revés.
release="$(sed -n 's/.*admiranext-version.*content="\(v\.[^"]*\)".*/\1/p' index.html | head -1)"
[ -n "$release" ] || { echo "  ✖ no encuentro el sello canónico en index.html"; exit 1; }
d_ver="$(jq -r '.version // empty' release-signature.json)"
d_sig="$(jq -r '.signature // empty' release-signature.json)"
[ "$d_ver" = "$release" ] || { echo "  ✖ release-signature.json dice $d_ver y el sello es $release"; exit 1; }
[ "$d_sig" = "$ADMIRA_RELEASE_AGENT · $ADMIRA_RELEASE_MACHINE" ] || { echo "  ✖ la firma declarada no es la de este agente/equipo"; exit 1; }
# version.json se GENERA aquí y no se commitea: si viviera en el repo se quedaría
# congelado y cada despliegue republicaría la firma del anterior — es el fallo que
# apareció el 3-ago en admiranext (producción declaraba la r7 estando viva la r8).
git_full="$(git rev-parse HEAD)"
jq -n --arg version "$release" --arg deployedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --arg deployer "$ADMIRA_RELEASE_AGENT" --arg machine "$ADMIRA_RELEASE_MACHINE" \
      --arg signature "$ADMIRA_RELEASE_AGENT · $ADMIRA_RELEASE_MACHINE" --arg git "$git_full" \
      '{version:$version,deployedAt:$deployedAt,deployer:$deployer,machine:$machine,signature:$signature,git:$git,gitShort:($git[0:7]),gitFull:$git,dirty:false}' \
      > version.json
echo "  ✓ $release · $ADMIRA_RELEASE_AGENT · $ADMIRA_RELEASE_MACHINE"

echo "→ Cloudflare Pages (deploy, ORIGEN de producción)…"
# Desde 07-jul-2026 hay wrangler.toml (proyecto + output dir + binding KV LEADS de /lead):
# el proyecto y el directorio salen de la config; no repetir por CLI.
npx wrangler pages deploy --branch=main --commit-dirty=true

echo "✓ Producción: https://admira.tv (Cloudflare Pages) · mirror https://admira-tv.pages.dev"

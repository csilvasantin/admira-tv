# Publicación de admira.tv

Desde el 14-oct-2026, **cada merge en `main` publica admira.tv solo**. Lo hace GitHub Actions
(`.github/workflows/publicar-admira-tv.yml`) con `./deploy.sh cf`, las mismas comprobaciones de siempre
(rejilla, literales de versión, firma, caché del service worker). Igual que admira.biz.

## El sello

- **Si el merge ya trae su sello** (de hoy y más nuevo que el de producción), se publica tal cual con
  la firma de `release-signature.json`. Así sigue valiendo sellar a mano un release especial.
- **Si no**, el flujo lo sella con `tools/sellar-release.py`:
  - `r` siguiente a la de producción;
  - hora de Madrid;
  - firma `autor del PR · GitHubActions`;
  - la novedad es el título del PR.

  El sello se aplica a la copia que se publica, no se commitea: el sello vivo lo dice
  `admira.tv/version.json`.

## Ritmo y comprobación

- Como mucho 4 publicaciones por hora: si la última salió hace menos de 15 minutos, espera.
- Si mientras tanto entra otro merge, publica solo el último.
- Al final comprueba que `admira.tv/version.json` sirve el commit publicado.

## Qué necesita

En el repo, los secretos de Actions `CLOUDFLARE_API_TOKEN` (con permiso Cloudflare Pages: Edit) y
`CLOUDFLARE_ACCOUNT_ID`. El flujo limpia un token mal pegado (espacios o una línea de más).

## A mano

Sigue valiendo:

```bash
python3 tools/sellar-release.py v.DD.MM.AAAA.rN.HH:MM MorfeoMacMini MacMini "Novedad del release"
git commit -am "v.DD.MM.AAAA.rN.HH:MM: …"
ADMIRA_RELEASE_AGENT=MorfeoMacMini ADMIRA_RELEASE_MACHINE=MacMini ./deploy.sh both
```

Si se mergea ese commit sellado, el flujo lo publica tal cual en vez de volver a sellarlo.

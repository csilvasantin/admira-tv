#!/usr/bin/env python3
"""Pone TODOS los literales de versión del sitio al sello del release.

POR QUÉ: el sello canónico vive en el <meta> de index.html y en /version.json, que
deploy.sh regenera en cada publicación. Pero una docena de páginas declaran además
`window.ADMIRA_VERSION='v…'` a mano. admira-nav.js las corrige al vuelo leyendo
/version.json, así que casi siempre el literal es solo un placeholder invisible…
hasta que una página pinta el suyo en un elemento que el nav NO corrige. Eso pasó:
el 12-ago el CMS de flota enseñaba una versión de JULIO mientras servía la del día,
y nadie podía verlo desde dentro.

Arreglar el caso del CMS no basta: el siguiente literal que alguien pinte vuelve a
mentir. Esto lo quita de las manos de nadie — se reescriben todos, y deploy.sh
comprueba antes de publicar.

  sella-versiones.py            reescribe los literales al sello de index.html
  sella-versiones.py --check    no toca nada; sale 1 si alguno está desfasado
"""
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
LITERAL = re.compile(r"(window\.ADMIRA_VERSION\s*=\s*')(v\.[0-9.]+r[0-9]+(?:\.[0-9:]+)?)(')")
SELLO_META = re.compile(r'<meta name="admiranext-version" content="([^"]+)"')


def sello_canonico():
    m = SELLO_META.search((RAIZ / "index.html").read_text(encoding="utf-8"))
    if not m:
        sys.exit("✖ no encuentro el sello canónico en index.html")
    return m.group(1)


def main():
    solo_mirar = "--check" in sys.argv
    sello = sello_canonico()
    desfasados, tocados = [], []

    for f in sorted(RAIZ.rglob("*.html")):
        if any(p in f.parts for p in ("node_modules", ".git", ".wrangler")):
            continue
        texto = f.read_text(encoding="utf-8")
        if "ADMIRA_VERSION" not in texto:
            continue
        nuevo = LITERAL.sub(lambda m: m.group(1) + sello + m.group(3), texto)
        if nuevo == texto:
            continue
        rel = f.relative_to(RAIZ)
        viejos = {m.group(2) for m in LITERAL.finditer(texto)} - {sello}
        desfasados.append(f"{rel} → {', '.join(sorted(viejos))}")
        if not solo_mirar:
            f.write_text(nuevo, encoding="utf-8")
            tocados.append(str(rel))

    if solo_mirar:
        if desfasados:
            print(f"✖ {len(desfasados)} página(s) declaran una versión que no es {sello}:")
            for d in desfasados:
                print("   ", d)
            print("   Arréglalo con: python3 tools/sella-versiones.py")
            sys.exit(1)
        print(f"✓ todos los literales de versión dicen {sello}")
        return

    if tocados:
        print(f"✓ {len(tocados)} página(s) selladas a {sello}")
        for t in tocados:
            print("   ", t)
    else:
        print(f"✓ ya estaban todas en {sello}")


main()

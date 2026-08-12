#!/usr/bin/env python3
"""Pone al sello del release TODOS los literales de versión Y los tokens de caché.

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
# El token de caché de los assets PROPIOS (?v=…). Es lo mismo que el literal de
# versión pero peor: mientras el rótulo solo miente, un token congelado hace que el
# navegador siga sirviendo el JS y el CSS VIEJOS. El 12-ago se publicaron seis
# releases seguidas de admira-nav.js y ninguna llegó a un navegador abierto, porque
# el CMS pedía admira-nav.js?v=04.08.2026.r4 y esa URL ya estaba en su caché.
# Solo assets propios (rutas relativas o /): los externos no se tocan.
TOKEN = re.compile(r'((?:href|src)="/?(?!//|https?:)[A-Za-z0-9._/-]+\.(?:js|css)\?v=)([^"]*)(")')
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
        if "ADMIRA_VERSION" not in texto and "?v=" not in texto:
            continue
        nuevo = LITERAL.sub(lambda m: m.group(1) + sello + m.group(3), texto)
        # El token va sin la «v.» y sin los dos puntos de la hora: es una clave de
        # caché, no un sello que nadie vaya a leer.
        clave = sello.lstrip("v.").replace(":", "")
        nuevo = TOKEN.sub(lambda m: m.group(1) + clave + m.group(3), nuevo)
        if nuevo == texto:
            continue
        rel = f.relative_to(RAIZ)
        clave = sello.lstrip("v.").replace(":", "")
        viejos = ({m.group(2) for m in LITERAL.finditer(texto)} - {sello}) | \
                 ({m.group(2) for m in TOKEN.finditer(texto)} - {clave})
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

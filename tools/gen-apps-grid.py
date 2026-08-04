#!/usr/bin/env python3
"""Genera en index.html la rejilla de soluciones a partir de apps/public-catalog.json.

Por qué existe: hasta el 4-ago-2026 el corazón de la home (las 20 tarjetas) lo
pintaba public-apps.js pidiendo el catálogo por fetch, y con un contrato rígido
—si no venían EXACTAMENTE 20, se tiraba entero—. Eso significaba que un fallo de
red, o simplemente añadir la solución 21, dejaba la sección principal vacía; y
que ningún buscador veía el producto, porque sin JS sólo quedaba el <noscript>.

Ahora el HTML se genera aquí, en el repo, y el JS sólo engancha comportamiento
(vídeo y PDF) sobre lo que ya está pintado. El catálogo y las tarjetas viajan en
el mismo despliegue, así que no hay nada que pedir en caliente.

    tools/gen-apps-grid.py            regenera index.html
    tools/gen-apps-grid.py --check    no escribe; sale 1 si está desincronizado

El --check lo llama deploy.sh: si alguien toca el JSON y olvida regenerar, la
publicación se para en vez de servir una rejilla que no dice lo que dice el
catálogo.
"""
import html
import json
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CATALOGO = RAIZ / "apps" / "public-catalog.json"
INDEX = RAIZ / "index.html"
ABRE = "<!-- apps:generado — NO editar a mano: tools/gen-apps-grid.py -->"
CIERRA = "<!-- /apps:generado -->"


def esc(valor):
    return html.escape(str(valor or ""), quote=True)


def url_segura(valor, slug, tipo):
    """Misma regla que tenía el JS: sólo se acepta la ruta canónica del slug.

    Se mantiene para que un catálogo manipulado no pueda colar una URL
    arbitraria en el botón; ahora se comprueba al generar, no en el navegador.
    """
    ext = "mp4" if tipo == "video" else "pdf"
    esperada = "/apps/{}/{}.{}".format(tipo, slug, ext)
    return esperada if valor == esperada else ""


def tarjeta(app):
    slug = app["slug"]
    nombre_es, nombre_en = app["name_es"], app["name_en"]
    disponible = app.get("status") == "available"
    estado = "Disponible · Available" if disponible else "Próximamente · Coming soon"
    video = url_segura(app.get("video"), slug, "video")
    pdf = url_segura(app.get("pdf"), slug, "pdf")

    acciones = []
    if video:
        acciones.append(
            '<button type="button" class="app-action app-video" data-app-video="{}"'
            ' aria-label="Ver vídeo de {}">▶ Vídeo</button>'.format(esc(video), esc(nombre_es))
        )
    if pdf:
        acciones.append(
            '<button type="button" class="app-action app-pdf" data-app-pdf="{}"'
            ' aria-label="Descargar PDF de {}">↓ PDF</button>'.format(esc(pdf), esc(nombre_es))
        )
    if not acciones:
        acciones.append('<span class="app-no-media">Ficha pública disponible próximamente</span>')
    acciones.append('<span class="app-media-status" role="status" aria-live="polite"></span>')

    return (
        '<article class="app-card" data-public-app-card="{slug}" data-app-title="{titulo}">'
        '<div class="app-card-head"><span class="app-icon" aria-hidden="true">{icono}</span>'
        '<span class="app-state">{estado}</span></div>'
        "<h3>{nes}</h3>"
        '<p class="app-name-en" lang="en">{nen}</p>'
        '<p class="app-description">{des}</p>'
        '<p class="app-description app-description-en" lang="en">{den}</p>'
        '<div class="app-actions">{acciones}</div>'
        "</article>"
    ).format(
        slug=esc(slug),
        titulo=esc("{} · {}".format(nombre_es, nombre_en)),
        icono=esc(app.get("icon", "")),
        estado=esc(estado),
        nes=esc(nombre_es),
        nen=esc(nombre_en),
        des=esc(app.get("description_es")),
        den=esc(app.get("description_en")),
        acciones="".join(acciones),
    )


def main():
    apps = json.loads(CATALOGO.read_text(encoding="utf-8"))
    if not isinstance(apps, list) or not apps:
        sys.exit("✖ el catálogo está vacío o no es una lista")

    bloque = "\n".join([ABRE] + [tarjeta(a) for a in apps] + [CIERRA])
    original = INDEX.read_text(encoding="utf-8")
    i, j = original.find(ABRE), original.find(CIERRA)
    if i < 0 or j < 0:
        sys.exit("✖ no encuentro los marcadores {} … {} en index.html".format(ABRE, CIERRA))
    nuevo = original[:i] + bloque + original[j + len(CIERRA):]

    # El contador visible sale del catálogo, no de un número escrito a mano, y ya
    # llega con su valor final: nadie ve un «Cargando…» que no espera a nada.
    n = len(apps)
    nuevo = re.sub(
        r'(<div class="catalog-count" id="appsStatus"[^>]*>)[^<]*(</div>)',
        r"\g<1>{n} soluciones · {n} solutions\g<2>".format(n=n),
        nuevo,
        count=1,
    )
    # La rejilla ya viene pintada: no hay espera que anunciar.
    nuevo = nuevo.replace(
        '<div class="apps-grid" id="publicApps" aria-live="polite" aria-busy="true">',
        '<div class="apps-grid" id="publicApps">',
    )

    if "--check" in sys.argv:
        if nuevo != original:
            sys.exit(
                "✖ index.html no corresponde a apps/public-catalog.json.\n"
                "  Regenera con: tools/gen-apps-grid.py"
            )
        print("  ✓ la rejilla de {} soluciones está sincronizada con el catálogo".format(n))
        return

    INDEX.write_text(nuevo, encoding="utf-8")
    print("  ✓ {} tarjetas generadas en index.html".format(n))


if __name__ == "__main__":
    main()

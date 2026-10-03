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

Los cinco pilares (3-oct-2026, Carlos: «el ecosistema de Admira.tv son todas las
soluciones de los cinco pilares de digitalsignage.ai; me gustaría que también
estuvieran representados por los colores del logo de AdmiraNeXT»). Cada solución
declara su `pilar` en el catálogo y los pilares —número, nombre, verbo, dominio y
color— viven SOLO en apps/pilares.json. De ahí sale todo lo pintado: el color de
cada tarjeta y su etiqueta «01 · Studio · Crear», la leyenda-filtro de encima de
la rejilla y el bloque de CSS con las variables de color. Nadie escribe un color
de pilar a mano en index.html. Las tarjetas se pintan en el orden de los pilares
(y, dentro de cada uno, en el orden del catálogo), que es también el orden que
recupera el filtro «Todas».
"""
import html
import json
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CATALOGO = RAIZ / "apps" / "public-catalog.json"
PILARES = RAIZ / "apps" / "pilares.json"
INDEX = RAIZ / "index.html"
ABRE = "<!-- apps:generado — NO editar a mano: tools/gen-apps-grid.py -->"
CIERRA = "<!-- /apps:generado -->"
ABRE_FILTRO = "<!-- pilares:generado — NO editar a mano: tools/gen-apps-grid.py -->"
CIERRA_FILTRO = "<!-- /pilares:generado -->"
ABRE_CSS = "<!-- pilares-css:generado — NO editar a mano: tools/gen-apps-grid.py -->"
CIERRA_CSS = "<!-- /pilares-css:generado -->"

# Fondo de la tarjeta (--panel2, el tono más claro de su degradado) y el tinte del
# color del pilar que se le superpone arriba. El contraste del texto se mide contra
# esa mezcla, que es el peor caso real, no contra el negro del body.
FONDO_TARJETA = "#101927"
TINTE = 0.06
TINTA_OSCURA = "#070a10"
TINTA_CLARA = "#e8eef6"
AA = 4.5


def esc(valor):
    return html.escape(str(valor or ""), quote=True)


def _rgb(hexa):
    h = hexa.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _luminancia(rgb):
    def canal(c):
        c /= 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (canal(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(a, b):
    """Razón de contraste WCAG 2.x entre dos colores (#rrggbb o tuplas RGB)."""
    la = _luminancia(_rgb(a) if isinstance(a, str) else a)
    lb = _luminancia(_rgb(b) if isinstance(b, str) else b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def mezcla(color, fondo, alfa):
    return tuple(round(alfa * c + (1 - alfa) * f) for c, f in zip(_rgb(color), _rgb(fondo)))


def tintas(color):
    """Decide qué tinta lleva cada texto del pilar para cumplir AA (4,5:1).

    - Texto sobre la tarjeta (nombre en inglés, «Studio · Crear»): el propio color
      si aguanta AA contra el fondo tintado; si no, texto claro.
    - Texto sobre el chip relleno del color (el número «01»): oscuro o claro, el
      que más contraste dé.
    """
    fondo = mezcla(color, FONDO_TARJETA, TINTE)
    texto = color if contraste(color, fondo) >= AA else TINTA_CLARA
    chip = max((TINTA_OSCURA, TINTA_CLARA), key=lambda t: contraste(t, color))
    return texto, chip


def carga_pilares():
    datos = json.loads(PILARES.read_text(encoding="utf-8"))
    pilares = datos.get("pilares") if isinstance(datos, dict) else None
    if not isinstance(pilares, list) or not pilares:
        sys.exit("✖ apps/pilares.json no trae la lista `pilares`")
    for p in pilares:
        for campo in ("id", "n", "nombre", "verbo_es", "verbo_en", "dominio", "color"):
            if not p.get(campo):
                sys.exit("✖ el pilar {} no trae `{}`".format(p.get("id", "?"), campo))
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", p["color"]):
            sys.exit("✖ el color del pilar {} no es #rrggbb".format(p["id"]))
        if not re.fullmatch(r"[a-z]+", p["id"]):
            sys.exit("✖ id de pilar inválido: {}".format(p["id"]))
        p["tinta"], p["tinta_chip"] = tintas(p["color"])
    return datos, pilares


def etiqueta_pilar(p):
    """Texto plano de la etiqueta: «01 · Studio · Crear»."""
    return "{} · {} · {}".format(p["n"], p["nombre"], p["verbo_es"])


def url_segura(valor, slug, tipo):
    """Misma regla que tenía el JS: sólo se acepta la ruta canónica del slug.

    Se mantiene para que un catálogo manipulado no pueda colar una URL
    arbitraria en el botón; ahora se comprueba al generar, no en el navegador.
    """
    ext = "mp4" if tipo == "video" else "pdf"
    esperada = "/apps/{}/{}.{}".format(tipo, slug, ext)
    return esperada if valor == esperada else ""


def tarjeta(app, pilar):
    slug = app["slug"]
    nombre_es, nombre_en = app["name_es"], app["name_en"]
    disponible = app.get("status") == "available"
    estado = "Disponible · Available" if disponible else "Próximamente · Coming soon"
    video = url_segura(app.get("video"), slug, "video")
    pdf = url_segura(app.get("pdf"), slug, "pdf")
    # Tarjeta con entrada propia: si el catálogo declara `href` (y la solución está
    # disponible), el título enlaza a la app y la tarjeta entera es clicable —el patrón
    # que estrenó Analítica de vídeo (Xtore, 11-sep) y que ahora también usa Catálogo—.
    # Vídeo y PDF se conservan: quedan por encima del enlace (z-index en la home).
    # `href` sólo se acepta como ruta interna (/…): un catálogo manipulado no puede
    # colar un destino externo en la home.
    href = str(app.get("href") or "")
    if not (disponible and href.startswith("/") and not href.startswith("//")):
        href = ""
    entry_label = app.get("entry_label") or "Abrir →"
    entry_aria = app.get("entry_aria") or "{}: abrir la app".format(nombre_es)
    titulo_html = esc(nombre_es)
    if href:
        titulo_html = (
            '<a class="app-entry" href="{}" aria-label="{}">{}</a>'
        ).format(esc(href), esc(entry_aria), esc(nombre_es))

    acciones = []
    if href:
        acciones.append('<span class="app-entry-label">{}</span>'.format(esc(entry_label)))
    if slug == "support":
        acciones.append('<a class="app-action" href="/support/">Abrir Soporte · Tester visual ↗</a>')
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
        '<article class="app-card{entry_class}" data-public-app-card="{slug}" data-pilar="{pid}" data-app-title="{titulo}">'
        '<div class="app-card-head"><span class="app-icon" aria-hidden="true">{icono}</span>'
        '<span class="app-state">{estado}</span></div>'
        '<p class="app-pilar" title="{pdom}"><span class="app-pilar-n">{pn}</span>'
        '<span class="app-pilar-txt"> · {pnom} · {pves}</span>'
        '<span class="app-pilar-en" lang="en"> · {pven}</span></p>'
        "<h3>{titulo_html}</h3>"
        '<p class="app-name-en" lang="en">{nen}</p>'
        '<p class="app-description">{des}</p>'
        '<p class="app-description app-description-en" lang="en">{den}</p>'
        '<div class="app-actions">{acciones}</div>'
        "</article>"
    ).format(
        slug=esc(slug),
        entry_class=" app-card-entry" if href else "",
        titulo_html=titulo_html,
        titulo=esc("{} · {}".format(nombre_es, nombre_en)),
        icono=esc(app.get("icon", "")),
        estado=esc(estado),
        nes=esc(nombre_es),
        nen=esc(nombre_en),
        des=esc(app.get("description_es")),
        den=esc(app.get("description_en")),
        acciones="".join(acciones),
        pid=esc(pilar["id"]),
        pn=esc(pilar["n"]),
        pnom=esc(pilar["nombre"]),
        pves=esc(pilar["verbo_es"]),
        pven=esc(pilar["verbo_en"]),
        pdom=esc("Pilar {} · {}".format(etiqueta_pilar(pilar), pilar["dominio"])),
    )


def css_pilares(pilares):
    """Variables de color por pilar. Es el ÚNICO sitio de la home donde aparece un
    color de pilar, y sale de apps/pilares.json."""
    reglas = [
        "[data-pilar]{{--pc-tinte:{}}}".format(TINTE),
    ]
    for p in pilares:
        reglas.append(
            '[data-pilar="{id}"]{{--pc:{c};--pc-rgb:{rgb};--pc-ink:{ink};--pc-chip-ink:{chip}}}'.format(
                id=p["id"], c=p["color"], rgb=",".join(str(x) for x in _rgb(p["color"])),
                ink=p["tinta"], chip=p["tinta_chip"],
            )
        )
    return '<style id="pilaresCss">{}</style>'.format("".join(reglas))


def filtro_pilares(datos, pilares, cuenta, total):
    """Leyenda y filtro de los cinco pilares, encima de la rejilla.

    Llega con los botones `disabled`: sin JS es una leyenda de colores que no se
    puede pulsar (y se ven las 20). public-apps.js los habilita al arrancar y
    entonces filtran, con aria-pressed y teclado nativo de <button>.
    """
    botones = [
        '<button type="button" class="pilar-btn pilar-btn-todas" data-pilar-filtro="todas"'
        ' aria-pressed="true" disabled>'
        '<span class="pilar-btn-n" aria-hidden="true">✱</span><span class="pilar-btn-nombre">Todas</span>'
        '<span class="pilar-btn-verbo"><span lang="en">All</span></span>'
        '<span class="pilar-btn-cuenta">{t} soluciones</span></button>'.format(t=total)
    ]
    for p in pilares:
        n = cuenta[p["id"]]
        botones.append(
            '<button type="button" class="pilar-btn" data-pilar="{id}" data-pilar-filtro="{id}"'
            ' aria-pressed="false" aria-label="{aria}" disabled>'
            '<span class="pilar-btn-n">{n}</span><span class="pilar-btn-nombre">{nom}</span>'
            '<span class="pilar-btn-verbo">{ves} · <span lang="en">{ven}</span></span>'
            '<span class="pilar-btn-cuenta">{dom} · {k}</span></button>'.format(
                id=esc(p["id"]), n=esc(p["n"]), nom=esc(p["nombre"]),
                ves=esc(p["verbo_es"]), ven=esc(p["verbo_en"]), dom=esc(p["dominio"]), k=n,
                aria=esc("Pilar {} · {}: {} {}".format(
                    etiqueta_pilar(p), p["dominio"], n, "solución" if n == 1 else "soluciones")),
            )
        )
    return (
        '<div class="pilares" id="pilares">'
        '<p class="pilares-titulo" id="pilaresTitulo">{tes} · '
        '<a href="{url}" target="_blank" rel="noopener">{fuente}<span aria-hidden="true"> ↗</span></a>'
        '<span class="pilares-titulo-en" lang="en"> · {ten}</span></p>'
        '<div class="pilares-btns" role="group" aria-labelledby="pilaresTitulo">{b}</div>'
        "</div>"
    ).format(
        tes=esc(datos.get("titulo_es", "Los cinco pilares")),
        ten=esc(datos.get("titulo_en", "The five pillars")),
        url=esc(datos.get("fuente", "https://www.digitalsignage.ai/")),
        fuente=esc(datos.get("fuente_nombre", "digitalsignage.ai")),
        b="".join(botones),
    )


def reemplaza(texto, abre, cierra, bloque):
    i, j = texto.find(abre), texto.find(cierra)
    if i < 0 or j < 0:
        sys.exit("✖ no encuentro los marcadores {} … {} en index.html".format(abre, cierra))
    return texto[:i] + bloque + texto[j + len(cierra):]


def main():
    apps = json.loads(CATALOGO.read_text(encoding="utf-8"))
    if not isinstance(apps, list) or not apps:
        sys.exit("✖ el catálogo está vacío o no es una lista")
    datos, pilares = carga_pilares()
    por_id = {p["id"]: p for p in pilares}
    orden = {p["id"]: i for i, p in enumerate(pilares)}
    sin_pilar = [a.get("slug", "?") for a in apps if a.get("pilar") not in por_id]
    if sin_pilar:
        sys.exit("✖ soluciones sin pilar válido en el catálogo: {}".format(", ".join(sin_pilar)))
    # sorted() es estable: dentro de cada pilar se respeta el orden del catálogo.
    apps = sorted(apps, key=lambda a: orden[a["pilar"]])
    cuenta = {p["id"]: sum(1 for a in apps if a["pilar"] == p["id"]) for p in pilares}

    bloque = "\n".join([ABRE] + [tarjeta(a, por_id[a["pilar"]]) for a in apps] + [CIERRA])
    original = INDEX.read_text(encoding="utf-8")
    nuevo = reemplaza(original, ABRE, CIERRA, bloque)
    nuevo = reemplaza(nuevo, ABRE_FILTRO, CIERRA_FILTRO,
                      ABRE_FILTRO + filtro_pilares(datos, pilares, cuenta, len(apps)) + CIERRA_FILTRO)
    nuevo = reemplaza(nuevo, ABRE_CSS, CIERRA_CSS, ABRE_CSS + css_pilares(pilares) + CIERRA_CSS)

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
        print("  ✓ la rejilla de {} soluciones y sus {} pilares están sincronizados con el catálogo".format(n, len(pilares)))
        return

    INDEX.write_text(nuevo, encoding="utf-8")
    print("  ✓ {} tarjetas en {} pilares generadas en index.html".format(n, len(pilares)))


if __name__ == "__main__":
    main()

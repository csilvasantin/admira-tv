#!/usr/bin/env python3
"""Genera en index.html la rejilla de la home a partir de apps/home-catalog.json.

Por qué existe: hasta el 4-ago-2026 el corazón de la home (las 20 tarjetas) lo
pintaba public-apps.js pidiendo el catálogo por fetch, y con un contrato rígido
—si no venían EXACTAMENTE 20, se tiraba entero—. Eso significaba que un fallo de
red, o simplemente añadir la solución 21, dejaba la sección principal vacía; y
que ningún buscador veía el producto, porque sin JS sólo quedaba el <noscript>.

Ahora el HTML se genera aquí, en el repo, y el JS sólo engancha comportamiento
(vídeo, PDF y filtro) sobre lo que ya está pintado. Los catálogos y las tarjetas
viajan en el mismo despliegue, así que no hay nada que pedir en caliente.

    tools/gen-apps-grid.py            regenera index.html
    tools/gen-apps-grid.py --check    no escribe; sale 1 si está desincronizado

El --check lo llama deploy.sh: si alguien toca un JSON y olvida regenerar, la
publicación se para en vez de servir una rejilla que no dice lo que dicen los
catálogos.

Los cinco pilares (3-oct-2026, Carlos: «el ecosistema de Admira.tv son todas las
soluciones de los cinco pilares de digitalsignage.ai; me gustaría que también
estuvieran representados por los colores del logo de AdmiraNeXT»). Los pilares
—número, nombre, verbo, dominio y color— viven SOLO en apps/pilares.json. De ahí
sale todo lo pintado: el color de cada tarjeta y su etiqueta «01 · Studio ·
Crear», la leyenda-filtro de encima de la rejilla y el bloque de CSS con las
variables de color. Nadie escribe un color de pilar a mano en index.html.

Las cinco zonas (4-oct-2026, Carlos): la home pasa a ser 5 zonas de 4 tarjetas,
una por pilar y en el orden de apps/pilares.json. Cada zona abre con la tarjeta
del propio pilar (enlace a https://www.<dominio>/) y sigue con sus 3 soluciones.
La composición vive en apps/home-catalog.json, separada de
apps/public-catalog.json a propósito: ese otro catálogo alimenta la lanzadera
protegida /apps/ (que enlaza /<slug>/ de cada app real) y la allowlist de
medios, así que meterle tarjetas sin app detrás habría roto la lanzadera. Una
tarjeta de la home con `desde_catalogo` reutiliza tal cual la ficha de
public-catalog.json (descripción, vídeo, PDF y enlace); las demás se definen en
home-catalog.json, y si aún no tienen vídeo o PDF se pintan con los botones en
estado «pronto».
"""
import html
import json
import pathlib
import re
import sys
from urllib.parse import quote

RAIZ = pathlib.Path(__file__).resolve().parent.parent
HOME_CATALOGO = RAIZ / "apps" / "home-catalog.json"
CATALOGO = RAIZ / "apps" / "public-catalog.json"
PILARES = RAIZ / "apps" / "pilares.json"
DEMOS = RAIZ / "apps" / "demo-videos.json"
INDEX = RAIZ / "index.html"
STOCK_VIDEO = re.compile(r"^https://stock\.admira\.store/stock/[0-9]+-[a-z0-9]+/asset\.mp4\?v=[0-9]+$")
DEMO_MAIL = "hola@admiranext.com"
ABRE = "<!-- apps:generado — NO editar a mano: tools/gen-apps-grid.py -->"
CIERRA = "<!-- /apps:generado -->"
ABRE_FILTRO = "<!-- pilares:generado — NO editar a mano: tools/gen-apps-grid.py -->"
CIERRA_FILTRO = "<!-- /pilares:generado -->"
ABRE_CSS = "<!-- pilares-css:generado — NO editar a mano: tools/gen-apps-grid.py -->"
CIERRA_CSS = "<!-- /pilares-css:generado -->"

# Fondo de la tarjeta (--panel2, el tono más claro de su degradado) y el tinte del
# color del pilar que se le superpone arriba. El contraste del texto se mide contra
# esa mezcla, que es el peor caso real, no contra el negro del body. La tarjeta que
# abre cada zona (la del propio pilar) lleva más tinte para distinguirse: el texto
# tiene que aguantar AA sobre las dos.
FONDO_TARJETA = "#101927"
TINTE = 0.06
TINTE_PILAR = 0.16
TINTA_OSCURA = "#070a10"
TINTA_CLARA = "#e8eef6"
AA = 4.5

SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
CAMPOS_TARJETA = ("icon", "name_es", "name_en", "description_es", "description_en", "status")


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
      si aguanta AA contra el fondo tintado de las dos tarjetas (la normal y la del
      pilar, más tintada); si no, texto claro.
    - Texto sobre el chip relleno del color (el número «01»): oscuro o claro, el
      que más contraste dé.
    """
    fondos = [mezcla(color, FONDO_TARJETA, t) for t in (TINTE, TINTE_PILAR)]
    texto = color if min(contraste(color, f) for f in fondos) >= AA else TINTA_CLARA
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
        # El enlace de la tarjeta del pilar se construye aquí, desde el dominio: un
        # catálogo manipulado no puede colar otro destino externo en la home.
        if not re.fullmatch(r"admira\.[a-z]+", p["dominio"]):
            sys.exit("✖ dominio de pilar inesperado: {}".format(p["dominio"]))
        p["url"] = "https://www.{}/".format(p["dominio"])
        p["tinta"], p["tinta_chip"] = tintas(p["color"])
    return datos, pilares


def carga_zonas(pilares):
    """Devuelve la lista plana de tarjetas (app, pilar) en el orden de la home.

    Reglas (si alguna falla, no se genera nada):
    - una zona por pilar, en el mismo orden que apps/pilares.json;
    - la primera tarjeta de cada zona es la del pilar, y sólo esa;
    - slugs únicos; `desde_catalogo` tiene que existir en public-catalog.json y una
      tarjeta nueva no puede reutilizar un slug de ese catálogo (sería ambiguo de
      qué ficha salen el texto y los medios).
    """
    datos = json.loads(HOME_CATALOGO.read_text(encoding="utf-8"))
    zonas = datos.get("zonas") if isinstance(datos, dict) else None
    if not isinstance(zonas, list) or not zonas:
        sys.exit("✖ apps/home-catalog.json no trae la lista `zonas`")
    catalogo = json.loads(CATALOGO.read_text(encoding="utf-8"))
    por_slug = {a["slug"]: a for a in catalogo}
    if [z.get("pilar") for z in zonas] != [p["id"] for p in pilares]:
        sys.exit("✖ las zonas de home-catalog.json no siguen el orden de apps/pilares.json")
    por_id = {p["id"]: p for p in pilares}
    vistas, tarjetas = set(), []
    for z in zonas:
        pilar = por_id[z["pilar"]]
        lista = z.get("tarjetas")
        if not isinstance(lista, list) or not lista:
            sys.exit("✖ la zona {} no trae tarjetas".format(pilar["id"]))
        for i, t in enumerate(lista):
            slug = t.get("slug", "")
            if not SLUG.fullmatch(slug):
                sys.exit("✖ slug inválido en la zona {}: «{}»".format(pilar["id"], slug))
            if slug in vistas:
                sys.exit("✖ slug repetido en la home: {}".format(slug))
            vistas.add(slug)
            es_pilar = t.get("tipo") == "pilar"
            if es_pilar != (i == 0):
                sys.exit("✖ zona {}: la tarjeta del pilar tiene que ser la primera, y sólo ella".format(pilar["id"]))
            if t.get("desde_catalogo"):
                if slug not in por_slug:
                    sys.exit("✖ {} dice venir del catálogo y no está en public-catalog.json".format(slug))
                app = dict(por_slug[slug])
            else:
                if slug in por_slug:
                    sys.exit("✖ {} ya existe en public-catalog.json: usa `desde_catalogo`".format(slug))
                app = dict(t)
            for campo in CAMPOS_TARJETA:
                if not app.get(campo):
                    sys.exit("✖ la tarjeta {} no trae `{}`".format(slug, campo))
            app["_pilar"] = es_pilar
            tarjetas.append((app, pilar))
    return tarjetas


def etiqueta_pilar(p):
    """Texto plano de la etiqueta: «01 · Studio · Crear»."""
    return "{} · {} · {}".format(p["n"], p["nombre"], p["verbo_es"])


def carga_demos():
    """Vídeos de demo ya publicados en el Stock. Una URL que no sea ese asset se rechaza."""
    if not DEMOS.exists():
        return {}
    datos = json.loads(DEMOS.read_text(encoding="utf-8"))
    videos = datos.get("videos") if isinstance(datos, dict) else None
    if not isinstance(videos, dict):
        sys.exit("✖ apps/demo-videos.json no trae el objeto `videos`")
    for slug, video in videos.items():
        if not SLUG.fullmatch(slug):
            sys.exit("✖ slug de demo inválido: {}".format(slug))
        if not isinstance(video, dict) or not video.get("src"):
            sys.exit("✖ {} no trae `src`".format(slug))
        for campo in ("src", "src_en"):
            if video.get(campo) and not STOCK_VIDEO.fullmatch(video[campo]):
                sys.exit("✖ {} {} no es un asset de stock.admira.store".format(slug, campo))
    return videos


def mailto_demo(nombre_es, nombre_en):
    """La demo (/adcelerate/demo/) no tiene un campo de solución: el correo sale con el asunto relleno."""
    asunto = "Pedir demo · {} / Request a demo · {}".format(nombre_es, nombre_en)
    cuerpo = "Solución: {}\nSolution: {}\n".format(nombre_es, nombre_en)
    return "mailto:{}?subject={}&body={}".format(DEMO_MAIL, quote(asunto, safe=""), quote(cuerpo, safe=""))


def url_segura(valor, slug, tipo):
    """Misma regla que tenía el JS: sólo se acepta la ruta canónica del slug.

    Se mantiene para que un catálogo manipulado no pueda colar una URL
    arbitraria en el botón; ahora se comprueba al generar, no en el navegador.
    """
    ext = "mp4" if tipo == "video" else "pdf"
    esperada = "/apps/{}/{}.{}".format(tipo, slug, ext)
    return esperada if valor == esperada else ""


def bilingue(es, en):
    """Atributos del par ES/EN que lee assets/portada-idioma.js (texto). Si los dos dicen
    lo mismo (Admira.studio, DooH…) no hace falta par."""
    return "" if es == en else ' data-es="{}" data-en="{}"'.format(esc(es), esc(en))


def bilingue_attr(attr, es, en):
    """El atributo en español (el de siempre) y su par ES/EN para portada-idioma.js."""
    return ' {a}="{es}" data-es-{a}="{es}" data-en-{a}="{en}"'.format(a=attr, es=esc(es), en=esc(en))


def boton_pronto(texto, texto_en, que, que_en, nombre_es, nombre_en):
    """Botón de un medio que aún no existe: presente, pero `aria-disabled`.

    Sigue siendo enfocable para que un lector de pantalla lo encuentre y anuncie
    «próximamente»; no lleva data-app-video/data-app-pdf, así que public-apps.js no
    le engancha nada y pulsarlo no hace nada.
    """
    return (
        '<button type="button" class="app-action app-pronto" aria-disabled="true"{}{}>{} · pronto</button>'
    ).format(
        bilingue_attr("aria-label", "{} de {}: próximamente".format(que, nombre_es), "{} {}: coming soon".format(nombre_en, que_en)),
        bilingue("{} · pronto".format(texto), "{} · coming soon".format(texto_en)),
        esc(texto),
    )


def tarjeta(app, pilar, demos):
    slug = app["slug"]
    nombre_es, nombre_en = app["name_es"], app["name_en"]
    es_pilar = app.get("_pilar")
    disponible = app.get("status") == "available"
    estado = "Disponible · Available" if disponible else "Próximamente · Coming soon"
    estado_en = "Available" if disponible else "Coming soon"
    video = url_segura(app.get("video"), slug, "video")
    video_en = ""
    if not video and slug in demos:
        video = demos[slug]["src"]
        video_en = demos[slug].get("src_en") or ""
    pdf = url_segura(app.get("pdf"), slug, "pdf")
    # Tarjeta con entrada propia: el título enlaza y la tarjeta entera es clicable
    # —el patrón que estrenó Analítica de vídeo (Xtore, 11-sep)—. Vídeo y PDF quedan
    # por encima del enlace (z-index en la home).
    # - Tarjeta de pilar: enlaza a https://www.<dominio>/ (sale de pilares.json).
    # - Solución: sólo si el catálogo declara `href` interno (/…) y está disponible;
    #   un catálogo manipulado no puede colar un destino externo.
    externo = False
    if es_pilar:
        href = pilar["url"]
        externo = True
        entry_label = "Abrir {} →".format(pilar["dominio"])
        entry_label_en = "Open {} →".format(pilar["dominio"])
        entry_aria = "{}: abrir {} en otra pestaña".format(nombre_es, pilar["dominio"])
        entry_aria_en = "{}: open {} in a new tab".format(nombre_en, pilar["dominio"])
    else:
        href = str(app.get("href") or "")
        if not (disponible and href.startswith("/") and not href.startswith("//")):
            href = ""
        entry_label = app.get("entry_label") or "Abrir →"
        entry_label_en = app.get("entry_label_en") or "Open →"
        entry_aria = app.get("entry_aria") or "{}: abrir la app".format(nombre_es)
        entry_aria_en = app.get("entry_aria_en") or "{}: open the app".format(nombre_en)
    # En inglés el título de una solución dice el nombre inglés (y .app-name-en se oculta: lo
    # repetiría). La tarjeta del pilar conserva la marca (Admira.studio…) con su línea inglesa.
    nombre_titulo_en = nombre_es if es_pilar else nombre_en
    titulo_html = '<span class="app-name"{}>{}</span>'.format(bilingue(nombre_es, nombre_titulo_en), esc(nombre_es))
    if href:
        titulo_html = (
            '<a class="app-entry" href="{}"{}{}{}>{}</a>'
        ).format(
            esc(href),
            ' target="_blank" rel="noopener"' if externo else "",
            bilingue_attr("aria-label", entry_aria, entry_aria_en),
            bilingue(nombre_es, nombre_titulo_en),
            esc(nombre_es),
        )

    acciones = []
    if href:
        acciones.append('<span class="app-entry-label"{}>{}</span>'.format(bilingue(entry_label, entry_label_en), esc(entry_label)))
    if video:
        acciones.append(
            '<button type="button" class="app-action app-video" data-app-video="{}"{}{}{}>▶ Vídeo</button>'.format(
                esc(video),
                ' data-app-video-en="{}"'.format(esc(video_en)) if video_en else "",
                bilingue_attr("aria-label", "Ver vídeo de {}".format(nombre_es), "Watch the {} video".format(nombre_en)),
                bilingue("▶ Vídeo", "▶ Video"),
            )
        )
    else:
        acciones.append(boton_pronto("▶ Vídeo", "▶ Video", "Vídeo", "video", nombre_es, nombre_en))
    if pdf:
        # El texto «↓ PDF» es el mismo en los dos idiomas (y public-apps.js lo cambia al comprobar).
        acciones.append(
            '<button type="button" class="app-action app-pdf" data-app-pdf="{}"{}>↓ PDF</button>'.format(
                esc(pdf),
                bilingue_attr("aria-label", "Descargar PDF de {}".format(nombre_es), "Download the {} PDF".format(nombre_en)),
            )
        )
    else:
        acciones.append(boton_pronto("↓ PDF", "↓ PDF", "PDF", "PDF", nombre_es, nombre_en))
    acciones.append(
        '<a class="app-action app-demo" href="{}"{}{}>Pedir demo</a>'.format(
            esc(mailto_demo(nombre_es, nombre_en)),
            bilingue_attr("aria-label", "Pedir demo de {}".format(nombre_es), "Request a demo of {}".format(nombre_en)),
            bilingue("Pedir demo", "Request a demo"),
        )
    )
    acciones.append('<span class="app-media-status" role="status" aria-live="polite"></span>')

    clases = "app-card"
    if href:
        clases += " app-card-entry"
    if es_pilar:
        clases += " app-card-pilar"
    return (
        '<article class="{clases}" id="solucion-{slug}" data-public-app-card="{slug}" data-pilar="{pid}" data-app-title="{titulo}">'
        '<div class="app-card-head"><span class="app-icon" aria-hidden="true">{icono}</span>'
        '<span class="app-state" data-es="{estado}" data-en="{estado_en}">{estado}</span></div>'
        '<p class="app-pilar" title="{pdom}" data-es-title="{pdom}" data-en-title="{pdom_en}"><span class="app-pilar-n">{pn}</span>'
        '<span class="app-pilar-txt" data-es=" · {pnom} · {pves}" data-en=" · {pnom} · {pven}"> · {pnom} · {pves}</span>'
        '<span class="app-pilar-en" lang="en"> · {pven}</span></p>'
        "<h3>{titulo_html}</h3>"
        '<p class="app-name-en" lang="en">{nen}</p>'
        '<p class="app-description">{des}</p>'
        '<p class="app-description app-description-en" lang="en">{den}</p>'
        '<div class="app-actions">{acciones}</div>'
        "</article>"
    ).format(
        clases=clases,
        slug=esc(slug),
        titulo_html=titulo_html,
        titulo=esc("{} · {}".format(nombre_es, nombre_en)),
        icono=esc(app.get("icon", "")),
        estado=esc(estado),
        estado_en=esc(estado_en),
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
        pdom_en=esc("Pillar {} · {} · {} · {}".format(pilar["n"], pilar["nombre"], pilar["verbo_en"], pilar["dominio"])),
    )


def css_pilares(pilares):
    """Variables de color por pilar. Es el ÚNICO sitio de la home donde aparece un
    color de pilar, y sale de apps/pilares.json."""
    reglas = [
        "[data-pilar]{{--pc-tinte:{};--pc-tinte-pilar:{}}}".format(TINTE, TINTE_PILAR),
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
        '<span class="pilar-btn-n" aria-hidden="true">✱</span><span class="pilar-btn-nombre" data-es="Todas" data-en="All">Todas</span>'
        '<span class="pilar-btn-verbo"><span lang="en">All</span></span>'
        '<span class="pilar-btn-cuenta" data-es="{t} soluciones" data-en="{t} solutions">{t} soluciones</span></button>'.format(t=total)
    ]
    for p in pilares:
        n = cuenta[p["id"]]
        botones.append(
            '<button type="button" class="pilar-btn" data-pilar="{id}" data-pilar-filtro="{id}"'
            ' aria-pressed="false" aria-label="{aria}" data-es-aria-label="{aria}" data-en-aria-label="{aria_en}" disabled>'
            '<span class="pilar-btn-n">{n}</span><span class="pilar-btn-nombre">{nom}</span>'
            '<span class="pilar-btn-verbo"><span class="pilar-btn-es">{ves} · </span><span lang="en">{ven}</span></span>'
            '<span class="pilar-btn-cuenta">{dom} · {k}</span></button>'.format(
                id=esc(p["id"]), n=esc(p["n"]), nom=esc(p["nombre"]),
                ves=esc(p["verbo_es"]), ven=esc(p["verbo_en"]), dom=esc(p["dominio"]), k=n,
                aria=esc("Pilar {} · {}: {} {}".format(
                    etiqueta_pilar(p), p["dominio"], n, "solución" if n == 1 else "soluciones")),
                aria_en=esc("Pillar {} · {} · {} · {}: {} {}".format(
                    p["n"], p["nombre"], p["verbo_en"], p["dominio"], n, "solution" if n == 1 else "solutions")),
            )
        )
    return (
        '<div class="pilares" id="pilares">'
        '<p class="pilares-titulo" id="pilaresTitulo"><span class="pilares-titulo-es" data-es="{tes}" data-en="{ten}">{tes}</span> · '
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
    datos, pilares = carga_pilares()
    demos = carga_demos()
    tarjetas = carga_zonas(pilares)
    for app, _pilar in tarjetas:
        if app["slug"] in demos and url_segura(app.get("video"), app["slug"], "video"):
            sys.exit("✖ {} ya tiene vídeo de catálogo y también uno de demo".format(app["slug"]))
    cuenta = {p["id"]: sum(1 for _, pz in tarjetas if pz["id"] == p["id"]) for p in pilares}

    bloque = "\n".join([ABRE] + [tarjeta(a, p, demos) for a, p in tarjetas] + [CIERRA])
    original = INDEX.read_text(encoding="utf-8")
    nuevo = reemplaza(original, ABRE, CIERRA, bloque)
    nuevo = reemplaza(nuevo, ABRE_FILTRO, CIERRA_FILTRO,
                      ABRE_FILTRO + filtro_pilares(datos, pilares, cuenta, len(tarjetas)) + CIERRA_FILTRO)
    nuevo = reemplaza(nuevo, ABRE_CSS, CIERRA_CSS, ABRE_CSS + css_pilares(pilares) + CIERRA_CSS)

    # El contador visible sale del catálogo, no de un número escrito a mano, y ya
    # llega con su valor final: nadie ve un «Cargando…» que no espera a nada.
    n = len(tarjetas)
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
                "✖ index.html no corresponde a apps/home-catalog.json, apps/pilares.json"
                " y apps/public-catalog.json.\n"
                "  Regenera con: tools/gen-apps-grid.py"
            )
        print("  ✓ la rejilla de {} soluciones y sus {} pilares están sincronizados con el catálogo".format(n, len(pilares)))
        return

    INDEX.write_text(nuevo, encoding="utf-8")
    print("  ✓ {} tarjetas en {} zonas generadas en index.html".format(n, len(pilares)))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Publica la playlist temática de cada kiosko digital (Carlos, 7-sep-2026):
   Vila · News & Coffee → música | Jardinets → tecnología | Lesseps → creatividad.
Fuente: Stock (api.admira.store/stock/list) filtrado por etiquetas; destino:
brain.digitalavatar.ai/control/playlist?screen=<pantalla>-tema (la FUENTE; <pantalla> a secas es el espejo
de lo que emite el teléfono), que leen canal.html
(teléfonos en sincro) y el gemelo adcelerate/demo/best (mismo reloj, mismo fotograma).
OJO: el worker guarda la playlist con TTL de 24 h → hay que volver a publicar cada día
(cron/launchd) o subir el TTL en omnipublicity-api. Uso: python3 tools/publica-playlists-kioskos.py [--dry]"""
import json, re, sys, urllib.request
UA = {"User-Agent": "Mozilla/5.0 admira-tv/playlists"}
KIOSKOS = {"samsung-galaxy-fold-9-mupi": "musica",   # Fold 9 · Vila (News & Coffee) — pantalla real
           "sim-gracia-kiosko": "musica",            # Vila · reserva (preview configurada)
           "ipad-admin-mupi": "musica",              # iPad de Admin (iOS 17) · Vila · música (alta 08-09-2026)
           "ipad-luna-mupi": "musica",               # iPad de Luna · Vila · música
           "samsung-galaxy-fold-8-mupi": "tecnologia",  # Fold 8 · Jardinets
           "iphone-mupi": "creatividad",             # iPhone 17 · Lesseps (app tv.admira.player.ipad)
           "iphone17-mupi": "creatividad",           # iPhone 17 · Lesseps (app antigua)
           "sim-jardinets-kiosko": "tecnologia", "sim-lesseps-kiosko": "creatividad"}   # pantallas de reserva (canal en navegador)
TAGS = {"tecnologia": {"tecnología", "tecnologia", "tech", "ia", "inteligencia artificial", "robótica", "innovación", "innovation", "ai"},
        "creatividad": {"creativity", "creatividad", "diseño", "inspiración", "animaciones", "animation", "arte", "cine", "creativetech"}}
DUR = 20

def perfil_de(i):
    """Perfil de audiencia al que casa mejor una pieza, por sus etiquetas/título (heurística honesta)."""
    t = " ".join(str(i.get(k) or "") for k in ("title", "tags", "comment")).lower()
    if re.search(r"198\d|80s|ochent|billboard|retro|nostalg|guns n|berlin|top gun|huey lewis|communards|westlife|\*nsync|throwback", t): return "seniors"
    if re.search(r"ia\b|inteligencia artificial|#ai|trend|tiktok|nyla stone|soul blues|shorts|humor|random|gpt|astra|3d|innovation|tech", t): return "jovenes"
    if re.search(r"familia|vida m[ií]a|b[eé]same|cari[nñ]o|mam[aá]|amigo|ni[nñ]|kids|orenes|ocio", t): return "familias"
    return "turistas"

def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA)))
def main():
    dry = "--dry" in sys.argv
    # El índice público trae TODO el Stock (889 piezas); /stock/list corta en 200.
    stock = get("https://stock.admira.store/stock/index.json"); items = stock.get("items", stock) if isinstance(stock, dict) else stock
    def tagged(i, ts): return any(str(t).lower() in ts for t in (i.get("tags") or []))
    vis = [i for i in items if i.get("type") in ("video", "image") and i.get("url")]
    listas = {k: [i for i in vis if tagged(i, ts)][:40] for k, ts in TAGS.items()}
    # Música EN VÍDEO (Carlos, 7-sep-2026): las piezas con el hashtag #musica (y #music…, o etiqueta musica/music).
    def texto(i): return " ".join(str(i.get(k) or "") for k in ("title", "comment", "prompt", "tags", "category", "hashtags"))
    mus = [i for i in vis if i.get("type") == "video" and re.search(r"#m[úu]sica\b", texto(i), re.I)]
    mus += [i for i in vis if i.get("type") == "video" and i not in mus and (re.search(r"#(m[úu]sica|music)\w*", texto(i), re.I)
            or any(re.fullmatch(r"m[úu]sica|music", str(t), re.I) for t in (i.get("tags") or [])))]
    listas["musica"] = mus[:40]
    # DURACIONES REALES en el tema (8-sep-2026): una pantalla recién dada de alta arrancaba con 20 s
    # por pieza mientras las veteranas ya sabían la duración real → líneas de tiempo distintas hasta
    # completar una vuelta (el iPad iba por la pieza 35 y el Fold 9 por la 22). Se toman de los espejos
    # (<pantalla>, lo que cada teléfono ha descubierto) de todas las pantallas del mismo tema.
    conocidas = {}
    for screen in KIOSKOS:
        try:
            for it in get("https://brain.digitalavatar.ai/control/playlist?screen=" + screen).get("items", []):
                d = int(it.get("dur") or 0)
                if d > 0 and d != DUR: conocidas[it["id"]] = d
        except Exception: pass
    print(f"duraciones reales conocidas: {len(conocidas)}")
    for screen, tema in KIOSKOS.items():
        # PERFIL de audiencia por pieza (8-sep-2026): el gemelo elige la pieza según el viandante dominante
        # (familias · jóvenes · turistas · seniors) y se la manda a la pantalla real por su número (#num).
        its = [{"id": i["id"], "num": i.get("num"), "title": (i.get("title") or "")[:80], "type": "audio" if i.get("type") in ("music", "audio") else i["type"],
                "url": i["url"], "thumb": i.get("thumbnail") or "", "dur": conocidas.get(i["id"], DUR), "perfil": perfil_de(i)} for i in listas[tema]]
        print(f"{screen} ← {tema}: {len(its)} piezas" + (" (dry)" if dry else ""))
        if dry or not its: continue
        r = urllib.request.Request("https://brain.digitalavatar.ai/control/playlist", data=json.dumps({"screen": screen + "-tema", "items": its}).encode(),
                                   headers={**UA, "Content-Type": "application/json"})
        print("  ", urllib.request.urlopen(r).read().decode()[:80])
if __name__ == "__main__": main()

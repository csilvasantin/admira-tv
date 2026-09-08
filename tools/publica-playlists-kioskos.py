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
           "ipad-luna-mupi": "musica",               # iPad (9ª gen) · Vila · música (alta 08-09-2026)
           "samsung-galaxy-fold-8-mupi": "tecnologia",  # Fold 8 · Jardinets
           "iphone-mupi": "creatividad",             # iPhone 17 · Lesseps (app tv.admira.player.ipad)
           "iphone17-mupi": "creatividad",           # iPhone 17 · Lesseps (app antigua)
           "sim-jardinets-kiosko": "tecnologia", "sim-lesseps-kiosko": "creatividad"}   # pantallas de reserva (canal en navegador)
TAGS = {"tecnologia": {"tecnología", "tecnologia", "tech", "ia", "inteligencia artificial", "robótica", "innovación", "innovation", "ai"},
        "creatividad": {"creativity", "creatividad", "diseño", "inspiración", "animaciones", "animation", "arte", "cine", "creativetech"}}
DUR = 20
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
    for screen, tema in KIOSKOS.items():
        its = [{"id": i["id"], "title": (i.get("title") or "")[:80], "type": "audio" if i.get("type") in ("music", "audio") else i["type"],
                "url": i["url"], "thumb": i.get("thumbnail") or "", "dur": DUR} for i in listas[tema]]
        print(f"{screen} ← {tema}: {len(its)} piezas" + (" (dry)" if dry else ""))
        if dry or not its: continue
        r = urllib.request.Request("https://brain.digitalavatar.ai/control/playlist", data=json.dumps({"screen": screen + "-tema", "items": its}).encode(),
                                   headers={**UA, "Content-Type": "application/json"})
        print("  ", urllib.request.urlopen(r).read().decode()[:80])
if __name__ == "__main__": main()

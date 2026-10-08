#!/usr/bin/env python3
"""Publica la playlist temática de cada kiosko digital (Carlos, 7-sep-2026):
   Vila · News & Coffee → música | Jardinets → música (Fold 8, desde 14-sep) | Lesseps → creatividad.
Fuente: Stock (api.admira.store/stock/list) filtrado por etiquetas; destino:
brain.digitalavatar.ai/control/playlist?screen=<pantalla>-tema (la FUENTE; <pantalla> a secas es el espejo
de lo que emite el teléfono), que leen canal.html
(teléfonos en sincro) y el gemelo adcelerate/demo/best (mismo reloj, mismo fotograma).
Desde el 10-sep-2026 el worker (omnipublicity-api) NO caduca los <screen>-tema (antes 24 h: el iPad
de Jardinets arrancaba al día siguiente sin tema y caía al máster global) y conserva num/perfil.
Se vuelve a ejecutar solo cuando cambie el Stock o el reparto de temas.

CLAVE (8-oct-2026, E0 del modelo único de playlists): escribir un <pantalla>-tema exige la clave
CONTROL_PLAYLIST_KEY del worker; leer, no. El script la busca, por este orden, en la variable de
entorno CONTROL_PLAYLIST_KEY y en la bóveda admira-vault (~/Claude/admira-vault/vault-get.sh
CONTROL_PLAYLIST_KEY; otra ruta con ADMIRA_VAULT_DIR). La envía en la cabecera X-Control-Key y nunca
la imprime. La clave no se escribe en el repo: se guarda en la bóveda con
~/Claude/admira-vault/guarda-secreto.sh CONTROL_PLAYLIST_KEY. Sin clave solo funciona mientras el
worker no tenga el secreto puesto; con el secreto puesto, el worker responde 401 y el script se para.
Uso: python3 tools/publica-playlists-kioskos.py [--dry]"""
import json, os, re, subprocess, sys, urllib.error, urllib.request
UA = {"User-Agent": "Mozilla/5.0 admira-tv/playlists"}
CLAVE_NOMBRE = "CONTROL_PLAYLIST_KEY"

def clave_de_escritura():
    """(clave, origen) para escribir los -tema: entorno → bóveda. Nunca se imprime el valor."""
    v = os.environ.get(CLAVE_NOMBRE, "").strip()
    if v: return v, "entorno"
    vault = os.environ.get("ADMIRA_VAULT_DIR") or os.path.expanduser("~/Claude/admira-vault")
    helper = os.path.join(vault, "vault-get.sh")
    if os.path.isfile(helper):
        try:
            r = subprocess.run(["bash", helper, CLAVE_NOMBRE], capture_output=True, text=True, timeout=20)
            v = r.stdout.strip() if r.returncode == 0 else ""
            if v: return v, "bóveda"
        except (OSError, subprocess.SubprocessError):
            pass
    return "", "no encontrada"
KIOSKOS = {"samsung-galaxy-fold-9-mupi": "musica",   # Fold 9 · Vila (News & Coffee) — pantalla real
           "sim-gracia-kiosko": "musica",            # Vila · reserva (preview configurada)
           "ipad-admin-mupi": "musica",              # iPad de Admin (iOS 17) · JARDINETS · música (8-sep: pantalla real del gemelo de Jardinets)
           "ipad-luna-mupi": "musica",               # iPad de Luna · Vila · música
           "samsung-galaxy-fold-8-mupi": "musica",      # Fold 8 · JARDINETS · música (14-sep: pantalla real del gemelo de Jardinets, el mismo tema que el iPad)
           "samsung-galaxy-tab-a11-mupi": "musica",     # Tab A11 (SM-X130) · JARDINETS · música (14-sep, circuito samsung-galaxy-fold-8)
           "dgx-spark": "musica",                       # DGX Spark · JARDINETS · pantalla grande; screen propio, circuito compartido con Fold 8
           "iphone-mupi": "creatividad",             # iPhone 17 · Lesseps (app tv.admira.player.ipad)
           "iphone17-mupi": "musica",                # iPhone 17 de Carlos · JARDINETS · música (15-sep: tercera pantalla real del CanalKiosk de Jardinets)
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

PLAYLIST_API = "https://brain.digitalavatar.ai/control/playlist"

def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA)))
def peticion_tema(screen, its, clave):
    """POST del tema de una pantalla. La clave va en X-Control-Key (el worker también acepta Bearer)."""
    headers = {**UA, "Content-Type": "application/json"}
    if clave: headers["X-Control-Key"] = clave
    return urllib.request.Request(PLAYLIST_API, data=json.dumps({"screen": screen + "-tema", "items": its}).encode(),
                                  headers=headers, method="POST")
def publica_tema(screen, its, clave):
    """Escribe el tema y devuelve la respuesta. Un 401 (falta la clave o no vale) para el script."""
    try:
        return urllib.request.urlopen(peticion_tema(screen, its, clave), timeout=30).read().decode()[:80]
    except urllib.error.HTTPError as e:
        if e.code != 401: raise
        # El cuerpo solo dice missing_control_key / invalid_control_key; la clave nunca se imprime.
        sys.exit(f"✗ {screen}-tema: el worker rechaza la escritura (401 {e.read().decode()[:80]}). Exporta "
                 f"{CLAVE_NOMBRE} o guárdala en la bóveda: ~/Claude/admira-vault/guarda-secreto.sh {CLAVE_NOMBRE}")
def main():
    dry = "--dry" in sys.argv
    clave, origen = clave_de_escritura()
    print(f"clave de escritura de los -tema: {origen}")
    if not clave and not dry:
        print(f"  aviso: sin {CLAVE_NOMBRE}; solo funcionará mientras el worker no tenga el secreto puesto", file=sys.stderr)
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
            for it in get(PLAYLIST_API + "?screen=" + screen).get("items", []):
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
        print("  ", publica_tema(screen, its, clave))
if __name__ == "__main__": main()

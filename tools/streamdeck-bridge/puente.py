# Puente EN VIVO Stream Deck XL (AdmiraNeXT01, antes METAHUMAN) -> admira.store/objeto/stream-deck
# Lee el perfil Elgato activo (ProfilesV3, Pages.Current), compone atlas 8x4 (1024x512) y lo sube.
# Desde el 6-nov-2026 pinta tambien los titulos de cada tecla (como hace el software Elgato) y manda
# la ficha de cada tecla (nombre de la accion, titulo, estados) para que el gemelo la ensene al pulsar.
# Clave: misma que los ventiladores (config.json nube.clave o ~/.admira_supercomputer_key). Nunca se imprime.
# Desde el 10-nov-2026 manda tambien la senal de REPOSO (salvapantallas con la playlist admira-tv-streamdeck):
# lee reposo.json junto a este fichero (lo escribe quien detecta el salvapantallas) y anade la pieza en emision.
# Sin reposo.json no manda nada nuevo. Contrato: admira.store admira-xp/docs/objeto-stream-deck.md (Senal de reposo).
# Parar: schtasks /End /TN AdmiraStreamDeckBridge  ·  desactivar: schtasks /Change /TN AdmiraStreamDeckBridge /DISABLE
import os, json, time, glob, base64, hashlib, io, urllib.request, sys, re
from PIL import Image, ImageDraw, ImageFont

API = 'https://www.admira.store/objeto/stream-deck/api/face'
SERIAL = 'CL37J1A02733'
COLS, ROWS, K = 8, 4, 128
KEY_PX = 96  # tamano real de la LCD del XL: las fuentes del perfil se escalan de 96 a 128
FAN_CFG = os.path.expanduser(r'~\admira-tv\tools\player-ventiladores\config.json')
PROFILES = os.path.join(os.environ.get('APPDATA', ''), 'Elgato', 'StreamDeck', 'ProfilesV3')
FONTS = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts')
LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'puente.log')
PREFIJO = 'com.elgato.streamdeck.'
REPOSO = os.environ.get('ADMIRA_SD_REPOSO') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'reposo.json')
PLAYLIST = 'https://admira.tv/api/playlist?screen=admira-tv-streamdeck'
POSTER = 'https://stock.admira.store/stock/%s/poster.jpg'

def log(m):
    with open(LOG, 'a', encoding='utf-8') as f: f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + m + '\n')

def clave():
    try:
        c = json.load(open(FAN_CFG, encoding='utf-8-sig')).get('nube', {})
        if c.get('clave'): return c['clave'].strip()
        fich = c.get('claveFichero')
    except Exception: fich = None
    fich = os.path.expanduser((fich or '~/.admira_supercomputer_key').replace('~', '~', 1))
    return open(fich, encoding='utf-8').read().strip()

def jload(p): return json.load(open(p, encoding='utf-8-sig'))

def perfil():
    best = None
    for d in glob.glob(os.path.join(PROFILES, '*.sdProfile')):
        m = os.path.join(d, 'manifest.json')
        if not os.path.exists(m): continue
        try: man = jload(m)
        except Exception: continue
        dev = man.get('Device', {}) or {}
        score = (2 if 'FF088C93' in d.upper() else 0) + (1 if str(dev.get('Model','')).find('20GAT') >= 0 else 0)
        if best is None or score > best[0]: best = (score, d, man)
    return best[1], best[2]

def pagina(d, man):
    cur = (man.get('Pages') or {}).get('Current') or ''
    for c in [cur, cur.upper(), cur.lower()]:
        pd = os.path.join(d, 'Profiles', c)
        if os.path.isdir(pd): return cur, pd
    for pd in glob.glob(os.path.join(d, 'Profiles', '*')):
        if os.path.basename(pd).lower() == cur.lower(): return cur, pd
    return cur, None

_fuentes = {}
def fuente(familia, estilo, px):
    """Fuente del titulo: la del perfil si existe en Windows; si no, Arial (negrita por defecto, como Elgato)."""
    estilo = (estilo or '').lower()
    negrita = 'regular' not in estilo and 'normal' not in estilo
    cursiva = 'italic' in estilo or 'cursiva' in estilo
    candidatos = []
    fam = re.sub(r'[^a-z0-9]', '', (familia or '').lower())
    if fam:
        candidatos += [fam + ('bi' if negrita and cursiva else 'bd' if negrita else 'i' if cursiva else '') + '.ttf', fam + '.ttf']
    candidatos += ['arial' + ('bi' if negrita and cursiva else 'bd' if negrita else 'i' if cursiva else '') + '.ttf', 'arialbd.ttf', 'arial.ttf']
    for c in candidatos:
        k = (c, px)
        if k in _fuentes: return _fuentes[k]
        p = os.path.join(FONTS, c)
        if os.path.exists(p):
            try:
                _fuentes[k] = ImageFont.truetype(p, px); return _fuentes[k]
            except Exception: pass
    return ImageFont.load_default()

def pintar_titulo(tile, st):
    """Pinta el titulo como el software Elgato: lineas (las vacias cuentan), alineacion, color, contorno."""
    titulo = st.get('Title')
    if not titulo or st.get('ShowTitle') is False or str(st.get('ShowTitle', '')).lower() == 'false': return
    lineas = str(titulo).replace('\r', '').replace('\t', ' ').split('\n')
    px = max(8, int(round(float(st.get('FontSize') or 12) * K / KEY_PX * 1.2)))
    f = fuente(st.get('FontFamily'), st.get('FontStyle'), px)
    color = st.get('TitleColor') or '#ffffff'
    grosor = max(0, min(4, int(round(float(st.get('OutlineThickness') or 2) * K / KEY_PX))))
    d = ImageDraw.Draw(tile)
    # Un título más ancho que la tecla (p. ej. «PortAventuraNext») encoge hasta caber, como hace Elgato.
    while px > 9:
        try: ancho = max(d.textlength(l, font=f) for l in lineas if l.strip())
        except Exception: break
        if ancho <= K - 8 - 2 * grosor: break
        px -= 1; f = fuente(st.get('FontFamily'), st.get('FontStyle'), px)
    alto = int(px * 1.15); bloque = alto * len(lineas); margen = 6
    al = str(st.get('TitleAlignment') or 'bottom').lower()
    y = margen if al == 'top' else (K - bloque) // 2 if al == 'middle' else K - margen - bloque
    for i, linea in enumerate(lineas):
        if not linea.strip(): continue
        try:
            d.text((K // 2, y + i * alto + alto // 2), linea, fill=color, font=f, anchor='mm',
                   stroke_width=grosor, stroke_fill='#000000')
        except Exception:
            d.text((K // 2, y + i * alto), linea, fill=color, font=f)
        if st.get('FontUnderline'):
            try:
                l, t, r, b = d.textbbox((K // 2, y + i * alto + alto // 2), linea, font=f, anchor='mm')
                d.line([(l, b + 1), (r, b + 1)], fill=color, width=max(1, px // 10))
            except Exception: pass

def recorta(s, n=80): return re.sub(r'\s+', ' ', str(s or '')).strip()[:n]

def atlas():
    d, man = perfil()
    pid, pd = pagina(d, man)
    paginas = (man.get('Pages') or {}).get('Pages') or []
    img = Image.new('RGB', (COLS * K, ROWS * K), (5, 7, 12))
    n = 0; teclas = {}; nombre_pagina = ''; carpeta = False
    if pd:
        pm = jload(os.path.join(pd, 'manifest.json'))
        nombre_pagina = recorta(pm.get('Name'), 60)
        acts = ((pm.get('Controllers') or [{}])[0].get('Actions') or {})
        for pos, a in acts.items():
            try: col, row = [int(x) for x in pos.split(',')]
            except Exception: continue
            if not (0 <= col < COLS and 0 <= row < ROWS): continue
            st = a.get('States') or [{}]
            idx = min(int(a.get('State', 0) or 0), len(st) - 1) if st else 0
            s = st[idx] if st else {}
            uuid = str(a.get('UUID') or '')
            if uuid == PREFIJO + 'profile.backtoparent': carpeta = True
            teclas[pos] = {'n': recorta(a.get('Name'), 40), 'u': recorta(uuid[len(PREFIJO):] if uuid.startswith(PREFIJO) else uuid, 60),
                           't': recorta(s.get('Title'), 80), 's': len(st), 'i': idx}
            rel = s.get('Image') or ''
            p = os.path.join(pd, rel.replace('/', os.sep)) if rel else ''
            tile = Image.new('RGBA', (K, K), (0, 0, 0, 255))
            if p and os.path.exists(p):
                try:
                    tile.alpha_composite(Image.open(p).convert('RGBA').resize((K, K)))
                except Exception as e: log('img %s %s' % (pos, e))
            try: pintar_titulo(tile, s)
            except Exception as e: log('titulo %s %s' % (pos, e))
            img.paste(tile.convert('RGB'), (col * K, row * K)); n += 1
    b = io.BytesIO(); img.save(b, 'PNG', optimize=True)
    meta = {'pageId': pid, 'pageName': nombre_pagina, 'profileName': recorta(man.get('Name'), 60),
            'pages': len(paginas), 'pageIndex': (paginas.index(pid) if pid in paginas else -1), 'folder': carpeta, 'keys': teclas}
    return b.getvalue(), meta, n

_playlist = {'at': 0, 'items': None, 'name': '', 'rev': None}
def playlist():
    """Playlist real de admira.tv (la misma que screensaver.py y el player). Cache 5 min; si falla, la ultima buena."""
    if _playlist['items'] is not None and time.time() - _playlist['at'] < 300: return _playlist
    try:
        r = urllib.request.Request(PLAYLIST, headers={'User-Agent': 'admira-streamdeck-bridge'})
        with urllib.request.urlopen(r, timeout=8) as x: d = json.load(x).get('draft') or {}
        items = [i for i in (d.get('items') or []) if i.get('assetType') == 'video']
        _playlist.update(at=time.time(), items=items, name=recorta(d.get('name'), 80), rev=d.get('rev'))
    except Exception as e:
        log('playlist %s' % str(e)[:120]); _playlist['at'] = time.time()
        if _playlist['items'] is None: _playlist['items'] = []
    return _playlist

def pieza_en(items, desde_ms, ahora_ms):
    """Pieza en emision: el GIF de screensaver.py encadena los videos a tiempo real y vuelve a empezar."""
    dur = [max(1, int(i.get('seconds') or 0)) for i in items]
    if not items or not desde_ms: return None
    t = ((ahora_ms - desde_ms) / 1000.0) % sum(dur); ini = 0
    for n, (it, d) in enumerate(zip(items, dur)):
        if t < ini + d:
            sid = recorta(it.get('stockId') or it.get('id'), 60)
            return {'id': sid, 'title': recorta(it.get('title'), 120), 'sub': recorta(it.get('sub'), 80), 'seconds': d,
                    'index': n, 'total': len(items), 'poster': POSTER % sid if sid else '', 'desde': int(ahora_ms - (t - ini) * 1000)}
        ini += d
    return None

def senal_reposo(ahora_ms=None):
    """Lee reposo.json ({"estado":"reposo"|"activo","desde":ms[,"fuente","pieza"]}). None = no hay senal."""
    if not os.path.exists(REPOSO): return None
    ahora_ms = ahora_ms or int(time.time() * 1000)
    try: r = jload(REPOSO)
    except Exception as e: log('reposo.json %s' % str(e)[:120]); return None
    if not isinstance(r, dict) or r.get('estado') not in ('reposo', 'activo'): return None
    desde = int(r.get('desde') or 0) or int(os.path.getmtime(REPOSO) * 1000)
    s = {'estado': r['estado'], 'desde': desde, 'ts': ahora_ms, 'fuente': recorta(r.get('fuente') or 'reposo.json', 40)}
    if r['estado'] == 'reposo':
        pl = playlist(); items = pl['items'] or []
        s['playlist'] = {'screen': 'admira-tv-streamdeck', 'name': pl['name'] or 'admira.tv StreamDeck', 'rev': pl['rev'], 'total': len(items)}
        s['pieza'] = r['pieza'] if isinstance(r.get('pieza'), dict) else pieza_en(items, desde, ahora_ms)
    return s

def post(body, key):
    r = urllib.request.Request(API, data=json.dumps(body).encode(), method='POST',
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'admira-streamdeck-bridge'})
    with urllib.request.urlopen(r, timeout=10) as x: return x.status

def main():
    key = clave(); last = None; once = '--once' in sys.argv; ultimo_reposo = None
    if '--png' in sys.argv:  # prueba local: guarda el atlas y la ficha sin subir nada
        png, meta, n = atlas(); salida = sys.argv[sys.argv.index('--png') + 1]
        open(salida, 'wb').write(png); open(salida + '.json', 'w', encoding='utf-8').write(json.dumps(meta, ensure_ascii=False, indent=1))
        print('atlas %d teclas -> %s' % (n, salida)); return
    log('arranque')
    while True:
        try:
            png, meta, n = atlas()
            h = hashlib.sha256(png + json.dumps(meta, sort_keys=True).encode()).hexdigest()
            body = {'serial': SERIAL, 'at': int(time.time() * 1000), 'pageId': meta['pageId'], 'keyCount': n}
            if h != last: body['facePngBase64'] = base64.b64encode(png).decode(); body.update(meta)
            rep = senal_reposo()
            if rep is not None: body['reposo'] = rep
            if (rep or {}).get('estado') != ultimo_reposo:
                ultimo_reposo = (rep or {}).get('estado'); log('reposo %s pieza=%s' % (ultimo_reposo, ((rep or {}).get('pieza') or {}).get('title')))
            st = post(body, key)
            if h != last: log('cara nueva page=%s teclas=%d bytes=%d http=%d' % (meta['pageId'], n, len(png), st)); last = h
        except Exception as e:
            log('error %s' % str(e)[:200]); last = None
        if once: break
        time.sleep(2.5)

if __name__ == '__main__': main()

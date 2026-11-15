# Previos de una playlist de admira.tv en las teclas del Stream Deck XL (AdmiraNeXT01).
# Cada tecla ensena el poster de una pieza y, al pulsarla, el player salta a esa pieza (orden play<N>
# por api.admira.store/locations/cmd, la misma cola que usa el mando).
#
#   python previos.py --png previo.png        compone el atlas 8x4 tal como quedaria el Stream Deck (no toca nada)
#   python previos.py --instalar              escribe la pagina en el perfil Elgato y relanza la app (Windows)
#   python previos.py --quitar                deshace la instalacion (restaura la copia)
#   pythonw previos.py --saltar 2037          lo que ejecuta cada tecla: salta a la pieza 2037 del Stock
#   pythonw previos.py --destino 03 on|off    lo que ejecuta cada selector de la fila 4: marca o desmarca un ordenador
#
# Fila 4: un selector por ordenador (01-05). Se pueden marcar uno, varios o todos; el previo que se pulse
# sale solo en los marcados. La seleccion vive en seleccion.json (junto a este fichero); recien instalado, los de `de_inicio` (o todos).
#
# Ajustes en previos.json (junto a este fichero); sin el, valen los de DEFECTO.
# La pagina se instala como carpeta dentro del menu actual: no se borra ninguna tecla existente.
import os, sys, io, json, time, glob, shutil, uuid, subprocess, threading, urllib.request
from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
DEFECTO = {
    'titulo': 'PortAventuraNeXT',
    'playlist': 'https://admira.tv/api/playlist?screen=portaventuranext',
    'destinos': [],           # [["01", "screen de admira.tv"], ...]: los selectores de la fila 4 y el player de cada uno
    'de_inicio': None,        # etiquetas marcadas recien instalado (None = todas)
    'arranque': {},           # {"screen": {"proceso": "x.exe", "vigilante": "id"}}: player local que se arranca si esta parado
    'tecla_menu': '',         # posicion "col,fila" de la carpeta en el menu; vacio = primera libre
}
STOCK = 'https://api.admira.store/stock/list?limit=300'
POSTER = 'https://stock.admira.store/stock/%s/poster.jpg'
CMD = ['https://api.admira.store/locations/cmd', 'https://brain.digitalavatar.ai/locations/cmd']
COLS, ROWS, PX = 8, 4, 144   # la LCD del XL es de 96 px por tecla; Elgato guarda los iconos a 144
PREFIJO = 'com.elgato.streamdeck.'
MARCA = 'admira-previos'      # nombre de las acciones que instala este guion (para reconocerlas y quitarlas)
UA = {'User-Agent': 'admira-streamdeck-previos'}

def ajustes():
    a = dict(DEFECTO)
    p = os.path.join(AQUI, 'previos.json')
    if os.path.exists(p): a.update(json.load(open(p, encoding='utf-8-sig')))
    return a

def traer(url, binario=False, espera=12):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=espera) as r:
        b = r.read()
    return b if binario else json.loads(b.decode('utf-8'))

def piezas(a):
    """Piezas de la playlist con su numero de Stock (el que entiende play<N>) y su poster."""
    borrador = traer(a['playlist']).get('draft') or {}
    nums = {}
    try: nums = {str(i.get('id')): i.get('num') for i in (traer(STOCK).get('items') or [])}
    except Exception: pass
    salida = []
    for i in borrador.get('items') or []:
        sid = str(i.get('stockId') or i.get('id') or '')
        if not sid: continue
        salida.append({'id': sid, 'num': i.get('num') or nums.get(sid), 'titulo': str(i.get('title') or ''),
                       'tipo': i.get('assetType') or '', 'segundos': i.get('seconds')})
    return salida[:COLS * (ROWS - 1) - 1], str(borrador.get('name') or '')   # una tecla para «volver»; la fila 4 son los selectores

def fuente(px):
    for f in [os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', 'arialbd.ttf'),
              '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
        if os.path.exists(f):
            try: return ImageFont.truetype(f, px)
            except Exception: pass
    return ImageFont.load_default()

def tecla(pieza, orden):
    """Icono de una tecla: poster recortado al centro, numero de orden y titulo corto abajo."""
    try:
        im = Image.open(io.BytesIO(traer(POSTER % pieza['id'], binario=True))).convert('RGB')
        lado = min(im.size); x = (im.width - lado) // 2; y = (im.height - lado) // 2
        im = im.crop((x, y, x + lado, y + lado)).resize((PX, PX), Image.LANCZOS)
    except Exception:
        im = Image.new('RGB', (PX, PX), (18, 22, 34))   # pieza sin poster (capsula, audio): fondo liso con el titulo
    d = ImageDraw.Draw(im, 'RGBA')
    d.rectangle([0, PX - 40, PX, PX], fill=(0, 0, 0, 170))
    f = fuente(15); texto = pieza['titulo'].strip()
    while texto and d.textlength(texto, font=f) > PX - 10: texto = texto[:-1]
    if texto != pieza['titulo'].strip(): texto = texto[:-1].rstrip() + '…'
    d.text((PX // 2, PX - 20), texto, fill='#ffffff', font=f, anchor='mm')
    d.rounded_rectangle([5, 5, 39, 35], radius=8, fill=(0, 0, 0, 190))
    d.text((22, 20), str(orden), fill='#ffd24a', font=fuente(20), anchor='mm')
    return im

def tecla_volver():
    im = Image.new('RGB', (PX, PX), (10, 12, 20)); d = ImageDraw.Draw(im)
    d.text((PX // 2, PX // 2 - 8), '‹', fill='#ffffff', font=fuente(72), anchor='mm')
    d.text((PX // 2, PX - 24), 'Menú', fill='#9aa4b8', font=fuente(16), anchor='mm')
    return im

def tecla_destino(etiqueta, marcado):
    im = Image.new('RGB', (PX, PX), (255, 196, 40) if marcado else (22, 26, 38)); d = ImageDraw.Draw(im)
    if not marcado: d.rounded_rectangle([6, 6, PX - 7, PX - 7], radius=16, outline=(70, 78, 100), width=3)
    px = 64; f = fuente(px)
    while px > 20 and d.textlength(etiqueta, font=f) > PX - 20: px -= 2; f = fuente(px)
    d.text((PX // 2, PX // 2 - 10), etiqueta, fill='#10131c' if marcado else '#6f7a94', font=f, anchor='mm')
    d.text((PX // 2, PX - 24), 'EMITE' if marcado else 'no emite', fill='#10131c' if marcado else '#6f7a94', font=fuente(17), anchor='mm')
    return im

SELECCION = os.path.join(AQUI, 'seleccion.json')
def seleccion(a):
    """Ordenadores marcados: {"01": True, ...}. Sin fichero, todos."""
    try: guardada = json.load(open(SELECCION, encoding='utf-8'))
    except Exception: guardada = {}
    inicio = a.get('de_inicio')   # etiquetas marcadas recien instalado; sin la lista, todas
    return {e: bool(guardada.get(e, inicio is None or e in inicio)) for e, _ in a['destinos']}

def marcar(a, etiqueta, valor):
    sel = seleccion(a)
    if etiqueta in sel: sel[etiqueta] = valor
    open(SELECCION, 'w', encoding='utf-8').write(json.dumps(sel))
    return sel

def posiciones(n):
    """La 0,0 es «volver»; las piezas se reparten de izquierda a derecha y de arriba abajo."""
    todas = ['%d,%d' % (c, f) for f in range(ROWS) for c in range(COLS)]
    return todas[1:1 + n]

def atlas(a):
    lista, nombre = piezas(a)
    img = Image.new('RGB', (COLS * PX, ROWS * PX), (5, 7, 12))
    img.paste(tecla_volver(), (0, 0))
    for n, (pos, p) in enumerate(zip(posiciones(len(lista)), lista), 1):
        c, f = [int(x) for x in pos.split(',')]
        img.paste(tecla(p, n), (c * PX, f * PX))
    sel = seleccion(a)
    for n, (e, _) in enumerate(a['destinos'][:COLS]): img.paste(tecla_destino(e, sel[e]), (n * PX, (ROWS - 1) * PX))
    return img, lista, nombre

def orden(pantalla, cmd):
    cuerpo = json.dumps({'id': pantalla, 'screen': pantalla, 'cmd': cmd}).encode(); fallo = None
    for host in CMD:
        try:
            r = urllib.request.Request(host, data=cuerpo, method='POST', headers=dict(UA, **{'Content-Type': 'application/json'}))
            with urllib.request.urlopen(r, timeout=5) as x: return json.loads(x.read().decode())
        except Exception as e: fallo = {'ok': False, 'screen': pantalla, 'error': str(e)[:120]}
    return fallo

def corriendo(proceso):
    r = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq ' + proceso, '/NH'], capture_output=True, text=True, creationflags=0x08000000)
    return proceso.lower() in (r.stdout or '').lower()

CENSO = 'https://api.admira.store/signage/screens'
def en_linea(pantalla):
    """El player ha dado senal en el ultimo minuto (censo de admira.tv)."""
    try:
        for x in traer(CENSO, espera=6).get('screens') or []:
            if x.get('screen') == pantalla: return bool(x.get('online')) and (x.get('age_seconds') or 999) < 60
    except Exception: pass
    return False

def despertar(pantalla, arr):
    """Player parado: se le pide `start` a su vigilante y se espera a que este en pie. True = hubo que arrancarlo."""
    local = arr.get('proceso') if os.name == 'nt' else None   # proceso = player de este mismo PC; sin el, se mira el censo
    vivo = (lambda: corriendo(local)) if local else (lambda: en_linea(pantalla))
    if vivo() or not arr.get('vigilante'): return False
    orden(arr['vigilante'], 'start')
    for _ in range(15):
        time.sleep(3)
        if vivo(): break
    if local: time.sleep(8)   # margen para que cargue el canal y empiece a sondear la cola
    return True

def saltar(num, a):
    """Lo que hace un previo al pulsarlo: play<N> a los destinos marcados, cada uno por su lado (uno parado no frena al resto)."""
    sel = seleccion(a); hecho = []
    def uno(pantalla):
        arr = (a.get('arranque') or {}).get(pantalla)
        arrancado = despertar(pantalla, arr) if arr else False
        r = orden(pantalla, 'play%d' % int(num)) or {}
        if arrancado: r['arrancado'] = True
        hecho.append(r)
    hilos = [threading.Thread(target=uno, args=(pantalla,)) for etiqueta, pantalla in a['destinos'] if sel.get(etiqueta)]
    for h in hilos: h.start()
    for h in hilos: h.join()
    return hecho

# ── Instalacion en el perfil Elgato (solo Windows, con la app Stream Deck instalada) ──────────────
PERFILES = os.path.join(os.environ.get('APPDATA', ''), 'Elgato', 'StreamDeck', 'ProfilesV3')
COPIAS = os.path.join(AQUI, 'copias-perfil')
def jload(p): return json.load(open(p, encoding='utf-8-sig'))
def jsave(p, d): open(p, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False))

def pagina_menu():
    """Perfil del XL y su pagina actual (misma eleccion que puente.py)."""
    mejor = None
    for d in glob.glob(os.path.join(PERFILES, '*.sdProfile')):
        try: man = jload(os.path.join(d, 'manifest.json'))
        except Exception: continue
        nota = (2 if 'FF088C93' in d.upper() else 0) + (1 if '20GAT' in str((man.get('Device') or {}).get('Model', '')) else 0)
        if mejor is None or nota > mejor[0]: mejor = (nota, d, man)
    if not mejor: raise SystemExit('no encuentro el perfil del Stream Deck en ' + PERFILES)
    _, d, man = mejor
    actual = (man.get('Pages') or {}).get('Current') or ''
    for pd in glob.glob(os.path.join(d, 'Profiles', '*')):
        if os.path.basename(pd).lower() == actual.lower(): return d, pd
    raise SystemExit('no encuentro la pagina actual del perfil')

def app(arrancar):
    exe = os.path.join(os.environ.get('ProgramFiles', r'C:\Program Files'), 'Elgato', 'StreamDeck', 'StreamDeck.exe')
    if arrancar and os.environ.get('SESSIONNAME'): subprocess.Popen([exe], close_fds=True)
    elif arrancar:
        # Lanzado por ssh (sesion 0): la app tiene que abrirse en el escritorio del usuario, con una tarea interactiva.
        subprocess.run(['schtasks', '/Create', '/TN', 'AdmiraStreamDeckRelanzar', '/TR', '"%s"' % exe, '/SC', 'ONCE', '/ST', '00:00', '/IT', '/F'], capture_output=True)
        r = subprocess.run(['schtasks', '/Run', '/TN', 'AdmiraStreamDeckRelanzar'], capture_output=True, text=True)
        if r.returncode: print('no pude relanzar la app: ' + (r.stderr or r.stdout).strip())
    else:
        subprocess.run(['taskkill', '/IM', 'StreamDeck.exe', '/F'], capture_output=True); time.sleep(2)

PORTADA = 'Images/' + MARCA + '.png'   # la carpeta de este guion se reconoce por su icono
def es_mia(v): return any((s.get('Image') or '') == PORTADA for s in (v.get('States') or []))

def accion(nombre, tipo, ajustes_accion, titulo, imagen):
    estado = {'Title': titulo, 'ShowTitle': bool(titulo)}
    if imagen: estado['Image'] = imagen
    return {'ActionID': str(uuid.uuid4()), 'LinkedTitle': False, 'Name': nombre,   # LinkedTitle=false: si no, la app deja la tecla en blanco
            'Plugin': {'Name': nombre, 'UUID': PREFIJO + tipo, 'Version': '1.0'}, 'Resources': None,
            'Settings': ajustes_accion, 'State': 0, 'States': [estado], 'UUID': PREFIJO + tipo}

def abrir(argumentos):
    yo = os.path.abspath(__file__); pyw = os.path.join(os.path.dirname(sys.executable), 'pythonw.exe')
    return accion('Open', 'system.open', {'path': '"%s" "%s" %s' % (pyw, yo, argumentos)}, '', '')

def selector(etiqueta, marcado, idir):
    """Tecla de dos estados (Multi Action Switch): apagada -> al pulsar marca; encendida -> al pulsar desmarca."""
    for m in (False, True): tecla_destino(etiqueta, m).save(os.path.join(idir, 'd%s-%d.png' % (etiqueta, m)))
    t = accion('Multi Action Switch', 'multiactions.routine2', {}, '', '')
    t['Plugin'] = {'Name': 'Multi Action', 'UUID': PREFIJO + 'multiactions', 'Version': '1.0'}
    t['States'] = [{'Image': 'Images/d%s-0.png' % etiqueta, 'ShowTitle': False}, {'Image': 'Images/d%s-1.png' % etiqueta, 'ShowTitle': False}]
    t['State'] = 1 if marcado else 0
    t['Actions'] = [{'Actions': [abrir('--destino %s on' % etiqueta)]}, {'Actions': [abrir('--destino %s off' % etiqueta)]}]
    return t

def instalar(a):
    if os.name != 'nt': raise SystemExit('--instalar solo funciona en el Windows del Stream Deck')
    perfil, menu = pagina_menu()
    man_menu = os.path.join(menu, 'manifest.json'); pm = jload(man_menu)
    acts = (pm.get('Controllers') or [{}])[0].setdefault('Actions', {})
    # Carpeta anterior de este guion: se reutiliza su tecla y su pagina hija.
    pos = next((k for k, v in acts.items() if es_mia(v)), None)
    hija = ((acts.get(pos) or {}).get('Settings') or {}).get('ProfileUUID') if pos else None
    if not pos:
        libres = [p for p in (['%d,%d' % (c, f) for f in range(ROWS) for c in range(COLS)]) if p not in acts]
        pos = a['tecla_menu'] if a['tecla_menu'] and a['tecla_menu'] not in acts else (libres[0] if libres else None)
        if not pos: raise SystemExit('no queda ninguna tecla libre en el menu')
    hija = (hija or str(uuid.uuid4())).lower()
    app(False)
    os.makedirs(COPIAS, exist_ok=True)
    copia = shutil.make_archive(os.path.join(COPIAS, 'perfil-' + time.strftime('%Y%m%d-%H%M%S')), 'zip', perfil)
    if os.path.exists(SELECCION): os.remove(SELECCION)   # recien instalado, la seleccion de inicio (y las teclas, a juego)
    img, lista, _ = atlas(a)
    pd = os.path.join(os.path.dirname(menu), hija.upper()); idir = os.path.join(pd, 'Images')
    shutil.rmtree(pd, ignore_errors=True); os.makedirs(idir)
    tecla_volver().resize((PX, PX)).save(os.path.join(idir, 'volver.png'))
    hijas = {'0,0': accion('Parent Folder', 'profile.backtoparent', {}, '', 'Images/volver.png')}
    for n, (p, pieza) in enumerate(zip(posiciones(len(lista)), lista), 1):
        c, f = [int(x) for x in p.split(',')]
        nombre = 'p%02d.png' % n; img.crop((c * PX, f * PX, (c + 1) * PX, (f + 1) * PX)).save(os.path.join(idir, nombre))
        hijas[p] = abrir('--saltar %s' % pieza['num']); hijas[p]['States'][0]['Image'] = 'Images/' + nombre
    for n, (e, _) in enumerate(a['destinos'][:COLS]): hijas['%d,%d' % (n, ROWS - 1)] = selector(e, seleccion(a)[e], idir)
    jsave(os.path.join(pd, 'manifest.json'), {'Controllers': [{'Actions': hijas, 'Type': 'Keypad'}], 'Icon': '', 'Name': a['titulo']})
    os.makedirs(os.path.join(menu, 'Images'), exist_ok=True)
    portada = img.crop((PX, 0, 2 * PX, PX)) if lista else tecla_volver()
    portada.save(os.path.join(menu, 'Images', MARCA + '.png'))
    carpeta = accion('Create Folder', 'profile.openchild', {'ProfileUUID': hija}, a['titulo'], PORTADA)
    carpeta['States'][0].update({'FontFamily': '', 'FontSize': 8, 'FontStyle': '', 'FontUnderline': False, 'OutlineThickness': 2, 'TitleAlignment': 'bottom', 'TitleColor': '#ffffff'})
    acts[pos] = carpeta; jsave(man_menu, pm)
    app(True)
    print('instalado: %d piezas en la carpeta «%s» (tecla %s del menu). Copia del perfil: %s' % (len(lista), a['titulo'], pos, copia))

def quitar():
    if os.name != 'nt': raise SystemExit('--quitar solo funciona en el Windows del Stream Deck')
    _, menu = pagina_menu(); man_menu = os.path.join(menu, 'manifest.json'); pm = jload(man_menu)
    acts = (pm.get('Controllers') or [{}])[0].get('Actions') or {}
    pos = next((k for k, v in acts.items() if es_mia(v)), None)
    if not pos: print('no habia nada instalado'); return
    app(False)
    hija = (acts[pos].get('Settings') or {}).get('ProfileUUID')
    if hija: shutil.rmtree(os.path.join(os.path.dirname(menu), hija.upper()), ignore_errors=True)
    del acts[pos]; jsave(man_menu, pm); app(True)
    print('quitada la carpeta de la tecla ' + pos)

def main():
    a = ajustes(); arg = sys.argv[1:]
    if '--saltar' in arg:
        print(json.dumps(saltar(arg[arg.index('--saltar') + 1], a), ensure_ascii=False)); return
    if '--destino' in arg:
        i = arg.index('--destino'); print(json.dumps(marcar(a, arg[i + 1], arg[i + 2] != 'off'))); return
    if '--png' in arg:
        salida = arg[arg.index('--png') + 1]; img, lista, nombre = atlas(a); img.save(salida)
        print('playlist «%s»: %d piezas -> %s' % (nombre, len(lista), salida))
        for n, p in enumerate(lista, 1): print(' %2d  play%s  %s' % (n, p['num'], p['titulo'][:70]))
        return
    if '--instalar' in arg: instalar(a); return
    if '--quitar' in arg: quitar(); return
    print('uso: previos.py --png fichero.png | --instalar | --quitar | --saltar <num> | --destino <01> on|off')

if __name__ == '__main__': main()

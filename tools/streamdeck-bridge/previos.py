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
import os, sys, io, json, time, glob, shutil, uuid, subprocess, threading, tempfile, re, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
DEFECTO = {
    'titulo': 'PortAventuraNeXT',
    'playlist': 'https://admira.tv/api/playlist?screen=portaventuranext',
    'presentaciones_activas': True,  # false mientras el player instalado no admita las cápsulas HTML
    'etiqueta_stock': '',     # suma al menú todas las piezas con esta etiqueta de Stock
    'destinos': [],           # [["01", "screen de admira.tv"], ...]: los selectores de la fila 4 y el player de cada uno
    'sincro': [],              # etiquetas de players que comparten hora de salida en los envíos múltiples
    'bucle': [],              # screens donde la pieza enviada se repite hasta mandar otra (el resto vuelve a su programacion)
    'de_inicio': None,        # etiquetas marcadas recien instalado (None = todas)
    'arranque': {},           # {"screen": {"proceso": "x.exe", "vigilante": "id"}}: player local que se arranca si esta parado
    'tecla_menu': '',         # posicion "col,fila" de la carpeta en el menu; vacio = primera libre
}
STOCK = 'https://stock.admira.store/stock/index.json'
TIPOS = {'video', 'animation', 'image', 'digital-twin', 'audio', 'music', 'locucion', 'interactive', 'capsula'}
POSTER = 'https://stock.admira.store/stock/%s/poster.jpg'
CLOCK = 'https://brain.digitalavatar.ai/sync/clock'
ADELANTO_MS = 24000
CMD = ['https://api.admira.store/locations/cmd', 'https://brain.digitalavatar.ai/locations/cmd']
COLS, ROWS, PX = 8, 4, 144   # la LCD del XL es de 96 px por tecla; Elgato guarda los iconos a 144
LIMITE_PAGINA = COLS * (ROWS - 1) - 1
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

def etiqueta(tag):
    return str(tag).strip().lstrip('#').casefold()


def url_stock(url, sid, nombre):
    """Sólo lee medios del propio identificador de Stock."""
    if not isinstance(url, str):
        return ''
    try: u = urllib.parse.urlsplit(url)
    except ValueError: return ''
    ruta = '/stock/%s/%s' % (sid, nombre)
    if u.scheme == 'https' and u.netloc == 'stock.admira.store' and u.path == ruta and not u.fragment:
        if not u.query or re.fullmatch(r'v=[0-9]{1,12}', u.query):
            return url
    return ''


def piezas(a):
    """Conserva el orden del canal y añade las piezas de Stock con la etiqueta exacta."""
    borrador = traer(a['playlist']).get('draft') or {}
    indice = traer(STOCK)
    stock = indice if isinstance(indice, list) else (indice.get('items') or [])
    por_id = {str(i['id']): i for i in stock if i.get('id')}
    objetivo = etiqueta(a.get('etiqueta_stock') or '')
    salida = {}

    def incluir(sid, original=None):
        original = original or {}
        if sid in salida or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{2,59}', sid):
            return
        ficha = por_id.get(sid, {})
        num = original.get('num') or ficha.get('num')
        tipo = ficha.get('type') or original.get('assetType') or ''
        if not str(num).isdigit() or int(num) < 1 or tipo not in TIPOS:
            return
        html = url_stock(ficha.get('url'), sid, 'asset.bin') if ficha.get('mime') == 'text/html' else ''
        if tipo == 'capsula' and (not html or not a.get('presentaciones_activas', True)):
            return
        poster = url_stock(ficha.get('thumbnail'), sid, 'poster.jpg') or url_stock(ficha.get('poster'), sid, 'poster.jpg')
        salida[sid] = {'id': sid, 'num': int(num), 'titulo': str(original.get('title') or ficha.get('title') or sid),
                       'tipo': tipo, 'poster': poster, 'html': html}

    for i in borrador.get('items') or []:
        incluir(str(i.get('stockId') or i.get('id') or ''), i)
    if objetivo:
        for i in stock:
            tags = i.get('tags')
            if isinstance(tags, list) and any(etiqueta(tag) == objetivo for tag in tags):
                incluir(str(i.get('id') or ''))
    return list(salida.values()), str(borrador.get('name') or '')


def paginas(lista):
    """La última tecla de las páginas intermedias abre la siguiente."""
    while len(lista) > LIMITE_PAGINA:
        yield lista[:LIMITE_PAGINA - 1]
        lista = lista[LIMITE_PAGINA - 1:]
    yield lista


def captura_html(url):
    """Captura la primera pantalla con Chrome headless y un perfil vacío."""
    program_files = os.environ.get('ProgramFiles', r'C:\Program Files')
    chrome = os.environ.get('ADMIRA_PREVIEW_CHROME') or os.path.join(program_files, 'Google', 'Chrome', 'Application', 'chrome.exe')
    if not os.path.isfile(chrome):
        return None
    with tempfile.TemporaryDirectory(prefix='admira-previo-') as temporal:
        pagina = Path(temporal) / 'previo.html'
        pagina.write_bytes(traer(url, binario=True))
        captura = os.path.join(temporal, 'captura.png')
        subprocess.run([chrome, '--headless', '--no-first-run', '--disable-background-networking',
                        '--user-data-dir=' + os.path.join(temporal, 'perfil'), '--window-size=960,540',
                        '--timeout=4000', '--screenshot=' + captura, pagina.as_uri()],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=18, check=True)
        with Image.open(captura) as imagen:
            return imagen.convert('RGB')


def fuente(px):
    for f in [os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', 'arialbd.ttf'),
              '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
        if os.path.exists(f):
            try: return ImageFont.truetype(f, px)
            except Exception: pass
    return ImageFont.load_default()

def tecla(pieza, orden):
    """Icono de una tecla: poster recortado al centro, numero de orden y titulo corto abajo."""
    im = None
    try:
        if pieza.get('html'):
            im = captura_html(pieza['html'])
        elif pieza.get('poster') or pieza['tipo'] not in {'audio', 'music', 'locucion'}:
            im = Image.open(io.BytesIO(traer(pieza.get('poster') or POSTER % pieza['id'], binario=True))).convert('RGB')
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    if im is None:
        im = Image.new('RGB', (PX, PX), (18, 22, 34))
        d = ImageDraw.Draw(im)
        if pieza['tipo'] in {'audio', 'music', 'locucion'}:
            for i, alto in enumerate((9, 18, 29, 42, 56, 38, 23, 31, 13)):
                x = 27 + 10 * i
                d.rounded_rectangle((x, 65 - alto//2, x + 5, 65 + alto//2), radius=2, fill='#f5c84b')
        else:
            d.text((PX // 2, 65), 'Presentación' if pieza.get('html') else 'Stock', fill='#f5c84b', font=fuente(17), anchor='mm')
    else:
        lado = min(im.size); x = (im.width - lado) // 2; y = (im.height - lado) // 2
        im = im.crop((x, y, x + lado, y + lado)).resize((PX, PX), Image.LANCZOS)
    d = ImageDraw.Draw(im, 'RGBA')
    d.rectangle([0, PX - 40, PX, PX], fill=(0, 0, 0, 200))
    f = fuente(15)
    titulo = re.sub(r'^PortAventuraNeXT\s*·\s*', '', pieza['titulo'].strip(), flags=re.I)
    texto = titulo
    while texto and d.textlength(texto, font=f) > PX - 12:
        texto = texto[:-1]
    if texto != titulo:
        resto = titulo[len(texto):].strip()
        linea = resto
        while linea and d.textlength(linea + ('…' if linea != resto else ''), font=f) > PX - 12:
            linea = linea[:-1]
        d.text((PX // 2, PX - 29), texto, fill='#ffffff', font=f, anchor='mm')
        d.text((PX // 2, PX - 12), linea.rstrip() + ('…' if linea != resto else ''), fill='#ffffff', font=f, anchor='mm')
    else:
        d.text((PX // 2, PX - 20), texto, fill='#ffffff', font=f, anchor='mm')
    d.rounded_rectangle([5, 5, 39, 35], radius=8, fill=(0, 0, 0, 190))
    d.text((22, 20), str(orden), fill='#ffd24a', font=fuente(20), anchor='mm')
    return im

def tecla_volver(titulo='Menú', simbolo='‹'):
    im = Image.new('RGB', (PX, PX), (10, 12, 20)); d = ImageDraw.Draw(im)
    d.text((PX // 2, PX // 2 - 8), simbolo, fill='#ffffff', font=fuente(72), anchor='mm')
    d.text((PX // 2, PX - 24), titulo, fill='#9aa4b8', font=fuente(16), anchor='mm')
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
    with ThreadPoolExecutor(max_workers=6) as workers:
        teclas = list(workers.map(tecla, lista, range(1, len(lista) + 1)))
    sel = seleccion(a)
    salida = []
    inicio = 0
    for pagina in paginas(lista):
        img = Image.new('RGB', (COLS * PX, ROWS * PX), (5, 7, 12))
        img.paste(tecla_volver('Volver' if inicio else 'Menú'), (0, 0))
        for pos, imagen in zip(posiciones(len(pagina)), teclas[inicio:inicio + len(pagina)]):
            c, f = [int(x) for x in pos.split(',')]
            img.paste(imagen, (c * PX, f * PX))
        inicio += len(pagina)
        if inicio < len(lista):
            img.paste(tecla_volver('Más', '›'), ((COLS - 1) * PX, (ROWS - 2) * PX))
        if not salida:
            for n, (e, _) in enumerate(a['destinos'][:COLS]):
                img.paste(tecla_destino(e, sel[e]), (n * PX, (ROWS - 1) * PX))
        salida.append((img, pagina))
    return salida, nombre


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

def emitiendo(pantalla):
    """Id de Stock de la pieza que ese player dice estar emitiendo."""
    try: return str(((traer('https://api.admira.store/signage/now?screen=' + pantalla, espera=6).get('item') or {}).get('id')) or '')
    except Exception: return ''

def despertar(pantalla, arr):
    """Player parado: se le pide `start` a su vigilante y se espera a que este en pie. True = hubo que arrancarlo."""
    local = arr.get('proceso') if os.name == 'nt' else None   # proceso = player de este mismo PC; sin el, se mira el censo
    vivo = (lambda: corriendo(local)) if local else (lambda: en_linea(pantalla))
    if not arr.get('vigilante'): return False
    estaba = vivo()
    if estaba and local: return False
    orden(arr['vigilante'], 'start')   # a un player remoto se le pide siempre: si ya esta abierto, su escucha lo trae al frente
    if estaba: return False
    for _ in range(15):
        time.sleep(3)
        if vivo(): break
    if local: time.sleep(8)   # margen para que cargue el canal y empiece a sondear la cola
    return True

def salida_programada(num, pantallas, a):
    """Prepara los destinos y encola una única hora de inicio para todos."""
    for pantalla in pantallas:
        arr = (a.get('arranque') or {}).get(pantalla)
        if arr and despertar(pantalla, arr):
            time.sleep(8)
    try:
        reloj = traer(CLOCK, espera=5)
        ahora = reloj['serverSentAt']
        if not reloj.get('ok') or reloj.get('protocol') != 'admira-clock-v1' or type(ahora) is not int:
            raise ValueError('Reloj compartido no disponible')
    except (OSError, ValueError, KeyError, TypeError) as e:
        return [{'ok': False, 'screen': p, 'error': str(e)} for p in pantallas]
    at = ahora + ADELANTO_MS
    comando = 'playat-%d-%d' % (num, at)
    with ThreadPoolExecutor(max_workers=len(pantallas)) as workers:
        resultados = list(workers.map(lambda pantalla: orden(pantalla, comando), pantallas))
    return [dict(r or {}, screen=p, start_at=at) for r, p in zip(resultados, pantallas)]


def saltar(num, a):
    """Lo que hace un previo al pulsarlo: play<N> a los destinos marcados, cada uno por su lado (uno parado no frena al resto)."""
    sel = seleccion(a)
    destinos = [(e, p) for e, p in a['destinos'] if sel.get(e)]
    sincronizados = [p for e, p in destinos if e in a.get('sincro', []) and p not in a.get('bucle', [])]
    hecho = salida_programada(int(num), sincronizados, a) if len(sincronizados) > 1 else []
    if hecho:
        destinos = [(e, p) for e, p in destinos if p not in sincronizados]
    pedido = [None]
    if any(p in (a.get('arranque') or {}) for _, p in destinos):
        try: pedido[0] = next((str(i.get('id')) for i in (traer(STOCK).get('items') or []) if i.get('num') == int(num)), None)
        except Exception: pass
    def uno(pantalla):
        arr = (a.get('arranque') or {}).get(pantalla)
        arrancado = despertar(pantalla, arr) if arr else False
        if arrancado: time.sleep(8)   # recien abierto, el player carga su programacion y pisaria la pieza
        verbo = 'loop' if pantalla in (a.get('bucle') or []) else 'play'   # loop<N>: la pieza se repite en vez de volver a la programacion
        r = orden(pantalla, '%s%d' % (verbo, int(num))) or {}
        if arrancado: r['arrancado'] = True
        if arrancado or (arr and not arr.get('proceso')):   # player remoto: el censo tarda un minuto en enterarse de que se cerro
            r['envios'] = 1
            for _ in range(5):       # se comprueba que emite la pieza pedida; si no, se le vuelve a mandar
                time.sleep(7)
                if not pedido[0] or emitiendo(pantalla) == pedido[0]: break
                orden(pantalla, '%s%d' % (verbo, int(num))); r['envios'] += 1
        hecho.append(r)
    hilos = [threading.Thread(target=uno, args=(pantalla,)) for _, pantalla in destinos]
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
    directorios = glob.glob(os.path.join(d, 'Profiles', '*'))
    # Reinstalar desde dentro de un submenú actualiza la carpeta original.
    for pd in directorios:
        try: manifest = jload(os.path.join(pd, 'manifest.json'))
        except (OSError, ValueError): continue
        if any(es_mia(v) for c in manifest.get('Controllers', []) for v in (c.get('Actions') or {}).values()):
            return d, pd
    for pd in directorios:
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

def subpaginas(directorio):
    """Recorre sólo las páginas adicionales creadas por este generador."""
    try: man = jload(os.path.join(directorio, 'manifest.json'))
    except (OSError, ValueError): return
    for control in man.get('Controllers', []):
        for valor in (control.get('Actions') or {}).values():
            estados = valor.get('States') or []
            if not any(e.get('Image') == 'Images/admira-mas.png' for e in estados):
                continue
            identificador = (valor.get('Settings') or {}).get('ProfileUUID', '')
            if re.fullmatch(r'[0-9a-fA-F-]{36}', identificador):
                hijo = os.path.join(os.path.dirname(directorio), identificador.upper())
                yield from subpaginas(hijo)
                yield hijo


def escribir_paginas(a, padre, ids, hojas):
    sel = seleccion(a)
    for i, ((img, lista), identificador) in enumerate(zip(hojas, ids)):
        pd = os.path.join(padre, identificador.upper())
        idir = os.path.join(pd, 'Images')
        os.makedirs(idir)
        img.crop((0, 0, PX, PX)).save(os.path.join(idir, 'volver.png'))
        acciones = {'0,0': accion('Parent Folder', 'profile.backtoparent', {}, '', 'Images/volver.png')}
        for n, (pos, pieza) in enumerate(zip(posiciones(len(lista)), lista), 1):
            c, f = [int(x) for x in pos.split(',')]
            nombre = 'p%02d.png' % n
            img.crop((c * PX, f * PX, (c + 1) * PX, (f + 1) * PX)).save(os.path.join(idir, nombre))
            acciones[pos] = abrir('--saltar %d' % pieza['num'])
            acciones[pos]['States'][0]['Image'] = 'Images/' + nombre
        if i == 0:
            for n, (e, _) in enumerate(a['destinos'][:COLS]):
                acciones['%d,%d' % (n, ROWS - 1)] = selector(e, sel[e], idir)
        if i + 1 < len(ids):
            img.crop(((COLS - 1) * PX, (ROWS - 2) * PX, COLS * PX, (ROWS - 1) * PX)).save(os.path.join(idir, 'admira-mas.png'))
            acciones['%d,%d' % (COLS - 1, ROWS - 2)] = accion(
                'Create Folder', 'profile.openchild', {'ProfileUUID': ids[i + 1]}, '', 'Images/admira-mas.png')
        nombre = a['titulo'] if not i else '%s · %s' % (a['titulo'], i + 1)
        jsave(os.path.join(pd, 'manifest.json'), {'Controllers': [{'Actions': acciones, 'Type': 'Keypad'}], 'Icon': '', 'Name': nombre})


def instalar(a):
    if os.name != 'nt': raise SystemExit('--instalar solo funciona en el Windows del Stream Deck')
    hojas, _ = atlas(a)
    if not any(lista for _, lista in hojas):
        raise SystemExit('No hay piezas lanzables; se conserva el perfil instalado.')
    perfil, menu = pagina_menu()
    man_menu = os.path.join(menu, 'manifest.json')
    pm = jload(man_menu)
    acts = (pm.get('Controllers') or [{}])[0].setdefault('Actions', {})
    pos = next((k for k, v in acts.items() if es_mia(v)), None)
    hija = ((acts.get(pos) or {}).get('Settings') or {}).get('ProfileUUID') if pos else None
    if not pos:
        pos = a['tecla_menu'] if a['tecla_menu'] and a['tecla_menu'] not in acts else next(
            ('%d,%d' % (c, f) for f in range(ROWS) for c in range(COLS) if '%d,%d' % (c, f) not in acts), None)
        if not pos: raise SystemExit('no queda ninguna tecla libre en el menu')
    raiz = (hija or str(uuid.uuid4())).lower()
    padre = os.path.dirname(menu)
    anterior = os.path.join(padre, raiz.upper())
    adicionales = list(reversed(list(subpaginas(anterior))))
    antiguas = adicionales + [anterior]
    ids = [raiz] + [os.path.basename(ruta).lower() for ruta in adicionales[:len(hojas) - 1]]
    ids.extend(str(uuid.uuid4()) for _ in range(len(hojas) - len(ids)))

    with tempfile.TemporaryDirectory(prefix='admira-stream-deck-', dir=os.path.dirname(perfil)) as temporal:
        nuevas = os.path.join(temporal, 'nuevas')
        guardadas = os.path.join(temporal, 'anteriores')
        os.makedirs(guardadas)
        escribir_paginas(a, nuevas, ids, hojas)
        portada = hojas[0][0].crop((PX, 0, 2 * PX, PX))
        carpeta = accion('Create Folder', 'profile.openchild', {'ProfileUUID': ids[0]}, a['titulo'], PORTADA)
        carpeta['States'][0].update({'FontFamily': '', 'FontSize': 8, 'FontStyle': '', 'FontUnderline': False, 'OutlineThickness': 2, 'TitleAlignment': 'bottom', 'TitleColor': '#ffffff'})
        acts[pos] = carpeta
        portada_menu = os.path.join(menu, PORTADA)
        portada.save(os.path.join(temporal, 'portada.png'))
        jsave(os.path.join(temporal, 'menu.json'), pm)
        app(False)
        movidas, instaladas = [], []
        try:
            os.makedirs(COPIAS, exist_ok=True)
            copia = shutil.make_archive(os.path.join(COPIAS, 'perfil-' + time.strftime('%Y%m%d-%H%M%S')), 'zip', perfil)
            for origen in antiguas + [portada_menu, man_menu]:
                if os.path.exists(origen):
                    destino = os.path.join(guardadas, os.path.basename(origen))
                    os.replace(origen, destino)
                    movidas.append((origen, destino))
            for origen, destino in [(os.path.join(nuevas, i.upper()), os.path.join(padre, i.upper())) for i in ids] + [
                    (os.path.join(temporal, 'portada.png'), portada_menu), (os.path.join(temporal, 'menu.json'), man_menu)]:
                os.makedirs(os.path.dirname(destino), exist_ok=True)
                os.replace(origen, destino)
                instaladas.append(destino)
        except Exception:
            for destino in reversed(instaladas):
                if os.path.isdir(destino): shutil.rmtree(destino)
                else: os.unlink(destino)
            for origen, destino in reversed(movidas):
                os.replace(destino, origen)
            raise
        finally:
            app(True)
    print('Instaladas %d piezas en %d páginas. Copia del perfil: %s' % (sum(len(lista) for _, lista in hojas), len(hojas), copia))


def quitar():
    if os.name != 'nt': raise SystemExit('--quitar solo funciona en el Windows del Stream Deck')
    _, menu = pagina_menu(); man_menu = os.path.join(menu, 'manifest.json'); pm = jload(man_menu)
    acts = (pm.get('Controllers') or [{}])[0].get('Actions') or {}
    pos = next((k for k, v in acts.items() if es_mia(v)), None)
    if not pos: print('no habia nada instalado'); return
    app(False)
    hija = (acts[pos].get('Settings') or {}).get('ProfileUUID')
    if hija:
        carpeta = os.path.join(os.path.dirname(menu), hija.upper())
        for destino in list(subpaginas(carpeta)) + [carpeta]:
            shutil.rmtree(destino, ignore_errors=True)
    del acts[pos]; jsave(man_menu, pm); app(True)
    print('quitada la carpeta de la tecla ' + pos)

def main():
    a = ajustes(); arg = sys.argv[1:]
    if '--saltar' in arg:
        print(json.dumps(saltar(arg[arg.index('--saltar') + 1], a), ensure_ascii=False)); return
    if '--destino' in arg:
        i = arg.index('--destino'); print(json.dumps(marcar(a, arg[i + 1], arg[i + 2] != 'off'))); return
    if '--png' in arg:
        salida = arg[arg.index('--png') + 1]
        hojas, nombre = atlas(a)
        raiz, extension = os.path.splitext(salida)
        for n, (img, lista) in enumerate(hojas, 1):
            destino = salida if n == 1 else '%s-%d%s' % (raiz, n, extension)
            img.save(destino)
            print('«%s», página %d: %d piezas -> %s' % (nombre, n, len(lista), destino))
            for p in lista: print(' play%s  %s' % (p['num'], p['titulo']))
        return
    if '--instalar' in arg: instalar(a); return
    if '--quitar' in arg: quitar(); return
    print('uso: previos.py --png fichero.png | --instalar | --quitar | --saltar <num> | --destino <01> on|off')

if __name__ == '__main__': main()

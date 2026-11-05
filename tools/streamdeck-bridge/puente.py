# Puente EN VIVO Stream Deck XL (METAHUMAN) -> admira.store/objeto/stream-deck
# Lee el perfil Elgato activo (ProfilesV3, Pages.Current), compone atlas 8x4 (1024x512) y lo sube.
# Clave: misma que los ventiladores (config.json nube.clave o ~/.admira_supercomputer_key). Nunca se imprime.
# Parar: schtasks /End /TN AdmiraStreamDeckBridge  ·  desactivar: schtasks /Change /TN AdmiraStreamDeckBridge /DISABLE
import os, json, time, glob, base64, hashlib, io, urllib.request, sys
from PIL import Image

API = 'https://www.admira.store/objeto/stream-deck/api/face'
SERIAL = 'CL37J1A02733'
COLS, ROWS, K = 8, 4, 128
FAN_CFG = os.path.expanduser(r'~\admira-tv\tools\player-ventiladores\config.json')
PROFILES = os.path.join(os.environ.get('APPDATA', ''), 'Elgato', 'StreamDeck', 'ProfilesV3')
LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'puente.log')

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

def atlas():
    d, man = perfil()
    pid, pd = pagina(d, man)
    img = Image.new('RGB', (COLS * K, ROWS * K), (5, 7, 12))
    n = 0
    if pd:
        acts = ((jload(os.path.join(pd, 'manifest.json')).get('Controllers') or [{}])[0].get('Actions') or {})
        for pos, a in acts.items():
            try: col, row = [int(x) for x in pos.split(',')]
            except Exception: continue
            if not (0 <= col < COLS and 0 <= row < ROWS): continue
            st = a.get('States') or [{}]
            s = st[min(int(a.get('State', 0) or 0), len(st) - 1)] if st else {}
            rel = s.get('Image') or ''
            p = os.path.join(pd, rel.replace('/', os.sep)) if rel else ''
            if p and os.path.exists(p):
                try:
                    t = Image.open(p).convert('RGBA').resize((K, K))
                    bg = Image.new('RGBA', (K, K), (0, 0, 0, 255)); bg.alpha_composite(t)
                    img.paste(bg.convert('RGB'), (col * K, row * K)); n += 1
                except Exception as e: log('img %s %s' % (pos, e))
    b = io.BytesIO(); img.save(b, 'PNG', optimize=True)
    return b.getvalue(), pid, n

def post(body, key):
    r = urllib.request.Request(API, data=json.dumps(body).encode(), method='POST',
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'admira-streamdeck-bridge'})
    with urllib.request.urlopen(r, timeout=10) as x: return x.status

def main():
    key = clave(); last = None; once = '--once' in sys.argv
    log('arranque')
    while True:
        try:
            png, pid, n = atlas(); h = hashlib.sha256(png).hexdigest()
            body = {'serial': SERIAL, 'at': int(time.time() * 1000), 'pageId': pid, 'keyCount': n}
            if h != last: body['facePngBase64'] = base64.b64encode(png).decode()
            st = post(body, key)
            if h != last: log('cara nueva page=%s teclas=%d bytes=%d http=%d' % (pid, n, len(png), st)); last = h
        except Exception as e:
            log('error %s' % str(e)[:200]); last = None
        if once: break
        time.sleep(2.5)

if __name__ == '__main__': main()

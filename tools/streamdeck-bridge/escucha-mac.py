#!/usr/bin/python3
# Escucha de arranque del player en un Mac (mismo contrato que el vigilante de los AdmiraNeXT de Windows):
# sondea su propia cola GET api.admira.store/locations/cmd?id=<maquina>-vigilante y, con la orden `start`,
# pone en marcha AdmiraSignageMac y lo trae al frente. Solo entiende `start`; cerrar el player sigue siendo Escape en el propio Mac.
# Lo usan los selectores MBP14/MBP16 del Stream Deck (previos.py) para mandar el player a un Mac que no lo tiene abierto.
# Instalar: escucha-mac.py --instalar   ·   quitar: escucha-mac.py --quitar
import json, os, subprocess, sys, time, urllib.request

COLA = 'https://api.admira.store/locations/cmd?id=%s'
ETIQUETA = 'tv.admira.signage.escucha'
PLIST = os.path.expanduser('~/Library/LaunchAgents/%s.plist' % ETIQUETA)
PLAYER = 'tv.admira.signage.mac'

def maquina():
    r = subprocess.run(['defaults', 'read', PLAYER, 'screen'], capture_output=True, text=True)
    return (r.stdout.strip() or subprocess.run(['scutil', '--get', 'LocalHostName'], capture_output=True, text=True).stdout.strip()).lower()

def ordenes(ident):
    r = urllib.request.Request(COLA % ident, headers={'User-Agent': 'admira-escucha-mac'})
    with urllib.request.urlopen(r, timeout=8) as x: return json.load(x).get('commands') or []

def arrancar():
    """Pone el player en marcha y SIEMPRE lo trae al frente: arrancado por launchd se queda detras de las demas ventanas."""
    como = 'ya estaba'
    if subprocess.run(['pgrep', '-x', 'AdmiraSignageMac'], capture_output=True).returncode != 0:
        servicio = 'gui/%d/%s' % (os.getuid(), PLAYER); como = 'open'
        if subprocess.run(['launchctl', 'print', servicio], capture_output=True).returncode == 0:
            subprocess.run(['launchctl', 'kickstart', servicio], capture_output=True); como = 'kickstart'; time.sleep(2)
    subprocess.run(['open', '-a', 'AdmiraSignageMac'], capture_output=True)
    return como + ' + al frente'

def bucle():
    ident = maquina() + '-vigilante'; visto = None
    print(time.strftime('%F %T'), 'escuchando', ident, flush=True)
    while True:
        try:
            cids = [(int(c.get('cid') or 0), str(c.get('cmd') or '')) for c in ordenes(ident)]
            if visto is None: visto = max([c for c, _ in cids] or [0])   # lo que ya habia en la cola al arrancar no se ejecuta
            for cid, cmd in sorted(cids):
                if cid <= visto: continue
                visto = cid
                if cmd == 'start': print(time.strftime('%F %T'), 'start ->', arrancar(), flush=True)
        except Exception as e:
            print(time.strftime('%F %T'), 'error', str(e)[:120], flush=True)
        time.sleep(3)

def instalar():
    yo = os.path.abspath(__file__)
    open(PLIST, 'w').write('''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>%s</string>
<key>ProgramArguments</key><array><string>/usr/bin/python3</string><string>%s</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>/tmp/admira-escucha-mac.log</string>
<key>StandardErrorPath</key><string>/tmp/admira-escucha-mac.log</string>
</dict></plist>
''' % (ETIQUETA, yo))
    subprocess.run(['launchctl', 'bootout', 'gui/%d/%s' % (os.getuid(), ETIQUETA)], capture_output=True)
    r = subprocess.run(['launchctl', 'bootstrap', 'gui/%d' % os.getuid(), PLIST], capture_output=True, text=True)
    print('instalada la escucha %s-vigilante %s' % (maquina(), r.stderr.strip()))

def quitar():
    subprocess.run(['launchctl', 'bootout', 'gui/%d/%s' % (os.getuid(), ETIQUETA)], capture_output=True)
    if os.path.exists(PLIST): os.remove(PLIST)
    print('quitada')

if __name__ == '__main__':
    if '--instalar' in sys.argv: instalar()
    elif '--quitar' in sys.argv: quitar()
    else: bucle()

# Senal de REPOSO del puente Stream Deck (10-nov-2026). Uso: python tools/streamdeck-bridge/test_reposo.py
import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import puente

T0 = 1794300000000
ITEMS = [{'id': 'a', 'stockId': 'a', 'title': 'Uno', 'sub': 'Admira Studio · Suno', 'seconds': 100, 'assetType': 'video'},
         {'id': 'b', 'stockId': 'b', 'title': 'Dos', 'sub': 'Admira Studio · Suno', 'seconds': 50, 'assetType': 'video'}]

class Reposo(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(); puente.REPOSO = os.path.join(self.dir, 'reposo.json')
        puente.LOG = os.path.join(self.dir, 'puente.log')
        puente._playlist.update(at=9e18, items=ITEMS, name='admira.tv StreamDeck', rev=7)
    def escribe(self, d):
        with open(puente.REPOSO, 'w', encoding='utf-8') as f: json.dump(d, f)

    def test_sin_fichero_no_hay_senal(self):
        self.assertIsNone(puente.senal_reposo(1000))

    def test_reposo_calcula_la_pieza_en_emision(self):
        self.escribe({'estado': 'reposo', 'desde': T0, 'fuente': 'elgato-screensaver'})
        s = puente.senal_reposo(T0 + 120 * 1000)  # 120 s: segunda pieza (0-100 Uno, 100-150 Dos)
        self.assertEqual(s['estado'], 'reposo'); self.assertEqual(s['ts'], T0 + 120000)
        self.assertEqual(s['playlist'], {'screen': 'admira-tv-streamdeck', 'name': 'admira.tv StreamDeck', 'rev': 7, 'total': 2})
        self.assertEqual(s['pieza']['title'], 'Dos'); self.assertEqual(s['pieza']['index'], 1)
        self.assertEqual(s['pieza']['desde'], T0 + 100000)
        self.assertEqual(s['pieza']['poster'], 'https://stock.admira.store/stock/b/poster.jpg')
        self.assertEqual(puente.senal_reposo(T0 + 160 * 1000)['pieza']['title'], 'Uno')  # vuelve a empezar

    def test_pieza_explicita_gana(self):
        self.escribe({'estado': 'reposo', 'desde': T0, 'pieza': {'id': 'z', 'title': 'Manual'}})
        self.assertEqual(puente.senal_reposo(T0 + 5000)['pieza']['title'], 'Manual')

    def test_activo_y_basura(self):
        self.escribe({'estado': 'activo', 'desde': 5})
        s = puente.senal_reposo(9); self.assertEqual(s['estado'], 'activo'); self.assertNotIn('pieza', s)
        self.escribe({'estado': 'dormido'}); self.assertIsNone(puente.senal_reposo(9))
        with open(puente.REPOSO, 'w') as f: f.write('{roto')
        self.assertIsNone(puente.senal_reposo(9))

if __name__ == '__main__': unittest.main()

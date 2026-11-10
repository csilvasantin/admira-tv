"""Pruebas locales del emisor; no equivalen a una prueba física de Elgato."""

import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import senal_reposo


class Emisor(unittest.TestCase):
    def setUp(self):
        self.directorio = tempfile.TemporaryDirectory()
        self.addCleanup(self.directorio.cleanup)
        self.ruta = Path(self.directorio.name) / "reposo.json"
        self.ahora = 1794300000000
        self.emisor = senal_reposo.SenalReposo(
            self.ruta, intervalo=0.03, reloj_ms=lambda: self.ahora,
        )
        self.addCleanup(self.emisor.cerrar)

    def leer(self):
        return json.loads(self.ruta.read_text())

    def esperar(self, condicion):
        limite = time.monotonic() + 2
        while not condicion():
            if time.monotonic() >= limite:
                self.fail("No se observó el refresco en dos segundos")
            time.sleep(0.005)

    def test_no_publica_un_estado_sin_evento(self):
        time.sleep(0.08)
        self.assertFalse(self.ruta.exists())

    def test_reposo_refresca_sin_reiniciar_desde_y_tecla_cambia_a_activo(self):
        self.emisor.entrar_salvapantallas()
        inicial = self.ruta.stat().st_mtime_ns
        esperado = {"estado": "reposo", "desde": self.ahora, "fuente": "elgato-screensaver"}
        self.assertEqual(self.leer(), esperado)
        self.ahora += 5000
        self.esperar(lambda: self.ruta.stat().st_mtime_ns != inicial)
        self.emisor.entrar_salvapantallas()
        self.assertEqual(self.leer(), esperado)
        self.emisor.pulsar_tecla()
        self.assertEqual(self.leer(), {"estado": "activo", "desde": self.ahora})
        self.ahora += 8000
        self.emisor.entrar_salvapantallas()
        self.assertEqual(self.leer()["desde"], self.ahora)

    def test_lectores_concurrentes_solo_ven_json_completo(self):
        self.emisor.entrar_salvapantallas()
        fin = threading.Event()
        errores = []
        lecturas = []

        def lector():
            while not fin.is_set():
                try:
                    dato = self.leer()
                    if dato["estado"] not in ("reposo", "activo") or "desde" not in dato:
                        raise ValueError(dato)
                    lecturas.append(1)
                except Exception as error:
                    errores.append(error)

        hilo = threading.Thread(target=lector)
        hilo.start()
        try:
            for i in range(100):
                self.ahora += 1
                self.emisor.pulsar_tecla() if i % 2 else self.emisor.entrar_salvapantallas()
        finally:
            fin.set()
            hilo.join()
        self.assertTrue(lecturas)
        self.assertEqual(errores, [])
        self.emisor.cerrar()
        self.assertEqual(list(self.ruta.parent.glob("*.tmp")), [])

    def test_bloqueo_transitorio_de_windows_se_reintenta(self):
        reemplazar = senal_reposo.os.replace
        with patch.object(senal_reposo.os, "replace", side_effect=[PermissionError(), None]) as reemplazo:
            # El segundo intento ejecuta el reemplazo real.
            def intentar(origen, destino):
                if reemplazo.call_count == 1:
                    raise PermissionError()
                reemplazar(origen, destino)
            reemplazo.side_effect = intentar
            self.emisor.entrar_salvapantallas()
        self.assertEqual(self.leer()["estado"], "reposo")

    def test_fallo_de_reemplazo_conserva_anterior_y_limpia_temporal(self):
        self.emisor.entrar_salvapantallas()
        original = self.ruta.read_bytes()
        # Mantener el lock para que el refresco no entre en esta simulación.
        with self.emisor._lock:
            with patch.object(senal_reposo.os, "replace", side_effect=OSError("disco")):
                with self.assertRaises(OSError):
                    senal_reposo.escribir_atomico(self.ruta, {"estado": "activo", "desde": 9})
            self.assertEqual(self.ruta.read_bytes(), original)
            self.assertEqual(list(self.ruta.parent.glob("*.tmp")), [])

    def test_cerrar_retira_senal_y_no_reaparece(self):
        self.emisor.entrar_salvapantallas()
        self.emisor.cerrar()
        time.sleep(0.08)
        self.assertFalse(self.ruta.exists())
        with self.assertRaises(RuntimeError):
            self.emisor.pulsar_tecla()

    def test_fallo_al_pulsar_se_recupera_con_refresco_activo(self):
        self.emisor.entrar_salvapantallas()
        self.ahora += 7000
        with patch.object(senal_reposo, "escribir_atomico", side_effect=OSError("disco")):
            with self.assertRaises(OSError):
                self.emisor.pulsar_tecla()
        self.esperar(lambda: self.leer()["estado"] == "activo")
        self.assertEqual(self.leer(), {"estado": "activo", "desde": self.ahora})

    def test_cadencia_predeterminada_y_limites(self):
        otro = senal_reposo.SenalReposo(self.ruta)
        self.addCleanup(otro.cerrar)
        self.assertEqual(otro.intervalo, 5)
        for intervalo in [0, -1, 15, 16, float("nan"), float("inf")]:
            with self.assertRaises(ValueError):
                senal_reposo.SenalReposo(self.ruta, intervalo=intervalo)


if __name__ == "__main__":
    unittest.main()

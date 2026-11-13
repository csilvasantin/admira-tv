"""Emisor de #7487/#7489; el detector real de Elgato debe llamar a sus eventos.

No detecta reposo por inactividad del PC ni controla Stream Deck. No modifica
puente.py. Sin un evento confirmado no crea ni refresca reposo.json.
"""

import json
import logging
import math
import os
from pathlib import Path
import random
import tempfile
import threading
import time


VERSION = "2026.11.10.2"
ESPERA_RENAME_S = 2.0
RUTA_PREDETERMINADA = Path(__file__).resolve().with_name("reposo.json")


def escribir_atomico(ruta, senal):
    """Publica un JSON completo por reemplazo en el mismo volumen."""
    ruta = Path(ruta)
    temporal = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=ruta.parent,
            prefix=ruta.name + ".", suffix=".tmp", delete=False,
        ) as archivo:
            temporal = Path(archivo.name)
            json.dump(senal, archivo, ensure_ascii=False, separators=(",", ":"))
            archivo.write("\n")
            archivo.flush()
            os.fsync(archivo.fileno())
        # Windows puede negar brevemente el reemplazo mientras el puente lee.
        limite = time.monotonic() + ESPERA_RENAME_S
        while True:
            try:
                os.replace(temporal, ruta)
                break
            except PermissionError:
                restante = limite - time.monotonic()
                if restante <= 0:
                    raise
                # Evitar coincidir siempre con un lector periódico de Windows.
                time.sleep(min(restante, random.uniform(0.01, 0.05)))
    finally:
        if temporal is not None:
            temporal.unlink(missing_ok=True)


class SenalReposo:
    """Un emisor por player. Conectar SOLO a eventos reales del deck objetivo.

    entrar_salvapantallas(): transición confirmada del salvapantallas Elgato.
    pulsar_tecla(): tecla física del deck (no teclado/ratón del PC).
    cerrar(): retira la señal y termina el refresco; no inventa estado activo.
    """

    def __init__(self, ruta=None, intervalo=5.0, reloj_ms=None):
        if not math.isfinite(intervalo) or not 0 < intervalo < 15:
            raise ValueError("El refresco debe ser mayor que 0 y menor que 15 s")
        self.ruta = Path(ruta or os.environ.get("ADMIRA_SD_REPOSO") or RUTA_PREDETERMINADA)
        self.intervalo = intervalo
        self.reloj_ms = reloj_ms or (lambda: time.time_ns() // 1_000_000)
        self._senal = None
        self._lock = threading.Lock()
        self._parar = threading.Event()
        self._hilo = threading.Thread(target=self._refrescar, daemon=True, name="senal-reposo")
        self._hilo.start()

    def _cambiar(self, estado):
        with self._lock:
            if self._parar.is_set():
                raise RuntimeError("El emisor está cerrado")
            # Notificaciones repetidas de reposo no reinician el reloj del GIF.
            if estado != "reposo" or not self._senal or self._senal["estado"] != estado:
                self._senal = {"estado": estado, "desde": int(self.reloj_ms())}
                if estado == "reposo":
                    self._senal["fuente"] = "elgato-screensaver"
            escribir_atomico(self.ruta, self._senal)

    def entrar_salvapantallas(self):
        self._cambiar("reposo")

    def pulsar_tecla(self):
        self._cambiar("activo")

    def _refrescar(self):
        while not self._parar.wait(self.intervalo):
            with self._lock:
                if self._parar.is_set():
                    break
                if self._senal is not None:
                    try:
                        escribir_atomico(self.ruta, self._senal)
                    except OSError:
                        # También reintenta activo: un fallo de disco al pulsar
                        # no debe dejar para siempre la última señal de reposo.
                        logging.exception("No se pudo refrescar reposo.json")

    def cerrar(self):
        self._parar.set()
        self._hilo.join()
        with self._lock:
            if self._senal is not None:
                self.ruta.unlink(missing_ok=True)

"""IEU hub adapter. No browser-session extraction, direct LAN calls or command retries."""
import asyncio
import hashlib
import json
import os
import re
import stat
from pathlib import Path

import httpx

ORIGIN = 'https://digitaltwin.ieu.ai'


def identifier(value: str) -> str:
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,120}', value):
        raise ValueError('Identificador inválido')
    return value


def password_from_file() -> str:
    name = os.environ.get('IEU_PASSWORD_FILE')
    if not name:
        raise ValueError('Configura IEU_EMAIL y un archivo privado IEU_PASSWORD_FILE; no pegues credenciales en herramientas MCP.')
    path = Path(name)
    if stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise ValueError('IEU_PASSWORD_FILE debe tener permisos 0600')
    return path.read_text().rstrip('\r\n')


class Bridge:
    def __init__(self, client=None, email=None, password=None):
        self.http = client or httpx.AsyncClient(base_url=ORIGIN, timeout=20, follow_redirects=False)
        self.email = email
        self.password = password
        self.authenticated = False
        self.lock = asyncio.Lock()

    async def authenticate(self):
        async with self.lock:
            if self.authenticated:
                return
            email = self.email or os.environ.get('IEU_EMAIL')
            if not email:
                raise ValueError('Falta IEU_EMAIL para la cuenta de integración autorizada')
            response = await self.http.post('/auth/login', json={'email': email, 'password': self.password or password_from_file()})
            if response.status_code != 200:
                raise ValueError(f'IEU no ha autenticado la cuenta (HTTP {response.status_code}); no se reintenta automáticamente')
            self.authenticated = True

    async def request(self, method, path, body=None):
        await self.authenticate()
        try:
            response = await self.http.request(method, path, json=body)
        except httpx.TransportError:
            raise ValueError('Sin respuesta de IEU. Si era una orden, su resultado es incierto: consulta el estado antes de repetirla.') from None
        if response.status_code == 401:
            self.authenticated = False
            raise ValueError('La sesión de IEU ha caducado. Vuelve a consultar; no se repite ninguna orden.')
        if response.status_code == 403:
            raise ValueError('La cuenta de IEU no tiene permiso para esta operación')
        if not response.is_success:
            raise ValueError(f'IEU respondió HTTP {response.status_code}; operación no confirmada')
        return response.json()

    async def sites(self):
        data = await self.request('GET', '/hub/sites')
        # Do not publish internal backend addresses in the MCP catalogue.
        return [{'id': s['id'], 'name': s['name'], 'status': s.get('status')} for s in data['sites']]

    async def site_path(self, site_id, suffix):
        identifier(site_id)
        if not any(s['id'] == site_id for s in await self.sites()):
            raise ValueError('Oficina no disponible para esta cuenta')
        return f'/s/{site_id}/api/{suffix}'

    async def read(self, site_id, suffix):
        return await self.request('GET', await self.site_path(site_id, suffix))

    async def snapshot(self, site_id):
        return await self.read(site_id, 'system/snapshot?refresh=false')

    async def command(self, site_id, device_id, action, params):
        identifier(device_id)
        identifier(action)
        before = await self.snapshot(site_id)
        if not any(d.get('device_id') == device_id for d in before.get('devices', [])):
            raise ValueError('El dispositivo no pertenece a la oficina seleccionada')
        result = await self.request('POST', await self.site_path(site_id, 'commands'), {
            'source': 'web', 'action': action,
            'target': {'type': 'device', 'device_id': device_id}, 'params': params,
        })
        # A command response is not proof that physical state has converged.
        try:
            observed = await self.snapshot(site_id)
            device = next((d for d in observed.get('devices', []) if d.get('device_id') == device_id), None)
            return {'command_response': result, 'observed_device': device, 'verification': 'Estado observado tras enviar; puede seguir pendiente. No implica ejecución física confirmada.'}
        except (ValueError, httpx.HTTPError):
            return {'command_response': result, 'verification': 'Orden respondida, pero no se pudo consultar el estado posterior. No repetir sin comprobar.'}

    async def changes(self, site_id, previous_revision='', timeout_seconds=0):
        if not 0 <= timeout_seconds <= 40:
            raise ValueError('timeout_seconds debe estar entre 0 y 40')
        deadline = asyncio.get_running_loop().time() + timeout_seconds
        while True:
            snapshot = await self.snapshot(site_id)
            # Ignore envelope timestamps; compare device data, not the poll time.
            devices = sorted(snapshot.get('devices', []), key=lambda d: d.get('device_id', ''))
            revision = hashlib.sha256(json.dumps(devices, sort_keys=True).encode()).hexdigest()
            changed = bool(previous_revision and revision != previous_revision)
            if not previous_revision or changed or asyncio.get_running_loop().time() >= deadline:
                return {'revision': revision, 'changed': changed, 'snapshot': snapshot, 'mode': 'polling'}
            await asyncio.sleep(min(8, max(0, deadline - asyncio.get_running_loop().time())))

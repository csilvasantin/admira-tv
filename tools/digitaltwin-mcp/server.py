"""Run locally through stdio. Credentials are provided outside tool arguments."""
import os
from typing import Any
from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from bridge import Bridge

mcp = FastMCP('Admira · IEU Digital Twin')
bridge = Bridge()
read = ToolAnnotations(readOnlyHint=True, openWorldHint=True)

@mcp.tool(annotations=read)
async def list_offices() -> list[dict]:
    """Lista las oficinas accesibles a la cuenta autenticada y sus identificadores."""
    return await bridge.sites()

@mcp.tool(annotations=read)
async def get_snapshot(site_id: str) -> dict:
    """Consulta dispositivos y estados de una oficina explícita. Puede haber estados pendientes."""
    return await bridge.snapshot(site_id)

@mcp.tool(annotations=read)
async def list_scenes(site_id: str) -> dict:
    """Consulta escenas interiores. No navega el navegador ni modifica escenas."""
    return await bridge.read(site_id, 'scenes')

@mcp.tool(annotations=read)
async def list_actions(site_id: str) -> dict:
    """Consulta el catálogo de acciones antes de proponer una orden y sus parámetros."""
    return await bridge.read(site_id, 'actions/catalog')

@mcp.tool(annotations=read)
async def observe_changes(site_id: str, previous_revision: str = '', timeout_seconds: int = 0) -> dict:
    """Retorno de estados por consultas cada 8 s, hasta 40 s. No es una suscripción push.
    Conserva revision para la siguiente llamada. No programa vigilancia futura.
    """
    return await bridge.changes(site_id, previous_revision, timeout_seconds)

# Opt-in installation capability, not a flag that an agent can set in a tool call.
if os.environ.get('IEU_ENABLE_COMMANDS') == '1':
    @mcp.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=True))
    async def send_device_command(site_id: str, device_id: str, action: str, params: dict[str, Any]) -> dict:
        """Envía UNA orden real al dispositivo de la oficina indicada, según catálogo IEU.
        Puede cambiar electricidad, clima u otros equipos. Usar sólo dentro del alcance
        solicitado por el usuario. No repetir una orden de resultado incierto.
        La respuesta y el estado posterior se devuelven por separado.
        """
        return await bridge.command(site_id, device_id, action, params)

if __name__ == '__main__':
    mcp.run(transport='stdio')

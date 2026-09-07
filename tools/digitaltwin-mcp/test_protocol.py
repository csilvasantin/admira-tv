import os
import sys
from pathlib import Path
import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

@pytest.mark.asyncio
@pytest.mark.parametrize('enabled',[False,True])
async def test_stdio_handshake_and_tools(enabled):
    env=dict(os.environ, IEU_ENABLE_COMMANDS='1' if enabled else '0')
    env.pop('IEU_EMAIL',None)
    params=StdioServerParameters(command=sys.executable,args=[str(Path(__file__).with_name('server.py'))],env=env)
    async with stdio_client(params) as (read,write):
        async with ClientSession(read,write) as session:
            await session.initialize()
            tools=await session.list_tools()
            names={t.name for t in tools.tools}
            assert {'list_offices','get_snapshot','list_scenes','list_actions','observe_changes'}<=names
            assert ('send_device_command' in names)==enabled
            result=await session.call_tool('list_offices',{})
            assert result.isError # No accidental use of browser cookies or unauthenticated fallback.

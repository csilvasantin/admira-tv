import httpx
import pytest
from bridge import Bridge


def setup(fail_command=False):
    calls=[]
    def respond(req):
        calls.append((req.method, req.url.path))
        path=req.url.path
        if path=='/auth/login': return httpx.Response(200,json={'role':'operador'},headers={'set-cookie':'session=test; HttpOnly; Secure; Path=/'})
        assert req.headers.get('cookie')=='session=test'
        if path=='/hub/sites': return httpx.Response(200,json={'sites':[{'id':'store','name':'Store','base_url':'private'}]})
        if path.endswith('/system/snapshot'): return httpx.Response(200,json={'devices':[{'device_id':'lamp','state':{'on':True}}]})
        if path.endswith('/commands'):
            if fail_command: raise httpx.ReadTimeout('uncertain')
            return httpx.Response(200,json={'command':{'status':'pending'}})
        return httpx.Response(404)
    return Bridge(httpx.AsyncClient(base_url='https://digitaltwin.ieu.ai',transport=httpx.MockTransport(respond)),email='test@example.invalid',password='test'),calls

@pytest.mark.asyncio
async def test_auth_and_private_routes():
    bridge,calls=setup()
    assert await bridge.sites()==[{'id':'store','name':'Store','status':None}]
    await bridge.snapshot('store')
    assert calls.count(('POST','/auth/login'))==1
    assert ('GET','/s/store/api/system/snapshot') in calls

@pytest.mark.asyncio
async def test_cross_office_and_path_injection_rejected():
    bridge,calls=setup()
    for site in ['../store','planeta']:
        with pytest.raises(ValueError): await bridge.snapshot(site)
    with pytest.raises(ValueError): await bridge.command('store','other-device','turn_on',{})
    assert not any(path.endswith('/commands') for _,path in calls)

@pytest.mark.asyncio
async def test_command_response_is_not_claimed_as_physical_success():
    bridge,calls=setup()
    result=await bridge.command('store','lamp','turn_on',{})
    assert result['command_response']['command']['status']=='pending'
    assert result['observed_device']['device_id']=='lamp'
    assert 'No implica' in result['verification']
    assert calls.count(('POST','/s/store/api/commands'))==1

@pytest.mark.asyncio
async def test_uncertain_command_is_never_retried():
    bridge,calls=setup(True)
    with pytest.raises(ValueError,match='incierto'): await bridge.command('store','lamp','turn_on',{})
    assert calls.count(('POST','/s/store/api/commands'))==1

@pytest.mark.asyncio
async def test_return_channel_revision_and_bounds():
    bridge,_=setup()
    first=await bridge.changes('store')
    assert not first['changed']
    assert not (await bridge.changes('store',first['revision']))['changed']
    assert (await bridge.changes('store','older'))['changed']
    with pytest.raises(ValueError): await bridge.changes('store',timeout_seconds=999)

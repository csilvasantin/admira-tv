import test from 'node:test';
import assert from 'node:assert/strict';
import {PlayerDataBridge} from './player-data.mjs';
function fixture(fetcher){
  const replies=[],calls=[];const target={postMessage:(...args)=>replies.push(args)};
  const bridge=new PlayerDataBridge({target,fetcher:async(...args)=>{calls.push(args);return fetcher?fetcher(...args):Response.json({items:[],rules:[]});}});
  const event=(resource='catalog',extra={})=>({origin:'null',source:target,data:{source:'admira-tv-public-data',resource,requestId:'12345678'},...extra});
  return {bridge,replies,calls,event};
}
test('public bridge accepts only exact child, enum resource and bounded request shape; no credentials',async()=>{
  const f=fixture();await f.bridge.receive(f.event('history'));await f.bridge.receive(f.event('catalog',{source:{}}));await f.bridge.receive(f.event('catalog',{origin:'https://admira.tv'}));
  const e=f.event();e.data.url='https://evil.example';await f.bridge.receive(e);assert.equal(f.calls.length,0);
  await f.bridge.receive(f.event());assert.equal(f.calls.length,1);assert.match(f.calls[0][0],/^https:\/\/api.admira.store\/stock\/list\?limit=300$/);
  assert.equal(f.calls[0][1].credentials,'omit');assert.equal(f.calls[0][1].redirect,'error');assert.equal(f.replies[0][0].ok,true);
  await f.bridge.receive(f.event());assert.equal(f.calls.length,1);f.bridge.stop();
});
test('closed or navigated child gets no late data; fetch aborted',async()=>{
  let release;const f=fixture(()=>new Promise(resolve=>{release=resolve;}));const request=f.bridge.receive(f.event());
  f.bridge.stop();assert.equal(f.calls[0][1].signal.aborted,true);release(Response.json({items:[]}));await request;assert.equal(f.replies.length,0);
});
test('oversized, malformed and non-JSON public replies fail without forwarding any body',async()=>{
  for(const response of [new Response('x'.repeat(2*1024*1024+1)),Response.json({token:'not-a-catalogue'}),new Response('<html>bad</html>')]){
    const f=fixture(()=>response);await f.bridge.receive(f.event());assert.equal(f.replies[0][0].ok,false);assert.equal('data' in f.replies[0][0],false);f.bridge.stop();
  }
});

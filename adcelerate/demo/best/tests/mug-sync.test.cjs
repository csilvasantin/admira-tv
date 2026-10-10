const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function harness(fetch){
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const code=html.slice(html.indexOf("let lastMugKey="),html.indexOf('function mappedMusicToScreen'));
 const timers=new Map();let next=0;
 const ctx=vm.createContext({fetch,AbortSignal,console:{info(){}},window:{addEventListener(){}},setTimeout(fn){timers.set(++next,fn);return next},clearTimeout(id){timers.delete(id)}});
 vm.runInContext(code+';globalThis.select=mappedMusicToMug;',ctx);
 return {select:ctx.select,async settle(){for(let i=0;i<10;i++)await new Promise(setImmediate)},async retry(){const jobs=[...timers.values()];timers.clear();for(const fn of jobs)fn();await this.settle()},timers};
}
const response=data=>({ok:true,json:async()=>data});
const song=(id)=>({id,artist:'Queen',title:'Queen - '+id});
test('offline bridge retains latest selection, checks readiness and retries once available',async()=>{
 let ready=false;const sent=[];
 const h=harness(async(url,opts)=>{
  if(url.endsWith('/mcp'))return response({result:{content:[{type:'text',text:JSON.stringify({iphone:{gifReady:ready}})}]}});
  sent.push(JSON.parse(opts.body));return response({ok:true,bubble:{queued:ready,id:'job'}});
 });
 h.select(song('one'));await h.settle();assert.equal(sent.length,1);
 await h.retry();assert.equal(sent.length,1,'no repeated GIF posts while bridge is down');
 h.select(song('two'));await h.settle();assert.equal(sent.at(-1).id,'two');
 ready=true;await h.retry();assert.equal(sent.at(-1).id,'two');assert.equal(h.timers.size,0);
 h.select(song('two'));await h.settle();assert.equal(sent.length,3,'queued selection is deduplicated');
});
test('network errors remain pending and can recover',async()=>{
 let fail=true,count=0;
 const h=harness(async(url)=>{if(url.endsWith('/mcp'))return response({result:{content:[{type:'text',text:'{"iphone":{"gifReady":true}}'}]}});count++;if(fail)throw Error('offline');return response({ok:true,bubble:{queued:true}})});
 h.select(song('one'));await h.settle();assert.equal(h.timers.size,1);fail=false;await h.retry();assert.equal(count,2);assert.equal(h.timers.size,0);
});
test('selection changing during an in-flight send is sent next, including returning to the previous song',async()=>{
 let resolve;const sent=[];
 const h=harness(async(url,opts)=>{if(url.endsWith('/mcp'))return response({result:{content:[{type:'text',text:'{"iphone":{"gifReady":true}}'}]}});const body=JSON.parse(opts.body);sent.push(body.id);if(body.id==='two')return new Promise(r=>resolve=r);return response({ok:true,bubble:{queued:true}})});
 h.select(song('one'));await h.settle();h.select(song('two'));await h.settle();h.select(song('one'));resolve(response({ok:true,bubble:{queued:true}}));await h.settle();await h.retry();assert.deepEqual(sent,['one','two','one']);
});
test('stop supersedes an offline song and queues Jardinets habitual on reconnect',async()=>{
 let ready=false;const sent=[];
 const h=harness(async(url,opts)=>{if(url.endsWith('/mcp'))return response({result:{content:[{type:'text',text:JSON.stringify({iphone:{gifReady:ready}})}]}});sent.push(JSON.parse(opts.body));return response({ok:true,bubble:{queued:ready}})});
 h.select(song('one'));await h.settle();h.select(null);await h.settle();ready=true;await h.retry();assert.equal(sent.at(-1).id,'stop');assert.equal(sent.at(-1).verb,'habitual');
});

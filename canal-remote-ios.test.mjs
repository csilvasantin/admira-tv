import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const canal = await readFile(new URL("./canal.html", import.meta.url), "utf8");
const remote = await readFile(new URL("./remotecontrol/index.html", import.meta.url), "utf8");
const cms = await readFile(new URL("./cms.html", import.meta.url), "utf8");
const remoteStartSource = canal.slice(
  canal.indexOf("async function remoteStartPlayback()"),
  canal.indexOf("\n\n// Orden POR DEFECTO", canal.indexOf("async function remoteStartPlayback()"))
);
const remoteAckSource = cms.slice(
  cms.indexOf("async function waitRemoteApplied(action)"),
  cms.indexOf("\nfunction finishRemoteAction", cms.indexOf("async function waitRemoteApplied(action)"))
);
const queuedAckSource = canal.slice(
  canal.indexOf("const LEGACY_ACTION_RE="),
  canal.indexOf("async function executeQueuedCommand", canal.indexOf("const LEGACY_ACTION_RE="))
);
const queuedPollSource = canal.slice(
  canal.indexOf("function cmdScreenSlug("),
  canal.indexOf("// Backoff por INACTIVIDAD", canal.indexOf("function cmdScreenSlug("))
);

test("la cola compartida ignora otra pantalla y continúa con órdenes propias y broadcasts", async () => {
  const executed = [], acked = [], reads = [];
  const commands = [
    { cid: 11, screen: 'pantalla-otra', cmd: 'standby' },
    { cid: 12, screen: 'pantalla-este', cmd: 'resume' },
    { cid: 13, cmd: 'next' },
    { cid: 14, screen: '', cmd: 'volume 50' },
    { cid: 15, screen: 'pantalla-otra', cmd: 'off' },
  ];
  const state = { since: 10, init: true };
  const context = vm.createContext({
    XTORE_PARENT: false, scr: { screen: '  Pantállá / Éste  ' },
    __cmdIds: ['shared-circuit'], __cmdState: { 'shared-circuit': state },
    __cmdPolling: false, __cmdHost: 0, __cmdIdleN: 0,
    CMD_HOSTS: ['https://api.test/locations/cmd'],
    async flushCmdAckOutbox() {},
    async executeQueuedCommand(command) { executed.push(command.cid); return 'executed'; },
    async ackQueuedCommand(command, status) { acked.push({ cid: command.cid, queue: command._queueId, status }); },
    async fetch(url) {
      const since = Number(new URL(url).searchParams.get('since'));
      reads.push(since);
      return { ok: true, json: async () => ({ commands: commands.filter(command => command.cid > since) }) };
    },
  });
  vm.runInContext(`${queuedPollSource}\nglobalThis.poll=pollCmd;globalThis.slug=cmdScreenSlug;`, context);
  await context.poll();
  assert.deepEqual(executed, [12, 13, 14], 'la orden ajena nunca modifica la emisión');
  assert.deepEqual(acked, [12, 13, 14].map(cid => ({ cid, queue: 'shared-circuit', status: 'executed' })));
  assert.equal(state.since, 15, 'el último comando ajeno también avanza el cursor');
  await context.poll();
  assert.deepEqual(reads, [10, 15]);
  assert.deepEqual(executed, [12, 13, 14], 'el siguiente poll no repite comandos');
  assert.equal(context.slug('  Pantállá / Éste  '), 'pantalla-este');
  assert.equal(context.slug('A'.repeat(60)), 'a'.repeat(48), 'mismo límite que el servidor');
});

function playbackHarness({ standby = false, playResults = [undefined] } = {}) {
  const calls = [];
  const results = playResults.slice();
  const context = vm.createContext({
    Promise,
    _standby: standby,
    paused: true,
    playlist: [{}],
    cur: 0,
    muted: false,
    mediaEl: {
      muted: false,
      play() {
        calls.push("play");
        const result = results.shift();
        return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
      }
    },
    standbyOn(on) { calls.push(`standby:${on}`); context._standby = on; },
    setPaused(on) { calls.push(`paused:${on}`); context.paused = on; },
    async play() { calls.push("mount"); },
    applyAudio() { calls.push(`audio:${context.muted}`); context.mediaEl.muted = context.muted; },
    flashCli(message) { calls.push(message); },
    tap: { classList: { add(name) { calls.push(`tap+:${name}`); }, remove(name) { calls.push(`tap-:${name}`); } } }
  });
  vm.runInContext(`${remoteStartSource}\nglobalThis.runRemoteStart=remoteStartPlayback;`, context);
  return { calls, context, run: () => context.runRemoteStart() };
}

test("play remoto despierta standby y comprueba la reproducción real", () => {
  assert.match(canal, /async function remoteStartPlayback\(\)/);
  assert.match(canal, /if\(_standby\) standbyOn\(false\)/);
  assert.match(canal, /case 'play':\s+return remoteStartPlayback\(\)/);
  assert.match(canal, /if\(_standby\|\|paused\) return remoteStartPlayback\(\)/);
  assert.match(canal, /await Promise\.resolve\(el\.play\(\)\)/);
});

test("el arranque remoto sale realmente de standby", async () => {
  const h = playbackHarness({ standby: true });
  assert.equal(await h.run(), "executed");
  assert.deepEqual(h.calls.slice(0, 2), ["standby:false", "play"]);
});

test("iOS recibe un fallback de autoplay silencioso antes de declarar fallo", () => {
  assert.match(canal, /const previousMuted=muted;\s+muted=true; applyAudio\(\)/);
  assert.match(canal, /audio silenciado por iOS/);
  assert.match(canal, /muted=previousMuted; applyAudio\(\)/);
  assert.match(canal, /catch\(_\)\{ ackCtrl\(c,'failed'\); \}/);
});

test("si WebKit bloquea el audio, el segundo intento arranca en mudo", async () => {
  const h = playbackHarness({ playResults: [new Error("NotAllowedError"), undefined] });
  assert.equal(await h.run(), "executed");
  assert.equal(h.context.muted, true);
  assert.equal(h.calls.filter((call) => call === "play").length, 2);
  assert.ok(h.calls.includes("audio:true"));
});

test("si también falla el intento mudo, restaura audio y propaga el fallo", async () => {
  const h = playbackHarness({ playResults: [new Error("NotAllowedError"), new Error("AbortError")] });
  await assert.rejects(h.run(), /AbortError/);
  assert.equal(h.context.muted, false);
  assert.ok(h.calls.includes("audio:false"));
  assert.ok(h.calls.includes("tap+:show"));
});

test("la cola no solapa polls y se rearma al volver iOS a primer plano", () => {
  assert.match(canal, /if\(!scr\.screen\|\|_ctrlPolling\) return/);
  assert.match(canal, /if\(!__cmdIds\.length\|\|__cmdPolling\) return/);
  assert.match(canal, /finally\{ __cmdPolling=false; \}/);
  assert.match(canal, /const result=await applyCtrlCmd/);
  assert.match(canal, /document\.addEventListener\('visibilitychange',rearmCtrlOnForeground\)/);
  assert.match(canal, /window\.addEventListener\('pageshow',rearmCtrlOnForeground\)/);
  assert.match(canal, /window\.addEventListener\('online',rearmCtrlOnForeground\)/);
});

test("el mando llama Arrancar a play y distingue acuse fallido de ejecutado", () => {
  assert.match(remote, /\{cmd:'play',\s+ico:'▶', lab:'Arrancar'\}/);
  assert.match(remote, /receipt\.result==='failed'/);
  assert.match(remote, /✗ recibido · no arrancó/);
  assert.match(remote, /✓✓ ejecutado/);
});

test("el mini-mando del CMS puede arrancar y parar el iPhone", () => {
  assert.match(cms, /data-cmd="resume" title="arrancar o reanudar el player \(iPhone\/iOS incluido\)"/);
  assert.match(cms, /data-cmd="standby" title="parar el player y dejar la pantalla en standby"/);
  assert.match(canal, /const status=await executeQueuedCommand\(c\)/);
  assert.match(canal, /await ackQueuedCommand\(c,status\)/);
  assert.match(canal, /CMD_ACK_OUTBOX_KEY='adtv_cmd_ack_outbox:'/);
  assert.match(canal, /persistCmdAckOutbox\(\);   \/\/ primero a disco/);
  assert.match(canal, /await flushCmdAckOutbox\(\);   \/\/ reintento idempotente/);
  assert.match(cms, /CMD_ACK_API=CMD_API\+'\/ack'/);
  assert.match(cms, /ack\.action===action\.token&&typeof ack\.cid==='number'&&ack\.cid===action\.cid&&ack\.cmd===action\.cmd/);
  assert.match(cms, /typeof queued\.cid!=='number'\|\|!Number\.isSafeInteger\(queued\.cid\)\|\|queued\.cid<=0/);
  assert.match(cms, /conic-gradient\(from -90deg,var\(--cmd-ring\) var\(--cmd-progress\)/);
  assert.match(cms, /action\.progress=Math\.min\(\.94/);
  assert.match(cms, /action\.progress=terminal\?1:Math\.min\(\.94,action\.progress\)/);
  assert.match(cms, /ack\.screen===action\.screen/);
});

function queuedAckHarness(stored, replies=[]){
  const writes=[],calls=[];
  const context=vm.createContext({
    Date,Number,JSON,String,Array,Set,Promise,
    scr:{circuit:'osx',screen:'macbookpro16'},VIRTUAL_PLAYER:false,
    CMD_HOSTS:['https://primary.test/locations/cmd','https://fallback.test/locations/cmd'],
    __cmdHost:0,
    LS:()=>JSON.stringify(stored),save:(key,value)=>writes.push({key,value}),
    AbortController:class{constructor(){this.signal={};}abort(){}},setTimeout,clearTimeout,
    fetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return replies.shift()||new Response(null,{status:503});},
    Response,
  });
  vm.runInContext(`${queuedAckSource}\nglobalThis.flush=flushCmdAckOutbox;globalThis.outbox=()=>__cmdAckOutbox;`,context);
  return {context,calls,writes};
}

test("el arranque descarta receipts legacy que el handler rechaza como invalid_ack_reference",()=>{
  const now=Date.now(),action='66f6e863-771f-4418-b465-59b83d689ca3';
  const h=queuedAckHarness([
    {action,queuedAt:now},
    {id:'osx',cid:92,action,status:'executed',queuedAt:now}
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(h.context.outbox())),[
    {id:'osx',cid:92,action,status:'executed',queuedAt:now}
  ]);
});

test("un 400 contractual es terminal: no prueba el alias ni repite el receipt",async()=>{
  const receipt={id:'osx',screen:'macbookpro16',cid:92,action:'66f6e863-771f-4418-b465-59b83d689ca3',status:'executed',queuedAt:Date.now()};
  const h=queuedAckHarness([receipt],[Response.json({error:'invalid_ack_reference'},{status:400})]);
  await h.context.flush();
  assert.equal(h.calls.length,1,"los dos hosts apuntan al mismo coordinator");
  assert.equal(h.calls[0].url,'https://primary.test/locations/cmd/ack');
  assert.deepEqual(JSON.parse(JSON.stringify(h.context.outbox())),[]);
  assert.deepEqual(JSON.parse(h.writes.at(-1).value),[]);
});

test("un 403 de pantalla ajena descarta el receipt sin repetir por el alias ni el siguiente poll",async()=>{
  const receipt={id:'osx',screen:'macbookpro16',cid:92,action:'66f6e863-771f-4418-b465-59b83d689ca3',status:'executed',queuedAt:Date.now()};
  const h=queuedAckHarness([receipt],[Response.json({error:'command_screen_mismatch'},{status:403})]);
  await h.context.flush();
  await h.context.flush();
  assert.equal(h.calls.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.context.outbox())),[]);
  assert.deepEqual(JSON.parse(h.writes.at(-1).value),[]);
});

test("un 503 sí conserva el receipt y prueba el fallback de red",async()=>{
  const receipt={id:'osx',screen:'macbookpro16',cid:92,action:'66f6e863-771f-4418-b465-59b83d689ca3',status:'executed',queuedAt:Date.now()};
  const h=queuedAckHarness([receipt],[new Response(null,{status:503}),new Response(null,{status:503})]);
  await h.context.flush();
  assert.equal(h.calls.length,2);
  assert.equal(h.context.outbox().length,1);
});

test("el contorno solo se cierra con el ACK exacto devuelto por el player", async () => {
  const replies=[
    { seen:true, ack:{ action:'66f6e863-771f-4418-b465-59b83d689ca3', cid:null, cmd:'standby', status:'executed' } },
    { seen:true, ack:{ action:'66f6e863-771f-4418-b465-59b83d689ca3', cid:92, cmd:'standby', screen:'ios-test', status:'executed' } },
  ];
  let reads=0;
  const context=vm.createContext({
    Date,
    REMOTE_TIMEOUT_MS:20000,
    CMD_ACK_API:'https://api.test/locations/cmd/ack',
    encodeURIComponent,
    AbortController:class{ constructor(){ this.signal={}; } abort(){} },
    setTimeout,
    clearTimeout,
    remoteDelay:async()=>{},
    fetch:async()=>({ ok:true, json:async()=>replies[reads++] }),
  });
  vm.runInContext(`${remoteAckSource}\nglobalThis.waitApplied=waitRemoteApplied;`,context);
  const action={id:'ios-test',screen:'ios-test',token:'66f6e863-771f-4418-b465-59b83d689ca3',cid:92,cmd:'standby',startedAt:Date.now()};
  assert.equal(await context.waitApplied(action),'executed');
  assert.equal(reads,2);
});

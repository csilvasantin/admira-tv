import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { missingConfig, gifRpc, deliveryResult } from './core.mjs';

const directory = path.dirname(new URL(import.meta.url).pathname);
const configPath = process.env.PLAYERTAZA_BRIDGE_CONFIG || path.join(directory, 'config.private.json');
const origin = 'https://playertaza.csilvasantin.workers.dev';
const health = { process: true, gifReady: false, target: 'CarlosGdG', slot: 2, state: 'starting', lastJob: null };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let stopping = false, config = {}, bot = null, sdkConfig = '', busy = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(req.url === '/health' ? health : { error: 'not found' }));
});
server.listen(4748, '127.0.0.1');

function log(state, extra = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), state, ...extra }));
}
async function queue(route, body) {
  const res = await fetch(origin + '/api/iphone/bridge/' + route, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + config.bridgeKey },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`cola HTTP ${res.status}`);
  return res.json();
}
async function configure() {
  config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  if (config.slot !== 2 || config.target !== 'CarlosGdG') throw new Error('Destino incorrecto: requiere CarlosGdG slot 2');
  const missing = missingConfig(config);
  health.missing = missing;
  if (missing.length) { health.gifReady = false; health.state = 'awaiting_configuration'; return; }
  const fingerprint = JSON.stringify([config.botToken, config.apiUrl]);
  if (fingerprint !== sdkConfig) {
    bot?.stopIm(); bot?.stopMqtt();
    const { BotManager } = await import(pathToFileURL(path.join(directory, 'sdk', 'Bot_0.2.mjs')));
    bot = new BotManager(config.botToken, config.apiUrl || 'https://us.jeejio.com/im');
    // Preserve existing Bubble slots. bindDevices() would rewrite both slots.
    bot.start({ im: false, mqtt: true });
    sdkConfig = fingerprint;
  }
  health.gifReady = true;
  health.state = busy ? 'sending' : 'ready';
}
async function send(job) {
  busy = true; health.state = 'sending'; health.lastJob = { id: job.id, state: 'sending' };
  let result;
  try {
    const rpc = gifRpc(job, origin);
    const reply = await bot.setDevMessage(config.chat, { bindingIndex: 2 }, rpc);
    result = deliveryResult(reply);
  } catch (error) {
    // Do not log the SDK error object: it may contain credentials or URLs.
    result = { status: 'failed', message: `CarlosGdG: ${error instanceof Error && !/https|token/i.test(error.message) ? error.message.slice(0, 120) : 'error de transporte'}` };
  }
  // Retry reporting without resending the physical RPC.
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await queue('result', { id: job.id, ...result }); break; }
    catch { await delay(1500); }
  }
  health.lastJob = { id: job.id, ...result }; busy = false;
  health.state = result.status; log(result.status, { job: job.id, target: 'CarlosGdG' });
}
let sendPromise = null;
while (!stopping) {
  try {
    await configure();
    if (config.bridgeKey) {
      const reply = await queue('poll', { ready: false, gifReady: health.gifReady && !busy });
      if (reply.job && !busy) sendPromise = send(reply.job);
    }
  } catch (error) {
    health.gifReady = false;
    health.state = error?.code === 'ENOENT' ? 'awaiting_configuration' : 'configuration_or_queue_error';
    // Only log stable diagnostic states, never raw exceptions or config.
  }
  await delay(3000);
}
await sendPromise;
if (config.bridgeKey) await queue('poll', { ready: false, gifReady: false }).catch(() => {});
bot?.stopIm(); bot?.stopMqtt(); server.close(); process.exit(0);

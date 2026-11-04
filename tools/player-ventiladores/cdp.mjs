// Chrome sin ventana + cliente mínimo de DevTools (WebSocket nativo de Node 22).
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const delay = ms => new Promise(r => setTimeout(r, ms));

export async function launchChrome(chromePath, profileDir) {
  await fs.mkdir(profileDir, { recursive: true });
  await fs.rm(path.join(profileDir, 'DevToolsActivePort'), { force: true });
  const args = [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--window-size=400,400',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    // La tarea programada corre con privilegios altos (para pausar L-Connect) y Chrome, si se
    // ve elevado, se relanza sin ellos en otro proceso: el hijo moría y el perfil quedaba tomado.
    '--do-not-de-elevate', 'about:blank'
  ];
  const child = spawn(chromePath, args, { stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 100; i++) {
    const txt = await fs.readFile(path.join(profileDir, 'DevToolsActivePort'), 'utf8').catch(() => '');
    const [port, wsPath] = txt.split(/\r?\n/);
    if (port && wsPath) return { child, ws: `ws://127.0.0.1:${port}${wsPath}` };
    if (child.exitCode !== null) break;
    await delay(150);
  }
  child.kill();
  throw new Error('Chrome no abrió el puerto de DevTools');
}

export class Cdp {
  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.onopen = () => resolve(new Cdp(ws));
      ws.onerror = () => reject(new Error('no se pudo conectar con DevTools'));
    });
  }
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Set(); this.closed = false;
    ws.onmessage = ev => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        for (const h of this.handlers) h(msg.method, msg.params || {}, msg.sessionId);
      }
    };
    ws.onclose = () => {
      this.closed = true;
      for (const { reject } of this.pending.values()) reject(new Error('DevTools cerrado'));
      this.pending.clear();
      for (const h of this.handlers) h('Cdp.closed', {}, undefined);
    };
  }
  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error('DevTools cerrado'));
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(handler) { this.handlers.add(handler); return () => this.handlers.delete(handler); }
  close() { try { this.ws.close(); } catch {} }
}

// Una pestaña de 400×400 con el canal, emitiendo JPEG por screencast.
export async function openPlayerPage(cdp, { url, side, quality, userAgent }) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true, width: side, height: side });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);
  await s('Page.enable');
  await s('Network.enable');
  await s('Network.setUserAgentOverride', { userAgent });
  await s('Emulation.setDeviceMetricsOverride', { width: side, height: side, deviceScaleFactor: 1, mobile: false, screenWidth: side, screenHeight: side });
  await s('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await s('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await s('Page.navigate', { url });
  // Tras navegar (about:blank → https) Chrome cambia de proceso de render y durante
  // ese relevo el screencast responde «Not attached to an active page»: se reintenta.
  const startScreencast = async () => {
    for (let i = 0; ; i++) {
      try { return await s('Page.startScreencast', { format: 'jpeg', quality, maxWidth: side, maxHeight: side, everyNthFrame: 1 }); }
      catch (e) { if (i >= 40 || cdp.closed) throw e; await delay(250); }
    }
  };
  await startScreencast();
  return {
    targetId, sessionId, startScreencast,
    screenshot: () => s('Page.captureScreenshot', { format: 'jpeg', quality }).then(r => Buffer.from(r.data, 'base64')),
    // Miniatura para el gemelo: 160×160, unos 5 KB.
    miniatura: () => s('Page.captureScreenshot', { format: 'jpeg', quality: 55, clip: { x: 0, y: 0, width: side, height: side, scale: 0.4 } })
      .then(r => Buffer.from(r.data, 'base64')),
    evaluate: expression => s('Runtime.evaluate', { expression, returnByValue: true }).then(r => r.result?.value),
    ack: frameId => s('Page.screencastFrameAck', { sessionId: frameId }),
    reload: () => s('Page.reload', { ignoreCache: false }),
    close: () => cdp.send('Target.closeTarget', { targetId }).catch(() => {})
  };
}

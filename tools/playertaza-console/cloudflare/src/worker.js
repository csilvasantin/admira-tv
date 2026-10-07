var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
function gifFromRgb(w, h, rgb) {
  const pal = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    pal[i * 3] = (i >> 5 & 7) * 36;
    pal[i * 3 + 1] = (i >> 2 & 7) * 36;
    pal[i * 3 + 2] = (i & 3) * 85;
  }
  const idx = new Uint8Array(w * h);
  const n = Math.min(w * h, Math.floor(rgb.length / 3));
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3] & 255, g = rgb[i * 3 + 1] & 255, b = rgb[i * 3 + 2] & 255;
    idx[i] = r >> 5 << 5 | g >> 5 << 2 | b >> 6;
  }
  const u16 = /* @__PURE__ */ __name2((v) => Uint8Array.of(v & 255, v >> 8 & 255), "u16");
  const CLEAR = 256, EOI = 257;
  const bits = [];
  const put = /* @__PURE__ */ __name2((code, nbits) => {
    for (let i = 0; i < nbits; i++) bits.push(code >> i & 1);
  }, "put");
  put(CLEAR, 9);
  let run = 0;
  for (let i = 0; i < idx.length; i++) {
    put(idx[i], 9);
    run++;
    if (run >= 100) {
      put(CLEAR, 9);
      run = 0;
    }
  }
  put(EOI, 9);
  while (bits.length % 8) bits.push(0);
  const lzw = new Uint8Array(bits.length / 8);
  for (let i = 0; i < lzw.length; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v |= bits[i * 8 + b] << b;
    lzw[i] = v;
  }
  const parts = [
    new TextEncoder().encode("GIF89a"),
    u16(w),
    u16(h),
    Uint8Array.of(247, 0, 0),
    pal,
    Uint8Array.of(33, 249, 4, 0, 0, 0, 0, 0),
    Uint8Array.of(44, 0, 0, 0, 0),
    u16(w),
    u16(h),
    Uint8Array.of(0),
    Uint8Array.of(8)
  ];
  for (let i = 0; i < lzw.length; i += 255) {
    const chunk = lzw.subarray(i, Math.min(i + 255, lzw.length));
    parts.push(Uint8Array.of(chunk.length), chunk);
  }
  parts.push(Uint8Array.of(0, 59));
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
__name(gifFromRgb, "gifFromRgb");
__name2(gifFromRgb, "gifFromRgb");
function gifFromFrames(w, h, frames) {
  const list = (frames || []).filter((f) => f && f.rgb);
  if (!list.length) return gifFromRgb(w, h, new Uint8Array(w * h * 3));
  const u16 = /* @__PURE__ */ __name2((v) => Uint8Array.of(v & 255, v >> 8 & 255), "u16");
  const pal = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    pal[i * 3] = (i >> 5 & 7) * 36;
    pal[i * 3 + 1] = (i >> 2 & 7) * 36;
    pal[i * 3 + 2] = (i & 3) * 85;
  }
  const toIdx = /* @__PURE__ */ __name2((rgb) => {
    const idx = new Uint8Array(w * h);
    const n = Math.min(w * h, Math.floor(rgb.length / 3));
    for (let i = 0; i < n; i++) {
      const r = rgb[i * 3] & 255, g = rgb[i * 3 + 1] & 255, b = rgb[i * 3 + 2] & 255;
      idx[i] = r >> 5 << 5 | g >> 5 << 2 | b >> 6;
    }
    return idx;
  }, "toIdx");
  const lzwOf = /* @__PURE__ */ __name2((idx) => {
    const CLEAR = 256, EOI = 257, bits = [];
    const put = /* @__PURE__ */ __name((code, nbits) => {
      for (let i = 0; i < nbits; i++) bits.push(code >> i & 1);
    }, "put");
    put(CLEAR, 9);
    let run = 0;
    for (let i = 0; i < idx.length; i++) {
      put(idx[i], 9);
      run++;
      if (run >= 100) {
        put(CLEAR, 9);
        run = 0;
      }
    }
    put(EOI, 9);
    while (bits.length % 8) bits.push(0);
    const lzw = new Uint8Array(bits.length / 8);
    for (let i = 0; i < lzw.length; i++) {
      let v = 0;
      for (let b = 0; b < 8; b++) v |= bits[i * 8 + b] << b;
      lzw[i] = v;
    }
    return lzw;
  }, "lzwOf");
  const parts = [
    new TextEncoder().encode("GIF89a"),
    u16(w),
    u16(h),
    Uint8Array.of(247, 0, 0),
    pal,
    Uint8Array.of(33, 255, 11),
    new TextEncoder().encode("NETSCAPE2.0"),
    Uint8Array.of(3, 1, 0, 0, 0)
  ];
  for (const fr of list) {
    const delay = Math.max(2, Math.min(200, Number(fr.delayCs) || 20));
    const lzw = lzwOf(toIdx(fr.rgb));
    parts.push(
      Uint8Array.of(33, 249, 4, 4, delay & 255, delay >> 8 & 255, 0, 0),
      Uint8Array.of(44, 0, 0, 0, 0),
      u16(w),
      u16(h),
      Uint8Array.of(0),
      Uint8Array.of(8)
    );
    for (let i = 0; i < lzw.length; i += 255) {
      const chunk = lzw.subarray(i, Math.min(i + 255, lzw.length));
      parts.push(Uint8Array.of(chunk.length), chunk);
    }
    parts.push(Uint8Array.of(0));
  }
  parts.push(Uint8Array.of(59));
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
__name(gifFromFrames, "gifFromFrames");
__name2(gifFromFrames, "gifFromFrames");
function inspectGif(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const bad = /* @__PURE__ */ __name2((message) => {
    throw new Error(message);
  }, "bad");
  if (bytes.length > 40960) bad("El GIF supera los 40 KB admitidos por la taza.");
  if (bytes.length < 14) bad("GIF incompleto.");
  const signature = new TextDecoder().decode(bytes.subarray(0, 6));
  if (!["GIF87a", "GIF89a"].includes(signature)) bad("El archivo no es un GIF.");
  const u16 = /* @__PURE__ */ __name2((offset2) => bytes[offset2] | bytes[offset2 + 1] << 8, "u16");
  if (u16(6) !== 32 || u16(8) !== 16) bad("El GIF debe medir exactamente 32\xD716 p\xEDxeles.");
  let offset = 13, frames = 0, durationMs = 0, delay = 0;
  const take = /* @__PURE__ */ __name2((count) => {
    if (offset + count > bytes.length) bad("GIF truncado.");
    const start = offset;
    offset += count;
    return start;
  }, "take");
  if (bytes[10] & 128) take(3 * 2 ** ((bytes[10] & 7) + 1));
  const blocks = /* @__PURE__ */ __name2(() => {
    let count;
    do {
      count = bytes[take(1)];
      take(count);
    } while (count);
  }, "blocks");
  while (offset < bytes.length) {
    const marker = bytes[take(1)];
    if (marker === 59) {
      if (!frames || offset !== bytes.length) bad("GIF sin fotogramas o con datos adicionales.");
      return { width: 32, height: 16, size: bytes.length, frames, animated: frames > 1, durationMs };
    }
    if (marker === 33) {
      const label = bytes[take(1)];
      if (label === 249) {
        if (bytes[take(1)] !== 4) bad("Control de animaci\xF3n no v\xE1lido.");
        const control = take(4);
        delay = u16(control + 1) * 10;
        if (bytes[take(1)] !== 0) bad("Control de animaci\xF3n incompleto.");
      } else blocks();
    } else if (marker === 44) {
      const desc = take(9), x = u16(desc), y = u16(desc + 2), width = u16(desc + 4), height = u16(desc + 6);
      if (!width || !height || x + width > 32 || y + height > 16) bad("Fotograma fuera de la pantalla de 32\xD716.");
      const localPalette = bytes[desc + 8];
      if (localPalette & 128) take(3 * 2 ** ((localPalette & 7) + 1));
      else if (!(bytes[10] & 128)) bad("GIF sin paleta de colores.");
      const codeSize = bytes[take(1)];
      if (codeSize < 2 || codeSize > 8) bad("Compresi\xF3n GIF no v\xE1lida.");
      if (bytes[offset] === 0) bad("Fotograma vac\xEDo.");
      blocks();
      frames++;
      durationMs += delay;
      delay = 0;
    } else bad("Bloque GIF no reconocido.");
  }
  bad("Falta el cierre del GIF.");
}
__name(inspectGif, "inspectGif");
__name2(inspectGif, "inspectGif");
var headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
var json = /* @__PURE__ */ __name2((body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } }), "json");
var fail = /* @__PURE__ */ __name2((error, status = 400) => json({ ok: false, error }, status), "fail");
var cookieName = "__Host-taza-editor";
var decodeGif = /* @__PURE__ */ __name2((base64) => {
  if (typeof base64 !== "string" || base64.length > 54616 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error("GIF codificado incorrectamente.");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  inspectGif(bytes);
  return bytes;
}, "decodeGif");
var validId = /* @__PURE__ */ __name2((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id), "validId");
function validText(text) {
  return typeof text === "string" && text.trim().length > 0 && [...text].length <= 32 && !/[\x00-\x1f\x7f]/.test(text) && !text.trimStart().startsWith("/");
}
__name(validText, "validText");
__name2(validText, "validText");
async function equal(a, b) {
  if (!a || !b) return false;
  const digest = /* @__PURE__ */ __name2((x2) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(x2)), "digest");
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  const xx = new Uint8Array(x), yy = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xx.length; i++) diff |= xx[i] ^ yy[i];
  return diff === 0;
}
__name(equal, "equal");
__name2(equal, "equal");
async function iphoneRoute(req, env) {
  const url = new URL(req.url), route = url.pathname.replace(/\/+$/, "");
  if (!env.IPHONE_EDITOR_KEY || !env.IPHONE_BRIDGE_KEY || !env.IPHONE_QUEUE) return fail("Env\xEDo con iPhone a\xFAn sin configurar.", 503);
  if (/^\/api\/iphone\/content\/[0-9a-f-]{36}\.gif$/.test(route) && req.method === "GET") return env.IPHONE_QUEUE.get(env.IPHONE_QUEUE.idFromName("pixeltext")).fetch(req);
  if (req.headers.get("origin") && req.headers.get("origin") !== url.origin) return fail("Origen no permitido.", 403);
  if (req.method === "OPTIONS") return fail("Origen no permitido.", 403);
  if (Number(req.headers.get("content-length") || 0) > 65536) return fail("Petici\xF3n demasiado grande.", 413);
  const bridge = route.startsWith("/api/iphone/bridge/");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const cookie = req.headers.get("cookie")?.split(";").map((x) => x.trim()).find((x) => x.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  if (route === "/api/iphone/session" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    if (!await equal(body.key, env.IPHONE_EDITOR_KEY)) return fail("Clave del editor incorrecta.", 401);
    return json({ ok: true }, 200, { "set-cookie": `${cookieName}=${env.IPHONE_EDITOR_KEY}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000` });
  }
  if (!await equal(bridge ? bearer : cookie || bearer, bridge ? env.IPHONE_BRIDGE_KEY : env.IPHONE_EDITOR_KEY)) return fail("Vincula este navegador al iPhone para enviar.", 401);
  return env.IPHONE_QUEUE.get(env.IPHONE_QUEUE.idFromName("pixeltext")).fetch(req);
}
__name(iphoneRoute, "iphoneRoute");
__name2(iphoneRoute, "iphoneRoute");
var IPhoneQueue = class {
  static {
    __name(this, "IPhoneQueue");
  }
  static {
    __name2(this, "IPhoneQueue");
  }
  constructor(state) {
    this.state = state;
  }
  async fetch(req) {
    let body = {};
    if (req.method === "POST") {
      const reader = req.body?.getReader();
      let size = 0, chunks = [];
      if (reader) while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          return fail("Petici\xF3n demasiado grande.", 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return fail("JSON incorrecto.");
      }
    }
    return this.state.blockConcurrencyWhile(() => this.route(req, body));
  }
  async route(req, body, source = "manual") {
    const s = this.state.storage, url = new URL(req.url), p = url.pathname;
    const now = Date.now();
    let active = await s.get("active");
    if (active) {
      const old = await s.get("job:" + active);
      if (!old || ["queued", "sending"].includes(old.status) && now > old.deadline) {
        if (old) {
          old.status = old.status === "queued" ? "expired" : "uncertain";
          old.message = old.status === "expired" ? "El env\xEDo caduc\xF3 antes de llegar al iPhone." : "No se pudo confirmar el env\xEDo. Comprueba la taza antes de repetir.";
          old.updatedAt = now;
          await s.put("job:" + active, old);
        }
        await s.delete("active");
        active = null;
      }
    }
    if (p.startsWith("/api/iphone/content/") && req.method === "GET") {
      const id = p.split("/").at(-1).replace(/\.gif$/, "");
      const job = validId(id) ? await s.get("job:" + id) : null;
      if (!job || job.kind !== "gif" || now > job.createdAt + 864e5) return fail("GIF caducado o desconocido.", 404);
      return new Response(decodeGif(job.gif), { headers: { "content-type": "image/gif", "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
    }
    if (p === "/api/iphone/activity" && req.method === "GET") return json({ ok: true, ...await s.get("activity") || { enabled: false }, carbonId: "carlos3-0", name: "Carlos3.0" });
    if (p === "/api/iphone/activity" && req.method === "POST") {
      if (typeof body.enabled !== "boolean") return fail("Indica si activar o pausar.");
      const cfg = await s.get("activity") || {};
      if (cfg.enabled !== body.enabled) {
        cfg.lastKey = "";
        cfg.manualUntil = 0;
      }
      cfg.enabled = body.enabled;
      cfg.updatedAt = now;
      if (!cfg.enabled && active) {
        const job = await s.get("job:" + active);
        if (job?.source === "carbon" && job.status === "queued") {
          job.status = "cancelled";
          job.message = "Actividad autom\xE1tica pausada antes de enviar.";
          job.updatedAt = now;
          await s.put("job:" + active, job);
          await s.delete("active");
          active = null;
        }
      }
      await s.put("activity", cfg);
      return json({ ok: true, ...cfg, carbonId: "carlos3-0", name: "Carlos3.0" });
    }
    if (p === "/api/iphone/bridge/activity" && req.method === "POST") {
      const cfg = await s.get("activity") || {};
      if (!cfg.enabled) return json({ ok: true, action: "paused" });
      const snap = body.snapshot;
      if (!snap || snap.carbonId !== "carlos3-0" || !["working", "idle", "unavailable"].includes(snap.state) || typeof snap.task !== "string" || snap.task.length > 200 || !Number.isFinite(snap.checkedAt) || snap.checkedAt > now + 3e4 || now - snap.checkedAt > 15e4) return fail("Actividad incorrecta o caducada.");
      const key = JSON.stringify([snap.carbonId, snap.state, snap.task]);
      cfg.snapshot = { name: "Carlos3.0", state: snap.state, task: snap.task, checkedAt: snap.checkedAt };
      cfg.checkedAt = now;
      await s.put("activity", cfg);
      if (cfg.lastKey === key) return json({ ok: true, action: "unchanged" });
      if (active || now < (cfg.manualUntil || 0)) return json({ ok: true, action: "waiting" });
      const result = await this.route(new Request(url.origin + "/api/iphone/jobs", { method: "POST" }), { id: crypto.randomUUID(), kind: "gif", gif: body.gif }, "carbon");
      if (result.ok) {
        const job = await result.clone().json();
        cfg.lastKey = key;
        cfg.lastJobId = job.id;
        await s.put("activity", cfg);
        return json({ ok: true, action: "queued", id: job.id });
      }
      return result;
    }
    if (p === "/api/iphone/status" && req.method === "GET") {
      const hb = await s.get("heartbeat");
      return json({
        ok: true,
        ready: !!hb?.ready && now - hb.ts < 15e3,
        gifReady: !!hb?.gifReady && now - hb.ts < 15e3,
        activeId: active || null,
        message: hb?.ready && now - hb.ts < 15e3 ? "iPhone conectado \xB7 Bubble" : "Conecta y desbloquea el iPhone; inicia el puente en el Mac."
      });
    }
    if (p === "/api/iphone/jobs" && req.method === "POST") {
      let info;
      if (body.kind === "gif") {
        try {
          info = inspectGif(decodeGif(body.gif));
        } catch (error) {
          return fail(error.message);
        }
      }
      if (!validId(body.id) || body.kind !== "gif" && !validText(body.text)) return fail("Escribe de 1 a 32 caracteres, sin saltos de l\xEDnea ni comandos.");
      const old = await s.get("job:" + body.id);
      if (old) return (body.kind === "gif" ? old.kind === "gif" && old.gif === body.gif : old.kind !== "gif" && old.text === body.text) ? json(old) : fail("Identificador ya usado con otro contenido.", 409);
      if (active) return fail("Hay un env\xEDo en curso. Espera a que termine.", 409);
      const hb = await s.get("heartbeat");
      if (!(body.kind === "gif" ? hb?.gifReady : hb?.ready) || now - hb.ts >= 15e3) return fail(body.kind === "gif" ? "El puente para GIF no est\xE1 disponible. In\xEDcialo en el Mac." : "El iPhone no est\xE1 disponible. Con\xE9ctalo y desbloqu\xE9alo.", 503);
      const job = {
        ok: true,
        id: body.id,
        text: body.text,
        status: "queued",
        createdAt: now,
        updatedAt: now,
        deadline: now + 3e4,
        message: "En cola para el iPhone."
      };
      if (body.kind === "gif") {
        delete job.text;
        Object.assign(job, { kind: "gif", gif: body.gif, info, contentUrl: url.origin + "/api/iphone/content/" + job.id + ".gif", message: "GIF en cola para Bubble." });
      }
      const cfg = await s.get("activity");
      if (source === "carbon") {
        job.source = "carbon";
        job.activity = cfg?.snapshot;
      } else if (cfg?.enabled) {
        cfg.manualUntil = now + 12e4;
        cfg.lastKey = "";
        await s.put("activity", cfg);
      }
      await s.put({ ["job:" + job.id]: job, active: job.id });
      return json(job, 202);
    }
    if (p.startsWith("/api/iphone/jobs/") && req.method === "GET") {
      const id = p.split("/").at(-1);
      if (!validId(id)) return fail("Identificador incorrecto.");
      const job = await s.get("job:" + id);
      return job ? json(job) : fail("Env\xEDo desconocido.", 404);
    }
    if (p === "/api/iphone/confirm" && req.method === "POST") {
      const job = validId(body.id) ? await s.get("job:" + body.id) : null;
      if (!job || !["sent_to_bubble", "uncertain", "confirmed"].includes(job.status)) return fail("No hay un env\xEDo que confirmar.", 409);
      const changed = job.status !== "confirmed";
      job.status = "confirmed";
      job.updatedAt = now;
      job.message = "Recepci\xF3n en la taza confirmada por ti.";
      await s.put("job:" + job.id, job);
      return json({ ...job, logEvent: changed });
    }
    if (p === "/api/iphone/bridge/poll" && req.method === "POST") {
      await s.put("heartbeat", { ts: now, ready: body.ready === true, gifReady: body.gifReady === true });
      const activityEnabled = !!(await s.get("activity"))?.enabled;
      if (!active) return json({ ok: true, job: null, activityEnabled });
      const job = await s.get("job:" + active);
      if (job.status !== "queued" || (job.kind === "gif" ? body.gifReady !== true : body.ready !== true)) return json({ ok: true, job: null });
      job.status = "sending";
      job.updatedAt = now;
      job.deadline = now + 9e4;
      job.message = "Enviando desde Bubble\u2026";
      await s.put("job:" + job.id, job);
      return json({ ok: true, job });
    }
    if (p === "/api/iphone/bridge/result" && req.method === "POST") {
      const job = validId(body.id) ? await s.get("job:" + body.id) : null;
      if (!job) return fail("Env\xEDo desconocido.", 404);
      if (!["sending", "uncertain"].includes(job.status)) return json(job);
      if (!["sent_to_bubble", "failed", "uncertain"].includes(body.status)) return fail("Estado incorrecto.");
      job.status = body.status;
      job.updatedAt = now;
      job.message = body.status === "sent_to_bubble" ? job.kind === "gif" ? "La taza ha aceptado el GIF. Comprueba la pantalla." : "Enviado a Bubble. Comprueba la pantalla de la taza." : String(body.message || "No se pudo completar el env\xEDo.").slice(0, 200);
      await s.put("job:" + job.id, job);
      if (active === job.id) await s.delete("active");
      return json({ ...job, logEvent: true });
    }
    return fail("Ruta no disponible.", 404);
  }
};
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var VERSION = "v.07.10.2026.r2.store-binding";
var ADMIRA_SCREEN = "playertaza";
var ADMIRA_LIVE_SCREENS = ["playertaza", "samsung-galaxy-fold-8-mupi", "admiranext-mupi"];
var ADMIRA_IDENT = "https://admira.tv/og-admira.png";
var GIF_MAX = 40 * 1024;
function identPixels() {
  const w = 32, h = 16, rgb = new Uint8Array(w * h * 3);
  const font = {
    A: [7, 5, 7, 5, 5],
    D: [6, 5, 5, 5, 6],
    I: [7, 2, 2, 2, 7],
    M: [5, 7, 5, 5, 5],
    R: [7, 5, 7, 5, 5]
  };
  const set = /* @__PURE__ */ __name22((x2, y, r, g, b) => {
    if (x2 < 0 || y < 0 || x2 >= w || y >= h) return;
    const i = (y * w + x2) * 3;
    rgb[i] = r;
    rgb[i + 1] = g;
    rgb[i + 2] = b;
  }, "set");
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = 4;
    rgb[i + 1] = 8;
    rgb[i + 2] = 12;
  }
  let x = 1;
  for (const ch of "ADMIRA") {
    const g = font[ch];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (g[row] & 1 << 2 - col) set(x + col, 5 + row, 61, 255, 212);
      }
    }
    x += 4;
  }
  for (let xi = 2; xi < 30; xi++) set(xi, 13, 255, 77, 141);
  return rgb;
}
__name(identPixels, "identPixels");
__name2(identPixels, "identPixels");
__name22(identPixels, "identPixels");
function isGif32(buf) {
  if (!buf || buf.byteLength < 14 || buf.byteLength > GIF_MAX) return false;
  const b = new Uint8Array(buf);
  if (b[0] !== 71 || b[1] !== 73 || b[2] !== 70 || b[3] !== 56) return false;
  const w = b[6] | b[7] << 8, h = b[8] | b[9] << 8;
  return w === 32 && h === 16;
}
__name(isGif32, "isGif32");
__name2(isGif32, "isGif32");
__name22(isGif32, "isGif32");
function slimAdmiraItem(it, source) {
  if (!it) return null;
  const type = String(it.assetType || it.type || "image").toLowerCase();
  const url = String(it.url || it.src || "");
  let thumbnail = String(it.thumbnail || it.poster || it.thumb || "");
  if (!thumbnail && (type === "image" || type === "foto")) thumbnail = url;
  if (!thumbnail) thumbnail = ADMIRA_IDENT;
  return {
    id: String(it.id || it.assetId || source),
    title: String(it.title || it.prompt || it.name || "Admira.tv").slice(0, 80),
    type,
    url,
    thumbnail,
    source
  };
}
__name(slimAdmiraItem, "slimAdmiraItem");
__name2(slimAdmiraItem, "slimAdmiraItem");
__name22(slimAdmiraItem, "slimAdmiraItem");
async function fetchAdmiraScreen(scr) {
  try {
    const r = await fetch(`https://api.admira.store/signage/now?screen=${encodeURIComponent(scr)}`);
    const d = await r.json();
    if (d && d.item) return { live: true, fallback: false, item: slimAdmiraItem(d.item, "signage-now"), screen: scr };
  } catch (e) {
  }
  try {
    const r = await fetch(`https://admira.tv/api/playlist?screen=${encodeURIComponent(scr)}&_=${Date.now()}`);
    const d = await r.json();
    const items = d && d.draft && Array.isArray(d.draft.items) ? d.draft.items : [];
    if (items[0]) return { live: false, fallback: false, item: slimAdmiraItem(items[0], "playlist"), screen: scr };
  } catch (e) {
  }
  return null;
}
__name(fetchAdmiraScreen, "fetchAdmiraScreen");
async function admiraNow(screen) {
  const scr = String(screen || ADMIRA_SCREEN).slice(0, 40) || ADMIRA_SCREEN;
  const canal = `https://admira.tv/canal.html?embed=mupi&screen=${encodeURIComponent(scr)}`;
  const order = [scr, ...ADMIRA_LIVE_SCREENS.filter((s) => s !== scr)];
  let hit = null;
  const seen = [];
  for (const s of order) {
    const one = await fetchAdmiraScreen(s);
    if (one && one.item) {
      seen.push({ screen: s, title: one.item.title, artist: artistFromTitle(one.item.title), live: one.live });
      if (!hit) hit = one;
      if (artistFromTitle(one.item.title) && (s === scr || !artistFromTitle(hit.item && hit.item.title))) hit = one;
    }
  }
  const item = hit && hit.item || slimAdmiraItem({ id: "admira-ident", title: "Admira.tv", type: "image", url: ADMIRA_IDENT, thumbnail: ADMIRA_IDENT }, "ident");
  const artist = artistFromTitle(item.title);
  return {
    ok: true,
    screen: hit && hit.screen || scr,
    live: !!(hit && hit.live),
    fallback: !hit,
    item,
    artist,
    zones: { jackson: artist === "jackson", queen: artist === "queen" },
    seen,
    canal
  };
}
__name(admiraNow, "admiraNow");
__name2(admiraNow, "admiraNow");
__name22(admiraNow, "admiraNow");
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version"
};
function json2(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS }
  });
}
__name(json2, "json2");
__name2(json2, "json");
__name22(json2, "json");
function telegramConfigured(env) {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}
__name(telegramConfigured, "telegramConfigured");
__name2(telegramConfigured, "telegramConfigured");
__name22(telegramConfigured, "telegramConfigured");
function fromTelegram(author, text, via) {
  const v = String(via || "").toLowerCase();
  const t = String(text || "");
  const a = String(author || "");
  return v === "telegram" || t.startsWith("[Telegram]") || /telegram/i.test(a);
}
__name(fromTelegram, "fromTelegram");
__name2(fromTelegram, "fromTelegram");
__name22(fromTelegram, "fromTelegram");
async function telegramSend(env, text, withPhoto) {
  if (!telegramConfigured(env)) return { ok: false, error: "sin secreto" };
  const api = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
  const chat = String(env.TELEGRAM_CHAT_ID);
  try {
    if (withPhoto) {
      const bin = await env.KV.get("snap", { type: "arrayBuffer" });
      if (bin && bin.byteLength) {
        const form = new FormData();
        form.set("chat_id", chat);
        form.set("caption", text.slice(0, 1024));
        form.set("photo", new Blob([bin], { type: "image/jpeg" }), "playertaza.jpg");
        const r2 = await fetch(`${api}/sendPhoto`, { method: "POST", body: form });
        const d2 = await r2.json().catch(() => ({}));
        return { ok: !!d2.ok, error: d2.description || null };
      }
    }
    const body = new URLSearchParams({
      chat_id: chat,
      text: text.slice(0, 3900),
      disable_web_page_preview: "true"
    });
    const r = await fetch(`${api}/sendMessage`, { method: "POST", body });
    const d = await r.json().catch(() => ({}));
    return { ok: !!d.ok, error: d.description || null };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 180) };
  }
}
__name(telegramSend, "telegramSend");
__name2(telegramSend, "telegramSend");
__name22(telegramSend, "telegramSend");
async function appendLog(env, author, text, via, mirror = true) {
  const messages = JSON.parse(await env.KV.get("log") || "[]");
  const message = {
    ts: Date.now(),
    author,
    text,
    via: via || (fromTelegram(author, text, "") ? "telegram" : /smith/i.test(author) ? "mesa" : "web")
  };
  messages.push(message);
  await env.KV.put("log", JSON.stringify(messages.slice(-200)));
  let telegram = { ok: false, skipped: true };
  if (mirror && !fromTelegram(message.author, message.text, message.via)) {
    const line = `PlayerTaza \xB7 ${message.author}: ${message.text}`;
    const photo = /carlos/i.test(message.author) && message.via === "web";
    telegram = await telegramSend(env, line, photo);
    await env.KV.put("telegram", JSON.stringify({
      ok: !!telegram.ok,
      error: telegram.error || null,
      ts: Date.now(),
      skipped: false
    }));
  }
  return { message, telegram };
}
__name(appendLog, "appendLog");
__name2(appendLog, "appendLog");
__name22(appendLog, "appendLog");
var FONT5 = {
  " ": [0, 0, 0, 0, 0],
  "-": [0, 0, 7, 0, 0],
  ".": [0, 0, 0, 0, 2],
  ":": [0, 2, 0, 2, 0],
  "?": [7, 1, 2, 0, 2],
  "0": [7, 5, 5, 5, 7],
  "1": [2, 6, 2, 2, 7],
  "2": [7, 1, 7, 4, 7],
  "3": [7, 1, 7, 1, 7],
  "4": [5, 5, 7, 1, 1],
  "5": [7, 4, 7, 1, 7],
  "6": [7, 4, 7, 5, 7],
  "7": [7, 1, 2, 2, 2],
  "8": [7, 5, 7, 5, 7],
  "9": [7, 5, 7, 1, 7],
  A: [2, 5, 7, 5, 5],
  B: [6, 5, 6, 5, 6],
  C: [7, 4, 4, 4, 7],
  D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4],
  G: [7, 4, 5, 5, 7],
  H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7],
  J: [1, 1, 1, 5, 7],
  K: [5, 6, 4, 6, 5],
  L: [4, 4, 4, 4, 7],
  M: [5, 7, 5, 5, 5],
  N: [5, 7, 7, 5, 5],
  O: [7, 5, 5, 5, 7],
  P: [7, 5, 7, 4, 4],
  Q: [7, 5, 5, 7, 1],
  R: [7, 5, 6, 5, 5],
  S: [7, 4, 7, 1, 7],
  T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7],
  V: [5, 5, 5, 5, 2],
  W: [5, 5, 5, 7, 5],
  X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7]
};
function asciiMug(s) {
  let t = String(s || "");
  try {
    t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (_) {
  }
  t = t.replace(/[\u2018\u2019\u201A\u2032\u0060\u00B4']/g, "");
  t = t.replace(/[\u201C\u201D\u00AB\u00BB]/g, "");
  t = t.replace(/[\u2013\u2014]/g, "-");
  t = t.replace(/[·•|/\\]/g, " ");
  t = t.replace(/[^A-Za-z0-9 .:\-]/g, " ");
  t = t.replace(/\s+/g, " ").trim().toUpperCase();
  return t;
}
__name(asciiMug, "asciiMug");
function statusPixels(name, verb, offsetX = 0) {
  const w = 32, h = 16, rgb = new Uint8Array(w * h * 3);
  const set = /* @__PURE__ */ __name((x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 3;
    rgb[i] = r;
    rgb[i + 1] = g;
    rgb[i + 2] = b;
  }, "set");
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = 4;
    rgb[i + 1] = 8;
    rgb[i + 2] = 12;
  }
  const line = /* @__PURE__ */ __name((text, y, r, g, b) => {
    const raw = asciiMug(text).slice(0, 40);
    let x = -Math.max(0, Number(offsetX) || 0);
    for (const ch of raw) {
      const glyph = FONT5[ch] || FONT5[" "];
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if (glyph[row] & 1 << 2 - col) set(x + col, y + row, r, g, b);
        }
      }
      x += 4;
    }
  }, "line");
  line(name, 1, 61, 255, 212);
  line(verb, 10, 255, 77, 141);
  for (let xi = 0; xi < 32; xi++) set(xi, 8, 20, 40, 48);
  return rgb;
}
__name(statusPixels, "statusPixels");
function statusScrollGif(name, verb) {
  const n = asciiMug(name).slice(0, 36);
  const v = asciiMug(verb).slice(0, 36);
  const need = Math.max(n.length, v.length) * 4;
  if (need <= 32) return gifFromRgb(32, 16, statusPixels(n, v, 0));
  const gap = 12;
  const scrollDist = need - 32 + gap;
  let step = 2;
  let frames = [];
  const build = /* @__PURE__ */ __name((st) => {
    const list = [];
    for (let ox = 0; ox <= scrollDist; ox += st) {
      list.push({ rgb: statusPixels(n, v, ox), delayCs: 14 });
    }
    if (list.length) {
      list[0].delayCs = 36;
      list[list.length - 1].delayCs = 42;
    }
    return list;
  }, "build");
  frames = build(step);
  let gif = gifFromFrames(32, 16, frames);
  while (gif.byteLength > GIF_MAX && step < 8) {
    step += 1;
    frames = build(step);
    gif = gifFromFrames(32, 16, frames);
  }
  if (gif.byteLength > GIF_MAX) {
    return gifFromRgb(32, 16, statusPixels(n.slice(0, 8), v.slice(0, 8), 0));
  }
  return gif;
}
__name(statusScrollGif, "statusScrollGif");
function artistFromTitle(title) {
  const t = String(title || "").toLowerCase();
  if (/jackson|thriller|beat it|billie jean|smooth criminal|bad \(/.test(t)) return "jackson";
  if (/\bqueen\b|bohemian|we will rock|we are the champions|radio ga ga|freddie mercury|another one bites/.test(t)) return "queen";
  return null;
}
__name(artistFromTitle, "artistFromTitle");
function rgbFrame(paint) {
  const w = 32, h = 16, rgb = new Uint8Array(w * h * 3);
  const set = /* @__PURE__ */ __name((x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 3;
    rgb[i] = r;
    rgb[i + 1] = g;
    rgb[i + 2] = b;
  }, "set");
  const fill = /* @__PURE__ */ __name((r, g, b) => {
    for (let i = 0; i < rgb.length; i += 3) {
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
    }
  }, "fill");
  paint({ set, fill, w, h, rgb });
  return rgb;
}
__name(rgbFrame, "rgbFrame");
function namePixels(zone) {
  return zone === "queen" ? statusPixels("QUEEN", "FREDDIE") : statusPixels("MICHAEL", "JACKSON");
}
__name(namePixels, "namePixels");
function jacksonAnim(f) {
  return rgbFrame(({ set, fill }) => {
    fill(10, 0, 18);
    set(27, 1, 255, 220, 70);
    set(28, 1, 255, 220, 70);
    set(27, 2, 255, 220, 70);
    set(28, 2, 255, 220, 70);
    const x = 5 + (f === 1 ? 2 : f === 2 ? 4 : f === 3 ? 1 : 0);
    for (let i = 2; i <= 7; i++) set(x + i, 2, 16, 16, 18);
    set(x + 4, 3, 48, 28, 18);
    set(x + 5, 3, 48, 28, 18);
    set(x + 4, 4, 48, 28, 18);
    set(x + 5, 4, 48, 28, 18);
    for (let y = 5; y <= 9; y++) for (let i = 3; i <= 6; i++) set(x + i, y, 210, 24, 48);
    const gx = x + (f % 2 ? 8 : 7);
    set(gx, 7, 255, 255, 255);
    set(gx, 8, 255, 255, 255);
    const leg = f % 2;
    set(x + 4, 10, 18, 18, 28);
    set(x + 5, 10, 18, 18, 28);
    set(x + 3 + leg, 11, 18, 18, 28);
    set(x + 6 - leg, 11, 18, 18, 28);
    set(x + 2 + leg, 12, 18, 18, 28);
    set(x + 7 - leg, 12, 18, 18, 28);
    set(x + 2 + leg, 13, 240, 240, 245);
    set(x + 7 - leg, 13, 40, 40, 48);
    if (f === 2) {
      set(3, 2, 255, 255, 255);
      set(11, 1, 255, 220, 160);
      set(22, 4, 255, 80, 140);
    }
  });
}
__name(jacksonAnim, "jacksonAnim");
function queenAnim(f) {
  return rgbFrame(({ set, fill }) => {
    fill(18, 4, 28);
    const y = 2 + (f === 1 || f === 3 ? 0 : 1);
    const gold = [255, 196, 48];
    for (let x = 8; x <= 23; x++) set(x, y + 5, gold[0], gold[1], gold[2]);
    set(10, y + 4, ...gold);
    set(11, y + 3, ...gold);
    set(12, y + 2, ...gold);
    set(13, y + 3, ...gold);
    set(15, y + 4, ...gold);
    set(16, y + 2, ...gold);
    set(17, y + 1, ...gold);
    set(18, y + 2, ...gold);
    set(20, y + 4, ...gold);
    set(21, y + 3, ...gold);
    set(22, y + 2, ...gold);
    set(12, y + 4, 255, 50, 90);
    set(17, y + 3, 80, 190, 255);
    set(21, y + 4, 90, 255, 140);
    const qx = 12, qy = 9;
    for (let i = 1; i <= 6; i++) {
      set(qx + i, qy, 255, 220, 80);
      set(qx + i, qy + 5, 255, 220, 80);
    }
    for (let i = 1; i <= 4; i++) {
      set(qx, qy + i, 255, 220, 80);
      set(qx + 7, qy + i, 255, 220, 80);
    }
    set(qx + 6, qy + 5, 255, 220, 80);
    set(qx + 7, qy + 6, 255, 220, 80);
    if (f % 2) set(16, y, 255, 255, 220);
  });
}
__name(queenAnim, "queenAnim");
function animGif(zone) {
  const frames = [0, 1, 2, 3].map((f) => ({
    rgb: zone === "queen" ? queenAnim(f) : jacksonAnim(f),
    delayCs: 18
  }));
  return gifFromFrames(32, 16, frames);
}
__name(animGif, "animGif");
async function presetAnimGif(env, zone) {
  const paths = zone === "queen" ? ["/demos/mj-queen/queen-dsmn-32x16.gif", "/mj-queen/queen-dsmn-32x16.gif"] : ["/demos/mj-queen/mj-bad-32x16.gif", "/mj-queen/mj-bad-32x16.gif"];
  if (env && env.ASSETS) {
    for (const path of paths) {
      try {
        const res = await env.ASSETS.fetch(new Request("https://assets.local" + path));
        if (res && res.ok) {
          const buf = new Uint8Array(await res.arrayBuffer());
          if (buf.byteLength > 14 && buf.byteLength <= GIF_MAX) {
            return { gif: buf, preset: path, source: "assets" };
          }
        }
      } catch (_) {
      }
    }
  }
  return { gif: animGif(zone), preset: null, source: "procedural" };
}
__name(presetAnimGif, "presetAnimGif");
function splitStatus(args) {
  const nameIn = String(args && (args.name || args.author) || "").trim().slice(0, 28);
  const verbIn = String(args && (args.verb || args.task) || "").trim().slice(0, 40);
  let text = String(args && args.text || "").trim().slice(0, 64);
  let name = nameIn, verb = verbIn;
  if (!name && !verb && text) {
    const parts = text.split(/\s*[·•|]\s*/);
    if (parts.length >= 2) {
      name = parts[0].slice(0, 16);
      verb = parts.slice(1).join(" ").slice(0, 24);
    } else {
      const sp = text.split(/\s+/);
      name = (sp.shift() || "").slice(0, 16);
      verb = sp.join(" ").slice(0, 24);
    }
  }
  if (name && !verb) verb = "online";
  if (!name && verb) name = "anon";
  if (!name && !verb) return { error: "name+verb o text requerido" };
  if (!text) text = name + " \xB7 " + verb;
  return {
    name,
    verb,
    text,
    via: String(args && args.via || "mcp").slice(0, 20) || "mcp",
    source: String(args && args.source || "").slice(0, 80)
  };
}
__name(splitStatus, "splitStatus");
async function iphoneSnapshot(env) {
  if (!env.IPHONE_QUEUE) return { ready: false, gifReady: false };
  try {
    const stub = env.IPHONE_QUEUE.get(env.IPHONE_QUEUE.idFromName("pixeltext"));
    const res = await stub.fetch(new Request("https://playertaza.internal/api/iphone/status"));
    return await res.json();
  } catch {
    return { ready: false, gifReady: false };
  }
}
__name(iphoneSnapshot, "iphoneSnapshot");
async function enqueueMugGif(env, gifBytes, origin) {
  if (!env.IPHONE_QUEUE) return { queued: false, reason: "sin cola iPhone" };
  try {
    const bytes = gifBytes instanceof Uint8Array ? gifBytes : new Uint8Array(gifBytes);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const id = crypto.randomUUID();
    const publicOrigin = String(origin || "https://playertaza.csilvasantin.workers.dev").replace(/\/+$/, "");
    const req = new Request(publicOrigin + "/api/iphone/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, kind: "gif", gif: btoa(bin) })
    });
    const stub = env.IPHONE_QUEUE.get(env.IPHONE_QUEUE.idFromName("pixeltext"));
    const res = await stub.fetch(req);
    const data = await res.json().catch(() => ({}));
    return {
      queued: res.ok || res.status === 202,
      http: res.status,
      id: data.id || id,
      message: data.message || data.error || "",
      status: data.status || null
    };
  } catch (e) {
    return { queued: false, reason: String(e).slice(0, 180) };
  }
}
__name(enqueueMugGif, "enqueueMugGif");
async function readMugStatus(env, origin) {
  const status = JSON.parse(await env.KV.get("mugStatus") || "null");
  const gifAt = Number(await env.KV.get("gifAt") || 0);
  return {
    ok: true,
    status: status || { name: "ADMIRA", verb: "ident", text: "ADMIRA \xB7 ident", ts: 0, via: "ident" },
    gif_url: origin + "/gif.gif",
    gif_at: gifAt,
    yokup_project: "playertaza"
  };
}
__name(readMugStatus, "readMugStatus");
async function writeMugStatus(env, origin, args) {
  const binding = JSON.parse(await env.KV.get(STORE_BINDING_KEY) || 'null');
  if(!permitsStore(binding,args))return {ok:false,error:'Esta taza está asociada a '+binding.name+'; origen ajeno bloqueado',binding};
  const parsed = splitStatus(args || {});
  if (parsed.error) return { ok: false, error: parsed.error };
  const prev = JSON.parse(await env.KV.get("mugStatus") || "null");
  if (prev && Date.now() - (prev.ts || 0) < 3e3) {
    return { ok: false, error: "espera 3 s entre escrituras", retry_ms: 3e3 - (Date.now() - prev.ts) };
  }
  const rec = { ...parsed, storeId:binding?.storeId||null, screen:binding?.screen||null, bindingRevision:binding?.revision||null, ts: Date.now(), name: asciiMug(parsed.name), verb: asciiMug(parsed.verb), text: asciiMug(parsed.text) };
  const gif = statusScrollGif(rec.name, rec.verb);
  await env.KV.put("gif", gif);
  await env.KV.put("gifAt", String(rec.ts));
  await env.KV.put("mugStatus", JSON.stringify(rec));
  const bubble = await enqueueMugGif(env, gif, origin);
  if(bubble.queued&&binding)await env.KV.put('projectDelivery',JSON.stringify({key:binding.revision+':'+rec.ts,id:bubble.id,ts:Date.now()}));
  await appendLog(env, rec.name, rec.text + (rec.source ? " \xB7 " + rec.source : ""), rec.via, false).catch(() => {
  });
  return {
    ok: true,
    status: rec,
    gif_url: origin + "/gif.gif",
    bytes: gif.byteLength,
    width: 32,
    height: 16,
    talPlayGif: { gifContent: { size: gif.byteLength, type: "image/gif", url: origin + "/gif.gif" } },
    bubble,
    yokup_project: "playertaza",
    note: bubble.queued ? "Fotograma en cola Bubble. Comprueba la cer\xE1mica a ojo." : "Fotograma en /gif.gif. Puente Bubble no listo: el GIF queda publicado para talPlayGif."
  };
}
__name(writeMugStatus, "writeMugStatus");
async function mugLaunch(env, origin, args) {
  const binding=JSON.parse(await env.KV.get(STORE_BINDING_KEY)||'null');
  if(binding?.enabled)return {ok:false,error:'La taza sigue '+binding.name+'. Desvincula la store para enviar una animación manual.'};
  const zone = String(args && args.zone || "").toLowerCase() === "queen" ? "queen" : "jackson";
  const step = String(args && args.step || "name").toLowerCase() === "anim" ? "anim" : "name";
  const now = await admiraNow(ADMIRA_SCREEN);
  const rec = {
    name: zone === "queen" ? "QUEEN" : "JACKSON",
    verb: step === "name" ? "NOMBRE" : "ANIM",
    text: zone === "queen" ? "Queen" : "Michael Jackson",
    via: "zona",
    source: now.item && now.item.title || "admira.tv",
    zone,
    step,
    admira_artist: now.artist,
    item: now.item ? { id: now.item.id, title: now.item.title, type: now.item.type, thumbnail: now.item.thumbnail } : null,
    ts: Date.now()
  };
  let gif;
  let presetMeta = { preset: null, source: "name" };
  if (step === "name") {
    gif = gifFromRgb(32, 16, namePixels(zone));
  } else {
    presetMeta = await presetAnimGif(env, zone);
    gif = presetMeta.gif;
    rec.preset = presetMeta.preset;
    rec.anim_source = presetMeta.source;
  }
  if (!isGif32(gif) && !(gif && gif.byteLength > 14 && gif.byteLength <= GIF_MAX)) {
    return { ok: false, error: "GIF 32\xD716 \u226440KB requerido" };
  }
  await env.KV.put("gif", gif);
  await env.KV.put("gifAt", String(rec.ts));
  await env.KV.put("mugStatus", JSON.stringify(rec));
  const bubble = await enqueueMugGif(env, gif, origin);
  return {
    ok: true,
    status: rec,
    gif_url: origin + "/gif.gif",
    bytes: gif.byteLength,
    width: 32,
    height: 16,
    frames: step === "anim" ? 4 : 1,
    talPlayGif: { gifContent: { size: gif.byteLength, type: "image/gif", url: origin + "/gif.gif" } },
    bubble,
    admira: { artist: now.artist, title: now.item && now.item.title, live: now.live, screen: now.screen },
    yokup_project: "playertaza",
    note: bubble.queued ? step === "name" ? "Nombre en cola Bubble." : "Animaci\xF3n en cola Bubble." : step === "name" ? "Nombre en /gif.gif." : "Animaci\xF3n 4 fotogramas en /gif.gif."
  };
}
__name(mugLaunch, "mugLaunch");
async function playPixels(env, origin, pixels, meta) {
  if (!Array.isArray(pixels) || pixels.length < 32 * 16 * 3) return { ok: false, error: "pixels 32\xD716 RGB" };
  const rec = {
    name: String(meta && meta.name || "ADMIRA").slice(0, 16) || "ADMIRA",
    verb: String(meta && meta.verb || "tv").slice(0, 24) || "tv",
    text: String(meta && meta.text || "ADMIRA \xB7 tv").slice(0, 32),
    via: String(meta && meta.via || "admira").slice(0, 20),
    source: String(meta && meta.source || "admira.tv").slice(0, 80),
    item: meta && meta.item ? { id: String(meta.item.id || "").slice(0, 80), title: String(meta.item.title || "").slice(0, 80), type: String(meta.item.type || "").slice(0, 20) } : null,
    ts: Date.now()
  };
  const gif = gifFromRgb(32, 16, Uint8Array.from(pixels.slice(0, 32 * 16 * 3)));
  if (!isGif32(gif)) return { ok: false, error: "GIF 32\xD716 \u226440KB requerido" };
  await env.KV.put("gif", gif);
  await env.KV.put("gifAt", String(rec.ts));
  await env.KV.put("mugStatus", JSON.stringify(rec));
  const bubble = await enqueueMugGif(env, gif, origin);
  return {
    ok: true,
    status: rec,
    gif_url: origin + "/gif.gif",
    bytes: gif.byteLength,
    width: 32,
    height: 16,
    talPlayGif: { gifContent: { size: gif.byteLength, type: "image/gif", url: origin + "/gif.gif" } },
    bubble,
    yokup_project: "playertaza",
    note: bubble.queued ? "Admira 32\xD716 en cola Bubble. Comprueba la cer\xE1mica a ojo." : "Admira 32\xD716 en /gif.gif. Puente Bubble no listo."
  };
}
__name(playPixels, "playPixels");
var MCP_TOOLS = [
  {
    name: "taza_now",
    description: "Estado del player y de la taza: c\xE1mara, BLE, GIF 32\xD716, puente iPhone/Bubble y \xFAltimo pulso (nombre \xB7 verbo).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "taza_status_read",
    description: "Lee el pulso actual de la taza (nombre \xB7 verbo) y la URL del GIF 32\xD716.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "taza_status_write",
    description: "Escribe el pulso de cualquiera en la taza. name+verb (Disney: nombre \xB7 verbo) o text. Origen previsto: yarig.ai \u2192 yokup.com proyecto playertaza \u2192 cer\xE1mica. Pinta /gif.gif (talPlayGif) y encola Bubble si el puente est\xE1 listo. No usa GATT.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Qui\xE9n (\u226416). Se pintan 8 caracteres en 32\xD716." },
        verb: { type: "string", description: "Qu\xE9 hace (\u226424). Se pintan 8 caracteres." },
        text: { type: "string", description: "Alternativa: 'Nombre \xB7 verbo' o 'Nombre verbo'." },
        via: { type: "string", description: "mcp|yarig|yokup|web. Por defecto mcp." },
        source: { type: "string", description: "Origen libre, p. ej. yarig.ai" }
      },
      additionalProperties: false
    }
  },
  {
    name: "taza_pixels_write",
    description: "Pinta un fotograma RGB 32\xD716 (1536 enteros 0\u2013255) en /gif.gif y, si Bubble est\xE1 listo, lo encola a la taza. Para emitir admira.tv a baja resoluci\xF3n: pixelar la pieza y llamar esta tool (o POST /api/gif con play:true).",
    inputSchema: {
      type: "object",
      properties: {
        pixels: { type: "array", items: { type: "number" }, description: "RGB 32\xD716, 1536 n\xFAmeros." },
        name: { type: "string", description: "Etiqueta corta (p. ej. ADMIRA)." },
        verb: { type: "string", description: "Verbo o t\xEDtulo recortado." },
        play: { type: "boolean", description: "Encolar a Bubble. Por defecto true." }
      },
      required: ["pixels"],
      additionalProperties: false
    }
  },
  {
    name: "taza_admira_now",
    description: "Qu\xE9 hay en antena en admira.tv para la pantalla playertaza (o ?screen=). No pinta la taza; usa taza_pixels_write / play-admira.py para el 32\xD716.",
    inputSchema: {
      type: "object",
      properties: {
        screen: { type: "string", description: "id de pantalla, por defecto playertaza" }
      },
      additionalProperties: false
    }
  },
  {
    name: "taza_launch",
    description: "Lanza una zona de la taza: jackson o queen. step=name pinta el nombre; step=anim el preset 32\xD716 (MJ Bad / Queen DSMN; fallback 4 fotogramas). El artista en antena de admira.tv se anota, no bloquea el lanzamiento.",
    inputSchema: {
      type: "object",
      properties: {
        zone: { type: "string", description: "jackson | queen" },
        step: { type: "string", description: "name | anim. Por defecto name." }
      },
      required: ["zone"],
      additionalProperties: false
    }
  }
];
function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
__name(rpcResult, "rpcResult");
function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
__name(rpcError, "rpcError");
function mcpHttp(req, payload, status = 200) {
  if (payload === null) return new Response(null, { status: 202, headers: CORS });
  const accept = (req.headers.get("accept") || "").toLowerCase();
  const preferSse = accept.includes("text/event-stream") && !accept.includes("application/json");
  if (preferSse) {
    return new Response(`event: message
data: ${JSON.stringify(payload)}

`, {
      status,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", ...CORS }
    });
  }
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS }
  });
}
__name(mcpHttp, "mcpHttp");
async function handleMcpRpc(env, origin, msg) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return rpcError(null, -32600, "No se aceptan lotes JSON-RPC");
  }
  const { id, method, params } = msg;
  switch (method) {
    case "initialize": {
      const offered = String(params && params.protocolVersion || "");
      const supported = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
      return rpcResult(id, {
        protocolVersion: supported.includes(offered) ? offered : "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "PlayerTaza", version: VERSION },
        instructions: "PlayerTaza \xB7 taza LED 32\xD716. taza_now para el estado, taza_status_read para el pulso, taza_status_write({name,verb}) para que cualquiera pinte su estado (yarig.ai \u2192 yokup.com proyecto playertaza). GATT bloqueado."
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: MCP_TOOLS });
    case "tools/call": {
      const name = params && params.name;
      const args = params && params.arguments || {};
      try {
        let out;
        if (name === "taza_status_read") out = await readMugStatus(env, origin);
        else if (name === "taza_status_write") out = await writeMugStatus(env, origin, args);
        else if (name === "taza_pixels_write") {
          if (args && args.play === false) {
            const pixels = Array.isArray(args.pixels) ? args.pixels.slice(0, 32 * 16 * 3) : [];
            if (pixels.length < 32 * 16 * 3) out = { ok: false, error: "pixels 32\xD716 RGB" };
            else {
              const gif = gifFromRgb(32, 16, Uint8Array.from(pixels));
              await env.KV.put("gif", gif);
              await env.KV.put("gifAt", String(Date.now()));
              out = { ok: true, gif_url: origin + "/gif.gif", bytes: gif.byteLength, bubble: { queued: false, reason: "play:false" } };
            }
          } else out = await playPixels(env, origin, args && args.pixels, args || {});
        } else if (name === "taza_admira_now") {
          out = await admiraNow(args && args.screen || ADMIRA_SCREEN);
        } else if (name === "taza_launch") {
          out = await mugLaunch(env, origin, args || {});
        } else if (name === "taza_now") {
          const look = JSON.parse(await env.KV.get("look") || '{"text":"","ts":0}');
          const snapAt = Number(await env.KV.get("snapAt") || 0);
          const ble = JSON.parse(await env.KV.get("ble") || "{}");
          const age = snapAt ? Date.now() - snapAt : null;
          out = {
            ok: true,
            version: VERSION,
            project: "playertaza",
            yokup: "https://www.yokup.com",
            camera_ok: age != null && age < 8e3,
            age_ms: age,
            ble_name: ble.name || "",
            ble_rssi: ble.rssi ?? null,
            gif_url: origin + "/gif.gif",
            look,
            iphone: await iphoneSnapshot(env),
            mug_status: await readMugStatus(env, origin),
            write_protocol_verified: false
          };
        } else {
          return rpcResult(id, { content: [{ type: "text", text: "Tool desconocida: " + name }], isError: true });
        }
        const isError = out && out.ok === false;
        return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], isError: !!isError });
      } catch (e) {
        return rpcResult(id, { content: [{ type: "text", text: "Error: " + (e.message || e) }], isError: true });
      }
    }
    default:
      return rpcError(id, -32601, "M\xE9todo no soportado: " + method);
  }
}
__name(handleMcpRpc, "handleMcpRpc");
const STORE_BINDING_KEY = 'storeBinding';
const validStoreId = id => /^[A-Za-z0-9_-]{1,100}$/.test(id);
async function storeJson(url) {
 const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 PlayerTaza/1'},signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw new Error('Catálogo no disponible');return r.json();
}
async function getStore(id){
 if(id==='yarigai')return {id,name:'Yarigai',screens:[],demo:false,project:'yarigai'};
 if(id==='canalkiosk-jardinets')return {id,name:'CanalKiosk · Jardinets',screens:[{id:'ipad-admin-mupi',name:'Pantalla Jardinets · iPad Admin'},{id:'samsung-galaxy-fold-8-mupi',name:'Fold 8'}],demo:true};
 const d=await storeJson('https://brain.digitalavatar.ai/locations/'+encodeURIComponent(id));
 const l=d.location;if(!l||l.id!==id)throw Error('Store no encontrada');
 const screens=(l.surfaces||[]).filter(s=>s.screen).map(s=>({id:String(s.screen),name:String(s.name||s.screen)}));
 if(l.screen&&!screens.some(s=>s.id===l.screen))screens.unshift({id:String(l.screen),name:'Pantalla principal'});
 return {id:l.id,name:l.name,screens,demo:false};
}
function permitsStore(binding,args){
 if(!binding?.enabled)return true;
 if(args?.via==='store-follow')return args.storeId===binding.storeId&&args.screen===binding.screen&&args.bindingRevision===binding.revision;
 if(binding.storeId==='yarigai')return ['yarig','yarigai','yarig.ai'].includes(String(args?.via||'').toLowerCase())||/^https?:\/\/(www\.)?yarig\.ai(?:\/|$)/i.test(args?.source||'')||['yarig.ai','yarigai'].includes(String(args?.source||'').toLowerCase());
 // Compatibilidad con la demo actual de Jardinets; otros productores no pueden pisarla.
 return binding.storeId==='canalkiosk-jardinets'&&args?.via==='adcelerate-best'&&args?.source==='mappedMusic';
}
async function retryProjectGif(env,origin,binding,status){
 const bridge=await iphoneSnapshot(env);
 const key=binding.revision+':'+status.ts;
 const previous=JSON.parse(await env.KV.get('projectDelivery')||'null');
 if(bridge.gifReady&&previous?.key!==key){
  const gif=await env.KV.get('gif','arrayBuffer');
  if(gif){const sent=await enqueueMugGif(env,gif,origin);if(sent.queued)await env.KV.put('projectDelivery',JSON.stringify({key,id:sent.id,ts:Date.now()}));}
 }
 return bridge;
}
async function storeRoute(req,env,url){
 const p=url.pathname;
 if(p==='/api/stores'&&req.method==='GET'){
  const d=await storeJson('https://brain.digitalavatar.ai/locations?slim=1');
  return json2({ok:true,stores:[{id:'yarigai',name:'Yarigai',kind:'Proyecto'}, {id:'canalkiosk-jardinets',name:'CanalKiosk · Jardinets',kind:'Demo kiosko'},...(d.locations||[]).map(l=>({id:l.id,name:l.name,kind:l.kind}))]});
 }
 if(p==='/api/store'&&req.method==='GET'){
  const id=url.searchParams.get('id')||'';if(!validStoreId(id))return json2({ok:false,error:'ID de store no válido'},400);
  return json2({ok:true,store:await getStore(id)});
 }
 const binding=JSON.parse(await env.KV.get(STORE_BINDING_KEY)||'null');
 if(p==='/api/store-binding'&&req.method==='GET')return json2({ok:true,binding});
 if(p==='/api/store-binding'&&req.method==='POST'){
  const b=await req.json();
  if(b.enabled===false){await env.KV.delete(STORE_BINDING_KEY);return json2({ok:true,binding:null});}
  if(!validStoreId(b.storeId||'')||typeof b.screen!=='string'||b.screen.length>100||b.screen&&!validStoreId(b.screen))return json2({ok:false,error:'Elige una store y un ID de pantalla válido'},400);
  const store=await getStore(b.storeId);
  const next={enabled:true,storeId:store.id,name:store.name,screen:b.screen,project:store.id==='yarigai'?'yarigai':store.id==='canalkiosk-jardinets'?'canalkiosk':/starbucks|sbux/i.test(store.name+' '+store.id)?'starbucks':'store',mode:store.id==='yarigai'?'producer':store.demo&&!b.screen?'demo':'screen',revision:crypto.randomUUID(),updatedAt:Date.now()};
  await env.KV.put(STORE_BINDING_KEY,JSON.stringify(next));
  return json2({ok:true,binding:next});
 }
 if(p==='/api/store-sync'&&req.method==='POST'){
  if(!binding?.enabled)return json2({ok:true,state:'unbound',message:'Elige una store para la taza'});
  let status=JSON.parse(await env.KV.get('mugStatus')||'null');
  if(binding.mode==='producer'){
   const matches=status?.bindingRevision===binding.revision;
   return json2({ok:true,binding,state:matches?'received':'waiting',title:matches?status.text:null,message:matches?'Contenido de Yarigai recibido; comprueba los LEDs':'Esperando contenido de Yarigai',delivery:matches?await retryProjectGif(env,url.origin,binding,status):await iphoneSnapshot(env)});
  }
  if(!binding.screen){
   if(!binding.screen&&binding.mode!=='demo')return json2({ok:true,binding,state:'waiting',message:'Store asociada; elige la pantalla que emite la demo',delivery:await iphoneSnapshot(env)});
   const matches=binding.storeId==='canalkiosk-jardinets'&&status?.via==='adcelerate-best'&&status?.source==='mappedMusic'&&status.ts>=binding.updatedAt;
   return json2({ok:true,binding,state:matches?'received':'waiting',title:matches?status.text:null,message:matches?'Selección de Jardinets recibida; comprueba los LEDs':'Esperando selección de la demo',delivery:matches?await retryProjectGif(env,url.origin,binding,status):await iphoneSnapshot(env)});
  }
  const now=await storeJson('https://api.admira.store/signage/now?screen='+encodeURIComponent(binding.screen));
  const item=now.item;
  if(!item||!item.id||!item.ts||Date.now()-item.ts>170000)return json2({ok:true,binding,state:'offline',message:'La pantalla elegida no publica una señal reciente',delivery:await iphoneSnapshot(env)});
  // Una asociación cambiada durante la consulta invalida esta respuesta.
  const current=JSON.parse(await env.KV.get(STORE_BINDING_KEY)||'null');
  if(current?.revision!==binding.revision)return json2({ok:false,error:'La asociación ha cambiado'},409);
  let sent=null;
  const key=binding.revision+':'+item.id+':'+(item.title||'');
  const previous=JSON.parse(await env.KV.get('storeDelivery')||'null');
  if(previous?.key!==key||!previous.queued){
   const bridge=await iphoneSnapshot(env);
   if(previous?.key!==key||bridge.gifReady){
    sent=await writeMugStatus(env,url.origin,{name:item.artist||binding.name,verb:item.title||item.name||'Contenido',via:'store-follow',source:item.title||item.name||'',storeId:binding.storeId,screen:binding.screen,bindingRevision:binding.revision});
    if(sent.ok)await env.KV.put('storeDelivery',JSON.stringify({key,queued:sent.bubble?.queued===true,ts:Date.now()}));
   }
  }
  return json2({ok:true,binding,state:'live',title:item.title||item.name||'Contenido',artist:item.artist||'',delivery:await iphoneSnapshot(env),send:sent});
 }
 return json2({ok:false,error:'Ruta de asociación no encontrada'},404);
}

var worker_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (["/api/stores","/api/store","/api/store-binding","/api/store-sync"].includes(path)) {
      if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
      try{return await storeRoute(req,env,url);}catch(e){return json2({ok:false,error:String(e.message||e)},502);}
    }
    if (path.startsWith("/api/iphone/")) {
      const response = await iphoneRoute(req, env);
      if (response.ok && ["/api/iphone/bridge/result", "/api/iphone/confirm"].includes(path)) {
        const result = await response.clone().json();
        if (result.logEvent) await appendLog(env, "PlayerTaza", `${result.source === "carbon" ? "Carlos3.0 \xB7 " + (result.activity?.task || (result.activity?.state === "idle" ? "Sin tarea en curso" : "Sin datos")) : result.kind === "gif" ? "GIF " + result.info.frames + " fotograma(s)" : "Texto \xAB" + result.text + "\xBB"} \xB7 ${result.message}`, "editor", false).catch(() => {
        });
      }
      return response;
    }
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (path === "/" || path === "/index.html") {
      const html = await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)));
      const headers2 = new Headers(html.headers);
      headers2.set("cache-control", "no-store");
      return new Response(html.body, { status: html.status, headers: headers2 });
    }
    if (path === "/mcp/llms.txt") {
      return env.ASSETS.fetch(new Request(new URL("/mcp/llms.txt", url.origin)));
    }
    if (path === "/mcp/manifest.json") {
      return env.ASSETS.fetch(new Request(new URL("/mcp/manifest.json", url.origin)));
    }
    if (path === "/mcp" && req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return mcpHttp(req, rpcError(null, -32700, "Parse error"), 400);
      }
      const resp = await handleMcpRpc(env, url.origin, body);
      return mcpHttp(req, resp);
    }
    if (path === "/help" || path === "/mcp" || path === "/app" || path === "/previo") {
      return env.ASSETS.fetch(new Request(new URL(path + ".html", url.origin)));
    }
    if (!env.KV && path !== "/version.json" && !((path === "/gif.gif" || path === "/gif") && req.method === "GET") && !(path === "/api/gif" && req.method === "POST")) return json2({ ok: false, error: "KV no configurado" }, 503);
    if (path === "/version.json") {
      return json2({
        version: VERSION,
        agent: "SmithMBARosa",
        deployer: "SmithMBARosa",
        machine: "MacBookAirRosa",
        signature: "SmithMBARosa \xB7 MacBookAirRosa",
        project: "playertaza",
        public: true,
        gitShort: "local",
        deployedAt: "2026-09-16T11:15:00Z",
        dirty: false
      });
    }
    if (path === "/api/status" && req.method === "GET") {
      const look = JSON.parse(await env.KV.get("look") || '{"text":"","ts":0}');
      const snapAt = Number(await env.KV.get("snapAt") || 0);
      const ble = JSON.parse(await env.KV.get("ble") || "{}");
      const telegram = JSON.parse(await env.KV.get("telegram") || "{}");
      const age = snapAt ? Date.now() - snapAt : null;
      return json2({
        ok: true,
        version: VERSION,
        agent: "SmithMBARosa",
        project: "playertaza",
        public: true,
        camera_ok: age != null && age < 8e3,
        gif_at: Number(await env.KV.get("gifAt") || 0),
        gif_url: url.origin + "/gif.gif",
        frames: Number(await env.KV.get("frames") || 0),
        age_ms: age,
        look,
        ble_name: ble.name || "",
        ble_rssi: ble.rssi ?? null,
        ble_age_ms: ble.ts ? Math.max(0, Date.now() - ble.ts) : null,
        write_protocol_verified: false,
        telegram_configured: telegramConfigured(env),
        telegram_ok: telegram.ok === true,
        telegram_at: telegram.ts || 0,
        url: url.origin + "/",
        mug_status: JSON.parse(await env.KV.get("mugStatus") || "null"),
        mcp: url.origin + "/mcp"
      });
    }
    if (path === "/api/log" && req.method === "GET") {
      const messages = JSON.parse(await env.KV.get("log") || "[]");
      return json2({ ok: true, messages });
    }
    if (path === "/api/log" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const author = String(body.author || "Carlos").slice(0, 40) || "Carlos";
      const text = String(body.text || "").trim().slice(0, 800);
      if (!text) return json2({ ok: false, error: "text requerido" }, 400);
      const via = String(body.via || "").slice(0, 20);
      const out = await appendLog(env, author, text, via, body.mirror !== false);
      return json2({ ok: true, ...out });
    }
    if (path === "/api/mug-status" && req.method === "GET") {
      return json2(await readMugStatus(env, url.origin));
    }
    if (path === "/api/mug-status" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const out = await writeMugStatus(env, url.origin, body);
      return json2(out, out.ok ? 200 : 400);
    }
    if (path === "/api/look" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const text = String(body.text || "").trim().slice(0, 400);
      if (!text) return json2({ ok: false, error: "text requerido" }, 400);
      const look = { text, ts: Date.now() };
      await env.KV.put("look", JSON.stringify(look));
      const out = await appendLog(env, "Smith", text, "mesa");
      return json2({ ok: true, look, telegram: out.telegram });
    }
    if (path === "/api/mug" && req.method === "GET") {
      const id = url.searchParams.get("id");
      if (id) {
        if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) return json2({ ok: false, error: "Identificador no v\xE1lido" }, 400);
        const raw = await env.KV.get("mugResult:" + id);
        return raw ? json2(JSON.parse(raw)) : json2({ ok: false, error: "Prueba desconocida o caducada" }, 404);
      }
      return json2(JSON.parse(await env.KV.get("mug") || '{"ok":true,"last_ok":false}'));
    }
    if (path === "/api/mug" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const op = String(body.op || "frame").slice(0, 20);
      if (op === "wifi") return json2({ ok: false, status: "blocked", error: "Configura Wi-Fi con la app oficial PixelMug; esta web no env\xEDa la clave a la taza." }, 400);
      if (["frame", "text", "brightness"].includes(op)) {
        return json2({
          ok: false,
          status: "blocked",
          op,
          write_protocol_verified: false,
          error: "Env\xEDo bloqueado: el protocolo de escritura de la taza a\xFAn no est\xE1 validado. No se ha enviado contenido."
        }, 409);
      }
      if (op !== "connect") return json2({ ok: false, error: "op desconocida" }, 400);
      const pending = JSON.parse(await env.KV.get("mugJob") || "null");
      if (pending && Date.now() - pending.ts < 6e4) return json2({ ok: false, error: "Hay una prueba en cola. Espera a que termine o caduque." }, 409);
      const job = { id: crypto.randomUUID(), op, ts: Date.now() };
      const queued = {
        ok: true,
        queued: true,
        status: "queued",
        id: job.id,
        op,
        ts: job.ts,
        message: "Prueba en cola; esperando respuesta del Mac."
      };
      await env.KV.put("mugResult:" + job.id, JSON.stringify(queued), { expirationTtl: 3600 });
      await env.KV.put("mugJob", JSON.stringify(job), { expirationTtl: 60 });
      return json2(queued, 202);
    }
    if (path === "/api/mug/job" && req.method === "GET") {
      const raw = await env.KV.get("mugJob");
      if (!raw) return json2({ ok: true, job: null });
      await env.KV.delete("mugJob");
      const job = JSON.parse(raw);
      if (Date.now() - job.ts > 6e4) return json2({ ok: true, job: null });
      return json2({ ok: true, job });
    }
    if (path === "/api/mug/status" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const id = String(body.id || "");
      const op = String(body.op || "").slice(0, 20);
      if (id && !/^[a-zA-Z0-9-]{1,80}$/.test(id)) return json2({ ok: false, error: "Identificador no v\xE1lido" }, 400);
      if (id) {
        const job = JSON.parse(await env.KV.get("mugResult:" + id) || "null");
        if (!job || job.op !== op) return json2({ ok: false, error: "Resultado sin prueba coincidente" }, 409);
      }
      const mug = {
        ok: true,
        id,
        last_ok: body.last_ok === true,
        status: body.last_ok === true ? "succeeded" : "failed",
        error: String(body.error || "").slice(0, 400),
        name: String(body.name || "").slice(0, 80),
        op,
        ts: Date.now(),
        message: body.last_ok === true ? op === "connect" ? "Prueba BLE completada. Reproducci\xF3n sin verificar." : "El Mac informa de una escritura. Reproducci\xF3n sin verificar." : String(body.error || "La prueba ha fallado").slice(0, 400)
      };
      if (id) await env.KV.put("mugResult:" + id, JSON.stringify(mug), { expirationTtl: 3600 });
      await env.KV.put("mug", JSON.stringify(mug));
      return json2({ ok: true, correlated: Boolean(id) });
    }
    if ((path === "/gif.gif" || path === "/gif") && req.method === "GET") {
      try {
        let bin = env.KV ? await env.KV.get("gif", { type: "arrayBuffer" }) : null;
        if (!isGif32(bin)) bin = gifFromRgb(32, 16, identPixels());
        return new Response(bin, {
          headers: { "content-type": "image/gif", "cache-control": "no-store", ...CORS }
        });
      } catch {
        const fallback = gifFromRgb(32, 16, identPixels());
        return new Response(fallback, {
          headers: { "content-type": "image/gif", "cache-control": "no-store", ...CORS }
        });
      }
    }
    if (path === "/api/gif" && req.method === "POST") {
      const binding=JSON.parse(await env.KV.get(STORE_BINDING_KEY)||'null');
      if(binding?.enabled)return json2({ok:false,error:'La taza sigue '+binding.name+'. Desvincula la store para enviar un GIF manual.'},409);
      try {
        if (!env.KV) return json2({ ok: false, error: "KV no configurado" }, 503);
        const ctype = (req.headers.get("content-type") || "").toLowerCase();
        let gif;
        let play = url.searchParams.get("play") === "1" || url.searchParams.get("play") === "true";
        let meta = {};
        if (ctype.includes("image/gif")) {
          const buf = await req.arrayBuffer();
          if (!isGif32(buf)) return json2({ ok: false, error: "GIF 32\xD716 \u226440KB requerido" }, 400);
          gif = new Uint8Array(buf);
        } else {
          const body = await req.json().catch(() => ({}));
          play = play || body.play === true;
          meta = body;
          const pixels = Array.isArray(body.pixels) ? body.pixels.slice(0, 512 * 3) : [];
          if (pixels.length < 32 * 16 * 3) return json2({ ok: false, error: "pixels 32\xD716 RGB" }, 400);
          if (play) return json2(await playPixels(env, url.origin, pixels, body));
          gif = gifFromRgb(32, 16, Uint8Array.from(pixels));
        }
        if (!isGif32(gif)) return json2({ ok: false, error: "GIF 32\xD716 \u226440KB requerido" }, 400);
        await env.KV.put("gif", gif);
        await env.KV.put("gifAt", String(Date.now()));
        const origin = url.origin;
        const out = {
          ok: true,
          bytes: gif.byteLength,
          width: 32,
          height: 16,
          url: origin + "/gif.gif",
          talPlayGif: { gifContent: { size: gif.byteLength, type: "image/gif", url: origin + "/gif.gif" } }
        };
        if (play) {
          const rec = {
            name: String(url.searchParams.get("name") || meta.name || "ADMIRA").slice(0, 16) || "ADMIRA",
            verb: String(url.searchParams.get("verb") || meta.verb || "tv").slice(0, 24),
            text: String(url.searchParams.get("title") || meta.text || meta.title || "").slice(0, 80),
            via: "admira",
            source: String(url.searchParams.get("source") || meta.source || "admira.tv").slice(0, 80),
            ts: Date.now()
          };
          await env.KV.put("mugStatus", JSON.stringify(rec));
          out.status = rec;
          out.bubble = await enqueueMugGif(env, gif, origin);
        }
        return json2(out);
      } catch {
        return json2({ ok: false, error: "GIF 32\xD716 \u226440KB requerido" }, 400);
      }
    }
    if (path === "/api/admira" && req.method === "GET") {
      const screen = (url.searchParams.get("screen") || ADMIRA_SCREEN).slice(0, 40);
      const now = await admiraNow(screen);
      return json2(now);
    }
    if (path === "/api/mug-launch" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const out = await mugLaunch(env, url.origin, body);
      return json2(out, out.ok ? 200 : 400);
    }
    if (path === "/api/pixeria" && req.method === "GET") {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      try {
        const idx = await fetch("https://pub-bf043a4daa3b43b7a0b769617729d074.r2.dev/stock/index.json");
        const data = await idx.json();
        let items = (data.items || []).filter((it) => String(it.type || "") === "image");
        if (q) {
          items = items.filter((it) => [it.id, it.prompt, it.title, (it.tags || []).join(" ")].join(" ").toLowerCase().includes(q));
        }
        const slim = items.slice(0, 36).map((it) => ({
          id: it.id,
          url: it.url,
          thumbnail: it.thumbnail || it.url,
          prompt: String(it.prompt || "").slice(0, 120),
          title: it.title || "",
          tags: it.tags || []
        }));
        return json2({ ok: true, items: slim });
      } catch (e) {
        return json2({ ok: false, error: String(e).slice(0, 120) }, 502);
      }
    }
    if (path === "/api/import" && req.method === "GET") {
      const raw = (url.searchParams.get("url") || "").trim();
      let host = "";
      try {
        host = new URL(raw).hostname;
      } catch {
        host = "";
      }
      const allowed = host === "pub-bf043a4daa3b43b7a0b769617729d074.r2.dev" || host === "www.pixeria.com" || host === "pixeria.com" || host === "api.admira.store" || host === "admira.tv" || host === "www.admira.tv" || host === "admira.store" || host === "stock.admira.store" || host === "www.admira.store";
      if (!raw.startsWith("https://") || !allowed) return json2({ ok: false, error: "url no permitida" }, 400);
      const r = await fetch(raw);
      const ctype = r.headers.get("content-type") || "application/octet-stream";
      if (!ctype.startsWith("image/")) return json2({ ok: false, error: "no es imagen" }, 415);
      return new Response(r.body, {
        headers: { "content-type": ctype, "cache-control": "no-store", ...CORS }
      });
    }
    if (path === "/api/ble" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      await env.KV.put("ble", JSON.stringify({
        name: String(body.name || "").slice(0, 80),
        rssi: body.rssi ?? null,
        ts: Date.now()
      }));
      return json2({ ok: true });
    }
    if ((path === "/snap" || path === "/snap.jpg") && req.method === "GET") {
      const bin = await env.KV.get("snap", { type: "arrayBuffer" });
      if (!bin) return new Response("sin frame", { status: 503, headers: CORS });
      return new Response(bin, {
        headers: { "content-type": "image/jpeg", "cache-control": "no-store", ...CORS }
      });
    }
    if (path === "/api/snap" && req.method === "POST") {
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return json2({ ok: false, error: "vac\xEDo" }, 400);
      await env.KV.put("snap", buf);
      await env.KV.put("snapAt", String(Date.now()));
      const n = Number(await env.KV.get("frames") || 0) + 1;
      await env.KV.put("frames", String(n));
      return json2({ ok: true, frames: n });
    }
    if (path.startsWith("/web") || path === "/stream.mjpg") {
      return new Response("usa /snap.jpg en el host p\xFAblico", { status: 404 });
    }
    return env.ASSETS.fetch(req);
  }
};
export {
  IPhoneQueue,
  worker_default as default
};


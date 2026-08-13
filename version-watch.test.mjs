import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./assets/admira-version-watch.js", import.meta.url), "utf8");

const release = (version, deployedAt, git = "abc1234") => ({
  version,
  deployedAt,
  git,
  signature: "TrinityMBP14 · MacBookProNegro14",
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
};

function harness(responses) {
  const intervals = [];
  const timeouts = [];
  const documentEvents = new Map();
  const windowEvents = new Map();
  const bodyChildren = [];
  const headChildren = [];
  const requests = [];

  const makeElement = (tagName) => ({
    tagName: tagName.toUpperCase(),
    attributes: {},
    listeners: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, listener) { this.listeners[name] = listener; },
  });

  const document = {
    hidden: false,
    currentScript: { src: "https://admira.tv/assets/admira-version-watch.js" },
    createElement: makeElement,
    addEventListener(name, listener) { documentEvents.set(name, listener); },
    head: { appendChild(node) { headChildren.push(node); } },
    body: { appendChild(node) { bodyChildren.push(node); } },
  };
  const window = {
    addEventListener(name, listener) { windowEvents.set(name, listener); },
  };
  const sandbox = {
    document,
    window,
    location: { reload() {} },
    Date,
    Promise,
    String,
    setInterval(listener, delay) { intervals.push({ listener, delay }); },
    setTimeout(listener, delay) {
      const timer = { listener, delay, cleared: false };
      timeouts.push(timer);
      return timer;
    },
    clearTimeout(timer) { if (timer) timer.cleared = true; },
    fetch(url, options) {
      requests.push({ url, options });
      const next = responses.shift();
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve(next).then((value) => ({
        ok: value !== null,
        json: () => Promise.resolve(value),
      }));
    },
  };

  vm.runInNewContext(source, sandbox, { filename: "admira-version-watch.js" });
  return { intervals, timeouts, documentEvents, windowEvents, bodyChildren, headChildren, requests };
}

test("avisa cuando cambia la versión publicada", async () => {
  const h = harness([
    release("v.11.08.2026.r5.21:03", "2026-08-11T19:03:24Z"),
    release("v.11.08.2026.r6.22:10", "2026-08-11T20:10:00Z", "def5678"),
  ]);
  await flush();
  assert.equal(h.bodyChildren.length, 0, "la primera lectura sólo fija la referencia");

  h.intervals[0].listener();
  await flush();

  assert.equal(h.bodyChildren.length, 1);
  assert.equal(h.bodyChildren[0].className, "admira-stale");
  assert.match(h.bodyChildren[0].title, /v\.11\.08\.2026\.r6\.22:10/);
  assert.equal(h.headChildren.length, 1);
});

test("detecta un despliegue nuevo aunque alguien olvide subir la r", async () => {
  const h = harness([
    release("v.11.08.2026.r5.21:03", "2026-08-11T19:03:24Z", "abc1234"),
    release("v.11.08.2026.r5.21:03", "2026-08-11T20:22:00Z", "abc1234"),
  ]);
  await flush();
  h.windowEvents.get("focus")();
  await flush();
  assert.equal(h.bodyChildren.length, 1);
});

test("no crea falsos avisos y comprueba al volver a la pestaña", async () => {
  const current = release("v.11.08.2026.r5.21:03", "2026-08-11T19:03:24Z");
  const h = harness([current, current]);
  await flush();
  h.documentEvents.get("visibilitychange")();
  await flush();

  assert.equal(h.bodyChildren.length, 0);
  assert.equal(h.intervals[0].delay, 30000);
  assert.deepEqual([...h.windowEvents.keys()].sort(), ["focus", "online", "pageshow"]);
  assert.equal(h.requests.length, 2);
  assert.ok(h.requests.every(({ url, options }) =>
    url.startsWith("/version.json?vw=") && options.cache === "no-store"));
});

test("se recupera si una lectura de version.json queda colgada", async () => {
  const never = new Promise(() => {});
  const h = harness([
    never,
    release("v.11.08.2026.r5.21:03", "2026-08-11T19:03:24Z"),
    release("v.11.08.2026.r6.22:10", "2026-08-11T20:10:00Z", "def5678"),
  ]);

  h.intervals[0].listener(); // queda una comprobación pendiente por repetir
  h.timeouts[0].listener();  // vence el deadline de la primera lectura
  await flush();
  assert.equal(h.requests.length, 2, "la señal pendiente rearma el watcher tras el timeout");

  h.intervals[0].listener();
  await flush();
  assert.equal(h.bodyChildren.length, 1);
  assert.equal(h.timeouts[0].delay, 8000);
});

test("el avisador está montado en las superficies operativas de admira.tv", () => {
  const pages = [
    "index.html", "cms.html", "canal.html", "mando.html", "players.html",
    "player/index.html", "remotecontrol/index.html", "cms/calendar/index.html",
    "dashboard/index.html", "digitalsignage/index.html", "contentcatalogue/index.html",
    "support/index.html", "pushnotifications/index.html", "virtualassistant/index.html",
    "adcelerate/index.html", "gamification/index.html", "iotmanager/index.html",
    "videoanalytics/index.html", "radioanalytics/index.html", "socialwifi/index.html",
    "queuemanager/index.html", "roombooking/index.html", "audiobranding/index.html",
    "olfactorymarketing/index.html", "virtualreality/index.html",
    "augmentedreality/index.html", "xpaceos/index.html", "yarig/index.html",
  ];
  for (const page of pages) {
    const html = fs.readFileSync(new URL(page, import.meta.url), "utf8");
    // El ?v=<sello> es OPCIONAL pero deseable: la URL sin versionar se quedó
    // cacheada una semana con el tipo MIME equivocado (13-ago-2026) y el aviso
    // no llegó a nadie. Lo que este test protege es que el vigilante ESTÉ; que
    // además viaje versionado lo mantiene al día tools/sella-versiones.py.
    assert.match(html, /<script src="\/assets\/admira-version-watch\.js(\?v=[^"]*)?" defer><\/script>/, page);
  }
});

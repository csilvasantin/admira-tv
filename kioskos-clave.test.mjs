// E0 del modelo único de playlists (8-oct-2026): tools/publica-playlists-kioskos.py escribe los
// <pantalla>-tema con la clave CONTROL_PLAYLIST_KEY, que lee del entorno o de la bóveda; nunca del repo.
// Sin red: la bóveda es un vault-get.sh falso y la petición se inspecciona sin enviarla.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = new URL('./tools/publica-playlists-kioskos.py', import.meta.url).pathname;
const source = readFileSync(SCRIPT, 'utf8');

const DRIVER = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("pk", sys.argv[1])
pk = importlib.util.module_from_spec(spec); spec.loader.exec_module(pk)
clave, origen = pk.clave_de_escritura()
con = pk.peticion_tema("ipad-admin-mupi", [{"id": "a1"}], "k-123")
sin = pk.peticion_tema("ipad-admin-mupi", [{"id": "a1"}], "")
print(json.dumps({"clave": clave, "origen": origen,
  "con": {"method": con.get_method(), "url": con.full_url, "key": con.get_header("X-control-key"), "body": json.loads(con.data)},
  "sin": {"key": sin.get_header("X-control-key")}}))
`;

function run({ env = {}, vault = null } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'kioskos-clave-'));
  try {
    if (vault !== null) writeFileSync(path.join(dir, 'vault-get.sh'), vault);
    const base = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', ADMIRA_VAULT_DIR: dir };
    delete base.CONTROL_PLAYLIST_KEY;
    const out = execFileSync('python3', ['-c', DRIVER, SCRIPT], { env: { ...base, ...env }, encoding: 'utf8' });
    return JSON.parse(out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const FAKE_VAULT = '#!/usr/bin/env bash\n[ "$1" = CONTROL_PLAYLIST_KEY ] && echo "clave-de-la-boveda" && exit 0\nexit 1\n';

test('la clave del entorno manda sobre la bóveda', () => {
  const r = run({ env: { CONTROL_PLAYLIST_KEY: 'clave-del-entorno' }, vault: FAKE_VAULT });
  assert.equal(r.clave, 'clave-del-entorno');
  assert.equal(r.origen, 'entorno');
});

test('sin variable de entorno la clave sale de la bóveda (vault-get.sh CONTROL_PLAYLIST_KEY)', () => {
  const r = run({ vault: FAKE_VAULT });
  assert.equal(r.clave, 'clave-de-la-boveda');
  assert.equal(r.origen, 'bóveda');
});

test('sin entorno ni bóveda no hay clave (y no se inventa)', () => {
  assert.deepEqual([run().clave, run().origen], ['', 'no encontrada']);
  const fallida = run({ vault: '#!/usr/bin/env bash\nexit 1\n' });
  assert.deepEqual([fallida.clave, fallida.origen], ['', 'no encontrada']);
});

test('la escritura va al -tema por POST con X-Control-Key; sin clave no se manda la cabecera', () => {
  const r = run();
  assert.equal(r.con.method, 'POST');
  assert.equal(r.con.url, 'https://brain.digitalavatar.ai/control/playlist');
  assert.equal(r.con.body.screen, 'ipad-admin-mupi-tema');
  assert.equal(r.con.key, 'k-123');
  assert.equal(r.sin.key, null);
});

test('el repo no lleva la clave y el script no la imprime', () => {
  assert.doesNotMatch(source, /CONTROL_PLAYLIST_KEY\s*=\s*["'][^"']+["']/);
  // Ningún print/sys.exit recibe la variable clave (pasarla a peticion_tema/publica_tema para enviarla sí vale).
  for (const line of source.split('\n').filter((l) => /print\(|sys\.exit\(/.test(l))) {
    assert.doesNotMatch(line.replace(/(?:peticion|publica)_tema\([^)]*\)/g, ''), /\{clave[}!:]|\(clave\b|,\s*clave\s*[,)]/, line.trim());
  }
});

// Un worker falso en 127.0.0.1 que se comporta como omnipublicity-api con el secreto puesto.
const DRIVER_401 = `
import importlib.util, json, sys, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
spec = importlib.util.spec_from_file_location("pk", sys.argv[1])
pk = importlib.util.module_from_spec(spec); spec.loader.exec_module(pk)
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length") or 0))
        k = self.headers.get("X-Control-Key") or ""
        code, body = (200, {"ok": True, "count": 1}) if k == "k-123" else (401, {"ok": False, "error": "invalid_control_key" if k else "missing_control_key"})
        raw = json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)
srv = HTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
pk.PLAYLIST_API = "http://127.0.0.1:%d/control/playlist" % srv.server_port
out = {}
for nombre, clave in (("buena", "k-123"), ("sin", ""), ("mala", "clave-que-no-vale")):
    try: out[nombre] = {"ok": pk.publica_tema("ipad-admin-mupi", [{"id": "a1"}], clave)}
    except SystemExit as e: out[nombre] = {"exit": str(e.code)}
srv.shutdown(); print(json.dumps(out))
`;

test('con el secreto puesto: la clave buena publica; sin clave o con una mala el script se para sin mostrarla', () => {
  const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' };
  const r = JSON.parse(execFileSync('python3', ['-c', DRIVER_401, SCRIPT], { env, encoding: 'utf8' }));
  assert.match(r.buena.ok, /"ok": true/);
  assert.match(r.sin.exit, /ipad-admin-mupi-tema.*401.*missing_control_key/);
  assert.match(r.sin.exit, /guarda-secreto\.sh CONTROL_PLAYLIST_KEY/);
  assert.match(r.mala.exit, /401.*invalid_control_key/);
  assert.doesNotMatch(r.mala.exit, /clave-que-no-vale/);
});

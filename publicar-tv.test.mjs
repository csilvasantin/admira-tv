// Publicación automática de admira.tv (Carlos, 14-oct-2026): cada merge en main sella y publica con
// ./deploy.sh cf desde GitHub Actions. Contrato del flujo y ensayo de tools/sellar-release.py en una copia.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const flujo = await readFile(new URL("./.github/workflows/publicar-admira-tv.yml", import.meta.url), "utf8");

test("el flujo publica al mergear en main, de uno en uno, con los secretos de Cloudflare", () => {
  assert.match(flujo, /on:\s*\n\s*push:\s*\n\s*branches: \[main\]/);
  assert.match(flujo, /workflow_dispatch:/);
  assert.match(flujo, /concurrency:\s*\n\s*group: publicar-admira-tv\s*\n\s*cancel-in-progress: false/);
  assert.match(flujo, /if: github\.repository == 'csilvasantin\/admira-tv'/);
  assert.match(flujo, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(flujo, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
});

test("el flujo limpia el token, respeta 4 por hora, sella si hace falta y publica con deploy.sh cf", () => {
  assert.match(flujo, /grep -oE '\[A-Za-z0-9_-\]\{40,\}'/);
  assert.match(flujo, /::add-mask::\$token/);
  assert.match(flujo, /\+ 900 -/, "15 minutos entre publicaciones");
  assert.match(flujo, /python3 tools\/sellar-release\.py "\$sello"/);
  assert.match(flujo, /ADMIRA_RELEASE_MACHINE="GitHubActions"/);
  assert.match(flujo, /HEAD\^2/, "firma con el autor del PR");
  assert.match(flujo, /\.\/deploy\.sh cf/, "en CI no hay git push");
  assert.match(flujo, /gitShort/, "comprueba que producción sirve el commit");
});

test("sellar-release.py deja sello, firma, caché del service worker, novedades y ?v= coherentes", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "sello-tv-"));
  await mkdir(join(raiz, "tools"));
  for (const f of ["tools/sellar-release.py", "tools/sella-versiones.py"]) await copyFile(new URL("./" + f, import.meta.url), join(raiz, f));
  const viejo = "v.14.10.2026.r13.19:37";
  await writeFile(join(raiz, "index.html"), `<meta name="admiranext-version" content="${viejo}">\n<script>window.ADMIRA_VERSION='${viejo}';</script>\n<script src="/admira-nav.js?v=14.10.2026.r13.1937"></script>\n`);
  await writeFile(join(raiz, "pagina.html"), `<script>window.ADMIRA_VERSION='${viejo}';</script><link rel="stylesheet" href="/admira-frame.css?v=14.10.2026.r13.1937">`);
  await writeFile(join(raiz, "sw.js"), `const CACHE = 'admira-shell-${viejo}';\n`);
  await writeFile(join(raiz, "release-signature.json"), JSON.stringify({ version: viejo, agent: "NeoMacStudio", machine: "MacStudio" }));
  await writeFile(join(raiz, "novedades.json"), JSON.stringify({ _como: "x", default: ["d"], [viejo]: ["vieja"] }));
  const sello = "v.14.10.2026.r14.20:15";
  const r = spawnSync("python3", [join(raiz, "tools/sellar-release.py"), sello, "NeoMacStudio", "GitHubActions", "Plano del laboratorio"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const index = await readFile(join(raiz, "index.html"), "utf8");
  assert.match(index, new RegExp(`content="${sello.replace(/\./g, "\\.")}"`));
  assert.match(index, /window\.ADMIRA_VERSION='v\.14\.10\.2026\.r14\.20:15'/);
  assert.match(index, /admira-nav\.js\?v=14\.10\.2026\.r14\.2015/, "token de caché nuevo");
  assert.match(await readFile(join(raiz, "pagina.html"), "utf8"), /admira-frame\.css\?v=14\.10\.2026\.r14\.2015/);
  assert.equal(await readFile(join(raiz, "sw.js"), "utf8"), `const CACHE = 'admira-shell-${sello}';\n`);
  const firma = JSON.parse(await readFile(join(raiz, "release-signature.json"), "utf8"));
  assert.equal(firma.version, sello);
  assert.equal(firma.signature, "NeoMacStudio · GitHubActions");
  const nov = JSON.parse(await readFile(join(raiz, "novedades.json"), "utf8"));
  assert.deepEqual(Object.keys(nov), ["_como", "default", sello, viejo], "la novedad nueva va detrás de default");
  assert.deepEqual(nov[sello], ["Plano del laboratorio"]);
});

test("sellar-release.py rechaza un sello con forma rara o sin firma", () => {
  const script = new URL("./tools/sellar-release.py", import.meta.url).pathname;
  assert.notEqual(spawnSync("python3", [script, "v.14.10.2026.r14", "A", "B"]).status, 0);
  assert.notEqual(spawnSync("python3", [script, "v.14.10.2026.r14.20:15", " ", "B"]).status, 0);
});

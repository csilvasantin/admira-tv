import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const raiz = new URL("./", import.meta.url);
const FUERA = new Set(["node_modules", ".git", ".wrangler", ".claude"]);

async function paginas(dir = raiz, rel = "") {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (FUERA.has(e.name)) continue;
    if (e.isDirectory()) out.push(...await paginas(new URL(e.name + "/", dir), rel + e.name + "/"));
    else if (e.name.endsWith(".html")) out.push(rel + e.name);
  }
  return out;
}

const index = await readFile(new URL("index.html", raiz), "utf8");
const sello = /<meta name="admiranext-version" content="([^"]+)"/.exec(index)[1];

// El 7-oct-2026 se selló a mano `v.07.10.2026.r4.taza-demo`: el sellador no reconocía el
// sufijo, 38 páginas se quedaron en esa versión cinco releases y --check decía ✓. Este
// test NO usa el patrón del sellador: mira cualquier literal y cualquier <meta>, tengan
// la forma que tengan, para que un sello raro se vea aunque el sellador no lo entienda.
test("ninguna página declara una versión distinta del sello canónico", async () => {
  const malas = [];
  for (const f of await paginas()) {
    const html = await readFile(new URL(f, raiz), "utf8");
    const vistos = [
      ...html.matchAll(/window\.ADMIRA_VERSION\s*=\s*(['"])(.*?)\1/g),
      ...html.matchAll(/<meta name="admiranext-version" content=(")([^"]*)"/g),
      ...html.matchAll(/<span data-release-version(>)([^<]*)</g),
    ].map((m) => m[2]);
    for (const v of new Set(vistos)) if (v !== sello) malas.push(`${f} → ${v}`);
  }
  assert.deepEqual(malas, []);
});

test("el sellador da por bueno el árbol y sella aunque el literal no tenga forma de sello", async () => {
  execFileSync("python3", ["tools/sella-versiones.py", "--check"], { cwd: raiz, stdio: "pipe" });
  const py = await readFile(new URL("tools/sella-versiones.py", raiz), "utf8");
  const patron = /LITERAL = re\.compile\(r"""(.+)"""\)/.exec(py)[1];
  // El mismo patrón es válido en JavaScript: debe casar el literal que se escapó.
  assert.match("window.ADMIRA_VERSION='v.07.10.2026.r4.taza-demo';", new RegExp(patron));
  assert.match('window.ADMIRA_VERSION = "lo-que-sea"', new RegExp(patron));
});

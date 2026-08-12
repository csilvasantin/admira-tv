import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { onRequestGet, onRequestPost } from "./functions/users/api/[[path]].js";

class MemoryKV {
  constructor(seed = {}) { this.data = new Map(Object.entries(seed)); }
  async get(key) { return this.data.get(key) ?? null; }
  async put(key, value) { this.data.set(key, String(value)); }
}

const originalFetch = globalThis.fetch;
const token = (email) => `token:${email}`;
const authFetch = async (input) => {
  const url = String(input);
  if (url.startsWith("https://oauth2.googleapis.com/tokeninfo")) {
    const raw = new URL(url).searchParams.get("id_token") || "";
    if (!raw.startsWith("token:")) return new Response("{}", { status: 401 });
    const email = raw.slice(6);
    return Response.json({
      aud: "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com",
      email, email_verified: "true", exp: String(Math.floor(Date.now() / 1000) + 3600),
    });
  }
  return originalFetch(input);
};

function ctx(kv, path, { email, method = "GET", body, query = "" } = {}) {
  const headers = {};
  if (email) headers.Authorization = `Bearer ${token(email)}`;
  if (body) headers["Content-Type"] = "application/json";
  return {
    env: { ACCESS: kv }, params: { path },
    request: new Request(`https://admira.tv/users/api/${path}${query}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }),
  };
}
async function data(response) { return { status: response.status, body: await response.json() }; }

test.before(() => { globalThis.fetch = authFetch; });
test.after(() => { globalThis.fetch = originalFetch; });

test("state y audit son privados incluso en lectura", async () => {
  const kv = new MemoryKV();
  assert.equal((await onRequestGet(ctx(kv, "state"))).status, 401);
  assert.equal((await onRequestGet(ctx(kv, "audit"))).status, 401);
});

test("el árbol pertenece sólo a admira.tv y empieza por Cartelería Digital", async () => {
  const kv = new MemoryKV();
  const res = await data(await onRequestGet(ctx(kv, "state", { email: "csilva@admira.com" })));
  assert.equal(res.status, 200);
  assert.equal(res.body.scope, "admira-tv");
  assert.equal(res.body.projects[0].id, "admira-tv");
  assert.ok(res.body.projects.every((p) => p.id === "admira-tv" || p.url.startsWith("https://admira.tv/")));
  const ds = res.body.projects.find((p) => p.id === "digitalsignage");
  assert.equal(ds.name, "Cartelería Digital");
  assert.equal(ds.parent, "admira-tv");
  const carteleria = res.body.projects.filter((p) => p.parent === "digitalsignage").map((p) => p.id);
  for (const required of ["digitalsignage-cms", "digitalsignage-parrilla", "digitalsignage-player", "digitalsignage-playlists", "digitalsignage-remotecontrol", "digitalsignage-wall", "digitalsignage-alta", "digitalsignage-conditional", "digitalsignage-signage", "digitalsignage-calendar"]) {
    assert.ok(carteleria.includes(required), `${required} debe estar bajo Cartelería Digital`);
  }
  for (const internal of ["apps", "mcp", "presenta", "xr", "nvidia", "comprar", "help", "docs"]) {
    assert.ok(res.body.projects.some((p) => p.id === internal && p.parent === "admira-tv"), `${internal} debe aparecer`);
  }
});

test("un permiso padre se hereda, pero no abre la gestión", async () => {
  const legacy = {
    v: 2, users: [{ email: "editor@example.com", roles: { digitalsignage: "editor" } }],
  };
  const kv = new MemoryKV({ "acl:v2": JSON.stringify(legacy) });
  const inherited = await data(await onRequestGet(ctx(kv, "access", {
    email: "editor@example.com", query: "?project=digitalsignage-cms",
  })));
  assert.equal(inherited.status, 200);
  assert.equal(inherited.body.allowed, true);
  assert.equal(inherited.body.role, "editor");
  const manage = await data(await onRequestGet(ctx(kv, "access", {
    email: "editor@example.com", query: "?project=admira-tv&manage=1",
  })));
  assert.equal(manage.body.allowed, false);
  assert.equal((await onRequestGet(ctx(kv, "state", { email: "editor@example.com" }))).status, 403);
});

test("crear un subproyecto exige owner, padre válido y URL admira.tv", async () => {
  const kv = new MemoryKV();
  const state = await (await onRequestGet(ctx(kv, "state", { email: "csilva@admira.com" }))).json();
  const external = await data(await onRequestPost(ctx(kv, "write", {
    email: "csilva@admira.com", method: "POST",
    body: { action: "project.add", rev: state.rev, id: "prueba-externa", name: "Externa", parent: "digitalsignage", url: "https://example.com/app" },
  })));
  assert.equal(external.status, 400);
  assert.equal(external.body.error, "external_url_forbidden");

  const created = await data(await onRequestPost(ctx(kv, "write", {
    email: "csilva@admira.com", method: "POST",
    body: { action: "project.add", rev: state.rev, id: "carteleria-prueba", name: "Prueba", parent: "digitalsignage", url: "https://admira.tv/prueba/" },
  })));
  assert.equal(created.status, 200);
  const p = created.body.projects.find((x) => x.id === "carteleria-prueba");
  assert.equal(p.kind, "subapp");
  assert.equal(p.parent, "digitalsignage");
});

test("un proyecto creado se puede eliminar, pero nunca la raíz ni lo de fábrica", async () => {
  const kv = new MemoryKV();
  const post = async (email, body) => {
    const state = await (await onRequestGet(ctx(kv, "state", { email }))).json();
    return data(await onRequestPost(ctx(kv, "write", { email, method: "POST", body: { ...body, rev: state.rev } })));
  };
  const owner = "csilva@admira.com";

  // La raíz y los proyectos sembrados quedan fuera del alcance del borrado.
  assert.equal((await post(owner, { action: "project.remove", id: "admira-tv" })).body.error, "root_protected");
  assert.equal((await post(owner, { action: "project.remove", id: "digitalsignage" })).body.error, "system_protected");

  // Un proyecto propio con hijos exige vaciarse antes: nunca borra en cascada.
  await post(owner, { action: "project.add", id: "padre-prueba", name: "Padre", parent: "admira-tv", url: "https://admira.tv/padre/" });
  await post(owner, { action: "project.add", id: "hijo-prueba", name: "Hijo", parent: "padre-prueba", url: "https://admira.tv/padre/hijo/" });
  const conHijos = await post(owner, { action: "project.remove", id: "padre-prueba" });
  assert.equal(conHijos.status, 409);
  assert.equal(conHijos.body.error, "has_children");

  // Al eliminarlo se liberan los permisos que apuntaban a él: sin roles huérfanos.
  await post(owner, { action: "user.add", email: "temp@example.com", project: "hijo-prueba", role: "editor" });
  const borrado = await post(owner, { action: "project.remove", id: "hijo-prueba" });
  assert.equal(borrado.status, 200);
  assert.ok(!borrado.body.projects.some((p) => p.id === "hijo-prueba"));
  const temp = borrado.body.users.find((u) => u.email === "temp@example.com");
  assert.deepEqual(temp.roles, {});

  // Y sigue siendo cosa del owner.
  await post(owner, { action: "user.add", email: "admin@example.com", project: "admira-tv", role: "admin" });
  const ajeno = await post("admin@example.com", { action: "project.remove", id: "padre-prueba" });
  assert.equal(ajeno.status, 403);
  assert.equal(ajeno.body.error, "owner_only");
});

test("la consola de usuarios se firma y traduce los errores del API", async () => {
  const html = await readFile(new URL("./users/index.html", import.meta.url), "utf8");
  // El sello canónico vive en index.html; aquí basta el literal que sella-versiones
  // mantiene al día. Un segundo <meta> sería otra fuente de verdad que acabaría mintiendo.
  assert.match(html, /window\.ADMIRA_VERSION='v\.\d{2}\.\d{2}\.\d{4}\.r\d+\.\d{2}:\d{2}'/);
  assert.doesNotMatch(html, /name="admiranext-version"/);
  // Ningún código del servidor debe llegar crudo al usuario.
  for (const code of ["owner_only", "external_url_forbidden", "has_children", "bad_email", "exists"]) {
    assert.match(html, new RegExp(code + ":'"), `falta traducir ${code}`);
  }
  assert.match(html, /action:'project\.remove'/);
});

test("la revisión evita que dos administradores se pisen", async () => {
  const kv = new MemoryKV();
  const state = await (await onRequestGet(ctx(kv, "state", { email: "csilva@admira.com" }))).json();
  const body = { action: "user.add", rev: state.rev, email: "uno@example.com", project: "digitalsignage", role: "viewer" };
  assert.equal((await onRequestPost(ctx(kv, "write", { email: "csilva@admira.com", method: "POST", body }))).status, 200);
  const stale = await data(await onRequestPost(ctx(kv, "write", { email: "csilva@admira.com", method: "POST", body: { ...body, email: "dos@example.com" } })));
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, "revision_conflict");
});

test("la superficie /users y el gate declaran el contrato fuerte", async () => {
  const [html, gate, nav, headers, redirects] = await Promise.all([
    readFile(new URL("./users/index.html", import.meta.url), "utf8"),
    readFile(new URL("./auth-gate.js", import.meta.url), "utf8"),
    readFile(new URL("./admira-nav.js", import.meta.url), "utf8"),
    readFile(new URL("./_headers", import.meta.url), "utf8"),
    readFile(new URL("./_redirects", import.meta.url), "utf8"),
  ]);
  assert.match(html, /zona superprotegida/i);
  assert.match(html, /\/users\/api/);
  assert.match(html, /Cartelería Digital/);
  assert.match(gate, /\/users\/api\/access/);
  assert.match(gate, /Authorization.*Bearer/);
  for (const route of ["cms.html", "cms", "parrilla", "playlists", "player", "remotecontrol", "wall", "alta.html", "condicional.html", "signage.html"]) {
    assert.match(gate, new RegExp('"' + route.replace('.', '\\.') + '"'), `falta mapear ${route}`);
  }
  assert.match(nav, /href="\/users\/"/);
  assert.match(headers, /\/users\/\*[\s\S]*X-Frame-Options: DENY/);
  assert.match(redirects, /\/accesscontrol\/ \/users\/ 301/);
});

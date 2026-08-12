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

  // Un admin de OTRA rama no puede borrar aquí. (Admin en la RAÍZ sí, porque
  // desde el 12-ago-2026 admin en la raíz es superusuario: ver los tests de
  // administración delegada más abajo.)
  await post(owner, { action: "project.add", id: "rama-ajena", name: "Rama ajena", parent: "admira-tv", url: "https://admira.tv/ajena/" });
  await post(owner, { action: "user.add", email: "admin@example.com", project: "rama-ajena", role: "admin" });
  const ajeno = await post("admin@example.com", { action: "project.remove", id: "padre-prueba" });
  assert.equal(ajeno.status, 403);
  assert.equal(ajeno.body.error, "out_of_scope");
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

test("el árbol nace compactado ENTERO, raíz incluida, y recuerda lo que abras", async () => {
  const html = await readFile(new URL("./users/index.html", import.meta.url), "utf8");
  // Nace vacío de ramas abiertas: sin esto los 38 proyectos salen desplegados.
  assert.match(html, /var abiertos=\(function\(\)\{try\{var v=JSON\.parse\(localStorage\.getItem\(OPEN_STORE\)\|\|'\[\]'\)/);
  // La raíz TAMBIÉN se pliega (Carlos, 12-ago-2026). Antes estaba exceptuada por
  // suponer que dejaría la pantalla en blanco: no la deja, queda su contador.
  assert.match(html, /function estaAbierto\(id\)\{return abiertos\.has\(id\)\}/);
  assert.doesNotMatch(html, /function alterna\(id\)\{if\(id==='admira-tv'\)return;/);
  // Sólo se pinta lo que cuelga de ramas abiertas, y se dice cuántos hay dentro.
  assert.match(html, /list\.filter\(visibleEnArbol\)/);
  assert.match(html, /hijos\+' dentro'/);
  assert.match(html, /localStorage\.setItem\(OPEN_STORE/);
});

test("desde permisos se puede nombrar Superusuario y Administrador", async () => {
  const html = await readFile(new URL("./users/index.html", import.meta.url), "utf8");
  // Las dos opciones existen y se explican solas.
  assert.match(html, /<option value="admin">Administrador · gestiona ese proyecto y lo que cuelga<\/option>/);
  assert.match(html, /<option value="superuser">Superusuario · gestiona TODO Admira\.tv<\/option>/);
  // Superusuario no es un rol del modelo: se traduce a admin EN LA RAÍZ.
  assert.match(html, /project:superu\?'admira-tv':\$\('newProject'\)\.value,role:superu\?'admin':elegido/);
  // Y se avisa de lo que entrega antes de hacerlo.
  assert.match(html, /Vas a hacer SUPERUSUARIO a/);
  // Sólo lo ofrece a quien puede darlo: el servidor responde owner_only al resto.
  assert.match(html, /if\(op&&!isOwnerActor\(\)\)\{[\s\S]{0,90}op\.remove\(\)\}/);
  // Con rol global el selector de proyecto deja de aplicar y se apaga.
  assert.match(html, /\$\('newProject'\)\.disabled=superu/);
  // En la matriz, el Admin de la raíz se llama por su nombre.
  assert.match(html, /\(p\.id==='admira-tv'\?'Superusuario':'Admin'\)/);
});

test("la pantalla ofrece sólo lo que el servidor va a aceptar", async () => {
  const html = await readFile(new URL("./users/index.html", import.meta.url), "utf8");
  // Espejo de adminReaches: se sube por los padres hasta encontrar una raíz propia.
  assert.match(html, /function administra\(id\)\{[\s\S]*?state\.adminRoots/);
  assert.match(html, /function canDelete\(p\)\{return administra\(p\.id\)&&!p\.readOnly/);
  // El padre de un proyecto nuevo sólo puede ser algo que administres.
  assert.match(html, /permitidos=id==='projectParent'\?list\.filter\(function\(p\)\{return administra\(p\.id\)&&!p\.readOnly\}\)/);
  // Y la matriz de roles se bloquea fuera del alcance, diciendo por qué.
  assert.match(html, /fuera=!administra\(p\.id\)\|\|p\.readOnly/);
  assert.match(html, /fuera de tu alcance/);
  assert.match(html, /esSuperusuario\(\)\?'Superusuario'/);
});

/* Superusuario y administración delegada (Carlos, 12-ago-2026): «el superusuario
   que es capaz de crear otros perfiles, que debe ser el usuario actual que puede
   hacerlo todo, y un usuario de un proyecto concreto: por ejemplo vamos a crear el
   proyecto Android y dentro meteremos los Samsung Galaxy Fold».
   Lo que se guarda aquí es el límite: que delegar una rama NO sea entregar la casa. */
async function conAndroid() {
  const kv = new MemoryKV();
  const owner = "csilva@admira.com";
  const post = async (email, body) => {
    const state = await (await onRequestGet(ctx(kv, "state", { email }))).json();
    return data(await onRequestPost(ctx(kv, "write", { email, method: "POST", body: { ...body, rev: state.rev } })));
  };
  await post(owner, { action: "project.add", id: "android", name: "Android", parent: "admira-tv", url: "https://admira.tv/android/" });
  await post(owner, { action: "user.add", email: "ana@example.com", name: "Ana", project: "android", role: "admin" });
  return { kv, post, owner };
}

test("el admin de Android crea dentro de Android: el Samsung Galaxy Fold entra", async () => {
  const { post } = await conAndroid();
  const creado = await post("ana@example.com", {
    action: "project.add", id: "android-galaxy-fold", name: "Samsung Galaxy Fold",
    parent: "android", url: "https://admira.tv/android/galaxy-fold/",
  });
  assert.equal(creado.status, 200);
  const fold = creado.body.projects.find((p) => p.id === "android-galaxy-fold");
  assert.equal(fold.parent, "android");
  assert.equal(fold.kind, "subapp");
});

test("pero NO puede crear fuera de su rama, ni colgar de la raíz", async () => {
  const { post } = await conAndroid();
  const fuera = await post("ana@example.com", {
    action: "project.add", id: "intruso", name: "Intruso", parent: "digitalsignage", url: "https://admira.tv/intruso/",
  });
  assert.equal(fuera.status, 403);
  assert.equal(fuera.body.error, "out_of_scope");

  const raiz = await post("ana@example.com", {
    action: "project.add", id: "otro-top", name: "Otro", parent: "admira-tv", url: "https://admira.tv/otro/",
  });
  assert.equal(raiz.body.error, "out_of_scope", "colgar de la raíz es del superusuario");
});

test("da acceso a su gente dentro de su rama, y a nadie fuera", async () => {
  const { post } = await conAndroid();
  const dentro = await post("ana@example.com", { action: "user.add", email: "tec@example.com", project: "android", role: "editor" });
  assert.equal(dentro.status, 200);
  const fuera = await post("ana@example.com", { action: "user.add", email: "tec@example.com", project: "digitalsignage", role: "editor" });
  assert.equal(fuera.body.error, "out_of_scope");
});

test("delegar una rama no reparte la llave de la casa", async () => {
  const { post } = await conAndroid();
  await post("ana@example.com", { action: "user.add", email: "tec@example.com", project: "android", role: "editor" });
  // No puede nombrar superusuario a nadie, ni siquiera a alguien de su rama.
  const sube = await post("ana@example.com", { action: "role.set", email: "tec@example.com", project: "admira-tv", role: "admin" });
  assert.equal(sube.status, 403);
  assert.ok(["owner_only", "out_of_scope"].includes(sube.body.error));
  // Ni borrar proyectos de fábrica de otra rama.
  const borra = await post("ana@example.com", { action: "project.remove", id: "digitalsignage" });
  assert.equal(borra.status, 403);
});

test("el admin delegado sólo VE su rama: ni el resto del árbol ni el resto de personas", async () => {
  const { kv, post, owner } = await conAndroid();
  await post(owner, { action: "user.add", email: "ajeno@example.com", project: "digitalsignage", role: "viewer" });
  const vista = await data(await onRequestGet(ctx(kv, "state", { email: "ana@example.com" })));
  assert.equal(vista.status, 200);
  assert.equal(vista.body.superuser, false);
  assert.deepEqual(vista.body.adminRoots, ["android"]);
  const ids = vista.body.projects.map((p) => p.id);
  assert.ok(ids.includes("android"), "ve su proyecto");
  assert.ok(!ids.includes("digitalsignage"), "no ve ramas ajenas");
  // La raíz aparece sólo para poder dibujar el árbol, y marcada como intocable.
  assert.equal(vista.body.projects.find((p) => p.id === "admira-tv").readOnly, true);
  const correos = vista.body.users.map((u) => u.email);
  assert.ok(!correos.includes("ajeno@example.com"), "no ve a gente de otras ramas");
});

test("el superusuario sigue viéndolo y pudiéndolo todo", async () => {
  const { kv, owner } = await conAndroid();
  const vista = await data(await onRequestGet(ctx(kv, "state", { email: owner })));
  assert.equal(vista.body.superuser, true);
  assert.equal(vista.body.scoped, false);
  assert.ok(vista.body.projects.some((p) => p.id === "digitalsignage"));
  assert.ok(!vista.body.projects.some((p) => p.readOnly));
});

test("quien no administra nada sigue sin entrar", async () => {
  const { kv, post, owner } = await conAndroid();
  await post(owner, { action: "user.add", email: "mirón@example.com", project: "android", role: "viewer" });
  assert.equal((await onRequestGet(ctx(kv, "state", { email: "mirón@example.com" }))).status, 403);
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

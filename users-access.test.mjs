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
  assert.match(nav, /href="\/users\/"/);
  assert.match(headers, /\/users\/\*[\s\S]*X-Frame-Options: DENY/);
  assert.match(redirects, /\/accesscontrol\/ \/users\/ 301/);
});

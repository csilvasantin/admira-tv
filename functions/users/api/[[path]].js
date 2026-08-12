// /users/api — administración fuerte y acotada al árbol de proyectos de admira.tv.
// A diferencia del ACL histórico, ninguna lectura es pública y no se aceptan
// credenciales en el cuerpo: toda operación exige Authorization: Bearer <Google ID token>.

const CLIENT_ID = "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";
const OWNERS = ["csilva@admira.com", "csilvasantin@gmail.com"];
const KEY_DOC = "admira-tv:users:v3";
const KEY_AUDIT = "admira-tv:users:audit:v3";
const MAX_AUDIT = 500;
const ROLES = ["admin", "editor", "viewer"];

const APPS = [
  ["dashboard", "Dashboard", "Cuadro de mando de la red"],
  ["digitalsignage", "Cartelería Digital", "Planificación, publicación y emisión en pantallas"],
  ["contentcatalogue", "Catálogo de contenidos", "Biblioteca de creatividades y campañas"],
  ["support", "Soporte", "Incidencias, seguimiento y ayuda"],
  ["pushnotifications", "Notificaciones", "Avisos operativos y de contenido"],
  ["virtualassistant", "Asistente virtual", "Atención y operación conversacional"],
  ["adcelerate", "ADcelerate", "Segmentación, inventario y activación publicitaria"],
  ["gamification", "Gamificación", "Retos, puntos y recompensas"],
  ["iotmanager", "Gestor de dispositivos", "Pantallas, players y sensores"],
  ["videoanalytics", "Analítica de vídeo", "Atención y comportamiento agregados"],
  ["radioanalytics", "Analítica de audio", "Afluencia y patrones de visita"],
  ["socialwifi", "WiFi social", "Conectividad de invitados"],
  ["queuemanager", "Gestor de colas", "Turnos y tiempos de espera"],
  ["roombooking", "Reserva de salas", "Disponibilidad y reserva de espacios"],
  ["audiobranding", "Marca sonora", "Identidad de audio"],
  ["olfactorymarketing", "Marketing olfativo", "Aroma como canal de marca"],
  ["virtualreality", "Realidad virtual", "Experiencias inmersivas"],
  ["augmentedreality", "Realidad aumentada", "Capas digitales sobre espacios físicos"],
  ["xpaceos", "XpaceOS", "Gemelo digital del espacio"],
  ["yarig", "Yarig.ai", "Colaboración de equipos con IA"],
  ["apps", "Catálogo de apps", "Inventario interno de aplicaciones"],
  ["mcp", "Conector MCP", "Herramientas y contratos para agentes"],
  ["presenta", "Presentaciones", "Presentaciones generadas por AdmiraNeXT"],
  ["xr", "Realidad extendida", "Laboratorio XR, AR y Quest"],
  ["nvidia", "Cómputo en el borde", "Operación de IA y vídeo en edge"],
  ["comprar", "Contratación", "Alta comercial de aplicaciones"],
  ["help", "Ayuda", "Guías operativas de Admira.tv"],
  ["docs", "Documentación", "Documentación técnica interna"],
];

const CARTELERIA_SUBAPPS = [
  ["digitalsignage-cms", "CMS", "/cms.html", "Gestión de contenidos y pantallas"],
  ["digitalsignage-parrilla", "Parrilla", "/parrilla/", "Programación de emisión"],
  ["digitalsignage-playlists", "Playlists", "/playlists/", "Listas de reproducción"],
  ["digitalsignage-player", "Reproductor", "/player/", "Configuración del player"],
  ["digitalsignage-remotecontrol", "Mando a distancia", "/remotecontrol/", "Control remoto de pantallas"],
  ["digitalsignage-wall", "Videowall", "/wall/", "Composición multipantalla"],
  ["digitalsignage-alta", "Alta de pantallas", "/alta.html", "Registro de nuevos players"],
  ["digitalsignage-conditional", "Emisión condicional", "/condicional.html", "Reglas contextuales de emisión"],
  ["digitalsignage-signage", "Flota", "/signage.html", "Estado y gestión de la flota"],
  ["digitalsignage-calendar", "Calendario", "/cms/calendar/", "Planificación visual"],
];

const now = () => Date.now();
const norm = (v) => String(v == null ? "" : v).trim().toLowerCase();
const text = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const isOwner = (email) => OWNERS.includes(norm(email));
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validId = (id) => /^[a-z0-9][a-z0-9-]{1,59}$/.test(id);

function headers(extra) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    ...(extra || {}),
  };
}
function json(data, status = 200, extra) {
  return new Response(JSON.stringify(data), { status, headers: headers(extra) });
}

function seedProjects() {
  const root = [{
    id: "admira-tv", name: "Admira.tv", parent: "", kind: "root",
    url: "https://admira.tv/", description: "Proyecto raíz protegido", system: true,
  }];
  const apps = APPS.map(([id, name, description]) => ({
    id, name, parent: "admira-tv", kind: "app",
    url: `https://admira.tv/${id}/`, description, system: true,
  }));
  const subs = CARTELERIA_SUBAPPS.map(([id, name, path, description]) => ({
    id, name, parent: "digitalsignage", kind: "subapp",
    url: `https://admira.tv${path}`, description, system: true,
  }));
  return root.concat(apps, subs);
}

function seedDoc() {
  return {
    v: 3,
    rev: 1,
    scope: "admira-tv",
    projects: seedProjects(),
    users: OWNERS.map((email) => ({
      email, name: email === OWNERS[0] ? "Carlos · Admira" : "Carlos · Recuperación",
      status: "active", roles: { "admira-tv": "owner" }, updatedAt: now(),
    })),
    updatedAt: now(),
  };
}

async function readDoc(env) {
  const raw = await env.ACCESS.get(KEY_DOC);
  if (raw) {
    try {
      const doc = JSON.parse(raw);
      if (doc && doc.v === 3 && doc.scope === "admira-tv") return doc;
    } catch (_) {}
  }
  const doc = seedDoc();
  // Migración conservadora desde ACL v2: sólo conserva identidades y roles que
  // pertenecen al árbol Admira.tv. Soluciones externas se descartan.
  try {
    const legacyRaw = await env.ACCESS.get("acl:v2");
    const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
    const validProjects = new Set(doc.projects.map((p) => p.id));
    for (const old of legacy && Array.isArray(legacy.users) ? legacy.users : []) {
      const email = norm(old.email);
      if (!validEmail(email) || isOwner(email)) continue;
      const roles = {};
      for (const [id, role] of Object.entries(old.roles || {})) {
        if (id === "*" && ROLES.includes(role)) roles["admira-tv"] = role;
        else if (validProjects.has(id) && ROLES.includes(role)) roles[id] = role;
      }
      if (!Object.keys(roles).length) continue;
      doc.users.push({ email, name: "", status: "active", roles, updatedAt: now() });
    }
  } catch (_) {}
  await env.ACCESS.put(KEY_DOC, JSON.stringify(doc));
  return doc;
}

async function verifyActor(request) {
  const auth = request.headers.get("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match || match[1].length > 4096) return null;
  let info;
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(match[1]));
    if (!r.ok) return null;
    info = await r.json();
  } catch (_) { return null; }
  if (!info || info.aud !== CLIENT_ID) return null;
  if (!(info.email_verified === true || info.email_verified === "true")) return null;
  if (!info.email || Number(info.exp) * 1000 <= now()) return null;
  return norm(info.email);
}

function userFor(doc, email) {
  return (doc.users || []).find((u) => norm(u.email) === norm(email));
}
function managementRole(doc, email) {
  if (isOwner(email)) return "owner";
  const user = userFor(doc, email);
  if (!user || user.status !== "active") return null;
  return user.roles && user.roles["admira-tv"] || null;
}
function canManage(doc, email) {
  return ["owner", "admin"].includes(managementRole(doc, email));
}
// ── ADMINISTRACIÓN DELEGADA POR SUBÁRBOL ───────────────────────────────────
// Antes había dos escalones y nada en medio: el superusuario, que lo podía todo,
// y el resto, que no podía nada sobre proyectos aunque fuese admin del suyo. Así
// no se puede dar un proyecto a alguien —«crea Android y mete dentro los Samsung
// Galaxy Fold»— sin convertirlo en superusuario de toda la casa.
// El alcance de un admin es SU rama: el proyecto donde tiene admin y todo lo que
// cuelgue de él. Se resuelve subiendo por los padres, así una subaplicación nueva
// hereda la delegación sin tener que repetir el permiso.
function adminReaches(doc, email, projectId) {
  if (isOwner(email)) return true;
  const user = userFor(doc, email);
  if (!user || user.status !== "active") return false;
  let node = projectFor(doc, projectId);
  const seen = new Set();
  while (node && !seen.has(node.id)) {
    if ((user.roles || {})[node.id] === "admin") return true;
    seen.add(node.id);
    node = projectFor(doc, node.parent);
  }
  return false;
}
// Proyectos que un actor administra de raíz (sin contar los heredados de otro).
function adminRoots(doc, email) {
  if (isOwner(email) || managementRole(doc, email) === "admin") return ["admira-tv"];
  const user = userFor(doc, email);
  if (!user || user.status !== "active") return [];
  return Object.keys(user.roles || {}).filter((id) => user.roles[id] === "admin" && projectFor(doc, id));
}
function isSuperuser(doc, email) {
  return isOwner(email) || managementRole(doc, email) === "admin";
}
function projectFor(doc, id) {
  return (doc.projects || []).find((p) => p.id === id);
}
function isDescendant(doc, id, possibleParent) {
  let current = projectFor(doc, possibleParent);
  const seen = new Set();
  while (current && current.parent && !seen.has(current.id)) {
    if (current.parent === id) return true;
    seen.add(current.id);
    current = projectFor(doc, current.parent);
  }
  return false;
}
function safeProjectUrl(raw) {
  const value = text(raw, 300);
  if (!value) return "";
  try {
    const u = new URL(value, "https://admira.tv/");
    if (u.protocol !== "https:" || !["admira.tv", "www.admira.tv"].includes(u.hostname)) return "";
    u.hostname = "admira.tv";
    return u.href;
  } catch (_) { return ""; }
}
// Un admin delegado ve SU rama, no la casa entera: los proyectos de fuera no
// aparecen, y de los ancestros sólo lo justo para poder dibujar el árbol —marcados
// `readOnly` para que ni la pantalla ni él se confundan sobre lo que puede tocar—.
// De personas ve únicamente a las que tienen algo dentro de su rama. Mantener
// «lecturas privadas» significa esto, no sólo pedir sesión.
function visibleFor(doc, actor) {
  const projects = doc.projects || [], users = doc.users || [];
  if (isSuperuser(doc, actor)) return { projects, users, scoped: false, roots: ["admira-tv"] };
  const roots = adminRoots(doc, actor);
  if (!roots.length) return { projects: [], users: [], scoped: true, roots: [] };
  const dentro = new Set();
  for (const p of projects) if (roots.some((r) => p.id === r || isDescendant(doc, r, p.id))) dentro.add(p.id);
  const ancestros = new Set();
  for (const r of roots) {
    let node = projectFor(doc, r);
    while (node && node.parent && !ancestros.has(node.parent)) { ancestros.add(node.parent); node = projectFor(doc, node.parent); }
  }
  const visibles = projects
    .filter((p) => dentro.has(p.id) || ancestros.has(p.id))
    .map((p) => (dentro.has(p.id) ? p : { ...p, readOnly: true }));
  const propios = users.filter((u) => Object.keys(u.roles || {}).some((id) => dentro.has(id)));
  return { projects: visibles, users: propios, scoped: true, roots };
}
function publicState(doc, actor) {
  const vista = visibleFor(doc, actor);
  return {
    v: 3, rev: doc.rev || 1, scope: "admira-tv", actor,
    actorRole: managementRole(doc, actor), owners: OWNERS.slice(),
    superuser: isSuperuser(doc, actor), scoped: vista.scoped, adminRoots: vista.roots,
    projects: vista.projects, users: vista.users, updatedAt: doc.updatedAt || 0,
  };
}

async function readAudit(env) {
  try {
    const raw = await env.ACCESS.get(KEY_AUDIT);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}
async function audit(env, event) {
  const events = await readAudit(env);
  events.push({ ts: now(), ...event });
  await env.ACCESS.put(KEY_AUDIT, JSON.stringify(events.slice(-MAX_AUDIT)));
}

async function authorize(ctx) {
  if (!ctx.env.ACCESS) return { response: json({ error: "no_kv" }, 500) };
  const actor = await verifyActor(ctx.request);
  if (!actor) return { response: json({ error: "unauthorized" }, 401) };
  const doc = await readDoc(ctx.env);
  // Entra quien administre ALGO: el superusuario o el admin de una rama. Lo que
  // pueda hacer dentro lo deciden las comprobaciones por acción, no esta puerta.
  if (!canManage(doc, actor) && !adminRoots(doc, actor).length) return { response: json({ error: "forbidden" }, 403) };
  return { actor, doc };
}
async function authenticate(ctx) {
  if (!ctx.env.ACCESS) return { response: json({ error: "no_kv" }, 500) };
  const actor = await verifyActor(ctx.request);
  if (!actor) return { response: json({ error: "unauthorized" }, 401) };
  const doc = await readDoc(ctx.env);
  return { actor, doc };
}
function effectiveRole(doc, email, projectId) {
  if (isOwner(email)) return "owner";
  const user = userFor(doc, email);
  if (!user || user.status !== "active") return null;
  let project = projectFor(doc, projectId);
  const seen = new Set();
  while (project && !seen.has(project.id)) {
    const role = user.roles && user.roles[project.id];
    if (role) return role;
    seen.add(project.id);
    project = projectFor(doc, project.parent);
  }
  return null;
}
function endpoint(params) {
  const value = Array.isArray(params.path) ? params.path.at(-1) : params.path;
  return String(value || "");
}

export async function onRequestOptions() {
  return new Response(null, { status: 405, headers: headers({ Allow: "GET, POST" }) });
}

export async function onRequestGet(ctx) {
  const ep = endpoint(ctx.params);
  if (ep === "access") {
    const auth = await authenticate(ctx);
    if (auth.response) return auth.response;
    const requested = text(new URL(ctx.request.url).searchParams.get("project"), 60) || "admira-tv";
    if (!projectFor(auth.doc, requested)) return json({ error: "bad_project" }, 400);
    const role = effectiveRole(auth.doc, auth.actor, requested);
    const managementOnly = new URL(ctx.request.url).searchParams.get("manage") === "1";
    const allowed = managementOnly ? canManage(auth.doc, auth.actor) : Boolean(role);
    return json({ actor: auth.actor, project: requested, allowed, role });
  }
  const auth = await authorize(ctx);
  if (auth.response) return auth.response;
  if (ep === "state") return json(publicState(auth.doc, auth.actor));
  if (ep === "audit") {
    const events = (await readAudit(ctx.env)).slice(-200).reverse();
    return json({ actor: auth.actor, events });
  }
  return json({ error: "not_found" }, 404);
}

export async function onRequestPost(ctx) {
  const origin = ctx.request.headers.get("Origin");
  if (origin && !["https://admira.tv", "https://www.admira.tv"].includes(origin)) {
    return json({ error: "bad_origin" }, 403);
  }
  const auth = await authorize(ctx);
  if (auth.response) return auth.response;
  if (endpoint(ctx.params) !== "write") return json({ error: "not_found" }, 404);

  let body;
  try { body = await ctx.request.json(); } catch (_) { return json({ error: "bad_json" }, 400); }
  const action = text(body.action, 40);
  if (!action) return json({ error: "missing_action" }, 400);

  // Control optimista: evita que dos administradores pisen cambios simultáneos en KV.
  const expectedRev = Number(body.rev);
  const doc = await readDoc(ctx.env);
  if (!Number.isSafeInteger(expectedRev) || expectedRev !== Number(doc.rev)) {
    return json({ error: "revision_conflict", currentRev: doc.rev }, 409);
  }
  const ownerActor = isOwner(auth.actor);
  const findUser = (email) => userFor(doc, email);
  let target = "";
  let detail = "";

  switch (action) {
    case "user.add": {
      const email = norm(body.email);
      const name = text(body.name, 100);
      const project = text(body.project, 60) || "digitalsignage";
      const role = text(body.role, 20) || "viewer";
      if (!validEmail(email)) return json({ error: "bad_email" }, 400);
      if (!projectFor(doc, project)) return json({ error: "bad_project" }, 400);
      if (!ROLES.includes(role)) return json({ error: "bad_role" }, 400);
      if (isOwner(email)) return json({ error: "owner_protected" }, 400);
      // Un admin delegado da acceso a SU gente, dentro de SU rama, y a nadie más.
      if (!adminReaches(doc, auth.actor, project)) return json({ error: "out_of_scope" }, 403);
      let user = findUser(email);
      if (!user) {
        user = { email, name, status: "active", roles: {}, updatedAt: now() };
        doc.users.push(user);
      } else {
        user.name = name || user.name || "";
        user.status = "active";
      }
      user.roles[project] = role;
      user.updatedAt = now();
      target = email; detail = `${project}=${role}`;
      break;
    }
    case "user.update": {
      const email = norm(body.email);
      const user = findUser(email);
      if (!user) return json({ error: "not_found" }, 404);
      if (isOwner(email)) return json({ error: "owner_protected" }, 400);
      const status = text(body.status, 20);
      if (status && !["active", "suspended"].includes(status)) return json({ error: "bad_status" }, 400);
      if (email === auth.actor && status === "suspended") return json({ error: "self_lockout" }, 400);
      if (Object.prototype.hasOwnProperty.call(body, "name")) user.name = text(body.name, 100);
      if (status) user.status = status;
      user.updatedAt = now(); target = email; detail = status || "profile";
      break;
    }
    case "user.remove": {
      const email = norm(body.email);
      if (!findUser(email)) return json({ error: "not_found" }, 404);
      if (isOwner(email)) return json({ error: "owner_protected" }, 400);
      if (email === auth.actor) return json({ error: "self_lockout" }, 400);
      doc.users = doc.users.filter((u) => norm(u.email) !== email);
      target = email;
      break;
    }
    case "role.set": {
      const email = norm(body.email);
      const project = text(body.project, 60);
      const role = text(body.role, 20);
      const user = findUser(email);
      if (!user) return json({ error: "not_found" }, 404);
      if (isOwner(email)) return json({ error: "owner_protected" }, 400);
      if (!projectFor(doc, project)) return json({ error: "bad_project" }, 400);
      if (!ROLES.includes(role)) return json({ error: "bad_role" }, 400);
      if (project === "admira-tv" && role === "admin" && !ownerActor) return json({ error: "owner_only" }, 403);
      if (!adminReaches(doc, auth.actor, project)) return json({ error: "out_of_scope" }, 403);
      user.roles = user.roles || {};
      user.roles[project] = role; user.updatedAt = now();
      target = email; detail = `${project}=${role}`;
      break;
    }
    case "role.clear": {
      const email = norm(body.email);
      const project = text(body.project, 60);
      const user = findUser(email);
      if (!user) return json({ error: "not_found" }, 404);
      if (isOwner(email)) return json({ error: "owner_protected" }, 400);
      if (email === auth.actor && project === "admira-tv") return json({ error: "self_lockout" }, 400);
      if (!projectFor(doc, project)) return json({ error: "bad_project" }, 400);
      if (!adminReaches(doc, auth.actor, project)) return json({ error: "out_of_scope" }, 403);
      delete user.roles[project]; user.updatedAt = now();
      target = email; detail = project;
      break;
    }
    case "project.add": {
      // Se crea DENTRO de lo que administras: colgar de la raíz sigue siendo del
      // superusuario, y el admin de Android puede crear bajo Android, no fuera.
      // El padre se valida más abajo; aquí sólo se mira el alcance.
      const id = norm(body.id);
      const name = text(body.name, 120);
      const parent = text(body.parent, 60) || "admira-tv";
      if (!adminReaches(doc, auth.actor, parent)) return json({ error: "out_of_scope" }, 403);
      const url = safeProjectUrl(body.url);
      if (!validId(id) || id === "admira-tv") return json({ error: "bad_id" }, 400);
      if (!name) return json({ error: "bad_name" }, 400);
      if (projectFor(doc, id)) return json({ error: "exists" }, 409);
      const parentProject = projectFor(doc, parent);
      if (!parentProject) return json({ error: "bad_parent" }, 400);
      if (!url) return json({ error: "external_url_forbidden" }, 400);
      const kind = parent === "admira-tv" ? "app" : "subapp";
      doc.projects.push({ id, name, parent, kind, url, description: text(body.description, 300), system: false });
      target = id; detail = `${kind}→${parent}`;
      break;
    }
    case "project.remove": {
      // Sin esto el árbol sólo crecía: un proyecto creado con el slug mal escrito
      // se quedaba para siempre. Se acota a lo que no puede romper el perímetro:
      // nunca la raíz, nunca los proyectos de fábrica, y nunca uno que sostenga
      // subaplicaciones (primero se vacía, así el borrado nunca es en cascada).
      const id = text(body.id, 60);
      const project = projectFor(doc, id);
      if (!project) return json({ error: "not_found" }, 404);
      if (!adminReaches(doc, auth.actor, id)) return json({ error: "out_of_scope" }, 403);
      if (project.id === "admira-tv") return json({ error: "root_protected" }, 400);
      if (project.system) return json({ error: "system_protected" }, 400);
      if ((doc.projects || []).some((p) => p.parent === id)) return json({ error: "has_children" }, 409);
      doc.projects = doc.projects.filter((p) => p.id !== id);
      // Los permisos que apuntaban aquí dejan de existir con él: un rol huérfano
      // no se ve en la matriz pero seguiría viajando en el documento.
      let cleared = 0;
      for (const user of doc.users || []) {
        if (user.roles && user.roles[id]) { delete user.roles[id]; user.updatedAt = now(); cleared++; }
      }
      target = id; detail = cleared ? `eliminado · ${cleared} permiso(s) liberados` : "eliminado";
      break;
    }
    case "project.update": {
      const id = text(body.id, 60);
      const project = projectFor(doc, id);
      if (!project) return json({ error: "not_found" }, 404);
      if (!adminReaches(doc, auth.actor, id)) return json({ error: "out_of_scope" }, 403);
      if (project.id === "admira-tv") return json({ error: "root_protected" }, 400);
      if (body.parent) {
        const parent = text(body.parent, 60);
        if (!projectFor(doc, parent) || parent === id || isDescendant(doc, id, parent)) return json({ error: "bad_parent" }, 400);
        project.parent = parent;
        project.kind = parent === "admira-tv" ? "app" : "subapp";
      }
      if (body.name) project.name = text(body.name, 120);
      if (body.url) {
        const url = safeProjectUrl(body.url);
        if (!url) return json({ error: "external_url_forbidden" }, 400);
        project.url = url;
      }
      if (Object.prototype.hasOwnProperty.call(body, "description")) project.description = text(body.description, 300);
      target = id; detail = "updated";
      break;
    }
    default:
      return json({ error: "unknown_action" }, 400);
  }

  doc.rev = Number(doc.rev || 1) + 1;
  doc.updatedAt = now();
  await ctx.env.ACCESS.put(KEY_DOC, JSON.stringify(doc));
  try { await audit(ctx.env, { actor: auth.actor, action, target, detail, rev: doc.rev }); } catch (_) {}
  return json(publicState(doc, auth.actor));
}

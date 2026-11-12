// Proyectos del mando (12-nov-2026, encargo de Carlos vía Walt): cada dispositivo pertenece a un
// proyecto (Mac Mini, Xtanco Valencia, Kioskos de prensa Barcelona, AdmiraNeXT 01-05…) y el mando
// y /players se filtran por él. El mapa proyecto→dispositivos vive en el KV ACCESS (el mismo que
// guarda sesiones y playout) bajo DOC_KEY.
//
// Visibilidad por usuario:
//   · «Dios» (OWNERS de _auth-session.js, o rol raíz owner/admin en admira-tv:users:v3) ve TODOS los
//     proyectos, la opción «Todos» y es el único que puede crear proyectos y mover dispositivos.
//   · Cualquier otro usuario activo solo ve los proyectos cuyo `members` incluye su email
//     (sin «Todos», sin escritura). La sesión de lectura sigue la misma regla y nunca escribe.
// No cambia el login: usa la misma cookie de sesión first-party que /api/playout.
import { authHeaders, effectiveRole, readSession } from "../_auth-session.js";

export const DOC_KEY = "admira-tv:device-projects:v1";
const USERS_KEY = "admira-tv:users:v3";
const OWNERS = new Set(["csilva@admira.com", "csilvasantin@gmail.com"]);
const ALLOWED_ORIGINS = new Set(["https://admira.tv", "https://www.admira.tv", "https://admira-tv.pages.dev"]);
const MAX_PROJECTS = 60, MAX_DEVICES = 400, MAX_ASSIGN = 2000;

// Semilla derivada de los datos reales de la flota (12-nov-2026): circuitos fijos del mando
// (xtanco-valencia-a..d, bcn-kiosk-001..100-led), el trío MM de /players (macmini-1..3), los ids
// admiranextNN del show, las localizaciones auto-registradas de brain (/locations?selfreg=1) y el
// registro de players virtuales (mcp-tv). `match` son prefijos de screen; `devices`, ids exactos.
export const DEFAULT_PROJECTS = Object.freeze([
  { id: "mac-mini", name: "Mac Mini", icon: "🖥️", devices: ["macmini-1", "macmini-2", "macmini-3"], match: ["macmini-"] },
  { id: "admiranext", name: "AdmiraNeXT 01-05", icon: "🎢", devices: ["admiranext01-a", "admiranext02-a", "admiranext03-a", "admiranext04-a", "admiranext05-a"], match: ["admiranext0"] },
  { id: "xtanco-valencia", name: "Xtanco Valencia", icon: "🏪", devices: ["xtanco-totem"], match: ["xtanco-"] },
  { id: "kioskos-bcn", name: "Kioskos de prensa Barcelona", icon: "🌆", devices: ["kiosko-lesseps-mupi"], match: ["bcn-kiosk-", "kiosko-"] },
  { id: "planeta-terminator", name: "Planeta · Terminator", icon: "🤖", devices: ["planeta-sala-reuniones-terminator-mupi", "reuniones-2-mupi"], match: ["planeta-", "reuniones-"] },
  { id: "starbucks-alsea", name: "Starbucks · Alsea (Xtore)", icon: "☕", devices: ["virtual-alsea-macstudio"], match: ["xtore-", "virtual-sbux-", "virtual-xp-", "virtual-alsea-", "preview-sbux-"] },
  { id: "robots-sitges", name: "Robots y Sitges", icon: "🦾", devices: ["admira-sitges-2-mupi", "sitges-mupi", "xpaceos-robot-chest", "robot-barcelona-chest", "tablet-samsung-unitree-mupi"], match: ["robot-", "xpaceos-robot"] },
  { id: "moviles-tablets", name: "Móviles y tablets", icon: "📱", devices: ["iphone17-mupi", "iphone-mupi", "iphone-carlos-jardinets-mupi", "samsung-galaxy-fold-9-mupi", "tabletmediatek-mupi", "movil-android-bcn-001-mupi", "iphonevirtual001-mupi", "qa-ios-20260912-mupi"], match: ["iphone", "ipad-", "samsung-galaxy-", "movil-", "tablet"] },
  { id: "laboratorio", name: "Laboratorio y pruebas", icon: "🧪", devices: ["admiranext-mupi", "osx-mupi", "macbookpro16-pruebas-mupi", "testplayer-mupi", "admiranext-review-mupi", "externo-negro14-mupi", "dgx-spark-consejo-mupi", "gracia-mupi", "jardinets-mupi", "virtual-mbp16-starbucks-horizontal", "virtual-demo-alcampo", "i-mupi", "the-i-mupi", "the-mupi"], match: ["virtual-"] },
]);

const norm = v => String(v == null ? "" : v).trim().toLowerCase();
export const cleanScreen = value => { const s = norm(value); return /^[a-z0-9][a-z0-9-]{0,79}$/.test(s) ? s : ""; };
const cleanId = value => { const s = norm(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40); return s; };
const cleanText = (value, max) => String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max);
const cleanList = (list, fn, max) => Array.from(new Set((Array.isArray(list) ? list : []).map(fn).filter(Boolean))).slice(0, max);
const cleanEmail = v => { const s = norm(v); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 120 ? s : ""; };
const cleanPrefix = v => { const s = norm(v); return /^[a-z0-9][a-z0-9-]{0,39}$/.test(s) ? s : ""; };

export function cleanProject(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = cleanId(raw.id || raw.name);
  const name = cleanText(raw.name || raw.id, 60);
  if (!id || !name || id === "todos" || id === "sin-proyecto") return null;
  return { id, name, icon: cleanText(raw.icon, 4) || "📁", devices: cleanList(raw.devices, cleanScreen, MAX_DEVICES),
    match: cleanList(raw.match, cleanPrefix, 12), members: cleanList(raw.members, cleanEmail, 50) };
}

export function seedDoc(now = Date.now()) {
  return { v: 1, revision: 0, updatedAt: now, updatedBy: "semilla", projects: DEFAULT_PROJECTS.map(p => cleanProject(p)), assign: {} };
}

export async function readDoc(env) {
  try {
    const doc = JSON.parse(await env.ACCESS.get(DOC_KEY) || "null");
    if (doc && doc.v === 1 && Array.isArray(doc.projects)) {
      return { ...doc, projects: doc.projects.map(cleanProject).filter(Boolean), assign: doc.assign && typeof doc.assign === "object" ? doc.assign : {}, seeded: false };
    }
  } catch (_) {}
  return { ...seedDoc(0), seeded: true };
}

/** Proyecto de un dispositivo: asignación explícita > lista `devices` > prefijo `match` (el más largo gana). */
export function projectOf(doc, screen) {
  const s = cleanScreen(screen); if (!s) return "";
  if (Object.prototype.hasOwnProperty.call(doc.assign || {}, s)) {
    const id = doc.assign[s];
    return id && doc.projects.some(p => p.id === id) ? id : "";
  }
  const exact = doc.projects.find(p => p.devices.includes(s)); if (exact) return exact.id;
  let best = "", len = 0;
  for (const p of doc.projects) for (const m of p.match || []) if (s.startsWith(m) && m.length > len) { best = p.id; len = m.length; }
  return best;
}

async function usersDoc(env) {
  try { const d = JSON.parse(await env.ACCESS.get(USERS_KEY) || "null"); return d && d.v === 3 ? d : null; } catch (_) { return null; }
}

/** Quién es y qué ve. superadmin = «Dios». */
export async function viewerFor(request, env) {
  const session = await readSession(request, env).catch(() => null);
  if (!session) return null;
  const email = norm(session.email);
  if (!session.lectura) {
    if (OWNERS.has(email)) return { email, role: "owner", superadmin: true };
    const users = await usersDoc(env);
    const root = users ? effectiveRole(users, email, "admira-tv") : null;
    if (["owner", "admin"].includes(root)) return { email, role: root, superadmin: true };
    const user = users && (users.users || []).find(u => norm(u.email) === email && u.status === "active");
    if (!user) return { email, role: null, superadmin: false, denied: true };
    return { email, role: root || "member", superadmin: false };
  }
  return { email, role: "viewer", superadmin: false, lectura: true };
}

export function visibleProjects(doc, viewer) {
  return viewer.superadmin ? doc.projects : doc.projects.filter(p => (p.members || []).includes(viewer.email));
}

function json(value, status = 200) { return Response.json(value, { status, headers: authHeaders() }); }

function payload(doc, viewer) {
  const projects = visibleProjects(doc, viewer).map(p => viewer.superadmin ? p : { ...p, members: undefined });
  const ids = new Set(projects.map(p => p.id));
  const assign = {};
  for (const [screen, id] of Object.entries(doc.assign || {})) if (viewer.superadmin || ids.has(id)) assign[screen] = id;
  return { ok: true, email: viewer.email, role: viewer.role, superadmin: viewer.superadmin, canEdit: viewer.superadmin, allowAll: viewer.superadmin,
    revision: doc.revision || 0, updatedAt: doc.updatedAt || 0, seeded: !!doc.seeded, projects, assign };
}

export async function onRequestGet({ request, env }) {
  if (!env.ACCESS) return json({ ok: false, error: "storage_unavailable" }, 503);
  const viewer = await viewerFor(request, env);
  if (!viewer) return json({ ok: false, error: "unauthorized" }, 401);
  if (viewer.denied) return json({ ok: false, error: "forbidden" }, 403);
  return json(payload(await readDoc(env), viewer));
}

export async function onRequestPost({ request, env }) {
  if (!env.ACCESS) return json({ ok: false, error: "storage_unavailable" }, 503);
  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ ok: false, error: "bad_origin" }, 403);
  if (!/^application\/json\b/i.test(request.headers.get("Content-Type") || "")) return json({ ok: false, error: "json_required" }, 415);
  const viewer = await viewerFor(request, env);
  if (!viewer) return json({ ok: false, error: "unauthorized" }, 401);
  if (!viewer.superadmin) return json({ ok: false, error: "forbidden" }, 403);
  let body; try { body = await request.json(); } catch (_) { return json({ ok: false, error: "bad_json" }, 400); }
  const doc = await readDoc(env); delete doc.seeded;
  const action = String(body && body.action || "");
  if (body && Number.isFinite(Number(body.revision)) && Number(body.revision) !== Number(doc.revision || 0)) {
    return json({ ok: false, error: "conflict", revision: doc.revision || 0 }, 409);
  }
  if (action === "assign") {
    const screens = cleanList(Array.isArray(body.screens) ? body.screens : [body.screen], cleanScreen, 200);
    const project = body.project ? cleanId(body.project) : "";
    if (!screens.length) return json({ ok: false, error: "bad_screen" }, 400);
    if (project && !doc.projects.some(p => p.id === project)) return json({ ok: false, error: "unknown_project" }, 400);
    for (const s of screens) doc.assign[s] = project;
    if (Object.keys(doc.assign).length > MAX_ASSIGN) return json({ ok: false, error: "too_many" }, 400);
  } else if (action === "upsert") {
    const project = cleanProject(body.project);
    if (!project) return json({ ok: false, error: "bad_project" }, 400);
    const at = doc.projects.findIndex(p => p.id === project.id);
    if (at >= 0) doc.projects[at] = { ...doc.projects[at], ...project, devices: body.project.devices ? project.devices : doc.projects[at].devices, match: body.project.match ? project.match : doc.projects[at].match, members: body.project.members ? project.members : doc.projects[at].members };
    else if (doc.projects.length >= MAX_PROJECTS) return json({ ok: false, error: "too_many" }, 400);
    else doc.projects.push(project);
  } else if (action === "delete") {
    const id = cleanId(body.id);
    if (!doc.projects.some(p => p.id === id)) return json({ ok: false, error: "unknown_project" }, 400);
    doc.projects = doc.projects.filter(p => p.id !== id);
    for (const [s, p] of Object.entries(doc.assign)) if (p === id) doc.assign[s] = "";
  } else {
    return json({ ok: false, error: "bad_action" }, 400);
  }
  doc.revision = (Number(doc.revision) || 0) + 1; doc.updatedAt = Date.now(); doc.updatedBy = viewer.email;
  await env.ACCESS.put(DOC_KEY, JSON.stringify(doc));
  return json(payload(doc, viewer));
}

export function onRequest() { return json({ ok: false, error: "method_not_allowed" }, 405); }

// Acceso (Access Control) v2 — backend same-origin de admira.tv (Pages Functions).
// Gestión de permisos v2 para TODAS las soluciones del grupo Admira/AdmiraNeXT.
// Evolución del worker v1 admira-whitelist (que sigue siendo la verja de admira.live).
//
// Va same-origin en admira.tv (y NO en *.workers.dev) porque los ISP españoles
// bloquean 188.114.96.0/22 → workers.dev inaccesible (lección del equipo).
//
// Rutas (catch-all [[path]] bajo /accesscontrol/api/):
//   GET  /accesscontrol/api/state  → doc ACL completo (lectura pública, verja blanda)
//   GET  /accesscontrol/api/audit  → últimos 200 eventos (más reciente primero, pública)
//   POST /accesscontrol/api/write  → mutaciones autenticadas con Google ID token
//
// Persistencia: KV binding ACCESS, doc único "acl:v2" con "rev" incrementable
// (RMW sobre 1 clave → se relee fresco antes de cada escritura). Auditoría en
// "audit:v2" (array circular, máx 500).

const CLIENT_ID =
  "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";
const OWNERS = ["csilva@admira.com", "csilvasantin@gmail.com"];
const V1_LIST = "https://admira-whitelist.csilvasantin.workers.dev/list";

const KEY_DOC = "acl:v2";
const KEY_AUDIT = "audit:v2";
const MAX_AUDIT = 500;   // tope del array circular en KV
const AUDIT_RETURN = 200; // tope de eventos devueltos por /audit

const ROLES = ["owner", "admin", "editor", "viewer"];

// Origen extra permitido en GET para futuros consumidores del grupo (admira.live).
// Same-origin (la propia consola en admira.tv) no necesita CORS.
const GET_CORS = {
  "Access-Control-Allow-Origin": "https://www.admira.live",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
};

// Registro inicial de soluciones (se siembra si el KV está vacío).
const SEED_SOLUTIONS = [
  { id: "admira-live", nm: "Consejo y control de flota", url: "https://www.admira.live", ds: "Consejo y control de flota" },
  { id: "admira-tv", nm: "Emisión y CMS", url: "https://admira.tv", ds: "Emisión y CMS" },
  { id: "xpaceos", nm: "Gemelo XP y backoffice", url: "https://www.xpaceos.com", ds: "Gemelo XP y backoffice" },
  { id: "pixeria", nm: "Estudio de creación / Catálogo", url: "https://www.pixeria.com", ds: "Estudio de creación / Catálogo" },
  { id: "yokup", nm: "Soporte y campo", url: "https://yokup.com/tool/", ds: "Soporte y campo" },
  { id: "admira-studio", nm: "Stock y galería", url: "https://www.admira.studio", ds: "Stock y galería" },
  { id: "adcelerate", nm: "Ad stack", url: "https://admira.tv/adcelerate/", ds: "Ad stack" },
];

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...(extra || {}) },
  });
}

const norm = (v) => (v == null ? "" : String(v)).trim().toLowerCase();
const s = (v, n) => (v == null ? "" : String(v)).slice(0, n).trim();
const isOwner = (email) => OWNERS.includes(norm(email));

// ── Semilla desde v1 (admira-whitelist /list) ──────────────────────────────
async function buildSeedDoc() {
  let emails = [];
  let superusers = [];
  try {
    const r = await fetch(V1_LIST, { cf: { cacheTtl: 0 } });
    if (r.ok) {
      const d = await r.json();
      emails = Array.isArray(d.emails) ? d.emails : [];
      superusers = Array.isArray(d.superusers) ? d.superusers : [];
    }
  } catch (e) {
    // Si v1 no responde, seguimos: al menos los OWNERS entran.
  }

  const set = new Set(emails.map(norm));
  OWNERS.forEach((o) => set.add(o)); // los owners siempre presentes
  const sup = new Set(superusers.map(norm));

  const users = [...set].sort().map((email) => {
    let roles = {};
    if (isOwner(email)) roles = { "*": "owner" };
    else if (sup.has(email)) roles = { "*": "admin" };
    return { email, roles };
  });

  return {
    v: 2,
    rev: 1,
    seededFrom: "admira-whitelist@" + new Date().toISOString(),
    solutions: SEED_SOLUTIONS.map((x) => ({ ...x })),
    users,
    updatedAt: Date.now(),
  };
}

// Lee el doc fresco; si no existe, lo siembra y persiste.
async function readDoc(env) {
  const raw = await env.ACCESS.get(KEY_DOC);
  if (raw) {
    try {
      const d = JSON.parse(raw);
      if (d && d.v === 2) return d;
    } catch (e) { /* corrupto → re-siembra abajo */ }
  }
  const seeded = await buildSeedDoc();
  await env.ACCESS.put(KEY_DOC, JSON.stringify(seeded));
  return seeded;
}

// Vista pública del doc (contrato de /state).
function statePayload(doc) {
  return {
    v: 2,
    solutions: doc.solutions || [],
    users: doc.users || [],
    owners: OWNERS.slice(),
    updatedAt: doc.updatedAt || 0,
  };
}

async function readAudit(env) {
  const raw = await env.ACCESS.get(KEY_AUDIT);
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
}

async function pushAudit(env, event) {
  const arr = await readAudit(env);
  arr.push(event);
  // Circular: conservar los últimos MAX_AUDIT.
  const trimmed = arr.slice(-MAX_AUDIT);
  await env.ACCESS.put(KEY_AUDIT, JSON.stringify(trimmed));
}

// ── Verificación del Google ID token contra tokeninfo ──────────────────────
// Devuelve el email (normalizado) del actor si el token es válido, o null.
async function verifyActor(credential) {
  const cred = s(credential, 4096);
  if (!cred) return null;
  let info;
  try {
    const r = await fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(cred)
    );
    if (!r.ok) return null;
    info = await r.json();
  } catch (e) { return null; }

  if (!info || info.aud !== CLIENT_ID) return null;
  const verified = info.email_verified === true || info.email_verified === "true";
  if (!verified || !info.email) return null;
  const exp = Number(info.exp);
  if (!exp || exp * 1000 <= Date.now()) return null; // caducado
  return norm(info.email);
}

// Rol global efectivo del actor sobre "*".
function globalRole(doc, email) {
  const e = norm(email);
  if (isOwner(e)) return "owner";
  const u = (doc.users || []).find((x) => norm(x.email) === e);
  return (u && u.roles && u.roles["*"]) || null;
}

// ── Handlers ────────────────────────────────────────────────────────────────
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: GET_CORS });
}

export async function onRequestGet(ctx) {
  const { env, params } = ctx;
  if (!env.ACCESS) return json({ error: "no_kv" }, 500, GET_CORS);
  const seg = (Array.isArray(params.path) ? params.path[params.path.length - 1] : params.path) || "";

  if (seg === "state") {
    const doc = await readDoc(env);
    return json(statePayload(doc), 200, GET_CORS);
  }
  if (seg === "audit") {
    const arr = await readAudit(env);
    const events = arr.slice(-AUDIT_RETURN).reverse(); // más reciente primero
    return json({ events }, 200, GET_CORS);
  }
  return json({ error: "not_found" }, 404, GET_CORS);
}

export async function onRequestPost(ctx) {
  const { request, env, params } = ctx;
  if (!env.ACCESS) return json({ error: "no_kv" }, 500, GET_CORS);
  const seg = (Array.isArray(params.path) ? params.path[params.path.length - 1] : params.path) || "";
  if (seg !== "write") return json({ error: "not_found" }, 404, GET_CORS);

  let d;
  try { d = await request.json(); } catch { return json({ error: "bad_json" }, 400, GET_CORS); }

  const action = s(d.action, 40);
  if (!action) return json({ error: "missing_action" }, 400, GET_CORS);

  // Autenticación: verifica el Google ID token.
  const actor = await verifyActor(d.credential);
  if (!actor) return json({ error: "unauthorized" }, 401, GET_CORS);

  // Autorización de escritura: OWNER o admin global ("*").
  const doc0 = await readDoc(env);
  const actorRole = globalRole(doc0, actor);
  const canWrite = isOwner(actor) || actorRole === "admin" || actorRole === "owner";
  if (!canWrite) return json({ error: "forbidden" }, 403, GET_CORS);

  // Re-leer fresco justo antes de mutar (minimiza pisadas RMW sobre 1 clave KV).
  const doc = await readDoc(env);
  doc.solutions = doc.solutions || [];
  doc.users = doc.users || [];

  const findUser = (email) => doc.users.find((x) => norm(x.email) === norm(email));
  const solExists = (id) => id === "*" || doc.solutions.some((x) => x.id === id);

  let auditTarget = "";
  let auditDetail = "";

  switch (action) {
    case "user.add": {
      const email = norm(d.email);
      if (!email || !/.+@.+\..+/.test(email)) return json({ error: "bad_email" }, 400, GET_CORS);
      if (!findUser(email)) doc.users.push({ email, roles: {} });
      auditTarget = email;
      break;
    }
    case "user.remove": {
      const email = norm(d.email);
      if (!email) return json({ error: "bad_email" }, 400, GET_CORS);
      if (isOwner(email)) return json({ error: "owner_protected" }, 400, GET_CORS);
      // Un admin global no puede eliminarse a sí mismo (evita lock-out).
      if (email === actor && !isOwner(actor)) return json({ error: "self_lockout" }, 400, GET_CORS);
      doc.users = doc.users.filter((x) => norm(x.email) !== email);
      auditTarget = email;
      break;
    }
    case "role.set": {
      const email = norm(d.email);
      const solution = s(d.solution, 60);
      const role = s(d.role, 20);
      if (!email) return json({ error: "bad_email" }, 400, GET_CORS);
      if (!ROLES.includes(role)) return json({ error: "bad_role" }, 400, GET_CORS);
      if (!solution || !solExists(solution)) return json({ error: "bad_solution" }, 400, GET_CORS);
      if (isOwner(email)) return json({ error: "owner_protected" }, 400, GET_CORS);
      // Sólo un OWNER puede otorgar el rol "owner".
      if (role === "owner" && !isOwner(actor)) return json({ error: "owner_only" }, 403, GET_CORS);
      // Un admin global no puede degradarse a sí mismo en "*" (evita lock-out).
      if (email === actor && solution === "*" && role !== "admin" && !isOwner(actor)) {
        return json({ error: "self_lockout" }, 400, GET_CORS);
      }
      let u = findUser(email);
      if (!u) { u = { email, roles: {} }; doc.users.push(u); }
      u.roles = u.roles || {};
      u.roles[solution] = role;
      auditTarget = email;
      auditDetail = solution + "=" + role;
      break;
    }
    case "role.clear": {
      const email = norm(d.email);
      const solution = s(d.solution, 60);
      if (!email) return json({ error: "bad_email" }, 400, GET_CORS);
      if (!solution) return json({ error: "bad_solution" }, 400, GET_CORS);
      if (isOwner(email)) return json({ error: "owner_protected" }, 400, GET_CORS);
      // Un admin global no puede quitarse a sí mismo el admin en "*" (evita lock-out).
      if (email === actor && solution === "*" && !isOwner(actor)) {
        return json({ error: "self_lockout" }, 400, GET_CORS);
      }
      const u = findUser(email);
      if (u && u.roles) delete u.roles[solution];
      auditTarget = email;
      auditDetail = solution;
      break;
    }
    case "solution.add": {
      if (!isOwner(actor)) return json({ error: "owner_only" }, 403, GET_CORS);
      const id = s(d.id, 60);
      if (!id || /[^a-z0-9._-]/i.test(id)) return json({ error: "bad_id" }, 400, GET_CORS);
      if (id === "*") return json({ error: "bad_id" }, 400, GET_CORS);
      if (solExists(id)) return json({ error: "exists" }, 400, GET_CORS);
      doc.solutions.push({ id, nm: s(d.nm, 120), url: s(d.url, 300), ds: s(d.ds, 300) });
      auditTarget = id;
      break;
    }
    case "solution.remove": {
      if (!isOwner(actor)) return json({ error: "owner_only" }, 403, GET_CORS);
      const id = s(d.id, 60);
      if (!id) return json({ error: "bad_id" }, 400, GET_CORS);
      doc.solutions = doc.solutions.filter((x) => x.id !== id);
      // Limpiar roles colgados sobre esa solución.
      doc.users.forEach((u) => { if (u.roles) delete u.roles[id]; });
      auditTarget = id;
      break;
    }
    default:
      return json({ error: "unknown_action" }, 400, GET_CORS);
  }

  // Persistir con rev+1 (RMW serializado lo posible).
  doc.rev = (Number(doc.rev) || 1) + 1;
  doc.updatedAt = Date.now();
  await env.ACCESS.put(KEY_DOC, JSON.stringify(doc));

  // Auditar (best-effort, no romper la respuesta).
  try {
    await pushAudit(env, {
      ts: Date.now(),
      actor,
      action,
      target: auditTarget,
      detail: auditDetail,
    });
  } catch (e) { /* la mutación ya está persistida */ }

  return json(statePayload(doc), 200, GET_CORS);
}

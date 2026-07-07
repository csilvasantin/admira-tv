// GET /leads?key=<LEADS_ADMIN> — revisar los leads capturados (JSON).
// Protegido por el secreto LEADS_ADMIN. Sin key válida → 401.
// DELETE /leads?key=<LEADS_ADMIN>&id=<lead:...> — borrar un lead (p.ej. uno de prueba).
// Portado de admira-adstack (functions/leads.js), mismo KV compartido.

function json(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function auth(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || request.headers.get("x-admin-key") || "";
  return env.LEADS_ADMIN && key === env.LEADS_ADMIN;
}

export async function onRequestGet({ request, env }) {
  if (!auth(request, env)) return json({ error: "unauthorized" }, 401);
  if (!env.LEADS) return json({ error: "no_kv" }, 500);
  const list = await env.LEADS.list({ prefix: "lead:", limit: 1000 });
  const items = [];
  for (const k of list.keys) {
    const v = await env.LEADS.get(k.name);
    if (v) { try { const o = JSON.parse(v); o._id = k.name; items.push(o); } catch (e) {} }
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1)); // más recientes primero
  return json({ count: items.length, leads: items }, 200);
}

export async function onRequestDelete({ request, env }) {
  if (!auth(request, env)) return json({ error: "unauthorized" }, 401);
  if (!env.LEADS) return json({ error: "no_kv" }, 500);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id.startsWith("lead:")) return json({ error: "bad_id" }, 400);
  await env.LEADS.delete(id);
  return json({ ok: true, deleted: id }, 200);
}

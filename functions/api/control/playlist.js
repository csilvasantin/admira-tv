// Proxy same-origin del inventario efectivo del player. El mando necesita esta
// lista para cruzarla con /screen/cache y mostrar progreso real; algunos ISP
// españoles bloquean *.workers.dev, así que la UI nunca depende sólo de ese host.
const UPSTREAM = 'https://omnipublicity-api.csilvasantin.workers.dev/control/playlist';

function json(value, status) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet({ request }) {
  const source = new URL(request.url);
  const screen = String(source.searchParams.get('screen') || '').trim().slice(0, 120);
  if (!screen) return json({ error: 'screen_required' }, 400);
  try {
    const upstream = await fetch(UPSTREAM + '?screen=' + encodeURIComponent(screen), {
      headers: { Accept: 'application/json' },
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return json({ error: 'upstream_unreachable', message: String(error && error.message || error) }, 502);
  }
}

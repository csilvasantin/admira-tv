const $ = id => document.getElementById(id), params = new URLSearchParams(location.search);
const form = $('registration');
for (const field of ['name', 'screen', 'circuit', 'mode']) if (params.has(field)) form.elements[field].value = params.get(field);
let registered = [], checked = null;
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
async function api(body, query = '') {
  const r = await fetch('/api/virtual-players' + query, { credentials: 'same-origin', cache: 'no-store', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const d = await r.json();
  if (!r.ok || d.ok !== true) throw new Error(r.status === 401 ? 'Inicia sesión en admira.tv para guardar.' : r.status === 403 ? 'Tu cuenta necesita permiso de edición de players.' : d.message || d.error || 'Servicio no disponible');
  return d;
}
function selected() {
  const row = registered.find(p => p.screen === $('virtual').value);
  $('virtualInfo').textContent = row ? `${row.name} · ${row.circuit}` : '';
  $('playlist').hidden = !row;
  if (row) $('playlist').href = row.playlist_url;
  reset();
}
function reset() { checked = null; $('savePair').disabled = true; $('unlink').disabled = true; $('current').textContent = 'Comprueba el dispositivo antes de guardar.'; }
async function inventory(preferred) {
  registered = await AdmiraVirtualPlayers.list();
  if (preferred && !registered.some(p => p.screen === preferred)) {
    const d = await api(null, '?screen=' + encodeURIComponent(preferred));
    if (d.player) registered.push(d.player);
  }
  $('virtual').replaceChildren(new Option('Elige un player virtual', ''), ...registered.map(p => new Option(p.name, p.screen)));
  if (preferred) $('virtual').value = preferred;
  selected();
}
form.addEventListener('submit', async event => {
  event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
  try {
    const d = await api({ action: 'register', ...Object.fromEntries(new FormData(form)) });
    await inventory(d.player.screen);
    message(d.created ? 'Player virtual dado de alta. Ya puedes emparejarlo.' : 'Este player virtual ya estaba dado de alta. Se conserva su ficha.');
  } catch (e) { message(e.message, true); } finally { button.disabled = false; }
});
$('device').addEventListener('input', reset); $('virtual').addEventListener('change', selected);
$('inspect').addEventListener('click', async () => {
  reset(); const device = $('device').value.trim();
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(device) || /^(?:xtore-)?virtual-/.test(device)) return message('Introduce el ID de una pantalla física.', true);
  $('inspect').disabled = true;
  try {
    const d = await api(null, '?device=' + encodeURIComponent(device));
    // Do not apply a late response to a different selection.
    if ($('device').value.trim() !== device) return;
    checked = { device, revision: d.pairing.revision };
    $('current').textContent = `${device} · ${d.pairing.source ? 'Asociado a '+d.pairing.source.name : 'Sin player virtual asociado'}. Guardar cambia la programación de este ID; comprueba que coincide con la app.`;
    $('savePair').disabled = !$('virtual').value; $('unlink').disabled = !d.pairing.source;
  } catch (e) { message(e.message, true); } finally { $('inspect').disabled = false; }
});
async function pair(source) {
  if (!checked || checked.device !== $('device').value.trim()) return;
  const device = checked.device, revision = checked.revision;
  $('savePair').disabled = $('unlink').disabled = true;
  try {
    await api({ action: 'pair', device, screen: source, revision });
    reset();
    message(source ? `Asociación guardada para ${device}. El player la recogerá en su siguiente consulta. Comprueba la emisión en Flota.` : `Dispositivo ${device} desvinculado. Recuperará su programación propia.`);
  } catch (e) { reset(); message(e.message, true); }
}
$('pairing').addEventListener('submit', e => { e.preventDefault(); pair($('virtual').value); });
$('unlink').addEventListener('click', () => pair(null));
inventory(params.get('screen')).catch(e => message('No se pudo cargar el registro: '+e.message, true));
fetch('https://api.admira.store/signage/screens', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject()).then(d => {
  $('devices').replaceChildren(...(d.screens || []).filter(p => p.screen && !AdmiraVirtualPlayers.isVirtual(p)).map(p => new Option(p.locName || p.screen, p.screen)));
}).catch(() => message('La lista de pantallas no está disponible. Puedes introducir el ID que muestra la app.', true));

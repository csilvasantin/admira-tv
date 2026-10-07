import { inspectGif } from './gif-validation.js';
const get = id => document.getElementById(id);
const sendButtons = ['btn-text', 'btn-gal-send', 'btn-draw-send', 'btn-heart', 'btn-admira-send'];
let pending = null, busy = false, gifAvailable = false, carbonEnabled = false;
try { const id = sessionStorage.getItem('taza-pending'); if (/^[0-9a-f-]{36}$/.test(id || '')) pending = { id }; } catch {}
const terminal = new Set(['sent_to_bubble', 'confirmed', 'failed', 'uncertain', 'expired', 'cancelled']);
function buttons() { for (const id of sendButtons) get(id).disabled = busy || (id !== 'btn-text' && !gifAvailable); }
async function api(path, body) {
  const response = await fetch('/api/iphone/' + path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000)
  });
  const data = await response.json();
  if (response.status === 401) get('iphone-pair').hidden = false;
  if (!response.ok) { const error = new Error(data.error || 'No se pudo conectar con la taza.'); error.status = response.status; throw error; }
  return data;
}
function show(job) {
  get('iphone-result').textContent = job.message;
  get('iphone-result').className = ['failed', 'uncertain', 'expired'].includes(job.status) ? 'bad' : job.status === 'confirmed' ? 'ok' : 'hint';
  get('iphone-confirm').hidden = !['sent_to_bubble', 'uncertain'].includes(job.status);
}
async function status() {
  try {
    const data = await api('status');
    get('iphone-status').textContent = 'Texto: ' + data.message;
    gifAvailable = data.gifReady;
    get('gif-status').textContent = data.gifReady ? 'Dibujos y GIF: listos · Bubble por internet' : 'Dibujos y GIF: puente del Mac no disponible.';
    get('iphone-pair').hidden = true;
    await carbonStatus();
    if (data.activeId && !busy) { pending = { id: data.activeId }; try { sessionStorage.setItem('taza-pending', pending.id); } catch {} busy = true; watch(); }
  } catch (error) { gifAvailable = false; get('iphone-status').textContent = error.message; get('gif-status').textContent = 'Vincula el navegador para enviar dibujos y GIF.'; }
  buttons();
}
async function watch() {
  if (!pending) return;
  const id = pending.id;
  try {
    const job = await api('jobs/' + id);
    if (pending?.id !== id) return;
    show(job);
    if (terminal.has(job.status)) { busy = false; buttons(); return; }
  } catch (error) {
    if (pending?.id !== id) return;
    if (error.status === 404) { busy = false; show({ status: 'failed', message: 'Este envío no está registrado. Puedes volver a enviar.' }); buttons(); return; }
    get('iphone-result').textContent = 'Respuesta pendiente: ' + error.message + ' No repitas el envío todavía.';
  }
  setTimeout(() => { if (pending?.id === id) watch(); }, 1500);
}
async function submit(content) {
  if (busy) return;
  busy = true; buttons(); get('iphone-confirm').hidden = true;
  pending = { id: crypto.randomUUID(), ...content };
  try { sessionStorage.setItem('taza-pending', pending.id); } catch {}
  try { show({ message: 'Preparando envío…' }); show(await api('jobs', pending)); await watch(); }
  catch (error) {
    try { const job = await api('jobs/' + pending.id); show(job); await watch(); }
    catch (checkError) {
      if (checkError.status === 404 || (error.status && error.status < 500)) {
        busy = false; buttons(); show({ status: 'failed', message: error.message });
      } else { show({ status: 'uncertain', message: error.message + ' Consultando el resultado…' }); setTimeout(watch, 3000); }
    }
  }
}
export async function sendGif(bytes) {
  try { inspectGif(bytes); await submit({ kind: 'gif', gif: btoa(String.fromCharCode(...bytes)) }); }
  catch (error) { show({ status: 'failed', message: error.message }); }
}
get('iphone-pair').onsubmit = async event => {
  event.preventDefault();
  try { await api('session', { key: get('iphone-key').value.trim() }); get('iphone-key').value = ''; get('iphone-pair').hidden = true; await status(); }
  catch (error) { get('iphone-status').textContent = error.message; }
};
get('btn-text').onclick = async () => {
  const text = get('msg').value;
  if (!text.trim() || [...text].length > 32 || /[\x00-\x1f\x7f]/.test(text) || text.trimStart().startsWith('/')) {
    show({ status: 'failed', message: 'Escribe de 1 a 32 caracteres, sin saltos de línea ni comandos.' }); return;
  }
  await submit({ text });
};
get('iphone-confirm').onclick = async () => {
  if (!pending) return;
  try { show(await api('confirm', { id: pending.id })); }
  catch (error) { get('iphone-result').textContent = error.message; }
};
buttons();
if (pending) { busy = true; buttons(); watch(); }
status(); setInterval(status, 8000);

async function carbonStatus() {
  try {
    const data = await api('activity'); carbonEnabled = data.enabled;
    if (/^[0-9a-f-]{36}$/.test(data.lastJobId || '') && get('carbon-preview').dataset.job !== data.lastJobId) {
      get('carbon-preview').src = '/api/iphone/content/' + data.lastJobId + '.gif'; get('carbon-preview').dataset.job = data.lastJobId; get('carbon-preview').hidden = false;
    }
    get('carbon-toggle').disabled = false;
    get('carbon-toggle').textContent = data.enabled ? 'Pausar actividad automática' : 'Activar actividad en la taza';
    const fresh = data.checkedAt && Date.now() - data.checkedAt < 150000;
    get('carbon-status').textContent = !data.enabled ? 'Pausado · la taza conserva el último contenido.' : data.manualUntil > Date.now() ? 'Pausa temporal: estás mostrando un envío manual.' : !fresh ? 'Activo · esperando una lectura reciente de Yokup.' : data.snapshot?.state === 'unavailable' ? 'Activo · SIN DATOS: Yokup todavía no tiene actividad disponible.' : 'Activo · cambios automáticos desde Yokup.';
    get('carbon-task').textContent = fresh ? data.snapshot?.state === 'working' ? data.snapshot.task : data.snapshot?.state === 'idle' ? 'Sin tarea en curso registrada. No indica disponibilidad.' : 'La taza mostrará CARLOS / SIN DATOS.' : '';
  } catch { get('carbon-status').textContent = 'Vincula el navegador para configurar la actividad.'; get('carbon-toggle').disabled = true; }
}
get('carbon-toggle').onclick = async () => {
  get('carbon-toggle').disabled = true;
  try { await api('activity', { enabled: !carbonEnabled }); await carbonStatus(); }
  catch (error) { get('carbon-status').textContent = error.message; get('carbon-toggle').disabled = false; }
};

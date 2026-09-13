import { getStore, formatClock, STATUSES } from './store.js';

const CSO = {
  radar: 'La flota no grita: entra en cola.',
  sala: 'No vas al ticket: entras en la pantalla.',
  parte: 'Se cierra con valor, no con “cerrado”.',
};
const store = getStore();
const $ = (sel, el = document) => el.querySelector(sel);
const root = $('#root');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(text) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast._h);
  toast._h = setTimeout(() => { t.hidden = true; }, 2800);
}

function parseRoute() {
  const q = new URLSearchParams(location.search);
  const path = location.pathname.replace(/\/+$/, '');
  const m = path.match(/\/support\/app\/i\/(INC-\d+)$/i);
  let view = q.get('view');
  let incidentId = q.get('incidentId') || q.get('i') || (m && m[1]);
  let playerId = q.get('playerId') || q.get('player');
  const source = q.get('source');
  if (!view) view = (incidentId || playerId) ? 'sala' : 'radar';
  if (view === 'sala' || view === 'parte') {
    if (playerId && (source === 'asistencia_click' || !incidentId)) {
      const inc = store.ensureSala(playerId, { source: source || 'asistencia_click' });
      incidentId = inc.id;
    } else if (incidentId) {
      const inc = store.get(incidentId);
      if (inc) playerId = inc.playerId;
    }
  }
  return { view, incidentId, playerId, source };
}

function href(view, extra = {}) {
  const u = new URL('/support/app/', location.origin);
  u.searchParams.set('view', view);
  Object.entries(extra).forEach(([k, v]) => { if (v) u.searchParams.set(k, v); });
  return u.pathname + u.search;
}

function go(view, extra = {}) {
  history.pushState({}, '', href(view, extra));
  render();
}

function clock() {
  return formatClock(Date.now());
}

function header(view, live) {
  return `<header class="bar">
    <div class="logo">ADMIRA.TV <span>/ SOPORTE</span></div>
    <div class="crumb">FLT-100395 / FLT-100396 · ${view === 'radar' ? 'P1 RADAR' : view === 'sala' ? 'P2 SALA' : 'P3 PARTE'}</div>
    <nav class="nav">
      <a class="${view === 'radar' ? 'on' : ''}" href="${href('radar')}">P1 Radar</a>
      <a class="${view === 'sala' ? 'on' : ''}" href="${href('sala', { playerId: 'admiranext-mupi', source: 'asistencia_click' })}">P2 Sala</a>
      <a class="${view === 'parte' ? 'on' : ''}" href="${href('parte', { incidentId: 'INC-10482' })}">P3 Parte</a>
      <a href="/support/">Landing</a>
    </nav>
    <div class="spacer"></div>
    <div class="live"><span class="dot"></span> ${esc(live)}</div>
  </header>
  <div class="cso" data-cso="${view}"><b>CSO · ${view === 'radar' ? 'P1' : view === 'sala' ? 'P2' : 'P3'}</b> · «${esc(CSO[view])}»</div>`;
}

function renderRadar(state) {
  const q = new URLSearchParams(location.search);
  const filter = {
    status: q.get('status') || 'all',
    sev: q.get('sev') || 'all',
    circuit: q.get('circuit') || 'all',
    site: q.get('site') || 'all',
    q: q.get('q') || '',
  };
  const rows = store.list(filter);
  const selectedId = q.get('sel') || state.incidentId || rows[0]?.id;
  const sel = selectedId ? store.get(selectedId) : null;
  const st = store.stats();
  const or = store.orphans();
  const circuits = store.circuits();
  const sites = store.sites();
  const pill = (id, val, label, extra = '') =>
    `<button type="button" class="pill ${filter[id] === val ? 'on' : ''}" data-filter="${id}" data-v="${val}">${extra}${label}</button>`;

  root.innerHTML = header('radar', `LIVE · cola /support/app · ${clock()}`) + `
  <div class="app" data-view="radar">
    <aside class="col">
      <h1>Cola de incidencias</h1>
      <p class="sub">Entrada A · scope=network · prioriza P0</p>
      <div class="sec">Filtros</div>
      <label>Circuito</label>
      <select id="fCircuit">
        <option value="all">Todos los circuitos</option>
        ${circuits.map((c) => `<option value="${esc(c)}" ${filter.circuit === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <label>Sitio</label>
      <select id="fSite">
        <option value="all">Todos los sitios</option>
        ${sites.map((s) => `<option value="${esc(s)}" ${filter.site === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
      <label>Estado</label>
      <div class="pills" id="stPills">
        ${pill('status', 'all', 'TODOS')}
        ${STATUSES.map((s) => pill('status', s, s.toUpperCase())).join('')}
      </div>
      <label>Severidad</label>
      <div class="pills" id="sevPills">
        ${pill('sev', 'all', 'ALL')}
        ${pill('sev', 'P0', 'P0', '<i class="k" style="background:var(--p0)"></i>')}
        ${pill('sev', 'P1', 'P1', '<i class="k" style="background:var(--p1)"></i>')}
        ${pill('sev', 'P2', 'P2', '<i class="k" style="background:var(--p2)"></i>')}
        ${pill('sev', 'P3', 'P3', '<i class="k" style="background:var(--p3)"></i>')}
      </div>
      <div class="sec">Red ahora</div>
      <div class="statgrid">
        <div class="stat"><b>${st.abiertas}</b><span>abiertas</span></div>
        <div class="stat"><b>${st.p0}</b><span>P0 vivo</span></div>
        <div class="stat"><b>${st.enCampo}</b><span>en campo</span></div>
        <div class="stat"><b>${st.slaP0}m</b><span>SLA P0</span></div>
      </div>
      <div class="sec">Widgets huérfanos · eco Flota</div>
      <div class="orphan"><strong>${or.vivosSinCircuito.length} vivos sin circuito</strong><p>${or.vivosSinCircuito.join(' · ')} — latean pero no tienen circuito.</p></div>
      <div class="orphan"><strong>${or.virtuales.length} virtuales huérfanos</strong><p>${or.virtuales.join(', ')} — sala sin hardware.</p></div>
      <div class="orphan"><strong>${or.sitiosSinPlayer.length} sitio sin player</strong><p>${or.sitiosSinPlayer.join(', ')} · punto creado en Flota, sin player EN EMISIÓN.</p></div>
    </aside>
    <main class="col">
      <div class="toolbar">
        <input type="search" id="q" placeholder="buscar player / sitio / INC-…" value="${esc(filter.q)}" style="max-width:280px">
        <button class="btn pri" type="button" data-act="open">ABRIR</button>
        <button class="btn ghost" type="button" data-act="merge">FUSIONAR DUPES</button>
        <button class="btn ghost" type="button" data-act="snooze">SNOOZE</button>
        <button class="btn ghost" type="button" data-act="escalate">ESCALAR A AGENTE</button>
      </div>
      <table class="table" id="incTable">
        <thead><tr><th>Sev</th><th>Incidencia</th><th>Player / sitio</th><th>Señal</th><th>Estado</th><th>Asignado</th><th></th></tr></thead>
        <tbody>
          ${rows.map((r) => {
            const field = r.status === 'in_field' || r.status === 'resolved' || r.status === 'valued';
            const label = r.status === 'valued' ? 'VALORADO →' : field ? (r.status === 'resolved' ? 'CIERRE →' : 'VER PARTE →') : 'ABRIR SALA →';
            const to = field ? href('parte', { incidentId: r.id }) : href('sala', { incidentId: r.id, playerId: r.playerId });
            return `<tr class="${r.id === selectedId ? 'sel' : ''}" data-id="${esc(r.id)}">
              <td><span class="sev ${r.sev.toLowerCase()}">${esc(r.sev)}</span></td>
              <td>${esc(r.id)}<br><span class="meta">${esc((r.source || [])[0] || 'cae')} · ${esc(r.age)}</span></td>
              <td><span class="player">${esc(r.playerId)}</span><br><span class="meta">${esc(r.site)}</span></td>
              <td>${esc(r.signal)}</td>
              <td><span class="st ${esc(r.status)}">${esc(r.status)}</span></td>
              <td class="meta">${esc(r.assignee || '—')}</td>
              <td><a class="linksala" href="${to}">${label}</a></td>
            </tr>`;
          }).join('') || '<tr><td colspan="7" class="empty">sin incidencias con esos filtros</td></tr>'}
        </tbody>
      </table>
      <p class="hint">P1 Radar / Cola · la incidencia nace en la pantalla. P0 arriba. Abrir sala no deja hueco vacío.</p>
    </main>
    <aside class="col">
      ${sel ? `<div class="side-card">
        <h2>Selección · ${esc(sel.id)}</h2>
        <dl class="kv">
          <dt>Player</dt><dd>${esc(sel.playerId)}</dd>
          <dt>Sitio</dt><dd>${esc(sel.site)}</dd>
          <dt>Fuente</dt><dd>${esc((sel.source || []).join(' + ') || 'cae')}</dd>
          <dt>Sev</dt><dd>${esc(sel.sev)} · SLA ${esc(sel.slaMin)} min</dd>
          <dt>Señal</dt><dd>${esc(sel.signal)}</dd>
          <dt>Playlist</dt><dd>${esc(sel.playlist || '—')}</dd>
          <dt>Entrada</dt><dd>A · /support/ → cola</dd>
        </dl>
      </div>
      <div class="side-card">
        <h2>Acciones</h2>
        <div class="actions">
          <a class="btn pri" href="${href('sala', { incidentId: sel.id, playerId: sel.playerId })}" style="text-align:center">ABRIR SALA DISPOSITIVO</a>
          <button class="btn ghost" type="button" data-act="merge">Fusionar dupes</button>
          <button class="btn ghost" type="button" data-act="snooze">Snooze 30 min</button>
          <button class="btn ghost" type="button" data-act="escalate">Escalar · Neo / Trinity</button>
        </div>
      </div>
      <div class="side-card">
        <h2>Motor agéntico</h2>
        <p class="meta">Triage: causa probable «caída de red / sincro player». Sugerencia: abrir sala, pedir captura, reboot si offline &gt; 10 min.</p>
      </div>` : '<p class="empty">Sin selección.</p>'}
    </aside>
  </div>`;

  const setFilter = (k, v) => {
    const u = new URL(location.href);
    if (!v || v === 'all') u.searchParams.delete(k); else u.searchParams.set(k, v);
    history.replaceState({}, '', u);
    render();
  };
  $('#fCircuit')?.addEventListener('change', (e) => setFilter('circuit', e.target.value));
  $('#fSite')?.addEventListener('change', (e) => setFilter('site', e.target.value));
  $('#stPills')?.addEventListener('click', (e) => {
    const p = e.target.closest('[data-filter]'); if (!p) return;
    setFilter(p.dataset.filter, p.dataset.v);
  });
  $('#sevPills')?.addEventListener('click', (e) => {
    const p = e.target.closest('[data-filter]'); if (!p) return;
    setFilter(p.dataset.filter, p.dataset.v);
  });
  let qTimer;
  $('#q')?.addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => setFilter('q', e.target.value.trim()), 180);
  });
  $('#incTable tbody')?.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const u = new URL(location.href);
    u.searchParams.set('sel', tr.dataset.id);
    history.replaceState({}, '', u);
    render();
  });
  root.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => radarAction(btn.dataset.act, selectedId)));
}

function radarAction(act, id) {
  if (!id) return toast('Selecciona una incidencia');
  try {
    if (act === 'open') {
      const inc = store.get(id);
      go('sala', { incidentId: id, playerId: inc?.playerId });
      return;
    }
    if (act === 'snooze') { store.snooze(id, 30); toast(`${id} snooze 30 min`); render(); return; }
    if (act === 'escalate') { store.escalate(id, 'Neo'); toast(`${id} escalada a Neo`); render(); return; }
    if (act === 'merge') {
      const rows = store.list();
      const cur = store.get(id);
      const other = rows.find((r) => r.id !== id && r.siteId === cur.siteId);
      if (!other) { toast('No fusionar: no hay dupes del mismo sitio'); return; }
      store.merge(other.id, id);
      toast(`${other.id} → ${id}`);
      render();
    }
  } catch (e) {
    toast(e.message === 'distinct_site' ? 'No fusionar: distinto sitio' : e.message);
  }
}

function renderSala(state) {
  let inc = state.incidentId ? store.get(state.incidentId) : null;
  if (!inc && state.playerId) inc = store.ensureSala(state.playerId, { source: state.source || 'asistencia_click' });
  if (!inc) {
    root.innerHTML = header('sala', 'sala') + '<p class="empty">Falta playerId o incidentId.</p>';
    return;
  }
  const live = `/support/app/?view=sala&incidentId=${inc.id}&playerId=${inc.playerId}`;
  root.innerHTML = header('sala', live) + `
  <section class="head">
    <h1>SALA · <em>${esc(inc.playerId)}</em></h1>
    <span class="badge ${inc.playerOnline ? 'on' : ''}">● ${inc.playerOnline ? 'ONLINE' : 'OFFLINE'}</span>
    <span class="badge sincro">SINCRO ${inc.sincro == null ? '—' : inc.sincro + 's'}</span>
    <span class="badge p0">${esc(inc.sev)}</span>
    <span class="badge open">${esc(inc.id)} ${esc(inc.status).toUpperCase()}</span>
    <span class="meta">${esc(inc.site)} · circuito ${esc(inc.circuit)} · siteId ${esc(inc.siteId || '—')}</span>
  </section>
  <div class="app sala" data-view="sala" data-incident="${esc(inc.id)}">
    <aside class="col">
      <div class="sec">Previo live</div>
      <div class="preview">
        <span class="lbl">PREVIEW · 1080×1920 · MUPI</span>
        <div class="scan"></div>
        <div class="cross">
          <b>${esc(inc.playlist || '—')}</b>
          slot ${esc(inc.slot || '—')} · «${esc(inc.slotTitle || 'en antena')}»<br>
          frame ${esc(inc.frame || 'live')}
        </div>
      </div>
      <div class="pl">
        <h2>Playlist en antena</h2>
        <dl class="kv">
          <dt>Lista</dt><dd>${esc(inc.playlist || '—')}</dd>
          <dt>Modo</dt><dd>avanzado · criterios</dd>
          <dt>Bloque</dt><dd>${esc(inc.block || 'MUPI-PORTRAIT')}</dd>
          <dt>Siguiente</dt><dd>${esc(inc.nextClip || '—')}</dd>
          <dt>Stock/list</dt><dd>ok</dd>
          <dt>Condición</dt><dd>horario 08–22 · aforo ok</dd>
        </dl>
      </div>
      <div class="note">
        <strong>Nota · entrada Flota Asistencia</strong>
        <p>Abierta desde Flota → fila player <b>${esc(inc.playerId)}</b> → Asistencia. Contexto: playerId + siteId. No es sala vacía: incidentId <b>${esc(inc.id)}</b> creado al click.</p>
      </div>
    </aside>
    <main class="col">
      <div class="sec">Timeline de señales</div>
      <ol class="tl">
        ${(inc.timeline || []).map((ev) => `<li class="${esc(ev.kind || '')}">
          <time>${esc(formatClock(ev.at))}</time>
          <b>${esc(ev.title)}</b>
          <p>${esc(ev.text)}</p>
        </li>`).join('')}
      </ol>
      <p class="hint">P2 · misma app que P1/P3 · incidentId compartido · deep-link ?playerId= resuelve a sala.</p>
    </main>
    <aside class="col">
      <div class="sec">Chat agéntico</div>
      <div class="chat">
        <div class="msgs" id="msgs">
          ${(inc.chat || []).map((m) => `<div class="msg ${m.role === 'hu' ? 'hu' : 'ag'}"><div class="who">${esc(m.who)}</div>${esc(m.text)}</div>`).join('')}
        </div>
        <div class="compose">
          <input type="text" id="chatIn" placeholder="escribir al agente…" autocomplete="off">
          <button class="btn pri" type="button" id="send">ENVIAR</button>
        </div>
      </div>
      <div class="sec">Acciones dispositivo</div>
      <div class="actions grid">
        <button class="btn danger" type="button" data-dev="reboot">REBOOT</button>
        <button class="btn" type="button" data-dev="capture">CAPTURAR</button>
        <a class="btn ghost" href="/tester/" target="_blank" rel="noopener noreferrer">TESTER WEBCAM</a>
        <a class="btn ghost" href="https://www.yokup.com/asistencia?room=${encodeURIComponent(inc.playerId)}" target="_blank" rel="noopener noreferrer">VIDEOLLAMADA</a>
        <button class="btn pri wide" type="button" id="accept">ACEPTAR PARTE →</button>
      </div>
      <p class="meta" id="actLog">sin acción aún · el parte se abre en P3 con el mismo ${esc(inc.id)}</p>
    </aside>
  </div>`;

  const msgs = $('#msgs');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
  $('#send')?.addEventListener('click', sendChat);
  $('#chatIn')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  function sendChat() {
    const i = $('#chatIn'); const t = i.value.trim(); if (!t) return;
    store.addChat(inc.id, { who: 'Tú · sala', role: 'hu', text: t });
    i.value = '';
    setTimeout(() => {
      store.addChat(inc.id, { who: 'Oráculo · motor', role: 'ag', text: 'Anotado. Si confirmas ceguera en pasillo, acepta parte y Neo toma ruta.' });
      render();
    }, 280);
    render();
  }
  root.querySelectorAll('[data-dev]').forEach((b) => b.addEventListener('click', () => {
    store.deviceAction(inc.id, b.dataset.dev);
    toast(b.dataset.dev + ' · ' + inc.playerId);
    render();
  }));
  $('#accept')?.addEventListener('click', () => {
    store.acceptParte(inc.id);
    go('parte', { incidentId: inc.id, playerId: inc.playerId });
  });
}

function renderParte(state) {
  const inc = state.incidentId ? store.get(state.incidentId) : (state.playerId ? store.ensureSala(state.playerId) : null);
  if (!inc) {
    root.innerHTML = header('parte', 'parte') + '<p class="empty">Falta incidentId.</p>';
    return;
  }
  const flow = ['assigned', 'in_field', 'resolved', 'valued'];
  const idx = Math.max(0, flow.indexOf(inc.status === 'open' ? 'assigned' : inc.status));
  const score = inc.valuation?.score || 0;
  root.innerHTML = header('parte', `${inc.id} · ${inc.assignee || 'sin técnico'} · ${clock()}`) + `
  <section class="flow" id="flow">
    ${flow.map((s, i) => `${i ? '<span class="arrow">→</span>' : ''}<span class="step ${i < idx ? 'done' : i === idx ? 'on' : ''}" data-s="${s}">${i + 1} ${s}</span>`).join('')}
  </section>
  <div class="app parte" data-view="parte" data-incident="${esc(inc.id)}">
    <aside class="col">
      <h1>Ruta al punto</h1>
      <p class="sub">Parte de campo · mismo incidentId que la sala</p>
      <div class="map">
        <div class="start">base · Moratalaz</div>
        <div class="route"></div>
        <div class="pin">${esc(inc.playerId)}<br>${esc(inc.site)}</div>
        <div class="eta">ETA ${esc(inc.etaMin || 18)} min · ${esc(inc.km || 11.4)} km</div>
      </div>
      <dl class="kv">
        <dt>Técnico</dt><dd>${esc(inc.tech || inc.assignee || 'Neo · flota campo')}</dd>
        <dt>Player</dt><dd>${esc(inc.playerId)}</dd>
        <dt>Sitio</dt><dd>${esc(inc.site)}</dd>
        <dt>Prioridad</dt><dd>${esc(inc.sev)} · SLA ${esc(inc.slaMin)} min</dd>
        <dt>Origen</dt><dd>${esc((inc.source || []).join(' + '))}</dd>
      </dl>
      <div class="sec">Tiempo</div>
      <div class="row">
        <label>MINUTOS<input type="number" id="mins" value="${esc(inc.minutes || 0)}" min="0" style="margin-top:4px"></label>
        <label>COSTE €<input type="number" id="cost" value="${esc(inc.cost || 0)}" min="0" style="margin-top:4px"></label>
      </div>
    </aside>
    <main class="col">
      <div class="sec">Checklist de campo</div>
      <ul class="check" id="check">
        ${(inc.checklist || []).map((c, i) => `<li><input type="checkbox" data-i="${i}" ${c.done ? 'checked' : ''}> ${esc(c.label)}</li>`).join('')}
      </ul>
      <div class="sec">Fotos del parte</div>
      <div class="photos" id="photos">
        ${(inc.photos || []).map((p) => `<div class="ph ${p.on ? 'on' : ''}" data-ph="${esc(p.id)}"><b>${p.on ? '■' : '+'}</b>${esc(p.label)}</div>`).join('') || '<div class="ph"><b>+</b>añadir foto</div>'}
      </div>
      <div class="sec">Notas</div>
      <textarea rows="5" id="notes">${esc(inc.notes || '')}</textarea>
      <p class="hint">P3 · assigned → in_field → resolved → valued. Cierra el ciclo de la pantalla al técnico.</p>
    </main>
    <aside class="col">
      <div class="card">
        <div class="sec">Avanzar estado</div>
        <p class="sub" id="stLabel">ahora: ${esc(inc.status)}</p>
        <div class="row">
          <button class="btn ghost" type="button" id="prev">← ATRÁS</button>
          <button class="btn pri" type="button" id="next">SIGUIENTE →</button>
        </div>
      </div>
      <div class="card">
        <div class="sec">Valoración del punto</div>
        <div class="score" id="scoreNum">${score ? score + ' / 5' : '— / 5'}</div>
        <div class="stars" id="stars">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star ${n <= score ? 'on' : ''}" data-v="${n}">${n}</button>`).join('')}
        </div>
        <input type="text" id="by" placeholder="valorado por (punto / gerente)" value="${esc(inc.valuation?.by || inc.site + ' · jefe de pasillo')}">
        <div class="row">
          <button class="btn pri" type="button" id="close">CERRAR CICLO · VALUED</button>
        </div>
        <p class="hint" id="valLog">${inc.valuation ? `valued · score ${inc.valuation.score} · ${inc.valuation.cost}€ · ${inc.valuation.minutes} min · by ${inc.valuation.by}` : 'score + coste + minutos se escriben en Incident.valuation'}</p>
      </div>
      <div class="card">
        <div class="sec">Feedback al player</div>
        <p class="meta">Al valued: re-sync playlist, confirmar heartbeat, devolver fila Flota a EN EMISIÓN. Deep-link sala sigue vivo.</p>
        <div class="row">
          <a class="btn ghost" href="${href('sala', { incidentId: inc.id, playerId: inc.playerId })}">VOLVER A SALA</a>
          <a class="btn ghost" href="${href('radar')}">COLA</a>
        </div>
      </div>
    </aside>
  </div>`;

  const persistNotes = () => store.patch(inc.id, { notes: $('#notes').value, minutes: Number($('#mins').value) || 0, cost: Number($('#cost').value) || 0 });
  $('#notes')?.addEventListener('change', persistNotes);
  $('#mins')?.addEventListener('change', persistNotes);
  $('#cost')?.addEventListener('change', persistNotes);
  $('#check')?.addEventListener('change', (e) => {
    const i = Number(e.target.dataset.i);
    const next = (inc.checklist || []).map((c, n) => n === i ? { ...c, done: e.target.checked } : c);
    store.patch(inc.id, { checklist: next });
  });
  $('#photos')?.addEventListener('click', (e) => {
    const ph = e.target.closest('[data-ph]'); if (!ph) return;
    const next = (inc.photos || []).map((p) => p.id === ph.dataset.ph ? { ...p, on: !p.on } : p);
    store.patch(inc.id, { photos: next });
    render();
  });
  $('#next')?.addEventListener('click', () => {
    const cur = inc.status === 'open' ? 'assigned' : inc.status;
    const i = flow.indexOf(cur);
    if (i < flow.length - 1 && flow[i + 1] !== 'valued') store.setStatus(inc.id, flow[i + 1]);
    else if (flow[i + 1] === 'valued') toast('El cierre es valued: usa CERRAR CICLO');
    render();
  });
  $('#prev')?.addEventListener('click', () => {
    const cur = inc.status === 'open' ? 'assigned' : inc.status;
    const i = flow.indexOf(cur);
    if (i > 0) store.setStatus(inc.id, flow[i - 1]);
    render();
  });
  let pick = score;
  $('#stars')?.addEventListener('click', (e) => {
    const s = e.target.closest('[data-v]'); if (!s) return;
    pick = Number(s.dataset.v);
    $('#stars').querySelectorAll('.star').forEach((x) => x.classList.toggle('on', Number(x.dataset.v) <= pick));
    $('#scoreNum').textContent = pick + ' / 5';
  });
  $('#close')?.addEventListener('click', () => {
    persistNotes();
    if (!pick) { toast('El cierre es con valor: elige 1–5'); return; }
    try {
      store.valueIncident(inc.id, {
        score: pick,
        by: $('#by').value.trim(),
        minutes: $('#mins').value,
        cost: $('#cost').value,
      });
      toast('Ciclo cerrado con valor, no con “cerrado”.');
      render();
    } catch (err) { toast(err.message); }
  });
}

let rendering = false;
export function render() {
  if (rendering) return;
  rendering = true;
  try {
    const state = parseRoute();
    document.title = state.view === 'sala'
      ? `P2 · Sala ${state.playerId || ''} · Admira.tv Soporte`
      : state.view === 'parte'
        ? `P3 · Parte ${state.incidentId || ''} · Admira.tv Soporte`
        : 'P1 · Radar / Cola · Admira.tv Soporte';
    if (state.view === 'sala') renderSala(state);
    else if (state.view === 'parte') renderParte(state);
    else renderRadar(state);
  } finally {
    rendering = false;
  }
}

store.subscribe(() => { if (!rendering) render(); });
window.addEventListener('popstate', render);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
else render();

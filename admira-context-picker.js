(function () {
  'use strict';

  const API = 'https://api.admira.store';
  const FALLBACK_PROJECTS = [
    { id: 'kiosk', name: 'CanalKiosk', circuits: ['kiosko', 'gracia'] },
    { id: 'xtanco', name: 'Canal Xtanco', circuits: ['xtanco', 'xtanco-valencia'] }
  ];
  const FALLBACK_SCREENS = [
    { screen: 'sim-gracia-kiosko', name: 'Canal Kiosk Plaça Vila', circuit: 'gracia', bands: 4, pixerScreens: [] },
    { screen: 'xtanco-escaparate-exterior', name: 'Escaparate exterior', circuit: 'xtanco', bands: 4, pixerScreens: [] },
    { screen: 'xtanco-led-frontal', name: 'LED Frontal', circuit: 'xtanco', bands: 4, pixerScreens: ['xtore-lg8qao', 'xtore-07313n'] },
    { screen: 'xtanco-led-vertical', name: 'LED Vertical', circuit: 'xtanco', bands: 4, pixerScreens: ['xtore-inicial'] },
    { screen: 'xtanco-mostrador-panel', name: 'Mostrador panel', circuit: 'xtanco', bands: 4, pixerScreens: [] },
    { screen: 'xtanco-vending-cigarreras', name: 'Vending / cigarreras', circuit: 'xtanco', bands: 4, pixerScreens: [] },
    { screen: 'xtore-escaparate-pn1w', name: 'Xtanco Valencia · Escaparate Colón', circuit: 'xtanco-valencia', bands: 4, pixerScreens: ['xtore-escaparate-pn1w'] }
  ];

  const byId = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const readLocal = key => { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } };
  const query = new URLSearchParams(location.search);

  let projects = FALLBACK_PROJECTS.slice();
  let screens = FALLBACK_SCREENS.slice();
  let activeProjectId = query.get('project') || readLocal('adtv_active_project') || 'kiosk';
  let activeLocationId = query.get('xpace') || readLocal('adtv_active_xpace') || '';
  let activeScreenId = query.get('device') || query.get('screen') || readLocal('adtv_active_device') || readLocal('adtv_active_screen') || 'sim-gracia-kiosko';
  let currentContext = null;

  function sourceXtancos() {
    const all = [...(window.OMNIP_LOCATIONS_DEFAULT || []), ...(window.OMNIP_LOCATIONS_EXTRA || [])];
    const seen = new Set();
    return all
      .filter(item => item && (/^xtanco(?:\s|$)/i.test(item.name || '') || /^xtanco(?:-|$)/i.test(item.id || '')))
      .filter(item => !seen.has(item.id) && seen.add(item.id));
  }

  function slug(value) {
    return String(value || 'device').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function projectFor(screen) {
    const haystack = `${screen.screen} ${screen.name} ${screen.circuit}`.toLowerCase();
    if (/kiosk|kiosko|gracia/.test(haystack)) return 'kiosk';
    if (/xtanco|xtore/.test(haystack)) return 'xtanco';
    const project = projects.find(item => (item.circuits || []).some(circuit => screen.circuit === circuit || String(screen.circuit || '').startsWith(circuit + '-')));
    return project ? project.id : '';
  }

  function mergeSourceDevices(gridScreens) {
    const gridById = new Map((gridScreens || []).map(item => [item.screen, item]));
    const kiosk = (gridScreens || []).filter(item => projectFor(item) === 'kiosk');
    const devices = [];
    for (const location of sourceXtancos()) {
      for (const surface of (location.surfaces || [])) {
        if (surface.surface === 'pwa') continue;
        const id = surface.screen || `${location.id}-${slug(surface.name)}`;
        const grid = gridById.get(id) || {};
        devices.push({
          ...grid,
          screen: id,
          name: surface.name,
          circuit: grid.circuit || (location.id === 'xtanco' ? 'xtanco' : location.id),
          bands: grid.bands || 4,
          pixerScreens: grid.pixerScreens || surface.pixerScreens || [],
          locationId: location.id,
          deviceType: surface.surface || 'pantalla',
          programmable: true
        });
      }
      if (location.cameras) devices.push({ screen: `${location.id}-camera`, name: 'Cámara de aforo', circuit: location.id, locationId: location.id, deviceType: 'camera', programmable: false });
      if (location.music) devices.push({ screen: `${location.id}-audio`, name: `Altavoces · ${location.music}`, circuit: location.id, locationId: location.id, deviceType: 'altavoz', programmable: false });
    }
    return kiosk.concat(devices);
  }

  function locationIdFor(screen) {
    if (screen.locationId) return screen.locationId;
    if (projectFor(screen) === 'kiosk') return 'gracia';
    return screen.circuit || screen.screen;
  }

  function locationName(id) {
    if (id === 'gracia') return 'CanalKiosk Gràcia · Plaça de la Vila';
    const source = sourceXtancos().find(item => item.id === id);
    return source ? source.name : String(id).replace(/-/g, ' ');
  }

  function locationsFor(projectId) {
    const found = new Map();
    for (const device of screens.filter(item => projectFor(item) === projectId)) {
      const id = locationIdFor(device);
      if (!found.has(id)) found.set(id, { id, name: locationName(id) });
    }
    return [...found.values()];
  }

  const devicesFor = locationId => screens.filter(item => locationIdFor(item) === locationId);

  function deviceKind(screen) {
    const text = `${screen.name} ${screen.screen} ${screen.deviceType || ''}`.toLowerCase();
    if (/camera|cámara/.test(text)) return { icon: '◉', name: 'Cámara' };
    if (/audio|speaker|altavoz|radio/.test(text)) return { icon: '♪', name: 'Altavoz' };
    if (/sensor|sonda/.test(text)) return { icon: '⌁', name: 'Sensor' };
    if (/vending/.test(text)) return { icon: '▤', name: 'Vending' };
    return { icon: '▣', name: 'Pantalla' };
  }

  function persistContext() {
    try {
      localStorage.setItem('adtv_active_project', activeProjectId);
      localStorage.setItem('adtv_active_xpace', activeLocationId);
      localStorage.setItem('adtv_active_device', activeScreenId);
    } catch (_) {}
    const url = new URL(location.href);
    url.searchParams.set('project', activeProjectId);
    url.searchParams.set('xpace', activeLocationId);
    url.searchParams.set('device', activeScreenId);
    url.searchParams.delete('screen');
    history.replaceState(null, '', url);
  }

  function notifyContext(project, xpace, screen) {
    currentContext = { project, xpace, screen };
    window.dispatchEvent(new CustomEvent('admira:context', { detail: { project, xpace, screen } }));
    const target = byId('segTarget');
    if (!target) return;
    const candidates = [screen.screen, xpace.id];
    const matched = candidates.find(id => [...target.options].some(option => option.value === id));
    if (matched && target.value !== matched) {
      target.value = matched;
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function render() {
    const visibleProjects = projects.filter(project => locationsFor(project.id).length);
    const project = visibleProjects.find(item => item.id === activeProjectId) || visibleProjects[0] || projects[0];
    activeProjectId = project.id;
    const locations = locationsFor(activeProjectId);
    if (!locations.some(item => item.id === activeLocationId)) activeLocationId = (locations[0] || {}).id || '';
    const devices = devicesFor(activeLocationId);
    if (!devices.some(item => item.screen === activeScreenId)) activeScreenId = (devices[0] || screens[0]).screen;
    const xpace = locations.find(item => item.id === activeLocationId) || locations[0];
    const screen = devices.find(item => item.screen === activeScreenId) || devices[0] || screens[0];
    const kind = deviceKind(screen);

    byId('projectCount').textContent = `// ${visibleProjects.length}`;
    byId('xpaceCount').textContent = `// ${locations.length}`;
    byId('deviceCount').textContent = `// ${devices.length}`;
    byId('projectSelect').innerHTML = visibleProjects.map(item => `<option value="${esc(item.id)}"${item.id === activeProjectId ? ' selected' : ''}>${esc(item.name)}</option>`).join('');
    byId('xpaceSelect').innerHTML = locations.map(item => `<option value="${esc(item.id)}"${item.id === activeLocationId ? ' selected' : ''}>${esc(item.name)}</option>`).join('');
    byId('deviceSelect').innerHTML = devices.map(item => {
      const itemKind = deviceKind(item);
      return `<option value="${esc(item.screen)}"${item.screen === activeScreenId ? ' selected' : ''}>${itemKind.icon} ${esc(item.name)}</option>`;
    }).join('');
    byId('contextMeta').textContent = `Editando ${project.name} › ${xpace.name} › ${kind.name} ${screen.name}`;
    persistContext();
    notifyContext(project, xpace, screen);
  }

  window.admiraSyncContextTarget = function () {
    if (currentContext) notifyContext(currentContext.project, currentContext.xpace, currentContext.screen);
  };

  async function load() {
    try {
      const [projectData, screenData] = await Promise.all([
        fetch(`${API}/grid/projects`, { cache: 'no-store' }).then(response => response.ok ? response.json() : Promise.reject()),
        fetch(`${API}/grid/screens`, { cache: 'no-store' }).then(response => response.ok ? response.json() : Promise.reject())
      ]);
      projects = (projectData.projects || FALLBACK_PROJECTS).filter(project => project.id === 'kiosk' || project.id === 'xtanco');
      for (const project of projects) {
        project.circuits = project.circuits || [];
        if (project.id === 'kiosk' && !project.circuits.includes('gracia')) project.circuits.push('gracia');
      }
      screens = sourceXtancos().length ? mergeSourceDevices(screenData.screens || []) : (screenData.screens || FALLBACK_SCREENS);
    } catch (_) {
      projects = FALLBACK_PROJECTS.slice();
      screens = sourceXtancos().length ? mergeSourceDevices(FALLBACK_SCREENS) : FALLBACK_SCREENS.slice();
    }
    render();
  }

  byId('projectSelect').addEventListener('change', event => {
    activeProjectId = event.target.value;
    activeLocationId = '';
    activeScreenId = '';
    render();
  });
  byId('xpaceSelect').addEventListener('change', event => {
    activeLocationId = event.target.value;
    activeScreenId = '';
    render();
  });
  byId('deviceSelect').addEventListener('change', event => {
    activeScreenId = event.target.value;
    render();
  });

  load();
})();

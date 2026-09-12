/* Persistent fleet identity and live telemetry are deliberately separate. */
(function (root) {
  'use strict';
  const endpoint = 'https://mcp-tv.admira.store/virtual-players';
  function isVirtual(row) {
    return !!row && (row.player_type === 'virtual' || /^(?:xtore-)?virtual-[a-z0-9-]+$/.test(String(row.screen || row.id || '')));
  }
  function label(row) { return isVirtual(row) ? 'Virtual · navegador' : ''; }
  function merge(live, registered) {
    const byScreen = new Map((Array.isArray(live) ? live : []).filter(p => p && p.screen).map(p => [p.screen, { ...p }]));
    for (const row of registered || []) {
      if (!row || row.player_type !== 'virtual' || !/^(?:xtore-)?virtual-[a-z0-9-]+$/.test(row.screen || '')) continue;
      const current = byScreen.get(row.screen);
      // Never turn registration into last_seen/online/playing or a physical machine.
      byScreen.set(row.screen, { ...(current || { online: false }), id: row.screen, screen: row.screen,
        name: row.name, circuit: row.circuit, loc: row.circuit, locName: row.name,
        player_type: 'virtual', runtime: 'browser', hardware: false, machine: '', registered: true,
        mode: row.mode, orientation: 'portrait', channel_url: row.channel_url, playlist_url: row.playlist_url, control_url: row.control_url });
    }
    return Array.from(byScreen.values());
  }
  async function list(fetcher = root.fetch.bind(root)) {
    const rows = [], seen = new Set(); let cursor = '';
    do {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetcher(endpoint + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { credentials: 'omit', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Registro virtual no disponible');
        const page = await response.json();
        if (page.ok !== true || !Array.isArray(page.players) || page.players.length > 100) throw new Error('Registro virtual inválido');
        rows.push(...page.players); cursor = page.cursor || '';
        if (cursor && (typeof cursor !== 'string' || cursor.length > 1024 || seen.has(cursor) || rows.length >= 1000)) throw new Error('Paginación virtual incompleta');
        seen.add(cursor);
      } finally { clearTimeout(timer); }
    } while (cursor);
    return rows;
  }
  root.AdmiraVirtualPlayers = Object.freeze({ endpoint, isVirtual, label, merge, list });
})(globalThis);

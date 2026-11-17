// Persistent exclusions belong to this player's browser and screen, never Stock.
export function createExclusions(storage, screen) {
  const key = 'admira:galleon:excluded:v1:' + screen;
  let ids = [];
  try { const saved = JSON.parse(storage.getItem(key) || '[]'); if (Array.isArray(saved)) ids = saved.filter(id => typeof id === 'string'); } catch {}
  let excluded = new Set(ids);
  return {
    has: item => excluded.has(String(item?.stockId || item?.id || '')),
    revision: () => [...excluded].sort().join(','),
    removeSlot(slot) {
      const removed = [...new Set([slot?.landscape, slot?.portrait].filter(Boolean).map(item => String(item.stockId || item.id || '')).filter(Boolean))];
      if (!removed.length) return [];
      const next = new Set([...excluded, ...removed]);
      storage.setItem(key, JSON.stringify([...next])); // Fail closed if persistence fails.
      excluded = next;
      return removed;
    }
  };
}

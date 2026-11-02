/**
 * localStorage that never throws. Sandboxed iframes, private modes and some embedding platforms
 * block storage entirely (any access throws); the game then simply runs without remembering
 * settings between visits.
 */
const mem = new Map();
function store() { try { const s = window.localStorage; s.getItem('__ff'); return s; } catch { return null; } }

export const storage = {
  get(key) { const s = store(); if (!s) return mem.has(key) ? mem.get(key) : null; try { return s.getItem(key); } catch { return mem.get(key) ?? null; } },
  set(key, value) { mem.set(key, String(value)); const s = store(); if (s) { try { s.setItem(key, String(value)); } catch {} } },
};

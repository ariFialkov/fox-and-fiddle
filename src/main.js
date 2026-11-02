import { Game } from './engine/Game.js';

window.__ffStarted = true; // tells the inline boot watchdog in index.html that the game script is running

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');

new Game(canvas, ui).init().then(() => {
  document.getElementById('boot').classList.add('gone');
}).catch((e) => {
  console.error(e);
  if (window.__ffBootError) window.__ffBootError('could not open: ' + ((e && e.message) || e));
});

// Offline support. Skipped quietly wherever service workers are not allowed (sandboxed frames,
// plain http, embedded webviews); the game itself does not need it.
try {
  if (!import.meta.env.DEV && 'serviceWorker' in navigator && window.isSecureContext && location.protocol.startsWith('http')) {
    addEventListener('load', () => { try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch {} });
  }
} catch {}

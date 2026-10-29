import { Game } from './engine/Game.js';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');

new Game(canvas, ui).init().then(() => {
  document.getElementById('boot').classList.add('gone');
}).catch((e) => {
  console.error(e);
  document.querySelector('.boot-sub').textContent = 'could not open: ' + (e.message || e) + ' — reload to try again';
  document.querySelector('.boot-sub').style.whiteSpace = 'pre-wrap';
  document.querySelector('.boot-sub').style.maxWidth = '80vw';
});

if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}));
}

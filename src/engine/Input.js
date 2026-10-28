/**
 * Unified input: keyboard, mouse/touch pointer (with drag + swipe analysis),
 * wheel, and an on-screen joystick for touch devices.
 */
export class Input {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    this.keys = new Set();
    this.pressed = new Set();     // keys pressed this frame
    this.released = new Set();
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.pointer = { x: 0, y: 0, down: false, dx: 0, dy: 0, button: 0, startX: 0, startY: 0, startT: 0, path: [] };
    this.clicks = [];             // pointer-ups that were taps/clicks this frame
    this.swipes = [];             // completed swipes this frame
    this.wheel = 0;               // accumulated wheel delta this frame
    this.joy = { x: 0, y: 0, active: false };
    this.enabled = true;
    this.ignoreNextClick = false;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); this.released.add(e.code); });
    window.addEventListener('blur', () => this.keys.clear());

    const onDown = (e) => {
      if (e.target !== canvas && !(e.target.classList && e.target.classList.contains('touchpad'))) return;
      const p = this.pointer;
      p.down = true; p.button = e.button || 0;
      p.x = p.startX = e.clientX; p.y = p.startY = e.clientY; p.startT = performance.now();
      p.path = [{ x: e.clientX, y: e.clientY, t: p.startT }];
      p.id = e.pointerId;
      try { e.target.setPointerCapture(e.pointerId); } catch {}
    };
    const onMove = (e) => {
      const p = this.pointer;
      if (p.down && e.pointerId !== p.id) return;
      p.dx += e.clientX - p.x; p.dy += e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (p.down) p.path.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    };
    const onUp = (e) => {
      const p = this.pointer;
      if (!p.down || e.pointerId !== p.id) return;
      p.down = false;
      const dt = performance.now() - p.startT;
      const dx = e.clientX - p.startX, dy = e.clientY - p.startY;
      const dist = Math.hypot(dx, dy);
      if (dist < 8 && dt < 400) this.clicks.push({ x: e.clientX, y: e.clientY, button: p.button });
      else if (dist > 40) this.swipes.push(analyseSwipe(p.path));
      p.path = [];
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { this.wheel += e.deltaY; if (this.enabled) e.preventDefault(); }, { passive: false });

    this.buildJoystick();
  }

  buildJoystick() {
    const el = document.createElement('div');
    el.className = 'joystick';
    el.innerHTML = '<div class="knob"></div>';
    this.ui.appendChild(el);
    this.joyEl = el;
    const knob = el.querySelector('.knob');
    let id = null, cx = 0, cy = 0;
    const R = 50;
    el.addEventListener('pointerdown', (e) => {
      id = e.pointerId; el.setPointerCapture(id);
      const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      this.joy.active = true; move(e);
    });
    const move = (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy.x = dx / R; this.joy.y = dy / R;
    };
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; this.joy.active = false; this.joy.x = this.joy.y = 0;
      knob.style.transform = '';
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    // right-half touchpad for look / mini-game gestures on touch devices
    const pad = document.createElement('div');
    pad.className = 'touchpad';
    this.ui.appendChild(pad);
    this.padEl = pad;
  }

  showJoystick(on) {
    this.joyEl.classList.toggle('show', on && this.isTouch);
    this.padEl.classList.toggle('show', on && this.isTouch);
  }

  down(code) { return this.keys.has(code); }
  justPressed(code) { return this.pressed.has(code); }
  justReleased(code) { return this.released.has(code); }

  /** Movement axis: x (-1 left .. 1 right), y (-1 back .. 1 forward). */
  axis() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.joy.active) { x += this.joy.x; y -= this.joy.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  /** Call at the end of every frame. */
  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.clicks.length = 0; this.swipes.length = 0;
    this.wheel = 0; this.pointer.dx = 0; this.pointer.dy = 0;
  }
}

/**
 * Turn a pointer path into a swipe descriptor:
 *  dx/dy total displacement (px), speed (px/ms), angle, and
 *  straightness in [0,1] (1 = perfectly straight line).
 */
export function analyseSwipe(path) {
  const a = path[0], b = path[path.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const dt = Math.max(1, b.t - a.t);
  // deviation of intermediate points from the chord
  let dev = 0, travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const p = path[i], q = path[i - 1];
    travelled += Math.hypot(p.x - q.x, p.y - q.y);
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len);
    const px = a.x + t * dx, py = a.y + t * dy;
    dev = Math.max(dev, Math.hypot(p.x - px, p.y - py));
  }
  const wobble = Math.min(1, dev / (len * 0.35)) * 0.6 + Math.min(1, (travelled / len - 1) * 2) * 0.4;
  return { dx, dy, len, dt, speed: len / dt, angle: Math.atan2(-dy, dx), straightness: 1 - Math.min(1, wobble), points: path.length };
}

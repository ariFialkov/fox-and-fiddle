/**
 * Mini-game lifecycle. `run()` resolves with { win, title, line, payout? }.
 * Everything a mini-game adds to the scene goes into `this.group` and is
 * removed on dispose. The round's fate is in `ctx.round`; the mini-game's job
 * is to make a skill-looking path to it.
 */
import * as THREE from 'three';

export class MiniGame {
  constructor(ctx) {
    this.ctx = ctx;
    Object.assign(this, ctx); // scene, camera, player, hud, input, api, bar, station, round...
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.t = 0;
    this.done = false;
    this.timers = [];
  }
  run() { return new Promise((resolve) => { this.resolve = resolve; this.start(); }); }
  start() {}
  update(dt) { this.t += dt; }
  finish(result) { if (this.done) return; this.done = true; this.after(0.05, () => this.resolve(result)); }
  after(sec, fn) { const id = setTimeout(fn, sec * 1000); this.timers.push(id); return id; }
  wait(sec) { return new Promise((r) => this.after(sec, r)); }
  dispose() {
    this.timers.forEach(clearTimeout);
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
  }
  /** Smoothly move the camera to a pose. */
  async moveCamera(pos, lookAt, sec = 0.9) {
    const cam = this.camera;
    const p0 = cam.position.clone(), q0 = cam.quaternion.clone();
    const tmp = new THREE.PerspectiveCamera(); tmp.position.copy(pos); tmp.lookAt(lookAt);
    const q1 = tmp.quaternion.clone();
    const t0 = performance.now();
    return new Promise((res) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
        const e = k * k * (3 - 2 * k);
        cam.position.lerpVectors(p0, pos, e);
        cam.quaternion.slerpQuaternions(q0, q1, e);
        if (k < 1 && !this.done) requestAnimationFrame(step); else res();
      };
      step();
    });
  }
  /** Player's view through a mini-game: the Game loop no longer drives the camera, we do. */
  setCamera(pos, lookAt) { this.camera.position.copy(pos); this.camera.lookAt(lookAt); }
}

/**
 * Darts against Fergus. Two modes, chosen before the first throw:
 *  - Highest total: three darts each, you throw first, highest total wins (ties replay).
 *  - 501: count down from 501, three darts a visit, you must finish exactly on 0. Fergus throws
 *    first in 501 so the result never depends on your visit: if you are meant to lose he
 *    finishes before you can (he goes first, so he is never a visit behind); if you are meant
 *    to win he never finishes (he busts his finishes) and you get there when you get there.
 * A throw is a swipe: angle -> left/right, speed -> high/low, wobble -> scatter. Your darts land
 * exactly where you threw them.
 */
import * as THREE from 'three';
import { MiniGame } from './base.js';
import { Patron } from '../world/Patron.js';

const NUMS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const VALID = [0, 25, 50];
for (let n = 1; n <= 20; n++) VALID.push(n, n * 2, n * 3);
const VALID_SET = new Set(VALID);
/** Totals reachable with up to three darts. */
const VISIT = new Set();
for (const a of VALID) for (const b of VALID) for (const c of VALID) VISIT.add(a + b + c);

/** Score for a point (bx right, by up) in metres from the board centre, given scoring radius R. */
export function scoreAt(bx, by, R) {
  const r = Math.hypot(bx, by) / R;
  if (r > 1) return { score: 0, label: 'miss' };
  if (r < 0.037) return { score: 50, label: 'BULL' };
  if (r < 0.094) return { score: 25, label: 'outer bull' };
  const a = Math.atan2(bx, by);
  const idx = Math.floor((((a + Math.PI / 20) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 10)) % 20;
  const n = NUMS[idx];
  if (r >= 0.58 && r <= 0.63) return { score: n * 3, label: `treble ${n}` };
  if (r >= 0.95) return { score: n * 2, label: `double ${n}` };
  return { score: n, label: `${n}` };
}

/** A random board point that scores exactly `s` (0 = a miss just outside the ring). */
function pointForScore(s, R) {
  if (s === 0) { const a = Math.random() * Math.PI * 2, r = 1.08 + Math.random() * 0.1; return { x: Math.sin(a) * r * R, y: Math.cos(a) * r * R }; }
  for (let i = 0; i < 600; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random();
    const x = Math.sin(a) * r * R, y = Math.cos(a) * r * R;
    if (scoreAt(x, y, R).score === s) return { x, y };
  }
  let best = null, bd = Infinity;
  for (let r = 0; r <= 1; r += 0.01) for (let a = 0; a < Math.PI * 2; a += Math.PI / 90) {
    const x = Math.sin(a) * r * R, y = Math.cos(a) * r * R;
    if (scoreAt(x, y, R).score === s && r < bd) { bd = r; best = { x, y }; }
  }
  return best || { x: 0, y: 0 };
}

/** Split a visit total into up to three dart scores (prefers fewer darts when `exact`). */
function splitVisit(total, exact = false) {
  if (exact && VALID_SET.has(total)) return [total];
  for (let i = 0; i < 400; i++) {
    const a = VALID[Math.floor(Math.random() * VALID.length)];
    if (a > total) continue;
    if (exact && VALID_SET.has(total - a) && Math.random() < 0.5) return [a, total - a];
    const b = VALID[Math.floor(Math.random() * VALID.length)];
    if (a + b > total) continue;
    const c = total - a - b;
    if (VALID_SET.has(c)) return [a, b, c];
  }
  for (const a of VALID) for (const b of VALID) { const c = total - a - b; if (c >= 0 && VALID_SET.has(c)) return [a, b, c]; }
  return [0, 0, 0];
}

export class Darts extends MiniGame {
  start() {
    const b = this.bar.dartboard;
    this.R = b.R;
    this.boardPos = b.pos;
    this.player.enabled = false;
    const st = this.station.pos;
    this.eye = new THREE.Vector3(st.x, 1.6, st.z);
    this.fov0 = this.camera.fov;
    this.fitCamera();
    this.onResize = () => this.fitCamera(); addEventListener('resize', this.onResize);

    this.bot = new Patron({ name: 'Fergus', shirt: 0x3d6b3a, height: 1.02, seed: 77 });
    this.bot.root.position.set(st.x + 1.0, 0, st.z + 1.05);
    this.bot.lookAt(new THREE.Vector3(b.pos.x, 0, b.pos.z));
    this.group.add(this.bot.root);

    this.darts = [];
    this.busy = false;
    this.mode = this.ctx.mode === '501' ? '501' : 'total';
    this.hud.setHints(`<kbd>swipe up</kbd> to throw · long swipes are steadier · angle = left/right · speed = high/low · keep it straight`);
    if (this.mode === 'total') { this.leg = 0; this.startLeg(); this.hud.showToast('Your throw', 'three darts each, highest total wins', 2200); }
    else { this.rem = { you: 501, bot: 501 }; this.phase = 'bot'; this.updateScore('Fergus throws first'); this.hud.showToast('501', 'finish exactly on zero · Fergus throws first', 2000); this.after(1.6, () => { if (!this.done) this.botVisit(); }); }
  }

  /** Zoom so the board (number ring included) fills most of the screen in either orientation. */
  fitCamera() {
    const b = this.bar.dartboard;
    const d = this.eye.distanceTo(b.pos);
    const aspect = innerWidth / innerHeight;
    const outer = 0.2255, fill = 0.82;
    const tanHalf = outer / (fill * d * Math.min(1, aspect));
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalf));
    this.camera.updateProjectionMatrix();
    // aim a touch above centre so the board sits clear of the score panel
    this.setCamera(this.eye, new THREE.Vector3(b.pos.x, b.pos.y + outer * 0.1, b.pos.z));
    this.camBase = this.camera.quaternion.clone();
  }

  // ---------- highest-total mode ----------
  startLeg() {
    this.clearDarts();
    this.leg++;
    this.you = 0; this.bot.score = 0;
    this.phase = 'you';
    this.throwIdx = 0;
    this.busy = false;
    this.updateScore(this.leg > 1 ? `leg ${this.leg} · your throw` : 'your throw');
  }
  botTarget(yours) {
    if (this.round.win) {
      if (yours <= 0) return null;
      const t = yours - 1 - Math.floor(Math.random() * Math.min(30, yours));
      return Math.max(0, Math.min(yours - 1, t));
    }
    if (yours >= 180) return null;
    return Math.min(180, yours + 1 + Math.floor(Math.random() * 30));
  }
  startBot() {
    this.phase = 'bot';
    this.throwIdx = 0;
    const target = this.botTarget(this.you);
    this.botDarts = target == null ? [0, 0, 0].map(() => pointForScore(0, this.R)) : splitVisit(target).map((sc) => pointForScore(sc, this.R));
    this.updateScore(`Fergus needs ${this.you + 1}`);
    this.hud.showToast('Fergus steps up', `needs ${this.you + 1} to win`, 1500);
    this.clearDarts();
    this.after(1.2, () => this.botThrow());
  }
  botThrow() {
    if (this.done) return;
    const pt = this.botDarts[this.throwIdx];
    this.bot.throwDart();
    const from = this.bot.root.position.clone().add(new THREE.Vector3(0.2, 1.4, -0.2));
    this.after(0.35, () => this.flyDart(from, pt, 0xdd3333, () => {
      const s = scoreAt(pt.x, pt.y, this.R);
      this.bot.score += s.score;
      this.updateScore(`Fergus: ${s.label}`);
      this.throwIdx++;
      if (this.throwIdx < 3) this.after(0.9, () => this.botThrow());
      else this.after(1.2, () => this.endLeg());
    }));
  }
  endLeg() {
    if (this.you > this.bot.score) return this.conclude(true);
    if (this.bot.score > this.you) return this.conclude(false);
    this.hud.showToast(this.you === 0 ? 'Nobody troubled the board' : 'Level', 'play the leg again', 1800);
    this.after(1.6, () => this.startLeg());
  }

  // ---------- 501 mode ----------
  /** Plan Fergus's visit as dart scores. The plan may be shorter than 3 darts (a finish or a bust). */
  planVisit501() {
    const rb = this.rem.bot, ry = this.rem.you;
    const finishable = (n) => n > 0 && n <= 180 && VISIT.has(n);
    if (!this.round.win) {
      // fated to beat you: finish as soon as you could finish on your next visit, or when he fancies it
      const threat = finishable(ry);
      if (finishable(rb) && (threat || rb <= 100 || Math.random() < 0.35)) return { darts: splitVisit(rb, true), finish: true };
      // otherwise score: stay at or below your remaining, land on a finishable number when under 180
      const wish = 95 + Math.floor(Math.random() * 45);
      const cands = [];
      for (let v = 0; v <= 180; v++) {
        if (!VISIT.has(v)) continue;
        const nr = rb - v;
        if (nr < 2 || nr > ry) continue;
        if (nr <= 180 && !finishable(nr)) continue;
        cands.push(v);
      }
      if (!cands.length) return { darts: splitVisit(rb, true), finish: true };
      cands.sort((a, b) => Math.abs(a - wish) - Math.abs(b - wish));
      return { darts: splitVisit(cands[0]), finish: false };
    }
    // fated to lose to you: never finish. Under 60 he busts his finishes; otherwise plods along.
    if (rb <= 60) {
      if (rb <= 2 || Math.random() < 0.6) { const over = VALID.filter((v) => v > rb); return { darts: [over[Math.floor(Math.random() * over.length)]], bust: true }; }
      const nr = 2 + Math.floor(Math.random() * Math.min(20, rb - 2));
      return { darts: splitVisit(rb - nr), finish: false };
    }
    const wish = 45 + Math.floor(Math.random() * 55);
    const cands = [];
    for (let v = 0; v <= 180; v++) { if (!VISIT.has(v)) continue; const nr = rb - v; if (nr < 2) continue; cands.push(v); }
    cands.sort((a, b) => Math.abs(a - wish) - Math.abs(b - wish));
    return { darts: splitVisit(cands[0]), finish: false };
  }

  botVisit() {
    if (this.done) return;
    this.phase = 'bot';
    this.clearDarts();
    const plan = this.planVisit501();
    this.botPlan = plan;
    this.botDarts = plan.darts.map((sc) => pointForScore(sc, this.R));
    this.throwIdx = 0;
    this.visitStart = this.rem.bot;
    this.updateScore(`Fergus · ${this.rem.bot} left`);
    this.after(0.9, () => this.botThrow501());
  }
  botThrow501() {
    if (this.done) return;
    const pt = this.botDarts[this.throwIdx];
    this.bot.throwDart();
    const from = this.bot.root.position.clone().add(new THREE.Vector3(0.2, 1.4, -0.2));
    this.after(0.35, () => this.flyDart(from, pt, 0xdd3333, () => {
      const s = scoreAt(pt.x, pt.y, this.R);
      this.throwIdx++;
      if (s.score > this.rem.bot) {
        this.rem.bot = this.visitStart;
        this.updateScore(`Fergus busts on ${s.label}`);
        this.hud.showToast('Bust!', `Fergus back to ${this.rem.bot}`, 1400);
        return this.after(1.4, () => this.startPlayerVisit());
      }
      this.rem.bot -= s.score;
      this.updateScore(`Fergus: ${s.label}`);
      if (this.rem.bot === 0) return this.after(1.2, () => this.conclude(false, 'Fergus checks out'));
      if (this.throwIdx < this.botDarts.length) this.after(0.9, () => this.botThrow501());
      else this.after(1.2, () => this.startPlayerVisit());
    }));
  }
  startPlayerVisit() {
    this.clearDarts();
    this.phase = 'you';
    this.throwIdx = 0;
    this.visitStart = this.rem.you;
    this.busy = false;
    this.updateScore(`your visit · ${this.rem.you} left`);
  }

  updateScore(sub) {
    if (this.mode === '501') this.hud.setScore(`You <em>${this.rem.you}</em> · Fergus <em>${this.rem.bot}</em>`, sub);
    else this.hud.setScore(`You <em>${this.you}</em> · Fergus <em>${this.bot.score}</em>`, sub);
  }

  update(dt) {
    super.update(dt);
    this.bot.update(dt);
    const q = this.camBase.clone();
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    e.x += Math.sin(this.t * 1.1) * 0.0012; e.y += Math.sin(this.t * 0.7) * 0.0009;
    this.camera.quaternion.setFromEuler(e);
    if (this.phase === 'you' && !this.busy && this.input.swipes.length) {
      const sw = this.input.swipes[0];
      if (sw.dy < -20) this.playerThrow(sw);
    }
    for (const d of this.darts) if (d.update) d.update(dt);
  }

  /**
   * Swipe -> landing point. Everything is measured in screen heights so desktop and phones feel
   * the same. Direction (sideways drift per unit of upward travel) sets left/right; the speed of
   * the flick sets high/low (a brisk ~2.6 screen-heights/second lands on the bull's line);
   * wobble scatters it. Short flicks are refused: a long swipe is a steady swipe.
   */
  playerThrow(sw) {
    const H = innerHeight;
    if (sw.len / H < 0.16) { this.hud.showToast('Longer swipe', 'draw it up the screen in one smooth stroke', 1100); return; }
    this.busy = true;
    const R = this.R;
    let bx = (sw.dx / Math.max(1, -sw.dy)) * 1.2 * R;
    const speed = (sw.activeSpeed ?? sw.speed) / H * 1000;
    let by = (speed - 2.6) * 0.7 * R;
    const scatter = (1 - sw.straightness) * 0.22 * R;
    const ang = Math.random() * Math.PI * 2, rr = Math.random() * scatter;
    bx += Math.cos(ang) * rr; by += Math.sin(ang) * rr;
    bx = THREE.MathUtils.clamp(bx, -1.4 * R, 1.4 * R); by = THREE.MathUtils.clamp(by, -1.4 * R, 1.4 * R);
    const pt = { x: bx, y: by };
    const from = this.camera.localToWorld(new THREE.Vector3(0.25, -0.2, -0.3));
    this.flyDart(from, pt, 0x3355dd, () => {
      const s = scoreAt(pt.x, pt.y, this.R);
      this.throwIdx++;
      if (this.mode === '501') {
        if (s.score > this.rem.you) {
          this.rem.you = this.visitStart;
          this.updateScore(`bust on ${s.label}`);
          this.hud.showToast('Bust!', `back to ${this.rem.you}`, 1400);
          return this.after(1.4, () => this.botVisit());
        }
        this.rem.you -= s.score;
        this.updateScore(`${s.label}${this.throwIdx < 3 ? ` · ${3 - this.throwIdx} left` : ''}`);
        if (this.rem.you === 0) return this.after(1.0, () => this.conclude(true, 'Checked out'));
        this.busy = this.throwIdx >= 3;
        if (this.throwIdx >= 3) this.after(1.2, () => this.botVisit());
        return;
      }
      this.you += s.score;
      this.updateScore(`${s.label}${this.throwIdx < 3 ? ` · ${3 - this.throwIdx} left` : ''}`);
      this.busy = false;
      if (this.throwIdx >= 3) { this.busy = true; this.after(1.2, () => this.startBot()); }
    });
  }

  conclude(win, title) {
    const lines = win
      ? ['"Lucky arrows," Fergus mutters, and buys the round.', '"Nobody beats me on a Tuesday." It is Thursday.']
      : ['"Practice makes perfect. You should try it."', 'Fergus chalks it up without looking at you.'];
    const t = title || (this.mode === '501' ? (win ? 'Game shot' : 'Fergus checks out') : (win ? `${this.you} beats ${this.bot.score}` : `${this.you} to ${this.bot.score}`));
    this.finish({ win, title: t, line: lines[Math.floor(Math.random() * lines.length)] });
  }

  /**
   * A proper steel-tip dart, ~15cm: needle point, knurled tungsten barrel, nylon shaft and four
   * printed flights. Built along +Y then turned so the point sits at the origin facing +Z.
   */
  makeDart(color) {
    const key = 'dart' + color;
    if (!Darts.cache) Darts.cache = {};
    if (!Darts.cache[key]) {
      const steel = new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 1, roughness: 0.18 });
      const tungsten = new THREE.MeshStandardMaterial({ color: 0x8b9097, metalness: 0.95, roughness: 0.32 });
      const shaftMat = new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.2, roughness: 0.4 });
      const ringMat = new THREE.MeshStandardMaterial({ color: 0xc9a23a, metalness: 1, roughness: 0.3 });
      const lathe = (pts, mat) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 24), mat);
      const point = lathe([[0, 0], [0.0004, 0.0015], [0.0009, 0.006], [0.00115, 0.03], [0.0013, 0.0315], [0, 0.0315]], steel);
      // barrel: front taper, 10 knurled grip rings, rear taper
      const bp = [[0, 0.031], [0.0016, 0.031], [0.0031, 0.037], [0.0034, 0.041]];
      for (let i = 0; i < 10; i++) { const y = 0.042 + i * 0.0042; bp.push([0.0034, y], [0.0029, y + 0.0012], [0.0029, y + 0.0026], [0.0034, y + 0.0036]); }
      bp.push([0.0034, 0.085], [0.0028, 0.09], [0.002, 0.092], [0, 0.092]);
      const barrel = lathe(bp, tungsten);
      const shaft = lathe([[0, 0.091], [0.0019, 0.091], [0.0017, 0.1], [0.00155, 0.128], [0.0019, 0.13], [0.0019, 0.136], [0, 0.137]], shaftMat);
      const ring = lathe([[0, 0.1255], [0.0021, 0.1255], [0.0021, 0.1275], [0, 0.1275]], ringMat);
      // flight texture: team colour, a pale chevron and a dark edge
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const g2 = c.getContext('2d');
      const hex = '#' + color.toString(16).padStart(6, '0');
      g2.fillStyle = hex; g2.fillRect(0, 0, 128, 128);
      const grad = g2.createLinearGradient(0, 0, 128, 128); grad.addColorStop(0, 'rgba(255,255,255,0.25)'); grad.addColorStop(1, 'rgba(0,0,0,0.25)');
      g2.fillStyle = grad; g2.fillRect(0, 0, 128, 128);
      g2.strokeStyle = 'rgba(255,255,255,0.85)'; g2.lineWidth = 10; g2.beginPath(); g2.moveTo(10, 100); g2.lineTo(64, 40); g2.lineTo(118, 100); g2.stroke();
      g2.strokeStyle = 'rgba(0,0,0,0.6)'; g2.lineWidth = 8; g2.strokeRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const flightMat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.55 });
      const shape = new THREE.Shape();
      shape.moveTo(0.0016, 0.104); shape.lineTo(0.0165, 0.118); shape.quadraticCurveTo(0.0185, 0.13, 0.0175, 0.1395); shape.lineTo(0.0016, 0.1395); shape.lineTo(0.0016, 0.104);
      const fg = new THREE.ShapeGeometry(shape, 6);
      fg.computeBoundingBox();
      const bb = fg.boundingBox, uv = fg.attributes.uv, pos = fg.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
      const inner = new THREE.Group();
      inner.add(point, barrel, shaft, ring);
      for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(fg, flightMat); f.rotation.y = (i * Math.PI) / 2 + Math.PI / 4; inner.add(f); }
      for (const m of inner.children) { m.castShadow = true; }
      inner.rotation.x = -Math.PI / 2;   // +Y (towards the flights) -> -Z: point at the origin facing +Z
      Darts.cache[key] = inner;
    }
    const g = new THREE.Group();
    g.add(Darts.cache[key].clone());
    return g;
  }

  /** Fly a dart from `from` to board point `pt` (scoring coordinates: x = right as you look at the board). */
  flyDart(from, pt, color, onLand) {
    const dart = this.makeDart(color);
    // the camera looks along +x at the board, so "right" on screen is world +z
    const target = this.boardPos.clone().add(new THREE.Vector3(0, pt.y, pt.x));
    this.group.add(dart);
    const dur = 0.42;
    let t = 0;
    const ctrl = from.clone().lerp(target, 0.5).add(new THREE.Vector3(0, 0.18, 0));
    const tmp = new THREE.Vector3(), next = new THREE.Vector3();
    const wob = new THREE.Euler((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, Math.random() * Math.PI * 2);
    const bez = (k, out) => out.set(0, 0, 0).addScaledVector(from, (1 - k) * (1 - k)).addScaledVector(ctrl, 2 * (1 - k) * k).addScaledVector(target, k * k);
    dart.update = (dt) => {
      t += dt;
      const k = Math.min(1, t / dur);
      bez(k, tmp); bez(Math.min(1, k + 0.02), next);
      dart.position.copy(tmp);
      if (k < 1) { dart.lookAt(next); dart.rotateZ(t * 25); }
      else {
        // stuck in the board, point slightly embedded, flights at a small random angle
        dart.position.copy(target).add(new THREE.Vector3(0.008, 0, 0));
        dart.lookAt(target.clone().add(new THREE.Vector3(1, 0, 0)));
        dart.rotateX(wob.x); dart.rotateY(wob.y); dart.rotateZ(wob.z);
        dart.update = null; onLand && onLand();
      }
    };
    this.darts.push(dart);
  }

  clearDarts() { for (const d of this.darts) this.group.remove(d); this.darts = []; }
  dispose() { super.dispose(); removeEventListener('resize', this.onResize); this.camera.fov = this.fov0; this.camera.updateProjectionMatrix(); }
}

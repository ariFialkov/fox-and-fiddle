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
    this.setCamera(this.eye, new THREE.Vector3(b.pos.x, b.pos.y - 0.03, b.pos.z));
    this.camBase = this.camera.quaternion.clone();
    this.fov0 = this.camera.fov; this.camera.fov = 28; this.camera.updateProjectionMatrix();

    this.bot = new Patron({ name: 'Fergus', shirt: 0x3d6b3a, height: 1.02, seed: 77 });
    this.bot.root.position.set(st.x + 1.0, 0, st.z + 1.05);
    this.bot.lookAt(new THREE.Vector3(b.pos.x, 0, b.pos.z));
    this.group.add(this.bot.root);

    this.darts = [];
    this.busy = false;
    this.mode = localStorage.getItem('ff.dartsMode') || 'total';
    this.thrown = false;
    this.hud.setHints(`<kbd>swipe up</kbd> to throw · angle = left/right · speed = high/low · keep it straight`);
    this.hud.setModes(['Highest total', '501'], this.mode === '501' ? 1 : 0, (i) => this.setMode(i ? '501' : 'total'));
    this.setMode(this.mode, true);
  }

  setMode(mode, init = false) {
    if (this.thrown) return;
    this.mode = mode;
    localStorage.setItem('ff.dartsMode', mode);
    this.hud.setModes(['Highest total', '501'], mode === '501' ? 1 : 0, (i) => this.setMode(i ? '501' : 'total'));
    this.clearDarts();
    if (mode === 'total') { this.leg = 0; this.startLeg(); if (!init) this.hud.showToast('Highest total', 'three darts each, you throw first', 1800); else this.hud.showToast('Your throw', 'three darts each, highest total wins', 2200); }
    else { this.rem = { you: 501, bot: 501 }; this.phase = 'bot'; this.visitDarts = 0; this.updateScore('Fergus throws first'); this.hud.showToast('501', 'finish exactly on zero · Fergus throws first', 2000); this.after(1.6, () => { if (this.mode === '501' && !this.done) this.botVisit(); }); }
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
    e.x += Math.sin(this.t * 1.1) * 0.004; e.y += Math.sin(this.t * 0.7) * 0.003;
    this.camera.quaternion.setFromEuler(e);
    if (this.phase === 'you' && !this.busy && this.input.swipes.length) {
      const sw = this.input.swipes[0];
      if (sw.dy < -20) this.playerThrow(sw);
    }
    for (const d of this.darts) if (d.update) d.update(dt);
  }

  playerThrow(sw) {
    this.busy = true;
    if (!this.thrown) { this.thrown = true; this.hud.setModes(null); }
    const tilt = Math.atan2(sw.dx, -sw.dy);
    let bx = Math.sin(tilt) * 0.55;
    const ideal = 1.35;
    let by = (sw.speed - ideal) * 0.3;
    const scatter = (1 - sw.straightness) * 0.09;
    const ang = Math.random() * Math.PI * 2, rr = Math.random() * scatter;
    bx += Math.cos(ang) * rr; by += Math.sin(ang) * rr;
    bx = THREE.MathUtils.clamp(bx, -0.3, 0.3); by = THREE.MathUtils.clamp(by, -0.3, 0.3);
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

  makeDart(color) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.3 }));
    shaft.rotation.x = Math.PI / 2; shaft.position.z = -0.03;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.03, 6), new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.9 }));
    tip.rotation.x = Math.PI / 2; tip.position.z = 0.045;
    const flight = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.03), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6 }));
    flight.position.z = -0.1; flight.position.y = 0.012;
    const flight2 = flight.clone(); flight2.rotation.z = Math.PI / 2; flight2.position.set(0.012, 0, -0.1);
    g.add(shaft, tip, flight, flight2);
    return g;
  }

  flyDart(from, pt, color, onLand) {
    const dart = this.makeDart(color);
    const target = this.boardPos.clone().add(new THREE.Vector3(0, pt.y, -pt.x)); // board right = -z
    this.group.add(dart);
    const dur = 0.42;
    let t = 0;
    const ctrl = from.clone().lerp(target, 0.5).add(new THREE.Vector3(0, 0.18, 0));
    const tmp = new THREE.Vector3();
    dart.update = (dt) => {
      t += dt;
      const k = Math.min(1, t / dur);
      tmp.set(0, 0, 0).addScaledVector(from, (1 - k) * (1 - k)).addScaledVector(ctrl, 2 * (1 - k) * k).addScaledVector(target, k * k);
      const next = new THREE.Vector3().addScaledVector(from, (1 - k - 0.02) * (1 - k - 0.02)).addScaledVector(ctrl, 2 * (1 - k - 0.02) * (k + 0.02)).addScaledVector(target, (k + 0.02) * (k + 0.02));
      dart.position.copy(tmp);
      dart.lookAt(k < 1 ? next : target.clone().add(new THREE.Vector3(1, 0, 0)));
      if (k >= 1) { dart.position.copy(target).add(new THREE.Vector3(-0.045, 0, 0)); dart.lookAt(target.clone().add(new THREE.Vector3(1, 0, 0))); dart.update = null; onLand && onLand(); }
    };
    this.darts.push(dart);
  }

  clearDarts() { for (const d of this.darts) this.group.remove(d); this.darts = []; }
  dispose() { super.dispose(); this.camera.fov = this.fov0; this.camera.updateProjectionMatrix(); }
}

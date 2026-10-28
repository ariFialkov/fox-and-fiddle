/**
 * Darts: the regular throws three darts first, then you throw three. Highest total wins (ties go to the house).
 * Throw = a swipe. Angle -> left/right, speed -> high/low, wobble -> scatter radius.
 * The bot's total comes from the round's flavour; your darts are nudged only when a landing
 * would contradict the predetermined result.
 */
import * as THREE from 'three';
import { MiniGame } from './base.js';
import { Patron } from '../world/Patron.js';

const NUMS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const VALID = new Set([0, 25, 50]);
for (let n = 1; n <= 20; n++) { VALID.add(n); VALID.add(n * 2); VALID.add(n * 3); }

/** Score for a point (bx right, by up) in metres from the board centre, given scoring radius R. */
export function scoreAt(bx, by, R) {
  const r = Math.hypot(bx, by) / R;
  if (r > 1) return { score: 0, label: 'miss' };
  if (r < 0.037) return { score: 50, label: 'BULL' };
  if (r < 0.094) return { score: 25, label: 'outer bull' };
  const a = Math.atan2(bx, by); // clockwise from top
  const idx = Math.floor((((a + Math.PI / 20) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 10)) % 20;
  const n = NUMS[idx];
  if (r >= 0.58 && r <= 0.63) return { score: n * 3, label: `treble ${n}` };
  if (r >= 0.95) return { score: n * 2, label: `double ${n}` };
  return { score: n, label: `${n}` };
}

/** Nearest board point to (bx,by) whose score satisfies `ok`. */
function nearestPoint(bx, by, R, ok) {
  let best = null, bestD = Infinity;
  for (let r = 0; r <= 1.0; r += 0.012) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 90) {
      const x = Math.sin(a) * r * R, y = Math.cos(a) * r * R;
      const s = scoreAt(x, y, R).score;
      if (!ok(s)) continue;
      const d = Math.hypot(x - bx, y - by);
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
  }
  return best || { x: 0, y: 0 };
}

export class Darts extends MiniGame {
  start() {
    const b = this.bar.dartboard;
    this.R = b.R;
    this.boardPos = b.pos;
    this.player.enabled = false;
    const st = this.station.pos;
    this.eye = new THREE.Vector3(st.x, 1.6, st.z);
    this.setCamera(this.eye, new THREE.Vector3(b.pos.x, b.pos.y - 0.05, b.pos.z));
    this.camBase = this.camera.quaternion.clone();
    this.fov0 = this.camera.fov; this.camera.fov = 34; this.camera.updateProjectionMatrix();

    // the regular: stands just left of the oche
    this.bot = new Patron({ name: 'Fergus', shirt: 0x3d6b3a, height: 1.02, seed: 77 });
    this.bot.root.position.set(st.x + 1.0, 0, st.z + 1.05);
    this.bot.lookAt(new THREE.Vector3(b.pos.x, 0, b.pos.z));
    this.group.add(this.bot.root);

    this.botTotal = this.round.flavour?.botTotal ?? 80;
    this.botDarts = this.planBotDarts(this.botTotal);
    this.you = 0; this.bot.score = 0;
    this.darts = [];
    this.phase = 'bot';
    this.throwIdx = 0;
    this.busy = false;
    this.hud.setScore(`You <em>0</em> · Fergus <em>0</em>`, 'Fergus throws first');
    this.hud.setHints(`<kbd>swipe up</kbd> to throw · angle = left/right · speed = high/low · keep it straight`);
    this.hud.showToast('Fergus steps up', 'three darts each, highest total wins', 2200);
    this.after(1.4, () => this.botThrow());
  }

  /** Split the bot's total into three realistic darts (last one is "clutch"). */
  planBotDarts(total) {
    const rnd = () => Math.random();
    const throwNear = (tx, ty, spread) => ({ x: tx + (rnd() - 0.5) * spread, y: ty + (rnd() - 0.5) * spread });
    for (let tries = 0; tries < 300; tries++) {
      const d1 = throwNear(0, 0.6 * this.R, 0.12), d2 = throwNear(0, 0.6 * this.R, 0.12);
      const s1 = scoreAt(d1.x, d1.y, this.R).score, s2 = scoreAt(d2.x, d2.y, this.R).score;
      const rem = total - s1 - s2;
      if (rem >= 0 && rem <= 60 && VALID.has(rem)) {
        const d3 = nearestPoint((rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.1, this.R, (s) => s === rem);
        return [d1, d2, d3];
      }
    }
    // deterministic fallback
    const d1 = nearestPoint(0, 0.6 * this.R, this.R, (s) => s === 20);
    for (let s2 = 60; s2 >= 0; s2--) {
      if (!VALID.has(s2)) continue;
      const rem = total - 20 - s2;
      if (rem >= 0 && rem <= 60 && VALID.has(rem)) {
        return [d1, nearestPoint(0.03, 0.05, this.R, (s) => s === s2), nearestPoint(0, 0, this.R, (s) => s === rem)];
      }
    }
    return [d1, d1, d1];
  }

  botThrow() {
    if (this.done) return;
    const i = this.throwIdx;
    const pt = this.botDarts[i];
    this.bot.punchArm = 1; this.bot.punch();
    const from = this.bot.root.position.clone().add(new THREE.Vector3(0.2, 1.4, -0.2));
    this.flyDart(from, pt, 0xdd3333, () => {
      const s = scoreAt(pt.x, pt.y, this.R);
      this.bot.score += s.score;
      this.hud.setScore(`You <em>0</em> · Fergus <em>${this.bot.score}</em>`, `Fergus: ${s.label}`);
      this.throwIdx++;
      if (this.throwIdx < 3) this.after(0.9, () => this.botThrow());
      else this.after(1.1, () => this.startPlayer());
    });
  }

  startPlayer() {
    this.clearDarts();
    this.phase = 'you';
    this.throwIdx = 0;
    this.hud.setScore(`You <em>0</em> · Fergus <em>${this.bot.score}</em>`, `your throw · beat ${this.bot.score}`);
    this.hud.showToast(`Beat ${this.bot.score}`, 'swipe to throw', 1600);
  }

  update(dt) {
    super.update(dt);
    this.bot.update(dt);
    // subtle breathing
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
    // mapping: swipe tilt -> horizontal; swipe speed -> vertical; wobble -> scatter
    const tilt = Math.atan2(sw.dx, -sw.dy);               // 0 = straight up
    let bx = Math.sin(tilt) * 0.55;
    const ideal = 1.35;                                    // px/ms for the bull
    let by = (sw.speed - ideal) * 0.3;
    const scatter = (1 - sw.straightness) * 0.09;
    const ang = Math.random() * Math.PI * 2, rr = Math.random() * scatter;
    bx += Math.cos(ang) * rr; by += Math.sin(ang) * rr;
    bx = THREE.MathUtils.clamp(bx, -0.3, 0.3); by = THREE.MathUtils.clamp(by, -0.3, 0.3);
    // outcome steering: only ever intervene when the landing would contradict the round's result
    const left = 2 - this.throwIdx;                         // darts remaining after this one
    const score = scoreAt(bx, by, this.R).score;
    let pt = { x: bx, y: by };
    if (this.round.win) {
      const needMin = Math.max(0, (this.bot.score + 1 - this.you) - 60 * left);
      if (score < needMin) pt = nearestPoint(bx, by, this.R, (s) => s >= needMin);
    } else {
      const allowMax = Math.max(0, this.bot.score - 1 - this.you);
      if (score > allowMax) pt = nearestPoint(bx, by, this.R, (s) => s <= allowMax);
    }
    const from = this.camera.localToWorld(new THREE.Vector3(0.25, -0.2, -0.3));
    this.flyDart(from, pt, 0x3355dd, () => {
      const s = scoreAt(pt.x, pt.y, this.R);
      this.you += s.score;
      this.throwIdx++;
      this.hud.setScore(`You <em>${this.you}</em> · Fergus <em>${this.bot.score}</em>`, `${s.label}${this.throwIdx < 3 ? ` · ${3 - this.throwIdx} left` : ''}`);
      this.busy = false;
      if (this.throwIdx >= 3) this.after(1.2, () => this.conclude());
    });
  }

  conclude() {
    const win = this.you > this.bot.score;
    const lines = win
      ? ['"Lucky arrows," Fergus mutters, and buys the round.', '"Nobody beats me on a Tuesday." It is Thursday.']
      : ['"Practice makes perfect. You should try it."', 'Fergus chalks it up without looking at you.'];
    this.finish({ win, title: win ? `${this.you} beats ${this.bot.score}` : `${this.you} to ${this.bot.score}`, line: lines[Math.floor(Math.random() * lines.length)] });
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

  /** Animate a dart from `from` to board point `pt` (board coords), then leave it stuck. */
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
      // quadratic bezier arc
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

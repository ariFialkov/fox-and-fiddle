/**
 * Foosball, first to three. You hold the four rods on your side (E forwards, D midfield,
 * C defence, Space goalie), scroll to spin, move the mouse to slide. The bot's skill and the
 * "post" / "nutmeg" moments on the decisive goal follow the round's result.
 */
import * as THREE from 'three';
import { MiniGame } from './base.js';
import { Patron } from '../world/Patron.js';

const L = 1.2, W = 0.7, R = 0.017, GOAL = 0.1, LEG = 0.065;
const ROWS = [
  { x: -0.525, team: 'you', n: 1, key: 'goalie', label: 'Goalie', slide: 0.14 },
  { x: -0.375, team: 'you', n: 2, key: 'def', label: 'Defence', slide: 0.2 },
  { x: -0.225, team: 'bot', n: 3, slide: 0.14 },
  { x: -0.075, team: 'you', n: 5, key: 'mid', label: 'Midfield', slide: 0.08 },
  { x: 0.075, team: 'bot', n: 5, slide: 0.08 },
  { x: 0.225, team: 'you', n: 3, key: 'fwd', label: 'Forwards', slide: 0.14 },
  { x: 0.375, team: 'bot', n: 2, slide: 0.2 },
  { x: 0.525, team: 'bot', n: 1, slide: 0.14 },
];
const OFFSETS = { 1: [0], 2: [-0.12, 0.12], 3: [-0.18, 0, 0.18], 5: [-0.24, -0.12, 0, 0.12, 0.24] };
const KEYS = { KeyE: 'fwd', KeyD: 'mid', KeyC: 'def', Space: 'goalie' };

export class Foosball extends MiniGame {
  start() {
    const f = this.bar.foos;
    this.cx = f.cx; this.cz = f.cz; this.ty = f.y - 0.13;
    this.player.enabled = false;
    this.target = this.round.flavour?.target ?? 3;
    this.skill = this.round.flavour?.botSkill ?? 0.5;
    this.mustWin = !!this.round.win;
    this.score = { you: 0, bot: 0 };
    this.ball = { x: 0, z: 0, vx: 0, vz: 0, lastKicker: null };
    this.clock = 0; this.sinceGoal = 0; this.frozen = 0;
    this.rods = ROWS.map((r) => ({ ...r, s: 0, th: 0, w: 0, cool: 0, offsets: OFFSETS[r.n], men: [] }));
    this.sel = this.rods.findIndex((r) => r.key === 'mid');

    // geometry
    const rodMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.9, roughness: 0.3 });
    const youMat = new THREE.MeshStandardMaterial({ color: 0x2b5fd9, roughness: 0.5 });
    const botMat = new THREE.MeshStandardMaterial({ color: 0xd93b2b, roughness: 0.5 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    for (const r of this.rods) {
      const g = new THREE.Group();
      g.position.set(this.cx + r.x, this.ty + 0.07, this.cz);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, W + 0.36, 8), rodMat);
      rod.rotation.x = Math.PI / 2; rod.position.z = r.team === 'you' ? 0.18 : -0.18; g.add(rod);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 10), handleMat);
      handle.rotation.x = Math.PI / 2; handle.position.z = r.team === 'you' ? W / 2 + 0.3 : -(W / 2 + 0.3); g.add(handle);
      r.rodMesh = rod; r.handle = handle;
      r.menGroup = new THREE.Group(); g.add(r.menGroup);
      for (const off of r.offsets) {
        const m = new THREE.Group(); m.position.z = off;
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.026), r.team === 'you' ? youMat : botMat);
        body.position.y = -0.03;
        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.03, 0.02), handleMat);
        legs.position.y = -0.062;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf1c9a5 }));
        head.position.y = 0.0;
        m.add(body, legs, head);
        r.menGroup.add(m); r.men.push(m);
      }
      this.group.add(g); r.group = g;
    }
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf4efe0, roughness: 0.4 }));
    this.ballMesh.castShadow = true; this.group.add(this.ballMesh);
    this.opp = new Patron({ name: 'Nadia', female: true, shirt: 0xd93b2b, height: 0.98, seed: 909 });
    this.opp.root.position.set(this.cx, 0, this.cz - W / 2 - 0.55);
    this.opp.lookAt(new THREE.Vector3(this.cx, 0, this.cz)); this.group.add(this.opp.root);

    this.placeCamera();
    this.serve(this.mustWin ? 1 : -1);
    this.hud.setHints(`<kbd>E</kbd> forwards <kbd>D</kbd> mid <kbd>C</kbd> defence <kbd>space</kbd> goalie · <kbd>scroll</kbd> spin · <kbd>mouse ←→</kbd> slide`);
    this.hud.setRodTabs(['Forwards', 'Midfield', 'Defence', 'Goalie'], 0, (i) => this.selectKey(['fwd', 'mid', 'def', 'goalie'][i]));
    this.selectKey('mid');
    this.hud.showToast('First to three', 'Nadia has not lost since 2019', 2000);
  }

  placeCamera() {
    const portrait = innerHeight > innerWidth;
    const pos = new THREE.Vector3(this.cx, this.ty + (portrait ? 1.5 : 0.95), this.cz + (portrait ? 0.8 : 0.72));
    this.setCamera(pos, new THREE.Vector3(this.cx, this.ty, this.cz - 0.06));
  }

  selectKey(key) {
    this.sel = this.rods.findIndex((r) => r.key === key);
    const order = ['fwd', 'mid', 'def', 'goalie'];
    this.hud.setRodTabs(['Forwards', 'Midfield', 'Defence', 'Goalie'], order.indexOf(key), (i) => this.selectKey(order[i]));
    for (const r of this.rods) if (r.team === 'you') r.handle.material = r.key === key ? this.selMat() : this.rods[0].handle.material;
    this.updateScore(`${this.rods[this.sel].label} selected`);
  }
  selMat() { return this._selMat || (this._selMat = new THREE.MeshStandardMaterial({ color: 0xf0a84b, emissive: 0xf0a84b, emissiveIntensity: 0.5 })); }
  updateScore(sub) { this.hud.setScore(`You <em>${this.score.you}</em> · Nadia <em>${this.score.bot}</em>`, sub || ''); }

  serve(dir) {
    this.ball.x = 0; this.ball.z = (Math.random() - 0.5) * 0.2;
    this.ball.vx = dir * 0.35; this.ball.vz = (Math.random() - 0.5) * 0.3; this.ball.lastKicker = null;
    this.sinceGoal = 0; this.frozen = 0.8;
  }

  update(dt) {
    super.update(dt);
    this.opp.update(dt);
    if (this.phaseOver) return;
    this.clock += dt; this.sinceGoal += dt;
    this.handleInput(dt);
    this.botAI(dt);
    for (const r of this.rods) {
      r.w *= Math.exp(-3.2 * dt);
      r.th += r.w * dt;
      if (Math.abs(r.w) < 0.4) { r.th = THREE.MathUtils.damp(r.th, Math.round(r.th / (Math.PI * 2)) * Math.PI * 2, 6, dt); }
      r.cool = Math.max(0, r.cool - dt);
    }
    if (this.frozen > 0) this.frozen -= dt; else this.physics(dt);
    this.sync();
  }

  handleInput(dt) {
    const inp = this.input;
    for (const [code, key] of Object.entries(KEYS)) if (inp.justPressed(code)) this.selectKey(key);
    const r = this.rods[this.sel];
    if (inp.wheel) r.w += -inp.wheel * 0.09;
    const p = inp.pointer;
    if (this.isTouch) {
      if (p.down) { r.s += p.dx * 0.0012; if (Math.abs(p.dy) > 2) r.w += -p.dy * 0.045; }
    } else if (p.dx) r.s += p.dx * 0.0011;
    r.s = THREE.MathUtils.clamp(r.s, -r.slide, r.slide);
  }

  botAI(dt) {
    const b = this.ball;
    const skill = this.effectiveSkill();
    for (const r of this.rods) {
      if (r.team !== 'bot') continue;
      // choose the man closest to the ball's z and slide so he lines up
      let best = r.offsets[0], bd = Infinity;
      for (const off of r.offsets) { const d = Math.abs(b.z - (r.s + off)); if (d < bd) { bd = d; best = off; } }
      const targetS = THREE.MathUtils.clamp(b.z - best, -r.slide, r.slide);
      const speed = 0.35 + skill * 1.3;
      r.s = THREE.MathUtils.damp(r.s, targetS, speed * 4, dt);
      // kick when the ball is at the feet and roughly lined up
      const inX = b.x > r.x - 0.05 && b.x < r.x + 0.03;
      if (inX && bd < 0.035 && r.cool <= 0 && Math.abs(r.w) < 1) {
        if (Math.random() < 0.3 + skill * 0.7) {
          const backward = this.clock > 120 && this.mustWin && Math.random() < 0.35;
          r.w = (backward ? 1 : -1) * (7 + skill * 9);
          r.cool = 0.6;
        }
      }
    }
  }

  /** How good the bot plays right now, given the fate of the round. */
  effectiveSkill() {
    if (!this.mustWin) return Math.max(this.skill, this.score.you === this.target - 1 ? 1 : 0.7);
    if (this.clock > 100) return 0.15;
    return Math.min(this.skill, 0.6);
  }

  physics(dt) {
    const b = this.ball;
    const sub = 4, h = dt / sub;
    for (let i = 0; i < sub; i++) {
      b.x += b.vx * h; b.z += b.vz * h;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) { const ns = Math.max(0, sp - 0.22 * h); b.vx *= ns / sp; b.vz *= ns / sp; }
      if (b.z < -W / 2 + R) { b.z = -W / 2 + R; b.vz = Math.abs(b.vz) * 0.6; }
      if (b.z > W / 2 - R) { b.z = W / 2 - R; b.vz = -Math.abs(b.vz) * 0.6; }
      // goals
      if (b.x > L / 2 - R) {
        if (Math.abs(b.z) < GOAL) { if (this.decisiveBlock('you')) { b.x = L / 2 - R; b.vx = -Math.abs(b.vx) * 0.8; b.vz += (b.z >= 0 ? 1 : -1) * 0.5; this.hud.showToast('POST!', '', 900); } else { this.goal('you'); return; } }
        else { b.x = L / 2 - R; b.vx = -Math.abs(b.vx) * 0.5; }
      }
      if (b.x < -L / 2 + R) {
        if (Math.abs(b.z) < GOAL) { if (this.decisiveBlock('bot')) { b.x = -L / 2 + R; b.vx = Math.abs(b.vx) * 0.8; b.vz += (b.z >= 0 ? 1 : -1) * 0.5; this.hud.showToast('Off the post!', '', 900); } else { this.goal('bot'); return; } }
        else { b.x = -L / 2 + R; b.vx = Math.abs(b.vx) * 0.5; }
      }
      // men
      for (const r of this.rods) {
        const footDown = Math.cos(r.th) > 0.55;
        if (!footDown) continue;
        if (this.tunnel(r)) continue;
        const footX = r.x + Math.sin(r.th) * LEG;
        if (Math.abs(b.x - footX) > R + 0.012) continue;
        for (const off of r.offsets) {
          const mz = r.s + off;
          if (Math.abs(b.z - mz) > R + 0.014) continue;
          const vFoot = r.w * Math.cos(r.th) * LEG;
          if (Math.abs(vFoot) > 0.12) {
            const dir = Math.sign(vFoot);
            b.vx = dir * Math.min(3.4, Math.abs(vFoot) * 1.7 + 0.4);
            b.vz = ((b.z - mz) / 0.03) * Math.abs(b.vx) * 0.35 + (Math.random() - 0.5) * 0.1;
            b.x = footX + dir * (R + 0.013);
            b.lastKicker = r.team;
          } else {
            const side = b.x >= footX ? 1 : -1;
            b.vx = side * Math.max(0.15, Math.abs(b.vx) * 0.45);
            b.x = footX + side * (R + 0.013);
          }
          break;
        }
      }
    }
    // stuck ball: nudge after a while
    if (this.sinceGoal > 40) { this.hud.showToast('Throw-in', 'house rules', 900); this.serve(this.mustWin ? 1 : -1); }
  }

  /** On the decisive goal the loser's shots hit the post... */
  decisiveBlock(scorer) {
    if (scorer === 'you') return !this.mustWin && this.score.you === this.target - 1;
    return this.mustWin && this.score.bot === this.target - 1;
  }
  /** ...and the winner's shots slip through the defenders. */
  tunnel(rod) {
    const b = this.ball;
    if (this.mustWin && rod.team === 'bot' && this.score.you === this.target - 1 && b.vx > 0 && (b.lastKicker === 'you' || this.clock > 120)) return true;
    if (!this.mustWin && rod.team === 'you' && this.score.bot === this.target - 1 && b.vx < 0 && b.lastKicker === 'bot') return true;
    return false;
  }

  goal(who) {
    this.score[who]++;
    const you = who === 'you';
    this.updateScore(you ? 'GOAL!' : 'Nadia scores');
    this.hud.showToast(you ? 'GOAL!' : 'Nadia scores', `${this.score.you} - ${this.score.bot}`, 1400);
    if (you) this.opp.stagger(); else this.opp.punch();
    if (this.score[who] >= this.target) {
      this.phaseOver = true;
      this.ball.vx = this.ball.vz = 0;
      this.after(1.6, () => this.finish({
        win: you, title: you ? `${this.score.you} - ${this.score.bot}` : `${this.score.you} - ${this.score.bot}`,
        line: you ? 'Nadia spins the goalie rod in disgust. "Rematch. Not tonight."' : '"Thanks for the warm-up," says Nadia.',
      }));
      return;
    }
    this.serve(you ? -1 : 1);
  }

  sync() {
    for (const r of this.rods) {
      r.menGroup.position.z = r.s;
      r.menGroup.rotation.z = r.th;
      r.handle.position.z = (r.team === 'you' ? W / 2 + 0.3 : -(W / 2 + 0.3)) + r.s;
      r.rodMesh.position.z = (r.team === 'you' ? 0.18 : -0.18) + r.s;
    }
    this.ballMesh.position.set(this.cx + this.ball.x, this.ty + R, this.cz + this.ball.z);
  }
}

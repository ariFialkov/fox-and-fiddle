/**
 * First-person eight-ball against "Shark". Aim with A/D (drag left/right on touch), drag back for
 * power, W/S for follow/draw, Space to chalk. Every shot is pre-simulated and, only if it would
 * contradict the round's result, nudged by a fraction of a degree.
 */
import * as THREE from 'three';
import { MiniGame } from './base.js';
import { Patron } from '../world/Patron.js';
import * as P from './poolPhysics.js';

const BALL_COLORS = { 1: 0xf2c200, 2: 0x1d4fd8, 3: 0xd62828, 4: 0x6a1b9a, 5: 0xf57c00, 6: 0x1b7a3f, 7: 0x7b1e1e, 8: 0x111111 };
const texCache = {};
function ballTexture(id) {
  if (texCache[id]) return texCache[id];
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  const col = '#' + (BALL_COLORS[id > 8 ? id - 8 : id] || 0xffffff).toString(16).padStart(6, '0');
  ctx.fillStyle = id === 0 ? '#f7f3e8' : (id <= 8 ? col : '#f7f3e8'); ctx.fillRect(0, 0, 256, 128);
  if (id > 8) { ctx.fillStyle = col; ctx.fillRect(0, 34, 256, 60); }
  if (id > 0) {
    for (const cx of [64, 192]) {
      ctx.fillStyle = '#f7f3e8'; ctx.beginPath(); ctx.arc(cx, 64, 20, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(id), cx, 65);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  texCache[id] = t;
  return t;
}

export class Billiards extends MiniGame {
  start() {
    const pool = this.bar.pool;
    this.cx = pool.cx; this.cz = pool.cz; this.ty = pool.y + 0.02;
    this.player.enabled = false;
    this.state = P.rackState();
    this.mustWin = this.round.win ? 'you' : 'bot';
    this.skill = this.round.flavour?.botSkill ?? 0.6;
    this.angle = 0; this.power = 0; this.spin = 0;
    this.phase = 'aim';           // aim | rolling | bot | over
    this.gesture = null;
    this.camMode = 'cue';
    this.simAcc = 0;

    // balls
    this.meshes = new Map();
    const geo = new THREE.SphereGeometry(P.R, 24, 16);
    for (const b of this.state.balls) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ballTexture(b.id), roughness: 0.25, metalness: 0.05 }));
      m.castShadow = true;
      this.group.add(m);
      this.meshes.set(b.id, m);
    }
    // cue stick
    this.cue = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.013, 1.45, 10), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.5 }));
    shaft.rotation.x = Math.PI / 2; shaft.position.z = -(0.725 + 0.03);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0x3a6bb0 }));
    tip.rotation.x = Math.PI / 2; tip.position.z = -0.02;
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6 }));
    butt.rotation.x = Math.PI / 2; butt.position.z = -(1.45 + 0.03 + 0.2);
    this.cue.add(shaft, tip, butt);
    this.group.add(this.cue);
    this.chalk = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.022), new THREE.MeshStandardMaterial({ color: 0x2b6cc4 }));
    this.chalk.visible = false; this.group.add(this.chalk);
    this.chalkT = -1;
    // aim guide
    this.guideMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    this.guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), this.guideMat);
    this.guide2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.6 }));
    this.ghost = new THREE.Mesh(new THREE.RingGeometry(P.R * 0.8, P.R, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    this.ghost.rotation.x = -Math.PI / 2;
    this.group.add(this.guide, this.guide2, this.ghost);
    // Shark, across the table
    this.shark = new Patron({ name: 'Shark', shirt: 0x151515, height: 1.05, seed: 404 });
    this.shark.root.position.set(this.cx + P.L / 2 + 0.7, 0, this.cz - 0.2);
    this.shark.lookAt(new THREE.Vector3(this.cx, 0, this.cz));
    this.group.add(this.shark.root);

    this.syncMeshes();
    this.hud.setHints(`<kbd>A</kbd><kbd>D</kbd> aim · <kbd>drag back</kbd> power, release to strike · <kbd>W</kbd><kbd>S</kbd> spin · <kbd>space</kbd> chalk`);
    if (this.isTouch) {
      this.hud.setActions([
        { label: 'spin −', onDown: () => { this.spin = Math.max(-1, this.spin - 0.34); } },
        { label: 'spin +', onDown: () => { this.spin = Math.min(1, this.spin + 0.34); } },
        { label: 'chalk', onDown: () => this.doChalk() },
      ]);
    }
    this.updateScore('your break');
    // aim at the rack
    const cue = this.ball(0);
    this.angle = Math.atan2(0 - cue.v, P.L / 4 - cue.u);
    this.setCueCamera(true);
    this.hud.showToast('Rack \'em', 'eight-ball · Shark is waiting', 2000);
  }

  ball(id) { return this.state.balls.find((b) => b.id === id); }
  world(u, v, y = this.ty + P.R) { return new THREE.Vector3(this.cx + u, y, this.cz + v); }

  updateScore(sub) {
    const g = this.state.group;
    const left = (grp) => this.state.balls.filter((b) => b.on && P.groupOf(b.id) === grp).length;
    const you = g.you ? `${g.you}s · ${left(g.you)} left` : 'open table';
    const bot = g.bot ? `${g.bot}s · ${left(g.bot)} left` : '';
    this.hud.setScore(`You <em>${you}</em>${bot ? ` · Shark <em>${bot}</em>` : ''}`, sub);
  }

  syncMeshes() {
    for (const b of this.state.balls) {
      const m = this.meshes.get(b.id);
      m.visible = b.on;
      if (!b.on) continue;
      const nx = this.cx + b.u, nz = this.cz + b.v;
      const dx = nx - m.position.x, dz = nz - m.position.z;
      m.position.set(nx, this.ty + P.R, nz);
      const d = Math.hypot(dx, dz);
      if (d > 1e-5) {
        const axis = new THREE.Vector3(dz, 0, -dx).normalize();
        m.rotateOnWorldAxis(axis, d / P.R);
      }
    }
  }

  setCueCamera(instant = false) {
    const cue = this.ball(0);
    const dir = new THREE.Vector3(Math.cos(this.angle), 0, Math.sin(this.angle));
    const pos = this.world(cue.u, cue.v).addScaledVector(dir, -0.8).add(new THREE.Vector3(0, 0.43, 0));
    const look = this.world(cue.u, cue.v).addScaledVector(dir, 0.45).add(new THREE.Vector3(0, -0.05, 0));
    this.camTarget = { pos, look };
    if (instant) { this.camera.position.copy(pos); this.camera.lookAt(look); this.camLook = look.clone(); }
  }
  setOverheadCamera() {
    const pos = new THREE.Vector3(this.cx, this.ty + 1.55, this.cz + 1.25);
    const look = new THREE.Vector3(this.cx, this.ty, this.cz - 0.1);
    this.camTarget = { pos, look };
  }

  update(dt) {
    super.update(dt);
    this.shark.update(dt);
    const inp = this.input;
    if (this.phase === 'aim') this.updateAim(dt);
    else if (this.phase === 'rolling') this.updateRolling(dt);
    // camera easing
    if (this.camTarget) {
      this.camera.position.lerp(this.camTarget.pos, Math.min(1, dt * 5));
      this.camLook = this.camLook || this.camTarget.look.clone();
      this.camLook.lerp(this.camTarget.look, Math.min(1, dt * 5));
      this.camera.lookAt(this.camLook);
    }
    // chalk animation
    if (this.chalkT >= 0) {
      this.chalkT += dt * 1.6;
      const k = Math.min(1, this.chalkT);
      const tipPos = this.cue.localToWorld(new THREE.Vector3(0, 0, 0.0));
      this.chalk.visible = k < 1;
      this.chalk.position.copy(tipPos).add(new THREE.Vector3(Math.sin(k * 30) * 0.008, 0.012 + Math.sin(k * Math.PI) * 0.02, Math.cos(k * 30) * 0.008));
      if (k >= 1) this.chalkT = -1;
    }
  }

  updateAim(dt) {
    const inp = this.input;
    const fine = inp.down('ShiftLeft') || inp.down('ShiftRight') ? 0.25 : 1;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) this.angle -= dt * 0.9 * fine;
    if (inp.down('KeyD') || inp.down('ArrowRight')) this.angle += dt * 0.9 * fine;
    if (inp.justPressed('KeyW') || inp.justPressed('ArrowUp')) this.spin = Math.min(1, this.spin + 0.34);
    if (inp.justPressed('KeyS') || inp.justPressed('ArrowDown')) this.spin = Math.max(-1, this.spin - 0.34);
    if (inp.justPressed('Space')) this.doChalk();
    // pointer: classify gesture after a few px; horizontal = aim (touch), vertical down = power
    const p = inp.pointer;
    if (p.down) {
      const dx = p.x - p.startX, dy = p.y - p.startY;
      if (!this.gesture && Math.hypot(dx, dy) > 10) this.gesture = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'aim' : 'power';
      if (this.gesture === 'aim') { this.angle += p.dx * 0.004; }
      else if (this.gesture === 'power') this.power = THREE.MathUtils.clamp(dy / 260, 0, 1);
    } else if (this.gesture) {
      const g = this.gesture; this.gesture = null;
      if (g === 'power' && this.power > 0.06) { this.shoot(); return; }
      this.power = 0;
    }
    this.hud.setPower(this.power > 0 ? this.power : null);
    // place cue + guide
    const cue = this.ball(0);
    const dir = new THREE.Vector3(Math.cos(this.angle), 0, Math.sin(this.angle));
    const bp = this.world(cue.u, cue.v);
    this.cue.visible = true;
    this.cue.position.copy(bp).addScaledVector(dir, -(0.035 + this.power * 0.28)).add(new THREE.Vector3(0, 0.012 + this.power * 0.01, 0));
    this.cue.lookAt(bp.clone().add(new THREE.Vector3(0, 0.012, 0)));
    this.cue.rotateX(0.06);
    const g = P.aimGuide(this.state.balls, this.angle);
    const end = bp.clone().addScaledVector(dir, g.dist);
    this.guide.geometry.setFromPoints([bp, end]);
    this.guide.visible = true;
    if (g.ghost) {
      this.ghost.visible = true; this.ghost.position.copy(this.world(g.ghost.u, g.ghost.v, this.ty + 0.002));
      const bw = this.world(g.ball.u, g.ball.v);
      this.guide2.geometry.setFromPoints([bw, bw.clone().add(new THREE.Vector3(g.objDir.u, 0, g.objDir.v).multiplyScalar(0.35))]);
      this.guide2.visible = true;
    } else { this.ghost.visible = false; this.guide2.visible = false; }
    this.setCueCamera();
    const spinTxt = this.spin > 0.1 ? ` · follow ${Math.round(this.spin * 100)}%` : this.spin < -0.1 ? ` · draw ${Math.round(-this.spin * 100)}%` : '';
    this.updateScore(`${this.state.ballInHand ? 'ball in hand · ' : ''}your shot${spinTxt}`);
  }

  doChalk() { if (this.phase === 'aim') this.chalkT = 0; }

  shoot() {
    const raw = { angle: this.angle, speed: 0.6 + this.power * 3.8, spin: this.spin };
    const c = P.constrainShot(this.state, raw, 'you', this.mustWin);
    this.playShot(c.shot, c.result, 'you');
  }

  /** Run the (already simulated) shot live. The live sim uses the same fixed steps, so it lands identically. */
  playShot(shot, result, shooter) {
    this.phase = 'rolling';
    this.shooter = shooter;
    this.pending = result;
    this.cue.visible = false; this.guide.visible = false; this.guide2.visible = false; this.ghost.visible = false;
    this.hud.setPower(null);
    this.power = 0; this.spin = 0;
    this.live = P.cloneBalls(this.state.balls);
    const cue = this.live.find((b) => b.id === 0);
    const dirU = Math.cos(shot.angle), dirV = Math.sin(shot.angle);
    cue.on = true; cue.vu = dirU * shot.speed; cue.vv = dirV * shot.speed;
    this.liveCtx = { spin: shot.spin || 0, spinUsed: false, dirU, dirV };
    this.liveSteps = 0;
    this.setOverheadCamera();
    if (shooter === 'bot') this.shark.punch();
  }

  updateRolling(dt) {
    this.simAcc += dt;
    const STEP = 1 / 240;
    let n = 0;
    while (this.simAcc >= STEP && n < 12) {
      const ev = P.stepBalls(this.live, this.liveCtx);
      this.simAcc -= STEP; this.liveSteps++; n++;
      for (const e of ev) if (e.type === 'pot' && e.id !== 0) this.hud.showToast(`${e.id} ball`, '', 700);
      if (P.allStopped(this.live) || this.liveSteps >= this.pending.steps) { this.simAcc = 0; break; }
    }
    const save = this.state.balls; this.state.balls = this.live; this.syncMeshes(); this.state.balls = save;
    if (P.allStopped(this.live) || this.liveSteps >= this.pending.steps) this.afterShot();
  }

  afterShot() {
    const shooter = this.shooter;
    const out = P.judge(this.state, this.pending, shooter);
    this.syncMeshes();
    if (out.winner) {
      this.phase = 'over';
      const win = out.winner === 'you';
      this.updateScore(out.message);
      this.after(1.4, () => this.finish({
        win, title: win ? 'Rack cleared' : 'Shark wins',
        line: win ? (out.message === '8-ball down' ? 'Shark racks his cue without a word. The table is yours.' : `Shark ${out.message.toLowerCase()}. You will take it.`) : (out.message === '8-ball down' ? '"Pleasure doing business," says Shark.' : `${out.message}. Shark smiles for the first time tonight.`),
      }));
      return;
    }
    if (this.state.turn === 'you') {
      this.phase = 'aim';
      this.updateScore(out.message);
      this.after(0.6, () => this.setCueCamera());
    } else {
      this.phase = 'bot';
      this.updateScore(`${out.message} · Shark's shot`);
      this.after(1.1, () => this.botTurn());
    }
  }

  botTurn() {
    if (this.done) return;
    const pick = P.botShot(this.state, this.skill, this.mustWin);
    this.playShot(pick.shot, pick.res, 'bot');
  }

  dispose() {
    super.dispose();
    this.hud.setPower(null);
  }
}

/**
 * First-person eight-ball against "Shark". You stand at the rail behind the cue ball and aim
 * with A/D (drag sideways on touch), drag back for power, W/S for follow/draw. After you strike,
 * you straighten up and watch. While Shark shoots you are free to walk around the table (kept
 * close to it), always watching the cue ball, and chalk your cue with Space.
 * Every shot is pre-simulated and, only if it would contradict the round's result, nudged by a
 * fraction of a degree.
 */
import * as THREE from 'three';
import { MiniGame } from './base.js';
import { Patron } from '../world/Patron.js';
import { turnToward } from '../engine/Player.js';
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

function makeCue() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.013, 1.45, 10), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.5 }));
  shaft.rotation.x = Math.PI / 2; shaft.position.z = -(0.725 + 0.03);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0x3a6bb0 }));
  tip.rotation.x = Math.PI / 2; tip.position.z = -0.02;
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6 }));
  butt.rotation.x = Math.PI / 2; butt.position.z = -(1.45 + 0.03 + 0.2);
  g.add(shaft, tip, butt);
  return g; // tip at the origin, stick extends along -z
}

export class Billiards extends MiniGame {
  start() {
    const pool = this.bar.pool;
    this.cx = pool.cx; this.cz = pool.cz; this.ty = pool.y + 0.02;
    this.player.enabled = false;
    this.bar.poolDecor.visible = false;
    this.state = P.rackState();
    this.mustWin = this.round.win ? 'you' : 'bot';
    this.skill = this.round.flavour?.botSkill ?? 0.6;
    this.angle = 0; this.power = 0; this.spin = 0;
    this.phase = 'aim';           // aim | rolling | bot | over
    this.gesture = null;
    this.simAcc = 0;

    this.meshes = new Map();
    const geo = new THREE.SphereGeometry(P.R, 24, 16);
    for (const b of this.state.balls) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ballTexture(b.id), roughness: 0.25, metalness: 0.05 }));
      m.castShadow = true;
      this.group.add(m);
      this.meshes.set(b.id, m);
    }
    // table cue (yours, while aiming) and Shark's cue
    this.cue = makeCue(); this.group.add(this.cue);
    this.sharkCue = makeCue(); this.group.add(this.sharkCue);
    this.chalk = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.022), new THREE.MeshStandardMaterial({ color: 0x2b6cc4 }));
    this.chalk.visible = false; this.group.add(this.chalk);
    // cue carried in hand while waiting (camera child), with a chalk hand
    this.handCue = new THREE.Group();
    const hc = makeCue(); hc.rotation.x = Math.PI / 2 - 0.3; hc.position.set(0, 0.0, 0); // held low near the butt, tip up and away
    this.handCue.add(hc);
    this.handCue.position.set(0.46, -0.62, -0.45); this.handCue.rotation.set(0.1, 0.1, -0.35);
    this.handCue.visible = false;
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b790, roughness: 0.7 });
    this.handR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), skin); this.handR.scale.set(1, 0.8, 1.1); this.handR.position.set(0, 0.02, 0.0); // grips the stick near the butt
    this.handCue.add(this.handR);
    this.handL = new THREE.Group(); this.handL.visible = false;
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), skin); palm.scale.set(1, 0.8, 1.1);
    const chalkCube = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.024), new THREE.MeshStandardMaterial({ color: 0x2b6cc4 }));
    chalkCube.position.set(0, -0.03, -0.03);
    this.handL.add(palm, chalkCube);
    this.camera.add(this.handCue, this.handL);
    this.chalkT = -1;
    // aim guide
    this.guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    this.guide2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.6 }));
    this.ghost = new THREE.Mesh(new THREE.RingGeometry(P.R * 0.8, P.R, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    this.ghost.rotation.x = -Math.PI / 2;
    this.group.add(this.guide, this.guide2, this.ghost);
    // Shark
    this.shark = new Patron({ name: 'Shark', shirt: 0x151515, height: 1.05, seed: 404 });
    this.sharkRest = new THREE.Vector3(this.cx + P.L / 2 + 0.95, 0, this.cz - 0.35);
    this.shark.root.position.copy(this.sharkRest);
    this.sharkYaw = Math.atan2(this.cx - this.sharkRest.x, this.cz - this.sharkRest.z);
    this.shark.root.rotation.set(0, this.sharkYaw, 0);
    this.shark.hold(this.sharkCue, 1, [0, -0.05, 0.02], [0, 0, 0]); // resting upright in hand (tip up: stick along -z in cue space -> rotate)
    this.sharkCue.rotation.set(-Math.PI / 2, 0, 0); this.sharkCue.position.set(0, -0.05, 0.02);
    this.shark.pose = 'idle';
    this.group.add(this.shark.root);
    this.sharkState = 'rest';

    this.syncMeshes();
    this.hud.setHints(`<kbd>A</kbd><kbd>D</kbd> aim · <kbd>drag back</kbd> power, release to strike · <kbd>W</kbd><kbd>S</kbd> spin`);
    if (this.isTouch) {
      this.hud.setActions([
        { label: 'spin −', onDown: () => { this.spin = Math.max(-1, this.spin - 0.34); } },
        { label: 'spin +', onDown: () => { this.spin = Math.min(1, this.spin + 0.34); } },
        { label: 'chalk', onDown: () => this.doChalk() },
      ]);
    }
    this.updateScore('your break');
    const cue = this.ball(0);
    this.angle = Math.atan2(0 - cue.v, P.L / 4 - cue.u);
    // walk-in: start standing where the player was, then settle behind the ball
    this.player.pos.copy(this.standSpot(cue, this.angle));
    this.camLook = this.world(cue.u, cue.v);
    this.camPos = this.player.eye();
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
    this.hud.showToast('Rack \'em', 'eight-ball · Shark is waiting', 2000);
  }

  ball(id) { return this.state.balls.find((b) => b.id === id); }
  world(u, v, y = this.ty + P.R) { return new THREE.Vector3(this.cx + u, y, this.cz + v); }

  /** Where someone stands to play a shot: behind the cue ball along the aim, outside the rails. */
  standSpot(cue, angle, back = 0.95) {
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    let d = back;
    let p;
    for (let i = 0; i < 30; i++) {
      p = this.world(cue.u, cue.v, 0).addScaledVector(dir, -d);
      const u = p.x - this.cx, v = p.z - this.cz;
      if (Math.abs(u) > P.L / 2 + 0.42 || Math.abs(v) > P.W / 2 + 0.42) break;
      d += 0.08;
    }
    p.x = THREE.MathUtils.clamp(p.x, this.cx - P.L / 2 - 2.2, 7.5); p.z = THREE.MathUtils.clamp(p.z, -2.6, 5.0);
    return p;
  }

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
      if (d > 1e-5) m.rotateOnWorldAxis(new THREE.Vector3(dz, 0, -dx).normalize(), d / P.R);
    }
  }

  cueBallWorld() {
    const live = this.live || this.state.balls;
    const c = live.find((b) => b.id === 0);
    return this.world(c.u, c.v);
  }

  update(dt) {
    super.update(dt);
    this.shark.update(dt);
    this.updateShark(dt);
    if (this.phase === 'aim') this.updateAim(dt);
    else if (this.phase === 'rolling') this.updateRolling(dt);
    if (this.phase === 'aim') {
      // bent over the cue: steady, no bob
      const cue = this.ball(0);
      const spot = this.standSpot(cue, this.angle);
      this.player.pos.lerp(spot, Math.min(1, dt * 6));
      const dir = new THREE.Vector3(Math.cos(this.angle), 0, Math.sin(this.angle));
      const eye = new THREE.Vector3(this.player.pos.x, 1.22, this.player.pos.z).addScaledVector(dir, 0.18);
      const look = this.world(cue.u, cue.v).addScaledVector(dir, 0.35);
      this.camPos.lerp(eye, Math.min(1, dt * 6)); this.camLook.lerp(look, Math.min(1, dt * 6));
      this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
      this.player.yaw = Math.atan2(-dir.x, -dir.z);
      this.handCue.visible = false; this.handL.visible = false;
    } else if (this.phase === 'rolling' && this.shooter === 'you') {
      // straighten up and follow the cue ball with the eyes
      const eye = this.player.eye();
      this.camPos.lerp(eye, Math.min(1, dt * 2.5));
      this.camLook.lerp(this.cueBallWorld(), Math.min(1, dt * 4));
      this.player.vel.set(0, 0, 0);
      this.idleCam(this.camPos, this.camLook, dt, 0.6);
      this.handCue.visible = true;
    } else {
      this.updateWatch(dt);
    }
    if (this.chalkT >= 0) this.updateChalk(dt);
  }

  /** Free to walk around the table while Shark plays, always facing the cue ball. */
  updateWatch(dt) {
    const inp = this.input;
    const a = inp.axis();
    const p = this.player;
    const target = this.cueBallWorld();
    const wantYaw = Math.atan2(-(target.x - p.pos.x), -(target.z - p.pos.z));
    p.yaw = turnToward(p.yaw, wantYaw, 3.5 * dt);
    const fwd = p.forward(), rgt = p.right();
    const want = fwd.multiplyScalar(a.y).add(rgt.multiplyScalar(a.x));
    if (want.length() > 1) want.normalize();
    want.multiplyScalar(p.speed * 0.8);
    p.vel.x = THREE.MathUtils.damp(p.vel.x, want.x, 9, dt); p.vel.z = THREE.MathUtils.damp(p.vel.z, want.z, 9, dt);
    const nx = p.pos.x + p.vel.x * dt, nz = p.pos.z + p.vel.z * dt;
    // keep within a ring around the table
    const ringOk = (x, z) => { const du = Math.max(0, Math.abs(x - this.cx) - P.L / 2), dv = Math.max(0, Math.abs(z - this.cz) - P.W / 2); const d = Math.hypot(du, dv); return d > 0.62 && d < 1.9; };
    if (ringOk(nx, p.pos.z) && !p.blocked(nx, p.pos.z, 'player')) p.pos.x = nx; else p.vel.x *= 0.2;
    if (ringOk(p.pos.x, nz) && !p.blocked(p.pos.x, nz, 'player')) p.pos.z = nz; else p.vel.z *= 0.2;
    const dy = target.y - 1.62, dxz = Math.hypot(target.x - p.pos.x, target.z - p.pos.z);
    p.pitch = THREE.MathUtils.damp(p.pitch, Math.atan2(dy, dxz) * 0.85, 4, dt);
    p.applyCamera(dt);
    this.camPos.copy(this.camera.position); this.camLook.copy(target);
    this.handCue.visible = true;
    if (inp.justPressed('Space')) this.doChalk();
    if (this.phase === 'bot' || (this.phase === 'rolling' && this.shooter === 'bot')) this.hud.setHints(`walk around the table · <kbd>space</kbd> chalk your cue`);
  }

  doChalk() { if (this.phase !== 'aim' && this.chalkT < 0) this.chalkT = 0; }
  updateChalk(dt) {
    this.chalkT += dt / 1.6;
    const k = Math.min(1, this.chalkT);
    const e = Math.sin(Math.min(1, k * 1.25) * Math.PI); // bring the tip in, rub, take it away
    // cue swings from the resting upright pose to tip-forward at eye level
    this.handCue.position.set(0.46 - e * 0.3, -0.62 + e * 0.35, -0.45 - e * 0.1);
    this.handCue.rotation.set(0.1 - e * 1.25, 0.1 - e * 0.4, -0.35 + e * 0.3);
    this.handL.visible = e > 0.3;
    const tip = this.handCue.children[0].localToWorld(new THREE.Vector3(0, 0, 0));
    const local = this.camera.worldToLocal(tip);
    this.handL.position.copy(local).add(new THREE.Vector3(Math.sin(k * 45) * 0.012 * e, 0.035 + Math.cos(k * 45) * 0.01 * e, -0.01));
    this.handL.rotation.set(0.4, 0, Math.sin(k * 45) * 0.3 * e);
    if (k >= 1) { this.chalkT = -1; this.handL.visible = false; this.handCue.position.set(0.46, -0.62, -0.45); this.handCue.rotation.set(0.1, 0.1, -0.35); }
  }

  updateAim(dt) {
    const inp = this.input;
    const fine = inp.down('ShiftLeft') || inp.down('ShiftRight') ? 0.25 : 1;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) this.angle -= dt * 0.8 * fine;
    if (inp.down('KeyD') || inp.down('ArrowRight')) this.angle += dt * 0.8 * fine;
    if (inp.justPressed('KeyW') || inp.justPressed('ArrowUp')) this.spin = Math.min(1, this.spin + 0.34);
    if (inp.justPressed('KeyS') || inp.justPressed('ArrowDown')) this.spin = Math.max(-1, this.spin - 0.34);
    const p = inp.pointer;
    if (p.down) {
      const dx = p.x - p.startX, dy = p.y - p.startY;
      if (!this.gesture && Math.hypot(dx, dy) > 10) this.gesture = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'aim' : 'power';
      if (this.gesture === 'aim') this.angle += p.dx * 0.004;
      else if (this.gesture === 'power') this.power = THREE.MathUtils.clamp(dy / 260, 0, 1);
    } else if (this.gesture) {
      const g = this.gesture; this.gesture = null;
      if (g === 'power' && this.power > 0.06) { this.shoot(); return; }
      this.power = 0;
    }
    this.hud.setPower(this.power > 0 ? this.power : null);
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
    const spinTxt = this.spin > 0.1 ? ` · follow ${Math.round(this.spin * 100)}%` : this.spin < -0.1 ? ` · draw ${Math.round(-this.spin * 100)}%` : '';
    this.updateScore(`${this.state.ballInHand ? 'ball in hand · ' : ''}your shot${spinTxt}`);
  }

  shoot() {
    const raw = { angle: this.angle, speed: 0.6 + this.power * 3.8, spin: this.spin };
    const c = P.constrainShot(this.state, raw, 'you', this.mustWin);
    this.playShot(c.shot, c.result, 'you');
  }

  /** Run the (already simulated) shot live with the same fixed steps, so it lands identically. */
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
    if (shooter === 'you') this.hud.setHints(`watch it...`);
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
    this.live = null;
    this.syncMeshes();
    if (out.winner) {
      this.phase = 'over';
      const win = out.winner === 'you';
      this.updateScore(out.message);
      if (win) this.shark.stagger(); else this.shark.cheer();
      this.after(1.6, () => this.finish({
        win, title: win ? 'Rack cleared' : 'Shark wins',
        line: win ? (out.message === '8-ball down' ? 'Shark racks his cue without a word. The table is yours.' : `Shark ${out.message.toLowerCase()}. You will take it.`) : (out.message === '8-ball down' ? '"Pleasure doing business," says Shark.' : `${out.message}. Shark smiles for the first time tonight.`),
      }));
      return;
    }
    if (this.state.turn === 'you') {
      this.updateScore(out.message);
      this.phase = 'bot'; // brief wait so the camera can walk round, then your shot
      this.after(shooter === 'bot' ? 0.4 : 0.9, () => { if (!this.done) this.beginAim(); });
    } else {
      this.phase = 'bot';
      this.updateScore(`${out.message} · Shark's shot`);
      this.after(0.8, () => this.botTurn());
    }
  }

  beginAim() {
    this.phase = 'aim';
    this.hud.setHints(`<kbd>A</kbd><kbd>D</kbd> aim · <kbd>drag back</kbd> power, release to strike · <kbd>W</kbd><kbd>S</kbd> spin`);
    this.chalkT = -1; this.handL.visible = false;
    this.handCue.position.set(0.46, -0.62, -0.45); this.handCue.rotation.set(0.1, 0.1, -0.35);
  }

  // ---------- Shark ----------
  botTurn() {
    if (this.done) return;
    const pick = P.botShot(this.state, this.skill, this.mustWin);
    this.botShotPlan = pick;
    const cue = this.ball(0);
    this.sharkSpot = this.standSpot(cue, pick.shot.angle, 0.8);
    this.sharkState = 'approach'; this.sharkT = 0;
    this.shark.pose = 'idle';
  }
  updateShark(dt) {
    const s = this.shark, st = this.sharkState;
    const pos = s.root.position;
    const moveTo = (target, speed) => {
      const dx = target.x - pos.x, dz = target.z - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { s.walk = THREE.MathUtils.damp(s.walk, 0, 8, dt); return true; }
      const stp = Math.min(d, speed * dt);
      pos.x += dx / d * stp; pos.z += dz / d * stp;
      s.walk = THREE.MathUtils.damp(s.walk, 0.9, 8, dt); s.walkPhase += speed * dt / 0.36 * Math.PI;
      this.sharkYaw = turnToward(this.sharkYaw, Math.atan2(dx, dz), 6 * dt);
      s.root.rotation.set(0, this.sharkYaw, 0);
      return false;
    };
    const faceBall = () => { const b = this.cueBallWorld(); this.sharkYaw = turnToward(this.sharkYaw, Math.atan2(b.x - pos.x, b.z - pos.z), 4 * dt); s.root.rotation.set(0, this.sharkYaw, 0); };
    if (st === 'rest') { s.walk = THREE.MathUtils.damp(s.walk, 0, 8, dt); faceBall(); return; }
    this.sharkT += dt;
    if (st === 'approach') {
      if (moveTo(this.sharkSpot, 1.1)) { this.sharkState = 'settle'; this.sharkT = 0; }
      return;
    }
    const plan = this.botShotPlan;
    const cue = this.ball(0);
    const dir = new THREE.Vector3(Math.cos(plan.shot.angle), 0, Math.sin(plan.shot.angle));
    const bp = this.world(cue.u, cue.v);
    if (st === 'settle') {
      faceBall();
      if (this.sharkT > 0.35) { this.sharkState = 'lean'; this.sharkT = 0; s.pose = 'lean'; this.group.attach(this.sharkCue); }
      return;
    }
    if (st === 'lean' || st === 'pull' || st === 'strike' || st === 'watch') {
      faceBall();
      s.headTarget = bp.clone();
      // cue lies along the shot line; pull back then strike
      let back = 0.04;
      if (st === 'lean') { back = 0.04 + (1 - Math.min(1, this.sharkT / 0.6)) * 0.25; if (this.sharkT > 1.4) { this.sharkState = 'pull'; this.sharkT = 0; } }
      else if (st === 'pull') { back = 0.04 + Math.min(1, this.sharkT / 0.55) * 0.16; if (this.sharkT > 0.65) { this.sharkState = 'strike'; this.sharkT = 0; } }
      else if (st === 'strike') { back = 0.2 - Math.min(1, this.sharkT / 0.09) * 0.19; if (this.sharkT > 0.1) { this.sharkState = 'watch'; this.sharkT = 0; this.playShot(plan.shot, plan.res, 'bot'); } }
      else if (st === 'watch') { back = 0.06; if (this.sharkT > 1.2) { this.sharkState = 'standup'; this.sharkT = 0; s.pose = 'idle'; s.headTarget = null; } }
      const tipY = this.ty + P.R;
      const tip = bp.clone().addScaledVector(dir, -back); tip.y = tipY + 0.005;
      this.sharkCue.position.copy(tip);
      this.sharkCue.lookAt(bp.clone().setY(tipY + 0.002));
      this.sharkCue.rotateX(0.05);
      return;
    }
    if (st === 'standup') {
      if (this.sharkT > 0.5) {
        s.hold(this.sharkCue, 1, [0, -0.05, 0.02], [0, 0, 0]);
        this.sharkCue.rotation.set(-Math.PI / 2, 0, 0); this.sharkCue.position.set(0, -0.05, 0.02);
        this.sharkState = 'retreat'; this.sharkT = 0;
      }
      return;
    }
    if (st === 'retreat') {
      if (moveTo(this.sharkRest, 1.0)) { this.sharkState = 'rest'; }
    }
  }

  dispose() {
    super.dispose();
    this.camera.remove(this.handCue); this.camera.remove(this.handL);
    this.bar.poolDecor.visible = true;
    this.hud.setPower(null);
  }
}

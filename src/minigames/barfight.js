/**
 * Bar fight. You keep the normal movement controls; X punches, C kicks, hold Space to grab the
 * nearest bottle or glass and release to throw it (longer hold = harder), or press X/C while
 * holding to smash it over whoever is in front of you.
 * The fight starts one-on-one with Mick. Others only step in when the round needs them (or, if
 * you are fated to win, for a bit of flavour), and they come at you from the front one at a
 * time while the rest hang back and heckle.
 */
import * as THREE from 'three';
import { MiniGame } from './base.js';

const damp = THREE.MathUtils.damp;

export class BarFight extends MiniGame {
  start() {
    const flav = this.round.flavour || {};
    this.mustWin = !!this.round.win;
    this.player.enabled = true;
    this.input.showJoystick(true);
    this.hp = 100;
    this.shake = 0;
    this.enemies = [];
    this.fx = [];
    this.labels = [];
    const mick = this.bar.mick;
    this.addEnemy(mick, { hp: 110, dmg: this.mustWin ? 7 : 11, rate: 1.7 });
    // who might join, and when
    const extra = Math.min(this.bar.mates.length, flav.extraPatrons ?? 1);
    this.joinQueue = [];
    if (!this.mustWin) {
      const n = Math.max(1, extra);
      const bruiserIdx = Math.floor(Math.random() * n);
      for (let i = 0; i < n; i++) this.joinQueue.push({ patron: this.bar.mates[i], bruiser: i === bruiserIdx, when: (e) => (mick.hp < 50 || this.t > 14) && this.t > this.lastJoin + 5 });
    } else {
      for (let i = 0; i < Math.min(2, extra); i++) this.joinQueue.push({ patron: this.bar.mates[i], bruiser: false, when: () => this.t > 9 + i * 7 && this.t > this.lastJoin + 5 });
    }
    this.lastJoin = 0;
    this.fighters = new Set([mick, ...this.bar.mates]);
    this.origins = new Map();
    for (const p of this.fighters) this.origins.set(p, p.root.position.clone());

    // first-person arms: upper arm -> forearm -> fist, so punches read as punches
    this.hands = new THREE.Group();
    this.camera.add(this.hands);
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b790, roughness: 0.7 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x6b3a1e, roughness: 0.9 });
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group(); shoulder.position.set(side * 0.3, -0.32, -0.12);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 8), sleeve); upper.rotation.x = Math.PI / 2 - 0.9; upper.position.set(0, -0.06, -0.12);
      const elbow = new THREE.Group(); elbow.position.set(0, -0.12, -0.24);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.045, 0.3, 8), skin); fore.rotation.x = Math.PI / 2 + 0.3; fore.position.set(0, 0.04, -0.14);
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin); fist.scale.set(1, 0.85, 1.15); fist.position.set(0, 0.09, -0.3);
      elbow.add(fore, fist); shoulder.add(upper, elbow); this.hands.add(shoulder);
      this.arms.push({ side, shoulder, elbow, t: -1 });
    }
    this.boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.28), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.9 }));
    this.boot.position.set(0.15, -0.9, -0.5); this.boot.visible = false; this.hands.add(this.boot);
    this.holdAnchor = new THREE.Group(); this.holdAnchor.position.set(0.22, -0.2, -0.4); this.hands.add(this.holdAnchor);
    this.kickT = -1; this.holdT = -1; this.held = null;
    this.flashTex = flashTexture();

    this.hud.setCrosshair(true);
    this.hud.setHints(`<kbd>X</kbd> punch · <kbd>C</kbd> kick · hold <kbd>space</kbd> grab, release to throw · <kbd>space</kbd>+<kbd>X</kbd>/<kbd>C</kbd> smash`);
    if (this.isTouch) {
      this.hud.setActions([
        { label: 'punch', onDown: () => this.attack('punch') },
        { label: 'kick', onDown: () => this.attack('kick') },
        { label: 'grab', big: true, onDown: () => this.beginHold(), onUp: () => this.releaseHold() },
      ]);
    }
    for (const m of this.bar.mates) { m.pose = 'talk'; m.headTarget = this.player.eye(); }
    this.hud.showToast('"You spilled my drink."', 'Big Mick squares up', 1800);
    this.updateHealth();
  }

  addEnemy(patron, opts) {
    patron.pose = 'fight'; patron.ko = 0; patron.stand(); patron.busy = true;
    const e = { patron, hp: opts.hp, max: opts.hp, dmg: opts.dmg, rate: opts.rate, bruiser: !!opts.bruiser, cd: 1.2 + Math.random() * 0.6, stun: 0, ko: false, slot: this.enemies.length, yaw: 0 };
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(patron.root.quaternion); e.yaw = Math.atan2(f.x, f.z);
    this.enemies.push(e);
    return e;
  }

  updateHealth() {
    const list = [{ label: 'You', hp: this.hp, max: 100 }];
    for (const e of this.enemies) list.push({ label: e.patron.name + (e.bruiser ? ' (uh oh)' : ''), hp: e.hp, max: e.max, enemy: true });
    this.hud.setHealth(list);
  }

  update(dt) {
    super.update(dt);
    if (this.over) { this.updateOver(dt); return; }
    const inp = this.input;
    this.player.update(dt, inp);
    // joiners
    for (const j of this.joinQueue) {
      if (!j.joined && j.when()) {
        j.joined = true; this.lastJoin = this.t;
        this.addEnemy(j.patron, { hp: j.bruiser ? 150 : 80, dmg: j.bruiser ? 22 : (this.mustWin ? 6 : 10), rate: j.bruiser ? 1.4 : 1.9, bruiser: j.bruiser });
        this.hud.showToast(`${j.patron.name} jumps in${j.bruiser ? '. He looks... sturdy.' : ''}`, '', 1500);
        this.updateHealth();
      }
    }
    if (inp.justPressed('Space')) this.beginHold();
    if (inp.justReleased('Space')) this.releaseHold();
    if (inp.justPressed('KeyX') || (inp.clicks.length && !this.isTouch)) this.attack('punch');
    if (inp.justPressed('KeyC')) this.attack('kick');
    if (this.holdT >= 0) { this.holdT += dt; this.hud.setPower(Math.min(1, this.holdT / 1.2)); }
    this.updateArms(dt);
    // who is engaging: the first standing enemy; the rest hang back in front
    const standing = this.enemies.filter((e) => !e.ko);
    standing.forEach((e, i) => this.updateEnemy(e, dt, i === 0, i));
    if (this.projectile) this.updateProjectile(dt);
    for (const f of this.fx) { f.t += dt; f.s.material.opacity = Math.max(0, 1 - f.t / 0.16); f.s.scale.setScalar(0.18 + f.t * 2.2); }
    this.fx = this.fx.filter((f) => f.t < 0.2 || (this.group.remove(f.s), false));
    this.updateLabels(dt);
    if (this.shake > 0) { this.shake -= dt; this.camera.rotation.z += (Math.random() - 0.5) * 0.035; this.camera.position.y += (Math.random() - 0.5) * 0.025; }
    if (this.enemies.length && !standing.length && this.joinQueue.every((j) => j.joined)) this.endFight(true);
  }

  updateArms(dt) {
    for (const a of this.arms) {
      const idleY = -0.32 + Math.sin(this.t * 2 + a.side) * 0.008, idleZ = -0.12 + Math.sin(this.t * 1.3) * 0.004;
      if (a.t >= 0) {
        a.t += dt / 0.42;
        const k = a.t;
        // 0-0.3 pull back, 0.3-0.5 drive forward, 0.5-1 recover
        const wind = k < 0.3 ? k / 0.3 : k < 0.5 ? 1 - (k - 0.3) / 0.2 : 0;
        const ext = k < 0.3 ? 0 : k < 0.5 ? (k - 0.3) / 0.2 : Math.max(0, 1 - (k - 0.5) / 0.5);
        const e2 = ext * ext * (3 - 2 * ext);
        a.shoulder.position.set(a.side * (0.3 - e2 * 0.22), idleY + wind * -0.05 + e2 * 0.12, idleZ + wind * 0.14 - e2 * 0.42);
        a.shoulder.rotation.set(wind * 0.3 - e2 * 0.5, -a.side * e2 * 0.35, a.side * (wind * 0.4));
        a.elbow.rotation.x = -wind * 0.6 + e2 * 0.6;
        if (k >= 1) a.t = -1;
      } else {
        a.shoulder.position.lerp(new THREE.Vector3(a.side * 0.3, idleY, idleZ), Math.min(1, dt * 10));
        a.shoulder.rotation.set(damp(a.shoulder.rotation.x, 0, 10, dt), damp(a.shoulder.rotation.y, 0, 10, dt), damp(a.shoulder.rotation.z, 0, 10, dt));
        a.elbow.rotation.x = damp(a.elbow.rotation.x, 0, 10, dt);
      }
    }
    if (this.kickT >= 0) {
      this.kickT += dt / 0.55;
      const k = this.kickT, e = Math.sin(Math.min(1, k) * Math.PI);
      this.boot.visible = true; this.boot.position.set(0.18 - e * 0.1, -0.95 + e * 0.75, -0.45 - e * 0.5); this.boot.rotation.x = -e * 1.1;
      if (k >= 1) { this.kickT = -1; this.boot.visible = false; }
    }
  }

  toPlayer(e) { return new THREE.Vector3(this.player.pos.x - e.patron.root.position.x, 0, this.player.pos.z - e.patron.root.position.z); }

  updateEnemy(e, dt, engaged, order) {
    const p = e.patron;
    const to = this.toPlayer(e);
    const dist = to.length();
    e.stun = Math.max(0, e.stun - dt);
    // face the player smoothly
    const wantYaw = Math.atan2(to.x, to.z);
    e.yaw = e.yaw + Math.atan2(Math.sin(wantYaw - e.yaw), Math.cos(wantYaw - e.yaw)) * Math.min(1, dt * 7);
    p.root.rotation.set(0, e.yaw, 0);
    p.headTarget = this.player.eye();
    if (e.stun > 0) { p.walk = damp(p.walk, 0, 8, dt); return; }
    // where to stand: engaged = 1m in front; others fan out 2m in front of the player's facing
    const fwd = this.player.forward();
    let target;
    if (engaged) target = this.player.pos.clone().addScaledVector(fwd, 1.0);
    else {
      const ang = (order % 2 ? 1 : -1) * (0.55 + order * 0.2);
      const d = new THREE.Vector3(fwd.x * Math.cos(ang) - fwd.z * Math.sin(ang), 0, fwd.x * Math.sin(ang) + fwd.z * Math.cos(ang));
      target = this.player.pos.clone().addScaledVector(d, 2.1);
    }
    const dx = target.x - p.root.position.x, dz = target.z - p.root.position.z, d = Math.hypot(dx, dz);
    const near = engaged ? dist < 1.15 : d < 0.35;
    if (!near) {
      const speed = e.bruiser ? 1.3 : 1.7;
      let sx = dx / d, sz = dz / d;
      // do not walk through the player
      if (dist < 0.9) { sx += to.x / dist * -1.5; sz += to.z / dist * -1.5; }
      for (const o of this.enemies) { if (o === e || o.ko) continue; const ox = p.root.position.x - o.patron.root.position.x, oz = p.root.position.z - o.patron.root.position.z, od = Math.hypot(ox, oz); if (od < 0.7 && od > 0) { sx += ox / od * 1.2; sz += oz / od * 1.2; } }
      const sl = Math.hypot(sx, sz) || 1;
      const nx = p.root.position.x + sx / sl * speed * dt, nz = p.root.position.z + sz / sl * speed * dt;
      if (!this.player.blocked(nx, nz, p, 0.28)) { p.root.position.x = nx; p.root.position.z = nz; }
      else if (!this.player.blocked(nx, p.root.position.z, p, 0.28)) p.root.position.x = nx;
      else if (!this.player.blocked(p.root.position.x, nz, p, 0.28)) p.root.position.z = nz;
      p.walk = damp(p.walk, 0.85, 8, dt); p.walkPhase += speed * dt / 0.36 * Math.PI;
      p.pose = engaged ? 'fight' : 'idle';
    } else {
      p.walk = damp(p.walk, 0, 8, dt);
      p.pose = engaged ? 'fight' : 'talk';
      if (!engaged && Math.random() < dt * 0.25) p.gesture();
    }
    if (!engaged) return;
    e.cd -= dt;
    if (dist < 1.3 && e.cd <= 0) {
      e.cd = e.rate * (0.8 + Math.random() * 0.5);
      p.punch();
      const side = p.punchArm ? 1 : -1;
      this.after(0.17, () => {
        if (this.over || e.ko || e.stun > 0) return;
        if (this.toPlayer(e).length() < 1.4) this.hurt(e.dmg, e, side);
      });
    }
  }

  hurt(dmg, e, side = 1) {
    const floor = this.mustWin ? 6 : 0;
    this.hp = Math.max(floor, this.hp - dmg);
    this.hud.flashHurt(0.9);
    this.shake = 0.28;
    this.camera.rotation.z += side * 0.08;
    this.floatLabel(this.player.eye().addScaledVector(this.player.forward(), 0.5).add(new THREE.Vector3(side * 0.15, -0.1, 0)), `-${Math.round(dmg)}`, 'you');
    this.updateHealth();
    if (this.hp <= 0) this.endFight(false, e);
    else if (this.hp === floor && this.mustWin && !this.secondWind) { this.secondWind = true; this.hud.showToast('Second wind', 'you are not going down tonight', 1400); }
  }

  targetInFront(reach = 1.3, cosLimit = 0.7) {
    const f = this.player.forward();
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.ko) continue;
      const to = new THREE.Vector3().subVectors(e.patron.root.position, this.player.pos); to.y = 0;
      const d = to.length();
      if (d > reach || d === 0) continue;
      if (to.normalize().dot(f) < cosLimit) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  attack(kind) {
    if (this.over) return;
    if (this.held) { this.smash(); return; }
    if (kind === 'punch') {
      const arm = this.arms.find((a) => a.t < 0 || a.t > 0.7);
      if (!arm) return;
      this.nextArm = this.nextArm === 0 ? 1 : 0;
      const a = this.arms[this.nextArm].t < 0 ? this.arms[this.nextArm] : arm;
      a.t = 0;
      this.after(0.15, () => this.landHit('punch', a.side));
    } else {
      if (this.kickT >= 0) return; this.kickT = 0;
      this.after(0.24, () => this.landHit('kick', 1));
    }
  }
  landHit(kind, side) {
    const e = this.targetInFront(kind === 'punch' ? 1.3 : 1.5);
    if (!e) return;
    const base = kind === 'punch' ? 11 + Math.random() * 6 : 17 + Math.random() * 8;
    this.damage(e, base * (this.mustWin ? 1.8 : 0.75), kind, side);
  }

  damage(e, amount, kind, side = 1) {
    const floor = e.bruiser && !this.mustWin ? 1 : 0;
    e.hp = Math.max(floor, e.hp - amount);
    e.patron.hit(-side); e.stun = kind === 'kick' ? 0.75 : kind === 'smash' ? 0.9 : 0.4;
    const head = e.patron.root.position.clone().add(new THREE.Vector3(0, 1.5 * e.patron.height, 0));
    const hitPoint = head.clone().add(this.player.forward().multiplyScalar(-0.15)).add(new THREE.Vector3(0, kind === 'kick' ? -0.5 : -0.05, 0));
    this.impact(hitPoint);
    this.floatLabel(head.add(new THREE.Vector3(0, 0.25, 0)), `-${Math.round(amount)}`, kind === 'punch' ? '' : 'big');
    this.shake = Math.max(this.shake, 0.08);
    const back = this.toPlayer(e).normalize().multiplyScalar(-(kind === 'kick' ? 0.45 : kind === 'smash' ? 0.35 : 0.18));
    const nx = e.patron.root.position.x + back.x, nz = e.patron.root.position.z + back.z;
    if (!this.player.blocked(nx, nz, e.patron, 0.28)) { e.patron.root.position.x = nx; e.patron.root.position.z = nz; }
    if (e.hp <= 0) { e.ko = true; e.patron.ko = 1; e.patron.pose = 'idle'; this.hud.showToast(`${e.patron.name} is down`, '', 1200); }
    else if (e.hp === floor && floor > 0 && !e.shrugged) { e.shrugged = true; this.hud.showToast(`${e.patron.name} shrugs it off`, 'that is not a man, that is a wall', 1600); }
    this.updateHealth();
  }

  impact(point) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, transparent: true, depthWrite: false, opacity: 1 }));
    s.position.copy(point); s.scale.setScalar(0.18);
    this.group.add(s); this.fx.push({ s, t: 0 });
  }
  floatLabel(worldPos, text, cls) {
    const el = document.createElement('div');
    el.className = 'floaty ' + (cls || '');
    el.textContent = text;
    this.hud.root.append(el);
    this.labels.push({ el, pos: worldPos.clone(), t: 0 });
  }
  updateLabels(dt) {
    const v = new THREE.Vector3();
    for (const l of this.labels) {
      l.t += dt;
      v.copy(l.pos); v.y += l.t * 0.5; v.project(this.camera);
      const onScreen = v.z < 1;
      l.el.style.display = onScreen ? 'block' : 'none';
      l.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`; l.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
      l.el.style.opacity = String(Math.max(0, 1 - l.t / 0.9));
    }
    this.labels = this.labels.filter((l) => l.t < 0.9 || (l.el.remove(), false));
  }

  nearestProp() {
    let best = null, bd = Infinity;
    const f = this.player.forward();
    for (const pr of this.bar.props) {
      if (pr.taken) continue;
      const wp = new THREE.Vector3(); pr.mesh.getWorldPosition(wp);
      const to = wp.clone().sub(this.player.eye()); const d = to.length();
      if (d > 1.9) continue;
      to.y = 0; if (to.normalize().dot(f) < 0.3) continue;
      if (d < bd) { bd = d; best = pr; }
    }
    return best;
  }
  beginHold() {
    if (this.over || this.held || this.holdT >= 0) return;
    const pr = this.nearestProp();
    if (!pr) { this.hud.showToast('Nothing to grab', 'get closer to a table', 900); return; }
    pr.taken = true; this.held = pr; this.holdT = 0;
    pr.parent0 = pr.mesh.parent; pr.pos0 = pr.mesh.position.clone(); pr.rot0 = pr.mesh.rotation.clone();
    this.holdAnchor.add(pr.mesh); pr.mesh.position.set(0, 0, 0); pr.mesh.rotation.set(0.3, 0, 0.2);
  }
  releaseHold() {
    if (!this.held || this.holdT < 0) return;
    const power = Math.min(1, this.holdT / 1.2);
    this.holdT = -1; this.hud.setPower(null);
    const pr = this.held; this.held = null;
    this.group.attach(pr.mesh);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.projectile = { pr, vel: dir.multiplyScalar(4 + power * 9).add(new THREE.Vector3(0, 1.5 + power * 1.5, 0)), t: 0, power };
    this.arms[1].t = 0;
  }
  updateProjectile(dt) {
    const pj = this.projectile, m = pj.pr.mesh;
    pj.vel.y -= 9.8 * dt;
    m.position.addScaledVector(pj.vel, dt);
    m.rotation.x += dt * 8;
    pj.t += dt;
    for (const e of this.enemies) {
      if (e.ko) continue;
      const hp = e.patron.root.position;
      if (Math.hypot(m.position.x - hp.x, m.position.z - hp.z) < 0.4 && m.position.y > 0.3 && m.position.y < 2.0) {
        this.damage(e, (pj.pr.kind === 'bottle' ? 22 : 16) * (0.6 + pj.power) * (this.mustWin ? 1.5 : 0.8), 'smash');
        this.hud.showToast('Smash!', '', 700);
        this.returnProp(pj.pr); this.projectile = null; return;
      }
    }
    if (m.position.y < 0.05 || pj.t > 4 || this.player.blocked(m.position.x, m.position.z, 'player', 0.05)) { this.returnProp(pj.pr); this.projectile = null; }
  }
  smash() {
    const pr = this.held; this.held = null; this.holdT = -1; this.hud.setPower(null);
    this.arms[1].t = 0;
    this.after(0.15, () => {
      const e = this.targetInFront(1.35, 0.6);
      if (e) { this.damage(e, 32 * (this.mustWin ? 1.5 : 0.8), 'smash'); this.hud.showToast('Over the head!', '', 900); }
    });
    this.after(0.3, () => this.returnProp(pr));
  }
  returnProp(pr) { pr.parent0.add(pr.mesh); pr.mesh.position.copy(pr.pos0); pr.mesh.rotation.copy(pr.rot0); pr.taken = false; }

  endFight(win, by) {
    if (this.over) return;
    this.over = true; this.overT = 0; this.win = win;
    this.player.enabled = false;
    this.hud.setActions(null); this.hud.setPower(null);
    if (!win) this.hud.showToast(`${by?.patron.name || 'Mick'} puts you down`, '', 2000);
    else this.hud.showToast('Last man standing', 'Dee sighs and reaches for the mop', 2000);
    this.after(win ? 2.2 : 2.6, () => this.finish({
      win, title: win ? 'You win the fight' : 'Knocked out',
      line: win ? 'Mick\'s mates drag him out. Somebody puts money on the bar for your trouble.' : 'You wake up outside with your wallet lighter and a new appreciation for Mick.',
    }));
  }
  updateOver(dt) {
    this.overT += dt;
    this.updateArms(dt); this.updateLabels(dt);
    if (!this.win) {
      const k = Math.min(1, this.overT / 1.4);
      this.camera.position.y = 1.62 - k * 1.3;
      this.camera.rotation.z = k * 0.6; this.camera.rotation.x = -k * 0.4;
      this.hud.setBlackout(Math.max(0, (this.overT - 0.8) / 1.5));
    } else {
      this.player.vel.set(0, 0, 0); this.player.applyCamera(dt);
    }
  }

  dispose() {
    super.dispose();
    this.camera.remove(this.hands);
    this.camera.rotation.z = 0;
    this.hud.setBlackout(0);
    for (const l of this.labels) l.el.remove();
    if (this.held) this.returnProp(this.held);
    if (this.projectile) this.returnProp(this.projectile.pr);
    for (const [p, pos] of this.origins) { p.root.position.copy(pos); p.ko = 0; p.pose = 'idle'; p.walk = 0; p.headTarget = null; p.stand(); }
  }
}

function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,230,160,0.8)'); g.addColorStop(1, 'rgba(255,120,60,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

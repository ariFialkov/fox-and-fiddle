/**
 * Bar fight. You keep the normal movement controls; X punches, C kicks, hold Space to grab the
 * nearest bottle or glass and release to throw it (longer hold = harder), or press X/C while
 * holding to smash it over whoever is in front of you. If the round says you lose, more of
 * Mick's mates jump in and one of them simply does not go down.
 */
import * as THREE from 'three';
import { MiniGame } from './base.js';

export class BarFight extends MiniGame {
  start() {
    const flav = this.round.flavour || {};
    this.mustWin = !!this.round.win;
    this.player.enabled = true;
    this.player.lookTarget = null;
    this.input.showJoystick(true);
    this.hp = 100;
    this.combo = 0;
    this.punchT = -1; this.kickT = -1; this.punchKind = 'punch';
    this.holdT = -1; this.held = null;
    this.shake = 0;
    this.enemies = [];
    const mick = this.bar.mick;
    this.addEnemy(mick, { hp: 100, dmg: this.mustWin ? 7 : 11, rate: 1.6, bruiser: false });
    const extra = Math.min(this.bar.mates.length, flav.extraPatrons ?? 1);
    const bruiserIdx = flav.bruiser ? Math.floor(Math.random() * extra) : -1;
    this.joinQueue = [];
    for (let i = 0; i < extra; i++) {
      const m = this.bar.mates[i];
      this.joinQueue.push({ patron: m, at: 2 + i * 3 + Math.random() * 2, bruiser: i === bruiserIdx });
    }
    if (flav.bruiser && extra === 0) this.joinQueue.push({ patron: this.bar.mates[0], at: 2, bruiser: true });
    const fighters = new Set([mick, ...this.bar.mates]);
    this.origins = new Map();
    for (const p of fighters) this.origins.set(p, p.root.position.clone());

    // first-person hands
    this.hands = new THREE.Group();
    this.camera.add(this.hands);
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b790, roughness: 0.7 });
    this.fist = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin);
    this.fist.scale.set(1, 0.8, 1.1); this.fist.position.set(0.28, -0.28, -0.45);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x6b3a1e, roughness: 0.9 }));
    arm.rotation.x = Math.PI / 2; arm.position.set(0, 0, 0.22); this.fist.add(arm);
    this.fist2 = this.fist.clone(); this.fist2.position.x = -0.28;
    this.boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.26), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.9 }));
    this.boot.position.set(0.15, -0.9, -0.5); this.boot.visible = false;
    this.hands.add(this.fist, this.fist2, this.boot);
    this.holdAnchor = new THREE.Group(); this.holdAnchor.position.set(0.22, -0.2, -0.4); this.hands.add(this.holdAnchor);

    this.hud.setCrosshair(true);
    this.hud.setHints(`<kbd>X</kbd> punch · <kbd>C</kbd> kick · hold <kbd>space</kbd> grab, release to throw · <kbd>space</kbd>+<kbd>X</kbd>/<kbd>C</kbd> smash`);
    if (this.isTouch) {
      this.hud.setActions([
        { label: 'punch', onDown: () => this.attack('punch') },
        { label: 'kick', onDown: () => this.attack('kick') },
        { label: 'grab', big: true, onDown: () => this.beginHold(), onUp: () => this.releaseHold() },
      ]);
    }
    mick.pose = 'fight';
    this.hud.showToast('"You spilled my drink."', 'Big Mick squares up', 1800);
    this.updateHealth();
  }

  addEnemy(patron, opts) {
    patron.pose = 'fight'; patron.ko = 0; patron.stand();
    const e = { patron, hp: opts.hp, max: opts.hp, dmg: opts.dmg, rate: opts.rate, bruiser: opts.bruiser, cd: 1 + Math.random(), stun: 0, ko: false, orbit: (Math.random() - 0.5) * 1.2 };
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
      if (!j.joined && this.t > j.at) {
        j.joined = true;
        this.addEnemy(j.patron, { hp: j.bruiser ? 140 : 80, dmg: j.bruiser ? 22 : (this.mustWin ? 6 : 10), rate: j.bruiser ? 1.3 : 1.9, bruiser: j.bruiser });
        this.hud.showToast(`${j.patron.name} jumps in${j.bruiser ? '. He looks... sturdy.' : ''}`, '', 1500);
        this.updateHealth();
      }
    }
    // inputs
    if (inp.justPressed('Space')) this.beginHold();
    if (inp.justReleased('Space')) this.releaseHold();
    if (inp.justPressed('KeyX') || (inp.clicks.length && !this.isTouch)) this.attack('punch');
    if (inp.justPressed('KeyC')) this.attack('kick');
    if (this.holdT >= 0) { this.holdT += dt; this.hud.setPower(Math.min(1, this.holdT / 1.2)); }
    // hand animation
    const k = this.punchT >= 0 ? Math.sin(Math.min(1, (this.punchT += dt * 5)) * Math.PI) : 0;
    if (this.punchT >= 1) this.punchT = -1;
    this.fist.position.set(0.28 - k * 0.2, -0.28 + k * 0.08, -0.45 - k * 0.35);
    this.fist2.position.set(-0.28, -0.3 + Math.sin(this.t * 2) * 0.01, -0.45 + k * 0.1);
    const kk = this.kickT >= 0 ? Math.sin(Math.min(1, (this.kickT += dt * 4)) * Math.PI) : 0;
    if (this.kickT >= 1) this.kickT = -1;
    this.boot.visible = kk > 0; this.boot.position.set(0.15, -0.9 + kk * 0.55, -0.5 - kk * 0.4); this.boot.rotation.x = -kk * 0.8;
    // enemies
    for (const e of this.enemies) this.updateEnemy(e, dt);
    // projectiles
    if (this.projectile) this.updateProjectile(dt);
    // camera shake
    if (this.shake > 0) { this.shake -= dt; this.camera.rotation.z += (Math.random() - 0.5) * 0.03; this.camera.position.y += (Math.random() - 0.5) * 0.02; }
    const alive = this.enemies.filter((e) => !e.ko);
    if (this.enemies.length && !alive.length && this.joinQueue.every((j) => j.joined)) this.endFight(true);
  }

  enemyFacing(e) {
    const pp = this.player.pos;
    const d = new THREE.Vector3(pp.x - e.patron.root.position.x, 0, pp.z - e.patron.root.position.z);
    return d;
  }

  updateEnemy(e, dt) {
    const p = e.patron;
    if (e.ko) return;
    const to = this.enemyFacing(e);
    const dist = to.length();
    p.lookAt(new THREE.Vector3(this.player.pos.x, 0, this.player.pos.z));
    e.stun = Math.max(0, e.stun - dt);
    if (e.stun > 0) return;
    // approach to ~0.9m, with a little lateral orbit so they don't stack
    const dir = to.clone().normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(e.orbit);
    const speed = e.bruiser ? 1.5 : 1.9;
    if (dist <= 0.95) p.walk = THREE.MathUtils.damp(p.walk, 0, 8, dt);
    if (dist > 0.95) {
      const step = dir.multiplyScalar(speed * dt).add(side.multiplyScalar(dt * 0.5));
      const nx = p.root.position.x + step.x, nz = p.root.position.z + step.z;
      if (!this.player.blocked(nx, nz, p)) { p.root.position.x = nx; p.root.position.z = nz; }
      else { e.orbit = -e.orbit; }
      p.walk = THREE.MathUtils.damp(p.walk, 0.8, 8, dt); p.walkPhase += speed * dt / 0.36 * Math.PI;
    }
    // separation from other enemies
    for (const o of this.enemies) {
      if (o === e || o.ko) continue;
      const dx = p.root.position.x - o.patron.root.position.x, dz = p.root.position.z - o.patron.root.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6 && d > 0) { p.root.position.x += (dx / d) * dt * 0.8; p.root.position.z += (dz / d) * dt * 0.8; }
    }
    e.cd -= dt;
    if (dist < 1.15 && e.cd <= 0) {
      e.cd = e.rate * (0.8 + Math.random() * 0.5);
      p.punch();
      this.after(0.2, () => {
        if (this.over || e.ko) return;
        if (this.enemyFacing(e).length() < 1.3) this.hurt(e.dmg, e);
      });
    }
  }

  hurt(dmg, e) {
    const floor = this.mustWin ? 6 : 0;
    this.hp = Math.max(floor, this.hp - dmg);
    this.hud.flashHurt(0.9);
    this.shake = 0.25;
    this.updateHealth();
    if (this.hp <= 0) this.endFight(false, e);
    else if (this.hp === floor && this.mustWin && !this.secondWind) { this.secondWind = true; this.hud.showToast('Second wind', 'you are not going down tonight', 1400); }
  }

  /** Who is in front of the player within reach and angle. */
  targetInFront(reach = 1.25, cosLimit = 0.7) {
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
    if (kind === 'punch') { if (this.punchT >= 0 && this.punchT < 0.5) return; this.punchT = 0; }
    else { if (this.kickT >= 0) return; this.kickT = 0; }
    this.after(kind === 'punch' ? 0.12 : 0.2, () => {
      const e = this.targetInFront(kind === 'punch' ? 1.25 : 1.45);
      if (!e) return;
      const base = kind === 'punch' ? 11 + Math.random() * 6 : 17 + Math.random() * 8;
      this.damage(e, base * (this.mustWin ? 1.8 : 0.75), kind);
    });
  }

  damage(e, amount, kind) {
    const floor = e.bruiser && !this.mustWin ? 1 : 0;
    e.hp = Math.max(floor, e.hp - amount);
    e.patron.stagger(); e.stun = kind === 'kick' ? 0.7 : 0.35;
    // knock back
    const dir = this.enemyFacing(e).normalize().multiplyScalar(-(kind === 'kick' ? 0.35 : 0.15));
    const nx = e.patron.root.position.x + dir.x, nz = e.patron.root.position.z + dir.z;
    if (!this.player.blocked(nx, nz, e.patron)) { e.patron.root.position.x = nx; e.patron.root.position.z = nz; }
    if (e.hp <= 0) { e.ko = true; e.patron.ko = 1; this.hud.showToast(`${e.patron.name} is down`, '', 1200); }
    else if (e.hp === floor && floor > 0 && !e.shrugged) { e.shrugged = true; this.hud.showToast(`${e.patron.name} shrugs it off`, 'that is not a man, that is a wall', 1600); }
    this.updateHealth();
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
    pr.taken = true;
    this.held = pr;
    this.holdT = 0;
    pr.parent0 = pr.mesh.parent; pr.pos0 = pr.mesh.position.clone(); pr.rot0 = pr.mesh.rotation.clone();
    this.holdAnchor.add(pr.mesh); pr.mesh.position.set(0, 0, 0); pr.mesh.rotation.set(0.3, 0, 0.2);
  }

  releaseHold() {
    if (!this.held || this.holdT < 0) return;
    const power = Math.min(1, this.holdT / 1.2);
    this.holdT = -1; this.hud.setPower(null);
    const pr = this.held; this.held = null;
    const start = new THREE.Vector3(); pr.mesh.getWorldPosition(start);
    this.group.attach(pr.mesh);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.projectile = { pr, vel: dir.multiplyScalar(4 + power * 9).add(new THREE.Vector3(0, 1.5 + power * 1.5, 0)), t: 0, power };
  }

  updateProjectile(dt) {
    const pj = this.projectile;
    const m = pj.pr.mesh;
    pj.vel.y -= 9.8 * dt;
    m.position.addScaledVector(pj.vel, dt);
    m.rotation.x += dt * 8;
    pj.t += dt;
    for (const e of this.enemies) {
      if (e.ko) continue;
      const hp = e.patron.root.position;
      if (Math.hypot(m.position.x - hp.x, m.position.z - hp.z) < 0.4 && m.position.y > 0.3 && m.position.y < 2.0) {
        this.damage(e, (pj.pr.kind === 'bottle' ? 22 : 16) * (0.6 + pj.power) * (this.mustWin ? 1.5 : 0.8), 'throw');
        this.hud.showToast('Smash!', '', 700);
        this.returnProp(pj.pr); this.projectile = null; return;
      }
    }
    if (m.position.y < 0.05 || pj.t > 4 || this.player.blocked(m.position.x, m.position.z)) { this.returnProp(pj.pr); this.projectile = null; }
  }

  smash() {
    const pr = this.held; this.held = null; this.holdT = -1; this.hud.setPower(null);
    this.punchT = 0;
    const e = this.targetInFront(1.3, 0.6);
    if (e) { this.damage(e, 32 * (this.mustWin ? 1.5 : 0.8), 'smash'); this.hud.showToast('Over the head!', '', 900); }
    this.after(0.25, () => this.returnProp(pr));
  }

  returnProp(pr) {
    pr.parent0.add(pr.mesh); pr.mesh.position.copy(pr.pos0); pr.mesh.rotation.copy(pr.rot0); pr.taken = false;
  }

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
    if (!this.win) {
      // slump to the floor and fade
      const k = Math.min(1, this.overT / 1.4);
      this.camera.position.y = 1.62 - k * 1.3;
      this.camera.rotation.z = k * 0.6; this.camera.rotation.x = -k * 0.4;
      this.hud.setBlackout(Math.max(0, (this.overT - 0.8) / 1.5));
    }
  }

  dispose() {
    super.dispose();
    this.camera.remove(this.hands);
    this.camera.rotation.z = 0;
    this.hud.setBlackout(0);
    if (this.held) this.returnProp(this.held);
    if (this.projectile) this.returnProp(this.projectile.pr);
    for (const [p, pos] of this.origins) { p.root.position.copy(pos); p.ko = 0; p.pose = 'idle'; p.walk = 0; p.stand(); }
  }
}

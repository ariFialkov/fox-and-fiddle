/**
 * First-person controller.
 * W/S walk forward/back, A/D turn in place (joystick: x turns, y walks). Turning eases in and
 * out over a few frames so it never snaps, but stops as soon as the key is released so aiming
 * stays accurate. Dragging on the canvas nudges the view. Idle breathing and a walk bob are
 * layered on the camera.
 */
import * as THREE from 'three';
import { ROOM } from '../world/Bar.js';

const EYE = 1.62;
const RADIUS = 0.32;
const damp = THREE.MathUtils.damp;

export class Player {
  constructor(camera, bar) {
    this.camera = camera;
    this.bar = bar;
    this.pos = new THREE.Vector3(-5, 0, 4.6);
    this.yaw = 0;
    this.pitch = 0;
    this.yawVel = 0;
    this.vel = new THREE.Vector3();
    this.speed = 2.6;
    this.turnSpeed = 2.1;     // rad/s at full deflection
    this.bobPhase = 0;
    this.bobAmt = 0;          // eased 0..1 walking blend
    this.t = 0;
    this.enabled = false;
    this.lookHold = 0;
  }

  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z); }

  update(dt, input) {
    this.t += dt;
    if (!this.enabled) { this.vel.multiplyScalar(0); this.applyCamera(dt); return; }
    const a = input.axis();
    const want = this.forward().multiplyScalar(THREE.MathUtils.clamp(a.y, -1, 1) * this.speed);
    // acceleration / deceleration
    const k = want.lengthSq() > 0 ? 9 : 12;
    this.vel.x = damp(this.vel.x, want.x, k, dt);
    this.vel.z = damp(this.vel.z, want.z, k, dt);

    // drag-look (optional nudge)
    const p = input.pointer;
    if (p.down && (p.dx || p.dy)) {
      this.yaw -= p.dx * 0.0045;
      this.pitch = THREE.MathUtils.clamp(this.pitch - p.dy * 0.003, -0.7, 0.6);
      this.lookHold = 0.5;
    }
    this.lookHold = Math.max(0, this.lookHold - dt);

    // turn in place: A/D (or joystick x). Eased, but with no lingering after release.
    const sp = this.vel.length();
    const desired = -THREE.MathUtils.clamp(a.x, -1, 1) * this.turnSpeed;
    this.yawVel = damp(this.yawVel, desired, desired === 0 ? 18 : 11, dt);
    if (Math.abs(this.yawVel) < 0.01) this.yawVel = 0;
    this.yaw += this.yawVel * dt;
    if (sp > 0.3) this.pitch = damp(this.pitch, 0, 1.5, dt);

    // move with axis-separated sliding
    const step = this.vel.clone().multiplyScalar(dt);
    if (step.lengthSq() > 0) this.tryMove(step);
    this.applyCamera(dt);
  }

  applyCamera(dt) {
    const sp = this.vel.length();
    const ratio = Math.min(1, sp / this.speed);
    this.bobAmt = damp(this.bobAmt, ratio, 6, dt);
    this.bobPhase += dt * (Math.PI * 2) * 1.85 * (0.4 + ratio * 0.6) * (ratio > 0.05 ? 1 : 0);
    const b = this.bobAmt;
    const vert = Math.sin(this.bobPhase * 2) * 0.032 * b + Math.sin(this.t * 1.1) * 0.006 * (1 - b * 0.5);
    const lat = Math.sin(this.bobPhase) * 0.022 * b;
    const r = this.right();
    this.camera.position.set(this.pos.x + r.x * lat, this.pos.y + EYE + vert, this.pos.z + r.z * lat);
    const roll = Math.sin(this.bobPhase) * 0.012 * b - this.yawVel * 0.02 + Math.sin(this.t * 0.9) * 0.002;
    const pitch = this.pitch + Math.sin(this.t * 1.1) * 0.004 + Math.sin(this.bobPhase * 2 + 0.6) * 0.008 * b;
    this.camera.rotation.set(pitch, this.yaw, roll, 'YXZ');
  }

  tryMove(step) {
    const nx = this.pos.x + step.x;
    if (!this.blocked(nx, this.pos.z)) this.pos.x = nx; else this.vel.x *= 0.2;
    const nz = this.pos.z + step.z;
    if (!this.blocked(this.pos.x, nz)) this.pos.z = nz; else this.vel.z *= 0.2;
  }

  /** Static colliders, room walls and (dynamic) patrons. `ignore` lets a patron test its own move. */
  blocked(x, z, ignore = null, radius = RADIUS) {
    if (x < ROOM.minX + radius || x > ROOM.maxX - radius || z < ROOM.minZ + radius || z > ROOM.maxZ - radius) return true;
    for (const c of this.bar.colliders) {
      if (x > c.minX - radius && x < c.maxX + radius && z > c.minZ - radius && z < c.maxZ + radius) return true;
    }
    const fromX = ignore ? ignore.root?.position.x ?? this.pos.x : this.pos.x;
    const fromZ = ignore ? ignore.root?.position.z ?? this.pos.z : this.pos.z;
    for (const p of this.bar.patrons) {
      if (p === ignore || p.ko > 0.5) continue;
      const d = Math.hypot(p.root.position.x - x, p.root.position.z - z);
      if (d < radius + 0.3) {
        // already overlapping (e.g. someone wandered onto our spot): allow moves that separate us
        const cur = Math.hypot(p.root.position.x - fromX, p.root.position.z - fromZ);
        if (d > cur + 1e-4) continue;
        return true;
      }
    }
    if (ignore && ignore !== 'player') {
      const d = Math.hypot(this.pos.x - x, this.pos.z - z);
      if (d < radius + 0.32 && d <= Math.hypot(this.pos.x - fromX, this.pos.z - fromZ) + 1e-4) return true;
    }
    return false;
  }

  teleport(pos, yaw) { this.pos.copy(pos); if (yaw != null) this.yaw = yaw; this.pitch = 0; this.vel.set(0, 0, 0); this.yawVel = 0; this.applyCamera(0); }
  faceToward(target) { this.yaw = Math.atan2(-(target.x - this.pos.x), -(target.z - this.pos.z)); }
}

export function wrap(a) { return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }
export function turnToward(cur, target, maxStep) {
  const d = wrap(target - cur);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

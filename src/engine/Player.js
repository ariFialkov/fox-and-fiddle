/**
 * First-person controller. WASD / joystick to move; the view yaw smoothly
 * auto-rotates toward the direction of travel, so no separate look control is
 * needed. Dragging on the canvas (or right half of a touch screen) nudges the
 * view for players who want it.
 */
import * as THREE from 'three';
import { ROOM } from '../world/Bar.js';

const EYE = 1.62;
const RADIUS = 0.32;

export class Player {
  constructor(camera, bar) {
    this.camera = camera;
    this.bar = bar;
    this.pos = new THREE.Vector3(-5, 0, 4.6);
    this.yaw = 0;
    this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.speed = 2.7;
    this.turnRate = 2.6;
    this.bobT = 0;
    this.moving = 0;
    this.enabled = false;
    this.lookTarget = null;   // Vector3 to glance at when idle near a station
  }

  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  update(dt, input) {
    if (!this.enabled) { this.applyCamera(dt); return; }
    const a = input.axis();
    const fwd = this.forward(), rgt = this.right();
    const move = fwd.multiplyScalar(a.y).add(rgt.multiplyScalar(a.x));
    const mag = Math.min(1, move.length());
    this.moving = THREE.MathUtils.damp(this.moving, mag, 10, dt);

    // drag-look
    const p = input.pointer;
    if (p.down && (p.dx || p.dy)) {
      this.yaw -= p.dx * 0.0045;
      this.pitch = THREE.MathUtils.clamp(this.pitch - p.dy * 0.003, -0.7, 0.6);
      this.lookHold = 0.6;
    }
    this.lookHold = Math.max(0, (this.lookHold || 0) - dt);

    if (mag > 0.05) {
      const dir = move.clone().normalize();
      // auto-yaw towards travel direction (not when backing up)
      if (a.y > -0.15) {
        const target = Math.atan2(-dir.x, -dir.z);
        this.yaw = turnToward(this.yaw, target, this.turnRate * mag * dt);
      }
      this.pitch = THREE.MathUtils.damp(this.pitch, 0, 2.5, dt);
      const step = dir.multiplyScalar(this.speed * mag * dt);
      this.tryMove(step);
      this.bobT += dt * 9 * mag;
    } else if (this.lookTarget && !this.lookHold) {
      const to = this.lookTarget.clone().sub(this.eye());
      const target = Math.atan2(-to.x, -to.z);
      this.yaw = turnToward(this.yaw, target, 2.2 * dt);
      const pitchT = Math.atan2(to.y, Math.hypot(to.x, to.z));
      this.pitch = THREE.MathUtils.damp(this.pitch, THREE.MathUtils.clamp(pitchT, -0.5, 0.4), 3, dt);
    }
    this.applyCamera(dt);
  }

  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z); }

  applyCamera(dt) {
    const bob = Math.sin(this.bobT) * 0.025 * this.moving;
    this.camera.position.set(this.pos.x, this.pos.y + EYE + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bobT * 0.5) * 0.004 * this.moving, 'YXZ');
  }

  tryMove(step) {
    // axis-separated slide against AABB colliders and room walls
    const nx = this.pos.x + step.x;
    if (!this.blocked(nx, this.pos.z)) this.pos.x = nx;
    const nz = this.pos.z + step.z;
    if (!this.blocked(this.pos.x, nz)) this.pos.z = nz;
  }

  blocked(x, z) {
    if (x < ROOM.minX + RADIUS || x > ROOM.maxX - RADIUS || z < ROOM.minZ + RADIUS || z > ROOM.maxZ - RADIUS) return true;
    for (const c of this.bar.colliders) {
      if (x > c.minX - RADIUS && x < c.maxX + RADIUS && z > c.minZ - RADIUS && z < c.maxZ + RADIUS) return true;
    }
    return false;
  }

  teleport(pos, yaw) { this.pos.copy(pos); if (yaw != null) this.yaw = yaw; this.pitch = 0; this.applyCamera(0); }
  faceToward(target) { this.yaw = Math.atan2(-(target.x - this.pos.x), -(target.z - this.pos.z)); }
}

export function turnToward(cur, target, maxStep) {
  let d = ((target - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

/**
 * Table-soccer hands: a Patron (v2, with reachHand) holds two adjacent rod handles, one per hand, and hops a
 * hand to the next rod when play moves. Used by the foosball mini-game (Nadia) and the bar's background players.
 *
 *   const grip = new FoosHands(patron);
 *   grip.update(dt, handles, focus);   // every frame, before patron.update(dt)
 *
 * handles: this player's rod handles, [{ pos: Vector3 (world, the middle of the grip), axis: Vector3 (world, along
 * the rod, from the handle into the table), roll: rod spin (rad) }]. focus: a world point the play is around
 * (the ball); the hands take the adjacent pair of rods nearest it.
 */
import * as THREE from 'three';

const HOP = 0.26;            // s for a hand to move to another rod
const LIFT = 0.07;           // m the hand rises while it moves
const PALM_ABOVE = 0.026;    // m from the handle's axis up to the palm's centre
const ROLL_MAX = 0.6;        // rad the wrist turns with the rod before it lets the rod spin under the fingers (a hard spin runs through a loose grip)
const BODY_BACK = 0.39;      // m from the handles back to the player's feet (at height 1)

const _a = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class FoosHands {
  constructor(patron) {
    this.p = patron;
    this.pair = -1;                     // index of the right hand's rod in the sorted handles (left hand takes pair + 1)
    this.hand = [{ rod: -1, from: -1, t: 1 }, { rod: -1, from: -1, t: 1 }];
    this.hold = 0;                      // s before the pair may change again
    this.bodyAt = new THREE.Vector3(); this.bodyYaw = 0; this.hasBody = false;
  }

  /** The hands let go (the arms ease back to their pose). */
  release() { for (let i = 0; i < 2; i++) { this.p.releaseHand(i); this.p.fist[i] = 0; } this.pair = -1; }

  update(dt, handles, focus) {
    const p = this.p;
    if (!p.reachHand || handles.length < 2) return;
    p.root.updateMatrixWorld(true);
    _m.copy(p.root.matrixWorld).invert();
    // sort by the player's own left-right: the right hand (arms[0]) is on the -x side
    const order = handles.map((h, i) => ({ i, x: _a.copy(h.pos).applyMatrix4(_m).x })).sort((u, v) => u.x - v.x).map((o) => o.i);
    // the pair nearest the play, with some hysteresis so the hands don't twitch between rods
    this.hold = Math.max(0, this.hold - dt);
    const dist = (k) => { const a = handles[order[k]].pos, b = handles[order[k + 1]].pos; return Math.hypot((a.x + b.x) / 2 - focus.x, (a.z + b.z) / 2 - focus.z); };
    let best = 0; for (let k = 1; k < order.length - 1; k++) if (dist(k) < dist(best)) best = k;
    if (this.pair < 0 || this.pair > order.length - 2) { this.pair = best; this.hand.forEach((h, i) => { h.rod = order[best + i]; h.from = h.rod; h.t = 1; }); }
    else if (best !== this.pair && this.hold <= 0 && dist(best) < dist(this.pair) - 0.05) {
      this.pair = best; this.hold = 0.6;
      this.hand.forEach((h, i) => { const to = order[best + i]; if (to !== h.rod) { h.from = h.rod; h.rod = to; h.t = 0; } });
    }
    for (let i = 0; i < 2; i++) {
      const h = this.hand[i], a = p.arms[i];
      h.t = Math.min(1, h.t + dt / HOP);
      const e = h.t * h.t * (3 - 2 * h.t);
      const to = handles[h.rod], from = handles[h.from] || to;
      // the fingers wrap the handle in line with the forearm (its direction last frame, squared to the rod and
      // eased), so the wrist stays nearly straight; the palm goes on the upper side of the handle
      const fore = new THREE.Vector3().subVectors(a.wrist.getWorldPosition(new THREE.Vector3()), a.fore.getWorldPosition(new THREE.Vector3()));
      const grip = (hd, out, fingers, palm) => {
        const roll = THREE.MathUtils.clamp(Math.atan2(Math.sin(hd.roll), Math.cos(hd.roll)), -ROLL_MAX, ROLL_MAX);
        // a slightly diagonal wrap (as people hold a handle): keep part of the forearm's run along the rod
        const f = fore.clone().addScaledVector(hd.axis, -0.6 * fore.dot(hd.axis));
        if (f.lengthSq() < 1e-6) f.set(-a.side, 0, 0).applyQuaternion(p.root.quaternion);
        f.normalize();
        h.f = h.f ? h.f.lerp(f, 0.25).normalize() : f.clone();
        fingers.copy(h.f);
        palm.crossVectors(fingers, hd.axis).normalize(); if (palm.y > 0) palm.negate();
        _q.setFromAxisAngle(hd.axis, roll);
        fingers.applyQuaternion(_q); palm.applyQuaternion(_q);
        out.copy(hd.pos).addScaledVector(palm, -PALM_ABOVE);
      };
      const pos = _a, fingers = _f, palm = new THREE.Vector3();
      grip(to, pos, fingers, palm);
      if (h.t < 1 && from !== to) {
        const pos0 = new THREE.Vector3(), f0 = new THREE.Vector3(), p0 = new THREE.Vector3();
        grip(from, pos0, f0, p0);
        pos.lerpVectors(pos0, pos, e); pos.y += LIFT * Math.sin(Math.PI * h.t);
        fingers.lerpVectors(f0, fingers, e).normalize(); palm.lerpVectors(p0, palm, e).normalize();
      }
      // elbows out and down, the way you brace on a table's handles
      const pole = new THREE.Vector3(a.side * 0.8, -1.0, -0.45).applyQuaternion(p.root.quaternion);
      p.reachHand(i, pos, { fingers, palm, pole, speed: 8 });
      p.fist[i] = h.t < 1 ? 0.25 + 0.6 * Math.max(0, h.t * 2 - 1) : 0.85;   // open in flight, closed on the grip
    }
    // where the body should be: centred between the two rods in hand, a comfortable reach behind their handles
    // (elbows bent, wrists straight). The caller moves the Patron there (FoosHands.follow).
    const h0 = handles[this.hand[0].rod], h1 = handles[this.hand[1].rod];
    if (h0 && h1) {
      const axis = h0.axis;
      this.bodyAt.copy(h0.pos).add(h1.pos).multiplyScalar(0.5).addScaledVector(axis, -BODY_BACK * p.height); this.bodyAt.y = 0;
      this.bodyYaw = Math.atan2(axis.x, axis.z);
      this.hasBody = true;
    }
  }

  /** Ease the Patron's root toward bodyAt (a quick side-step as the hands change rods). */
  follow(dt, k = 4) {
    if (!this.hasBody) return;
    const r = this.p.root.position;
    r.x = THREE.MathUtils.damp(r.x, this.bodyAt.x, k, dt); r.z = THREE.MathUtils.damp(r.z, this.bodyAt.z, k, dt);
  }
}

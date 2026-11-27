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
const ROLL_MAX = 1.25;       // rad the wrist turns with the rod before it lets the rod spin under the fingers

const _a = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class FoosHands {
  constructor(patron) {
    this.p = patron;
    this.pair = -1;                     // index of the right hand's rod in the sorted handles (left hand takes pair + 1)
    this.hand = [{ rod: -1, from: -1, t: 1 }, { rod: -1, from: -1, t: 1 }];
    this.hold = 0;                      // s before the pair may change again
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
      const grip = (hd, out, fingers, palm) => {
        // overhand: palm down on the handle, fingers across it toward the body's middle; the wrist rolls with the rod
        const roll = THREE.MathUtils.clamp(Math.atan2(Math.sin(hd.roll), Math.cos(hd.roll)), -ROLL_MAX, ROLL_MAX);
        _q.setFromAxisAngle(hd.axis, roll);
        palm.set(0, -1, 0).applyQuaternion(_q);
        // right hand's fingers toward the player's left, left hand's toward the right, square across the handle
        fingers.set(-a.side, 0, 0).applyQuaternion(p.root.quaternion);
        fingers.addScaledVector(hd.axis, -fingers.dot(hd.axis)); fingers.y = 0; fingers.normalize();
        fingers.applyQuaternion(_q);
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
      const pole = new THREE.Vector3(a.side * 1.0, -0.8, -0.3).applyQuaternion(p.root.quaternion);
      p.reachHand(i, pos, { fingers, palm, pole, speed: 8 });
      p.fist[i] = h.t < 1 ? 0.25 + 0.6 * Math.max(0, h.t * 2 - 1) : 0.85;   // open in flight, closed on the grip
    }
  }
}

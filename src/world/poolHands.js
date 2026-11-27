/**
 * Pool: the cue, and a player's hands on a shot. Used by the billiards mini-game (Shark) and the bar's own players.
 */
import * as THREE from 'three';

/** How a cue is carried in the hand (hold(cue, arm, pos, rot)): upright, tip up, the hand 0.9 m down from the tip. */
export const CUE_CARRY = { pos: [0, 0.9, 0.02], rot: [-Math.PI / 2 + 0.08, 0, 0] };

/** A cue, tip at the origin, the stick along -z. */
export function makeCue() {
  const g = new THREE.Group();
  // a real cue: 1.5 m tip to butt (shaft 1.06, butt 0.42)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.013, 1.06, 10), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.5 }));
  shaft.rotation.x = Math.PI / 2; shaft.position.z = -(0.53 + 0.03);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0x3a6bb0 }));
  tip.rotation.x = Math.PI / 2; tip.position.z = -0.02;
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.42, 10), new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6 }));
  butt.rotation.x = Math.PI / 2; butt.position.z = -(1.06 + 0.03 + 0.21);
  g.add(shaft, tip, butt);
  return g; // tip at the origin, stick extends along -z
}

/**
 * Hands on a shot (Patron v2): the left hand bridges on the felt behind the cue ball, palm down, the cue resting on
 * it; the right hand wraps the cue 1.1 m back from the tip, elbow up behind, and moves with it through the stroke.
 * bp: the cue ball's centre; dir: the shot's direction (flat, unit); feltY: the cloth's height. Call every frame
 * after placing the cue, before the Patron's update.
 */
export function shotHands(p, cue, bp, dir, feltY) {
  if (!p.reachHand) return;
  const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3(-dir.z, 0, dir.x);   // the shooter's right
  p.root.updateMatrixWorld(true);
  // bridge: 23 cm behind the cue ball, further back if the table is too wide to reach that far
  const sh = p.arms[1].pivot.getWorldPosition(new THREE.Vector3());
  const reach = 0.5 * p.height * (p.armScale || 1);
  let back = 0.23, bridge;
  for (let i = 0; i < 24; i++) {
    bridge = bp.clone().addScaledVector(dir, -back).addScaledVector(right, -0.035); bridge.y = feltY + 0.022;
    if (bridge.distanceTo(sh) < reach) break;
    back += 0.04;
  }
  const outward = dir.clone().addScaledVector(right, -0.45).normalize();          // fingers forward and a little out
  p.reachHand(1, bridge, { fingers: outward, palm: new THREE.Vector3(0, -1, 0), pole: right.clone().negate().add(new THREE.Vector3(0, 0.6, 0)), speed: 7 });
  p.fist[1] = 0.2;                                                                  // a loose open bridge
  // grip: on the cue, palm against its right side, fingers hanging round it, elbow up and back
  const cueBack = new THREE.Vector3(0, 0, -1).applyQuaternion(cue.getWorldQuaternion(new THREE.Quaternion()));   // tip -> butt
  // where on the cue: 1.1 m from the tip, choked up (for the whole shot) if that is out of the right arm's reach
  const shR = p.arms[0].pivot.getWorldPosition(new THREE.Vector3()), tipW = cue.getWorldPosition(new THREE.Vector3());
  if (!p.ik[0] || p.ik[0].w < 0.05) cue.userData.gripD = 1.1;
  let gd = cue.userData.gripD ?? 1.1;
  while (gd > 0.75 && tipW.clone().addScaledVector(cueBack, gd).distanceTo(shR) > reach * 0.97) gd -= 0.02;
  cue.userData.gripD = gd;
  const grip = tipW.addScaledVector(cueBack, gd).addScaledVector(right, 0.035);
  const fingersDown = up.clone().negate().addScaledVector(dir, 0.25).normalize();
  p.reachHand(0, grip, { fingers: fingersDown, palm: right.clone().negate(), pole: up.clone().addScaledVector(dir, -0.6).addScaledVector(right, 0.3), speed: 9 });
  p.fist[0] = 0.75;
}

/** Lay a cue on a shot line: tip `back` m behind the ball's centre, the butt raised a touch. parent: the cue's parent. */
export function cueOnLine(cue, bp, dir, back, tipY) {
  const tip = bp.clone().addScaledVector(dir, -back); tip.y = tipY + 0.005;
  cue.parent.worldToLocal(tip);
  cue.position.copy(tip);
  const aim = bp.clone().setY(tipY + 0.002);
  cue.lookAt(aim);              // lookAt takes a world point
  cue.rotateX(0.05);
}

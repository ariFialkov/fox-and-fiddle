/**
 * Patron v2: the bar's characters on a standard humanoid skeleton.
 *
 * Same public API as Patron.js v1 (constructor options, poses, one-shots, hold(), mood, ko, walk,
 * slump, reachR/liftR/tiltR, headTarget), so prototypes switch by changing the import. Without a
 * character GLB it builds the same capsule figure as v1, now with knees, a three-part spine,
 * collarbones, wrists and a jaw.
 *
 * Skeleton (Mixamo naming, see RIG_SPEC.md). Every bone's rest orientation is the identity, so angles
 * mean the same as in v1 (x = pitch, y = yaw, z = roll; arms and legs swing forward on negative x).
 *   Hips > Spine > Spine1 > Spine2 > Neck > Head > Jaw
 *                         Spine2 > {Left,Right}Shoulder > Arm > ForeArm > Hand > HandSocket
 *   Hips > {Left,Right}UpLeg > Leg > Foot
 * Anatomical naming: the character faces +Z, so its left side is +X. Compatibility handles keep v1's
 * indices: arms[0] / hips[0] are the x < 0 side (RightArm / RightUpLeg), arms[1] / hips[1] the x > 0
 * side (LeftArm / LeftUpLeg). v1's props go to arms[1].hand, as before.
 */
import * as THREE from 'three';

const SHIRTS = [0x8a2b2b, 0x2c4a7a, 0x3d6b3a, 0x6b4a2a, 0x4a4a4a, 0x7a3a6b, 0x9a6a2a, 0x2a6b6b];
const SKINS = [0xf1c9a5, 0xd9a278, 0xb07a4e, 0x8a5a3a, 0xe8b790];
let seq = 0;
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const damp = (a, b, k, dt) => THREE.MathUtils.damp(a, b, k, dt);

/** Rest layout at height 1.0, parent-local offsets in metres. A character GLB may override any of them. */
export function restLayout(female = false) {
  const shX = female ? 0.22 : 0.27;
  return {
    Hips: [0, 0.80, 0],
    Spine: [0, -0.02, 0], Spine1: [0, 0.17, 0], Spine2: [0, 0.17, 0],
    Neck: [0, 0.44, 0], Head: [0, 0.07, 0], Jaw: [0, -0.03, 0.03],
    RightShoulder: [-0.05, 0.13, 0], RightArm: [-(shX - 0.05), 0.05, 0], RightForeArm: [0, -0.30, 0], RightHand: [0, -0.24, 0], RightHandSocket: [0, -0.06, 0],
    LeftShoulder: [0.05, 0.13, 0], LeftArm: [shX - 0.05, 0.05, 0], LeftForeArm: [0, -0.30, 0], LeftHand: [0, -0.24, 0], LeftHandSocket: [0, -0.06, 0],
    RightUpLeg: [-0.11, 0, 0], RightLeg: [0, -0.40, 0], RightFoot: [0, -0.33, 0],
    LeftUpLeg: [0.11, 0, 0], LeftLeg: [0, -0.40, 0], LeftFoot: [0, -0.33, 0],
    RightKneeHelper: [0, -0.40, 0], LeftKneeHelper: [0, -0.40, 0],
    RightForeArmTwist: [0, -0.12, 0], LeftForeArmTwist: [0, -0.12, 0],
    RightHandFingers1: [0, -0.095, 0], RightHandFingers2: [0, -0.035, 0], LeftHandFingers1: [0, -0.095, 0], LeftHandFingers2: [0, -0.035, 0],
  };
}
export const PARENTS = {
  Hips: null, Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck', Jaw: 'Head',
  RightShoulder: 'Spine2', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm', RightHandSocket: 'RightHand',
  LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm', LeftHandSocket: 'LeftHand',
  RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg', LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg',
  RightKneeHelper: 'RightUpLeg', LeftKneeHelper: 'LeftUpLeg',   // turn half as far as the knee (skinning only)
  RightForeArmTwist: 'RightForeArm', LeftForeArmTwist: 'LeftForeArm', // turn half as far as the wrist's twist (skinning only)
  RightHandFingers1: 'RightHand', RightHandFingers2: 'RightHandFingers1', LeftHandFingers1: 'LeftHand', LeftHandFingers2: 'LeftHandFingers1',
};

const _m4 = new THREE.Matrix4(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _yAxis = new THREE.Vector3(0, 1, 0), _xAxis = new THREE.Vector3(1, 0, 0), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3();

/**
 * Animation clips: Meshy library motions retargeted to this skeleton (scripts/retarget.py), shared by every Patron.
 * loadPatronClips(json) decodes patron-clips.json; reskin.js calls it when the file is present.
 */
export function loadPatronClips(json) {
  const dec = (b64) => { const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Int16Array(u8.buffer); };
  const lib = { bones: json.bones, clips: {} };
  for (const [name, c] of Object.entries(json.clips)) {
    const q = dec(c.q), h = dec(c.hips), qf = new Float32Array(q.length), hf = new Float32Array(h.length);
    for (let i = 0; i < q.length; i++) qf[i] = q[i] / json.quatScale;
    for (let i = 0; i < h.length; i++) hf[i] = h[i] / json.hipsScale;
    lib.clips[name] = { name, fps: c.fps, frames: c.frames, duration: (c.frames - 1) / c.fps, q: qf, hips: hf };
    levelClip(lib.clips[name], json.bones);
  }
  Patron.clips = lib;
  return lib;
}

/**
 * Posture fix for the library clips. Retargeted to this skeleton, the standing clips keep both thighs swung back
 * (5-10 degrees net of the pelvis tilt), the talking clips bend the chest forward 10-18 degrees, and the head
 * tips down 10-20 degrees, so everyone stands with their feet behind their hips, stooped, staring at the floor.
 * Per clip, this removes the average backward slope of the legs (the feet keep their angle to the floor), the
 * chest's average forward bend beyond 3 degrees (8 seated) and the head's average downward tilt beyond 5. The
 * motion around those averages is untouched. Seated clips keep their legs (the chair has them).
 */
const LEVEL_HEAD_KEEP = 5 * Math.PI / 180;
const LEVEL_TRUNK_KEEP = 3 * Math.PI / 180, LEVEL_TRUNK_KEEP_SEATED = 8 * Math.PI / 180;
function levelClip(clip, names) {
  const nb = names.length, Q = clip.q, at = (n) => names.indexOf(n);
  const L = restLayout(false), v3 = (a) => new THREE.Vector3().fromArray(a);
  const get = (f, b, out) => out.set(Q[(f * nb + b) * 4], Q[(f * nb + b) * 4 + 1], Q[(f * nb + b) * 4 + 2], Q[(f * nb + b) * 4 + 3]).normalize();
  const put = (f, b, q) => { const i = (f * nb + b) * 4; Q[i] = q.x; Q[i + 1] = q.y; Q[i + 2] = q.z; Q[i + 3] = q.w; };
  const H = new THREE.Quaternion(), U = new THREE.Quaternion(), K = new THREE.Quaternion(), F = new THREE.Quaternion(), N = new THREE.Quaternion(), Hd = new THREE.Quaternion();
  const R = new THREE.Quaternion(), t = new THREE.Quaternion(), a = new THREE.Vector3(), j = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
  const hips = at('Hips'), legs = ['Left', 'Right'].map((s) => ({ up: at(s + 'UpLeg'), knee: at(s + 'Leg'), foot: at(s + 'Foot'), off: v3(L[s + 'UpLeg']) }));
  const shin = v3(L.LeftFoot), thigh = v3(L.LeftLeg);
  // legs: mean slope of hip-to-ankle, from straight down (positive = feet behind)
  if (!clip.name.startsWith('sit') && hips >= 0 && legs.every((l) => l.up >= 0 && l.knee >= 0 && l.foot >= 0)) {
    let sum = 0, n = 0;
    for (let f = 0; f < clip.frames; f++) {
      get(f, hips, H);
      for (const l of legs) {
        get(f, l.up, U); get(f, l.knee, K);
        a.copy(shin).applyQuaternion(K).add(thigh).applyQuaternion(U).applyQuaternion(H);   // hip joint -> ankle, body frame
        sum += Math.atan2(-a.z, -a.y); n++;
      }
    }
    const slope = n ? sum / n : 0;
    if (Math.abs(slope) > 0.017) {
      R.setFromAxisAngle(X, -slope);
      for (let f = 0; f < clip.frames; f++) {
        get(f, hips, H);
        for (const l of legs) {
          get(f, l.up, U); get(f, l.knee, K); get(f, l.foot, F);
          // thigh' = H^-1 R H thigh: swing the whole leg about the hip joint in the body frame
          const U2 = t.copy(H).invert().multiply(R).multiply(H).multiply(U).clone();
          // foot' = (U2 K)^-1 (U K) F: the foot keeps its angle to the floor
          const F2 = U2.clone().multiply(K).invert().multiply(U.clone().multiply(K)).multiply(F);
          put(f, l.up, U2); put(f, l.foot, F2.normalize());
        }
      }
    }
  }
  // trunk: mean forward bend of the chest (Hips x Spine x Spine1 x Spine2) beyond a natural few degrees; the whole
  // upper body turns back about the lower spine (in the body frame), so the arms keep their place on the chest
  const sp = ['Spine', 'Spine1', 'Spine2'].map(at), S = new THREE.Quaternion();
  if (hips >= 0 && sp.every((b) => b >= 0)) {
    let sum = 0;
    for (let f = 0; f < clip.frames; f++) {
      get(f, hips, H);
      for (const b of sp) H.multiply(get(f, b, S));
      j.set(0, 1, 0).applyQuaternion(H);
      sum += Math.atan2(j.z, j.y);
    }
    const lean = sum / clip.frames - (clip.name.startsWith('sit') ? LEVEL_TRUNK_KEEP_SEATED : LEVEL_TRUNK_KEEP);
    if (lean > 0.017) {
      R.setFromAxisAngle(X, -lean);
      for (let f = 0; f < clip.frames; f++) {
        get(f, hips, H); get(f, sp[0], S);
        put(f, sp[0], t.copy(H).invert().multiply(R).multiply(H).multiply(S).normalize());
      }
    }
  }
  // head: mean downward tilt of the face relative to the chest (Neck x Head), beyond a natural few degrees
  const nk = at('Neck'), hd = at('Head');
  if (nk >= 0 && hd >= 0) {
    let sum = 0;
    for (let f = 0; f < clip.frames; f++) {
      get(f, nk, N); get(f, hd, Hd);
      j.set(0, 0, 1).applyQuaternion(Hd).applyQuaternion(N);
      sum += Math.atan2(-j.y, j.z);
    }
    const down = sum / clip.frames - LEVEL_HEAD_KEEP;
    if (down > 0.017) {
      R.setFromAxisAngle(X, -down);
      for (let f = 0; f < clip.frames; f++) {
        get(f, nk, N); get(f, hd, Hd);
        put(f, hd, t.copy(N).invert().multiply(R).multiply(N).multiply(Hd).normalize());
      }
    }
  }
}

// ambient clip sets by pose: picked at random, one after another, cross-faded
const AMBIENT = {
  idle: [['idle1', 2], ['idle3', 3], ['idle4', 3], ['idle7', 2], ['scratch', 0.5, 'free'], ['handRub', 0.4, 'free']],
  talk: [['chat', 3], ['talkHandsOpen', 2], ['talkPassionate', 1], ['talkHandOnHip', 1.5], ['agree', 1], ['shrug', 1], ['listen', 2]],
  juke: [['sway', 2], ['joyDance', 1.2]],
  // seated: the chair keeps hips and legs (LOWER_BODY mask); '' = sit still for a few seconds
  sit: [['', 4], ['sitArmsCrossed', 1.5], ['sitTalk', 1.5], ['sitThumbsUp', 0.4], ['sitFingerWag', 0.4], ['sitLeanBack', 0.5, 'free']],
};
// one-shot reactions (p.react(kind)); seated ones use the LOWER_BODY mask
const REACT = {
  win: [['victory', 1], ['victoryCheer', 1], ['fistPump', 1], ['cheerBothHands', 0.6], ['cheerOneHand', 0.6]],
  lose: [['headache', 1], ['angryStomp', 1], ['shrug', 0.6]],
  no: [['fingerWag', 1]],
  sitWin: [['sitFistPump', 1], ['sitClap', 1, 'free'], ['sitThumbsUp', 0.6]],
  sitLose: [['sitFingerWag', 1], ['sitLeanBack', 0.6]],
};
// sips: the part of each drinking clip where the glass is at the mouth (s), and how fast to play it
const SIP = { sit: ['sitDrinkM', 2.9, 8.2, 1.35], stand: ['standDrink', 1.9, 6.1, 1.2] };
/** Share of a clip's collarbone turn the clavicle keeps (the rest moves to the upper arm): see applyClips. */
const CLAV_KEEP = 0.35;
const SOFT_ACTS = new Set(['gesture', 'nod', 'laugh', 'cheer']);
/** Mask for seated clips: the chair keeps the hips and legs (seat height, feet on the floor or rail). */
export const LOWER_BODY = new Set(['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']);
/** Mask for the standing sip: the clip bows the head toward the glass; ours keeps looking where it was. */
const HEAD = new Set(['Neck', 'Head']);
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qid = new THREE.Quaternion();

export class Patron {
  /** Retargeted animation clips (see loadPatronClips), or null. */
  static clips = null;
  /** World-space foot rests ({a: [x, y, z], b: [x, y, z]}, the top of a rail) that seated Patrons put their feet on. */
  static footRests = [];

  constructor({ name = 'Patron', female = false, shirt, skin, hair, height = 1.0, seed = seq++ } = {}) {
    this.name = name;
    this.female = female;
    this.version = 2;
    const rnd = mulberry(seed * 7919 + 13);
    shirt = shirt ?? SHIRTS[Math.floor(rnd() * SHIRTS.length)];
    skin = skin ?? SKINS[Math.floor(rnd() * SKINS.length)];
    hair = hair ?? [0x1a120c, 0x3a2414, 0x6b4a2a, 0xc9a23a, 0x8a1a1a][Math.floor(rnd() * 5)];
    this.height = height;

    this.root = new THREE.Group();   // position + yaw only
    const g = new THREE.Group();     // body: tilts when knocked out, carries the height scale
    this.root.add(g);
    this.body = g;

    // ---- skeleton ----
    const L = restLayout(female);
    this.bones = {};
    for (const n of Object.keys(PARENTS)) { const b = new THREE.Group(); b.name = n; b.position.fromArray(L[n]); this.bones[n] = b; }
    for (const [n, p] of Object.entries(PARENTS)) (p ? this.bones[p] : g).add(this.bones[n]);
    const B = this.bones;
    this.restHipsY = L.Hips[1];

    // ---- primitive look (used until a character GLB dresses it) ----
    const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.75 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.95 });
    const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.8 });
    const prim = (geo, mat, bone, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.userData.primitive = true; B[bone].add(m); return m; };
    for (const s of ['Left', 'Right']) {
      prim(new THREE.CapsuleGeometry(0.085, 0.24, 4, 8), pantsMat, s + 'UpLeg', 0, -0.2);
      prim(new THREE.CapsuleGeometry(0.075, 0.22, 4, 8), pantsMat, s + 'Leg', 0, -0.17);
      prim(new THREE.BoxGeometry(0.1, 0.07, 0.22), bootMat, s + 'Foot', 0, -0.035, 0.04);
      prim(new THREE.CapsuleGeometry(0.055, 0.2, 4, 8), shirtMat, s + 'Arm', 0, -0.15);
      prim(new THREE.CapsuleGeometry(0.05, 0.18, 4, 8), skinMat, s + 'ForeArm', 0, -0.12, 0.01);
      prim(new THREE.SphereGeometry(0.06, 8, 8), skinMat, s + 'HandSocket');
    }
    const bw = female ? 0.16 : 0.2;
    const pelvis = prim(new THREE.CapsuleGeometry(bw * 0.95, 0.06, 4, 10), pantsMat, 'Hips', 0, 0.02); pelvis.scale.set(1.15, 1, 0.8);
    const belly = prim(new THREE.CapsuleGeometry(bw, 0.12, 4, 10), shirtMat, 'Spine1', 0, 0.0); belly.scale.set(1.15, 1, 0.8);
    const chest = prim(new THREE.CapsuleGeometry(bw, 0.16, 4, 10), shirtMat, 'Spine2', 0, 0.16); chest.scale.set(1.15, 1, 0.8);
    this.head = prim(new THREE.SphereGeometry(0.13, 14, 12), skinMat, 'Head', 0, 0.03); this.head.scale.set(0.95, 1.1, 0.95);
    const hairMesh = prim(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, female ? 1.6 : 1.3), hairMat, 'Head', 0, female ? 0.05 : 0.06);
    if (female) hairMesh.scale.set(1.05, 1.25, 1.05);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
    for (const s of [-1, 1]) prim(new THREE.SphereGeometry(0.016, 6, 6), eyeMat, 'Head', s * 0.045, 0.05, 0.115);
    this.mouth = prim(new THREE.BoxGeometry(0.05, 0.01, 0.01), eyeMat, 'Jaw', 0, 0.01, 0.09);
    if (!female && rnd() > 0.5) { const beard = prim(new THREE.SphereGeometry(0.1, 10, 8, 0, Math.PI * 2, 1.3, 1.2), hairMat, 'Head', 0, 0.02, 0.03); beard.userData.beard = true; }
    g.scale.setScalar(height);

    // ---- v1 compatibility handles ----
    this.torso = B.Spine;
    this.neck = B.Neck;
    this.hips = [B.RightUpLeg, B.LeftUpLeg];
    this.arms = [
      { pivot: B.RightArm, fore: B.RightForeArm, wrist: B.RightHand, hand: B.RightHandSocket, clav: B.RightShoulder, twist: B.RightForeArmTwist, f1: B.RightHandFingers1, f2: B.RightHandFingers2, side: -1 },
      { pivot: B.LeftArm, fore: B.LeftForeArm, wrist: B.LeftHand, hand: B.LeftHandSocket, clav: B.LeftShoulder, twist: B.LeftForeArmTwist, f1: B.LeftHandFingers1, f2: B.LeftHandFingers2, side: 1 },
    ];

    this.t = rnd() * 10;
    this.pose = 'idle';
    this.mood = 0.5;
    this.ko = 0;
    this.slump = 0;
    this.walk = 0;
    this.walkPhase = 0;
    this.sway = 0.6 + rnd() * 0.6;
    this.shiftPhase = rnd() * 6.28;
    this.hp = 100;
    this.prop = null;
    this.headTarget = null;
    this.busy = false;
    this.reachR = 0;
    this.liftR = 0;
    this.tiltR = 0;
    this.reachPose = { rx: -1.35, rf: -0.25, rz: -0.05, lean: 0.12 };
    this.liftPose = { rx: -1.2, rf: -1.65, rz: -1.4 };
    this.seatH = 0;
    this.acts = {};
    this.cur = {};
    this.rnd = rnd;
    this.jawScale = 1;              // per character (GLB Jaw extras): beards need a wider opening to read
    this.mouthRest = this.mouth.position.clone();
    this.lids = [];                 // eyelid meshes (dressPatron2 adds them); closed = scale.y 1
    this.grip = [0, 0];             // set to 1 to close a hand round something the game places in it itself (arms[i] order)
    this.layers = [];               // playing clips: {clip, t, w, target, fade, loop, slot, mask}
    this.autoClips = true;          // ambient clips for idle / talk / juke when a clip library is loaded
    this.ambient = null;
    this.sip = null;                // the drinking clip layer while a sip plays
    this.lastSip = -99;
    this.propArm = 1;
    for (const a of this.arms) { a.hand.rotation.order = 'YXZ'; a.socketRest = a.hand.position.clone(); }
    this.blinkIn = 1 + rnd() * 3;
    this.blinkT = -1;
  }

  get position() { return this.root.position; }
  lookAt(v) { const p = v.clone(); p.y = this.root.position.y; this.root.lookAt(p); }
  faceYaw() { return this.root.rotation.y; }
  sit(seatH = 0.72) { this.pose = 'sit'; this.seatH = seatH; }
  stand() { if (this.pose === 'sit') this.pose = 'idle'; }
  punch() { this.stopClips('act', 0.12); this.acts.punch = 0; this.punchArm = this.punchArm === 1 ? 0 : 1; }
  drink() {
    // with clips: a real sip from the drinking clip (glass guided to the mouth), at most every 10 s; else v1's quick one
    if (Patron.clips && this.autoClips && this.prop && this.propUpright) {
      if ((this.sip && this.layers.includes(this.sip)) || this.t - this.lastSip < 10) return;
      const [name, a, b, sp] = SIP[this.pose === 'sit' ? 'sit' : 'stand'];
      this.sip = this.playClip(name, { slot: 'act', fade: 0.5, start: a, end: b, speed: sp, mask: this.pose === 'sit' ? LOWER_BODY : HEAD });
      if (this.sip) { this.lastSip = this.t; return; }
    }
    this.stopClips('act', 0.12);
    this.acts.drink = 0;
  }
  stagger() { this.stopClips('act', 0.12); this.acts.stagger = 0; }
  hit(side = 1) { this.stopClips('act', 0.12); this.acts.hit = 0; this.hitSide = side; }
  kick() { this.stopClips('act', 0.12); this.acts.kick = 0; }
  reach() { this.stopClips('act', 0.12); this.acts.reach = 0; }
  laugh() { this.acts.laugh = 0; }
  gesture() { this.acts.gesture = 0; this.gestureArm = this.rnd() < 0.5 ? 0 : 1; }
  nod() { this.acts.nod = 0; }
  throwDart() { this.stopClips('act', 0.12); this.acts.throw = 0; }
  strike() { this.stopClips('act', 0.12); this.acts.strike = 0; }
  jerk() { this.stopClips('act', 0.12); this.acts.jerk = 0; }
  cheer() { this.acts.cheer = 0; this.react('win'); }
  /** A reaction clip: 'win', 'lose' or 'no' (seated Patrons use the seated versions). Returns false without clips. */
  react(kind) {
    const lib = Patron.clips;
    if (!lib || !this.autoClips || this.ko > 0.05) return false;
    const sit = this.pose === 'sit', set = REACT[sit ? 'sit' + kind[0].toUpperCase() + kind.slice(1) : kind] || REACT[kind];
    const name = this.pick(set, null);
    if (!name) return false;
    this.playClip(name, { slot: 'act', fade: 0.25, mask: sit ? LOWER_BODY : null });
    return true;
  }
  /** Weighted random pick from [[name, weight, 'free'?], ...], skipping `not`, missing clips, and hands-free clips while holding something. */
  pick(set, not) {
    const lib = Patron.clips, busyHands = !!this.prop || this.grip[0] > 0.5 || this.grip[1] > 0.5;
    const ok = set.filter(([n, , f]) => n !== not && (n === '' || lib.clips[n]) && !(f === 'free' && busyHands));
    let tot = 0; for (const e of ok) tot += e[1];
    let r = this.rnd() * tot;
    for (const e of ok) { r -= e[1]; if (r <= 0) return e[0]; }
    return ok.length ? ok[ok.length - 1][0] : null;
  }
  /** A glass in the right hand: v2 keeps it upright (tipping it to the mouth when drinking), whatever the hand does. */
  holdGlass(mesh) { this.hold(mesh, 1, [0, -0.03, 0.04]); this.propUpright = !!mesh; }
  hold(mesh, armIdx = 1, pos = [0, -0.03, 0.04], rot = [0, 0, 0]) {
    if (this.prop) this.prop.parent?.remove(this.prop);
    this.prop = mesh;
    this.propArm = armIdx;
    this.propUpright = false;
    if (mesh) { mesh.position.set(...pos); mesh.rotation.set(...rot); this.arms[armIdx].hand.add(mesh); }
  }
  act(name, dt, speed) {
    if (this.acts[name] == null) return -1;
    this.acts[name] += dt * speed;
    if (this.acts[name] >= 1) { delete this.acts[name]; return 1; }
    return this.acts[name];
  }

  /** Leg proportions from the rest skeleton (body units): thigh / shin lengths and rest angles from straight down. */
  legGeom() {
    if (this._lg) return this._lg;
    const B = this.bones, l = B.LeftLeg.position, f = B.LeftFoot.position;
    const T = Math.hypot(l.y, l.z), S = Math.hypot(f.y, f.z);
    this._lg = { T, S, a0: Math.atan2(l.z, -l.y), b0: Math.atan2(f.z, -f.y), ankleY: this.restHipsY + B.LeftUpLeg.position.y + l.y + f.y };
    return this._lg;
  }
  /** Ankle height (body units) for hip pitch h and knee bend k, the hip joint at height hy. */
  ankleY(lg, hy, h, k) { return hy - lg.T * Math.cos(lg.a0 - h) - lg.S * Math.cos(lg.b0 - h - k); }
  /** Two-bone IK in the leg's plane: hip pitch and knee bend that put the ankle at (y, z) (body units), or null. */
  legIK(lg, hy, y, z) {
    const dy = y - hy, dz = z, d = Math.hypot(dy, dz);
    if (d > lg.T + lg.S - 0.005 || d < Math.abs(lg.T - lg.S) + 0.01) return null;
    const psi = Math.atan2(dz, -dy);
    const alpha = Math.acos(clamp((lg.T * lg.T + d * d - lg.S * lg.S) / (2 * lg.T * d), -1, 1));
    const phiT = psi + alpha;                                   // knee forward of the hip-ankle line
    const ky = hy - lg.T * Math.cos(phiT), kzz = lg.T * Math.sin(phiT);
    const phiS = Math.atan2(z - kzz, -(y - ky));
    const h = lg.a0 - phiT;
    return { h, k: lg.b0 - phiS - h };
  }
  /** The nearest foot rest in reach, in body units relative to this Patron (z forward), or null. */
  footRestLocal() {
    const rests = Patron.footRests;
    if (!rests.length) return null;
    const inv = _m4.copy(this.root.matrixWorld).invert();
    let best = null;
    for (const r of rests) {
      const a = _v1.fromArray(r.a).applyMatrix4(inv), b = _v2.fromArray(r.b).applyMatrix4(inv);
      if (Math.abs(b.x - a.x) < 1e-3) continue;
      const u = clamp(-a.x / (b.x - a.x), 0, 1);
      const x = lerp(a.x, b.x, u), y = lerp(a.y, b.y, u), z = lerp(a.z, b.z, u);
      if (Math.abs(x) > 0.15 || z < 0.12 || z > 0.7) continue;
      if (!best || z < best.z) best = { y: (y - this.body.position.y) / this.height, z: z / this.height };
    }
    return best;
  }

  /** Play a library clip over the procedural pose. opts: loop, fade (s), speed, slot ('act' replaces 'act'), mask (Set of bone names to leave out), weight, start / end (s, a part of the clip). */
  playClip(name, opts = {}) {
    const lib = Patron.clips, clip = lib && lib.clips[name];
    if (!clip) return null;
    const slot = opts.slot || 'act', fade = opts.fade ?? 0.3;
    for (const l of this.layers) if (l.slot === slot) { l.target = 0; l.fade = fade; }
    const layer = { clip, t: opts.start || 0, end: Math.min(opts.end ?? clip.duration, clip.duration), w: 0, target: opts.weight ?? 1, fade, loop: !!opts.loop, slot, speed: opts.speed || 1, mask: opts.mask || null };
    this.layers.push(layer);
    return layer;
  }
  /** Fade out every clip (or those in one slot). */
  stopClips(slot = null, fade = 0.3) { for (const l of this.layers) if (!slot || l.slot === slot) { l.target = 0; l.fade = fade; } }

  /** Ambient clips: pick idle / talk / dance motions for the current pose; fade them out for anything else. */
  ambientClips(dt) {
    const lib = Patron.clips;
    // procedural one-shots (drink, punch, nod...) keep the body: the ambient clip steps aside until they finish
    // (gesture, nod, laugh and cheer are what the clips do anyway, so they don't count)
    let busy = false; for (const k in this.acts) { if (!SOFT_ACTS.has(k)) { busy = true; break; } }
    const scripted = this.reachR > 0.05 || this.liftR > 0.05 || this.tiltR > 0.05;
    const set = lib && this.autoClips && !busy && !scripted && this.walk < 0.05 && this.ko < 0.05 && this.slump < 0.5 && AMBIENT[this.pose];
    const cur = this.ambient;
    if (!set) { if (cur) { this.stopClips('ambient', 0.35); this.ambient = null; } return; }
    const playing = cur && cur.pose === this.pose && (cur.layer ? this.layers.includes(cur.layer) && cur.layer.target > 0 && cur.layer.t < cur.layer.end - 0.45 : this.t < cur.until);
    if (playing) return;
    // next clip: weighted pick, not the same one twice running; '' sits still for a while
    const first = !cur || cur.pose !== this.pose;
    const name = this.pick(set, cur?.name);
    if (name == null) return;
    if (name === '') { if (cur?.layer) this.stopClips('ambient', 0.6); this.ambient = { pose: this.pose, name, layer: null, until: this.t + 3 + this.rnd() * 4 }; return; }
    const layer = this.playClip(name, { slot: 'ambient', fade: first ? 0.35 : 0.45, start: first ? this.rnd() * 1.5 : 0, mask: this.pose === 'sit' ? LOWER_BODY : null });
    this.ambient = layer ? { pose: this.pose, name, layer } : null;
  }

  /** Blend the playing clips over the bones the procedural code has just set. */
  applyClips(dt) {
    const lib = Patron.clips;
    if (!lib || !this.layers.length) return;
    const B = this.bones, names = lib.bones, nb = names.length;
    let any = false;
    // ambient underneath, one-shots ('act') on top, whatever order they started in
    if (this.layers.length > 1) this.layers.sort((a, b) => (a.slot === 'ambient' ? 0 : 1) - (b.slot === 'ambient' ? 0 : 1));
    for (const l of this.layers) {
      l.w = l.target > l.w ? Math.min(l.target, l.w + dt / Math.max(l.fade, 1e-3)) : Math.max(l.target, l.w - dt / Math.max(l.fade, 1e-3));
      l.t += dt * l.speed;
      if (!l.loop && l.slot === 'act' && l.t >= l.end - l.fade * l.speed) l.target = 0;   // fade out as the part ends
      if (l.t >= l.end) { if (l.loop) l.t %= l.end; else l.t = l.end; }
      if (l.w <= 0.001) continue;
      any = true;
      const c = l.clip, fpos = Math.min(l.t * c.fps, c.frames - 1), f0 = Math.floor(fpos), f1 = Math.min(f0 + 1, c.frames - 1), k = fpos - f0;
      // hips masked (seated): the chair keeps the pelvis, and the clip's pelvis tilt moves up into the spine so the
      // upper body keeps the clip's world angle (spine = chair hips^-1 * clip hips * clip spine)
      const carry = l.mask && l.mask.has('Hips');
      if (carry) {
        const hb = names.indexOf('Hips'), i0 = (f0 * nb + hb) * 4, i1 = (f1 * nb + hb) * 4;
        _qh.set(c.q[i0], c.q[i0 + 1], c.q[i0 + 2], c.q[i0 + 3]).slerp(_qa.set(c.q[i1], c.q[i1 + 1], c.q[i1 + 2], c.q[i1 + 3]), k);
        _qh.premultiply(_qb.copy(B.Hips.quaternion).invert());
      }
      // the head stays with the procedural look-at when there is something to look at; a gripping hand keeps its grip
      for (let b = 0; b < nb; b++) {
        const n = names[b];
        if (l.mask && l.mask.has(n)) continue;
        if ((n === 'Head' || n === 'Neck') && this.headTarget && l.slot === 'ambient') continue;
        if (l !== this.sip && ((n === 'RightHand' && (this.cur.grip0 || 0) > 0.5) || (n === 'LeftHand' && (this.cur.grip1 || 0) > 0.5))) continue;
        const i0 = (f0 * nb + b) * 4, i1 = (f1 * nb + b) * 4;
        _q.set(c.q[i0], c.q[i0 + 1], c.q[i0 + 2], c.q[i0 + 3]);
        _qa.set(c.q[i1], c.q[i1 + 1], c.q[i1 + 2], c.q[i1 + 3]);
        _q.slerp(_qa, k);
        if (carry && n === 'Spine') _q.premultiply(_qh);
        B[n].quaternion.slerp(_q, l.w);
      }
      if (l.mask && l.mask.has('Hips')) continue;
      const h0 = f0 * 3, h1 = f1 * 3;
      B.Hips.position.x += l.w * (c.hips[h0] + (c.hips[h1] - c.hips[h0]) * k);
      B.Hips.position.y += l.w * (c.hips[h0 + 1] + (c.hips[h1 + 1] - c.hips[h0 + 1]) * k);
      B.Hips.position.z += l.w * (c.hips[h0 + 2] + (c.hips[h1 + 2] - c.hips[h0 + 2]) * k);
    }
    this.layers = this.layers.filter((l) => l.w > 0.001 || l.target > 0);
    if (!any) return;
    // helpers follow the clip: knees half way, forearm twist half the wrist's twist
    B.RightKneeHelper.quaternion.copy(_qid).slerp(B.RightLeg.quaternion, 0.5);
    B.LeftKneeHelper.quaternion.copy(_qid).slerp(B.LeftLeg.quaternion, 0.5);
    for (const a of this.arms) {
      const q = a.wrist.quaternion; _q.set(0, q.y, 0, q.w).normalize();
      a.twist.quaternion.copy(_qid).slerp(_q, 0.5);
    }
    // Collarbones: the library clips turn the clavicle 20-40 degrees in everyday motions (70+ in a cheer). Our clavicle
    // runs from the spine to the shoulder joint (about 0.23 m), far longer than the clip rig's, so those angles throw
    // the shoulder joint up and in by 10-28 cm and the arms seem to grow out of the neck. Keep a third of the clavicle
    // turn and give the rest to the upper arm, so each arm still points where the clip puts it.
    let cw = 0; for (const l of this.layers) if (!(l.mask && l.mask.has('LeftShoulder'))) cw += l.w;
    const keep = 1 - (1 - CLAV_KEEP) * Math.min(1, cw);
    if (keep < 0.999) {
      for (const a of this.arms) {
        _q1.copy(a.clav.quaternion);                       // full clavicle turn
        a.clav.quaternion.copy(_qid).slerp(_q1, keep);      // reduced
        _q2.copy(a.clav.quaternion).invert().multiply(_q1); // the part taken out ...
        a.pivot.quaternion.premultiply(_q2);                // ... goes to the upper arm (same world direction)
      }
    }
  }

  /** While a sip plays: guide the glass hand to this character's mouth (the clip was made on someone else) and
   *  return how far to tip the glass (rad). Two CCD passes over forearm and upper arm, weighted by how near the
   *  clip already brings the hand. */
  sipFix() {
    const l = this.sip;
    if (!l || !this.layers.includes(l) || l.w < 0.01 || !this.prop) { this.sip = l && this.layers.includes(l) ? l : null; return 0; }
    const a = this.arms[this.propArm];
    this.root.updateMatrixWorld(true);
    const hand = a.hand.getWorldPosition(_v1), mouth = this.mouth.getWorldPosition(_v2);
    const near = clamp((0.42 - hand.distanceTo(mouth)) / 0.22, 0, 1), w = l.w * near * near * (3 - 2 * near);
    if (w < 0.01) return 0;
    // target: the hand a little below and in front of the lips, so the rim of an upright-ish glass meets them
    this.root.getWorldQuaternion(_q1);
    const tgt = _v3.set(0, -0.085, 0.075).applyQuaternion(_q1).add(mouth);
    // two-bone IK with the elbow kept low and out to the side (a pint sip, not a bottoms-up)
    const side = this.propArm ? 1 : -1;
    a.pivot.updateMatrixWorld(true);
    const S = a.pivot.getWorldPosition(_v4).clone(), E0 = a.fore.getWorldPosition(_v5).clone(), H0 = a.hand.getWorldPosition(_v6).clone();
    const la = E0.distanceTo(S), lb = H0.distanceTo(E0), toT = tgt.clone().sub(S);
    const d = clamp(toT.length(), Math.abs(la - lb) + 1e-3, la + lb - 1e-3), dir = toT.normalize();
    const pole = new THREE.Vector3(side * 0.7, -1, 0.15).applyQuaternion(_q1);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const cosA = clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1);
    const E = S.clone().addScaledVector(dir, la * cosA).addScaledVector(pole, la * Math.sqrt(1 - cosA * cosA));
    const swing = (bone, from, to) => {
      _q2.setFromUnitVectors(from.normalize(), to.normalize()); _q2.slerp(_qid, 1 - w);
      bone.getWorldQuaternion(_qb); _qb.premultiply(_q2);
      bone.parent.getWorldQuaternion(_qa); bone.quaternion.copy(_qa.invert().multiply(_qb));
      bone.updateMatrixWorld(true);
    };
    swing(a.pivot, E0.clone().sub(S), E.clone().sub(S));
    const E1 = a.fore.getWorldPosition(new THREE.Vector3()), H1 = a.hand.getWorldPosition(new THREE.Vector3());
    swing(a.fore, H1.sub(E1), tgt.clone().sub(E1));
    return 1.15 * w;
  }

  update(dt) {
    this.t += dt;
    const t = this.t, tg = {};
    const sitting = this.pose === 'sit';
    tg.kneeL = 0; tg.kneeR = 0;   // v2 joints that the v1 pose code below may set (kick, low block)
    // ---- pose targets ----
    tg.hipL = 0; tg.hipR = 0; tg.torsoX = 0; tg.torsoY = 0; tg.torsoZ = 0; tg.torsoH = 0.78; tg.neckX = 0; tg.neckY = 0; tg.neckZ = 0;
    tg.lx = 0.1; tg.rx = 0.1; tg.lz = 0.15; tg.rz = -0.15; tg.lf = -0.3; tg.rf = -0.3; tg.mouth = 1; tg.bodyY = 0;
    switch (this.pose) {
      case 'sit':
        tg.hipL = tg.hipR = -1.35; tg.torsoH = this.seatH + 0.04;
        tg.lx = tg.rx = -0.9; tg.lf = tg.rf = -1.6; tg.lz = 0.25; tg.rz = -0.25;
        break;
      case 'flirt': {
        const m = this.mood;
        tg.lz = 0.15 + (1 - m) * 0.9; tg.rz = -0.15 - (1 - m) * 0.9;
        tg.lf = tg.rf = -0.3 - (1 - m) * 1.6; tg.lx = tg.rx = -0.2 * (1 - m);
        tg.torsoX = (0.5 - m) * 0.25; tg.neckX = (m - 0.5) * 0.3; tg.neckZ = (m - 0.5) * 0.25;
        tg.mouth = 0.6 + m * 1.2;
        break;
      }
      case 'fight': {
        const sh = Math.sin(t * 4.2);
        tg.lx = -1.25 + sh * 0.05; tg.rx = -1.15 - sh * 0.05; tg.lz = 0.4; tg.rz = -0.4; tg.lf = -2.0; tg.rf = -2.1; tg.torsoX = 0.14;
        tg.torsoZ = sh * 0.04; tg.bodyY = Math.abs(Math.sin(t * 4.2)) * 0.012; tg.hipL = -0.15 + sh * 0.08; tg.hipR = 0.1 - sh * 0.08; tg.neckX = 0.1;
        if (this.block === 'high') { tg.lx = -1.9; tg.rx = -1.9; tg.lz = 0.15; tg.rz = -0.15; tg.lf = -2.4; tg.rf = -2.4; tg.neckX = 0.25; tg.torsoX = 0.2; }
        if (this.block === 'low') { tg.hipR = -1.1; tg.kneeR = 1.0; tg.torsoX = 0.3; tg.lx = -0.6; tg.rx = -0.6; tg.lf = -1.2; tg.rf = -1.2; tg.bodyY = 0.02; }
        break;
      }
      case 'lean': // over a pool table, cue in the right hand
        tg.torsoX = 0.85; tg.neckX = -0.6;
        tg.lx = -1.6; tg.lf = -0.4; tg.lz = 0.5; tg.rx = -0.9; tg.rf = -0.9; tg.rz = -0.2;
        tg.hipL = -0.15; tg.hipR = 0.25;
        break;
      case 'foos': // hands on two rod handles
        tg.lx = tg.rx = -0.75; tg.lf = tg.rf = -0.7; tg.lz = 0.4; tg.rz = -0.4; tg.torsoX = 0.3; tg.neckX = -0.1;
        break;
      case 'darts':
        tg.lx = -0.5; tg.lf = -1.5; tg.rx = -1.8; tg.rf = -1.5; tg.rz = -0.3; tg.torsoX = 0.05;
        break;
      case 'juke': // leaning on the jukebox, one hand on it
        tg.rx = -1.0; tg.rf = -0.5; tg.lx = 0.2; tg.lf = -0.8; tg.torsoX = 0.15; tg.torsoZ = -0.08;
        break;
      case 'bartend':
        tg.lx = tg.rx = -0.6; tg.lf = tg.rf = -1.2; tg.torsoX = 0.07;   // stands at the counter, hands forward (v1 stooped 0.2)
        break;
      case 'talk':
        tg.lx = -0.3; tg.lf = -1.2; tg.rx = -0.4; tg.rf = -1.0; tg.lz = 0.3; tg.rz = -0.3;
        break;
      default: break;
    }
    // ---- walking layer ----
    const w = this.walk;
    if (w > 0.01 && !sitting) {
      const s = Math.sin(this.walkPhase), c = Math.sin(this.walkPhase + Math.PI);
      tg.hipL += s * 0.55 * w; tg.hipR += c * 0.55 * w;
      tg.lx += c * 0.4 * w; tg.rx += s * 0.4 * w;
      tg.bodyY += Math.abs(Math.sin(this.walkPhase)) * 0.025 * w;
      tg.torsoZ += Math.sin(this.walkPhase) * 0.04 * w;
      tg.torsoX += 0.06 * w;
    }
    // ---- idle breathing / sway ----
    const idle = sitting ? 0.4 : 1 - w * 0.7;
    tg.torsoZ += Math.sin(t * 0.9 * this.sway) * 0.02 * idle;
    tg.torsoX += Math.sin(t * 1.3 * this.sway) * 0.015 + Math.sin(t * 2.2) * 0.004;
    tg.neckY += this.headTarget ? 0 : Math.sin(t * 0.5 * this.sway) * 0.25 * idle;
    tg.neckZ += Math.sin(t * 0.7) * 0.05;
    // ---- head tracking ----
    if (this.headTarget) {
      const local = this.root.worldToLocal(this.headTarget.clone());
      const yaw = Math.atan2(local.x, local.z);
      const pitch = Math.atan2(local.y - 1.5 * this.height, Math.hypot(local.x, local.z));
      tg.neckY += THREE.MathUtils.clamp(yaw, -1.1, 1.1);
      tg.neckX += THREE.MathUtils.clamp(-pitch, -0.5, 0.5);
      if (Math.abs(yaw) > 1.1 && !sitting && w < 0.01) tg.torsoY = THREE.MathUtils.clamp(yaw - Math.sign(yaw) * 1.1, -0.6, 0.6);
    }
    // ---- one-shots ----
    let k;
    if ((k = this.act('punch', dt, 2.4)) >= 0) {
      // 0-0.35 wind up (arm back, shoulders turn), 0.35-0.55 snap out, 0.55-1 recover
      const a = this.punchArm ? 'r' : 'l', sgn = this.punchArm ? -1 : 1;
      const wind = k < 0.35 ? k / 0.35 : k < 0.55 ? 1 - (k - 0.35) / 0.2 : 0;
      const ext = k < 0.35 ? 0 : k < 0.55 ? (k - 0.35) / 0.2 : 1 - (k - 0.55) / 0.45;
      tg[a + 'x'] = -1.2 + wind * 0.5 - ext * 0.85; tg[a + 'f'] = -2.0 + ext * 2.0 - wind * 0.2; tg[a + 'z'] = sgn * (0.4 - ext * 0.3);
      tg.torsoY += sgn * (wind * -0.35 + ext * 0.45); tg.torsoX += ext * 0.12; tg.hipL += ext * sgn * 0.1; tg.hipR -= ext * sgn * 0.1;
    }
    if ((k = this.act('kick', dt, 2.2)) >= 0) {
      // chamber then snap the right leg out
      const wind = k < 0.4 ? k / 0.4 : k < 0.6 ? 1 - (k - 0.4) / 0.2 : 0;
      const ext = k < 0.4 ? 0 : k < 0.6 ? (k - 0.4) / 0.2 : 1 - (k - 0.6) / 0.4;
      tg.hipR = -0.9 * wind - 1.5 * ext; tg.hipL = 0.2 * ext; tg.kneeR = 1.5 * wind + 0.15 * ext; tg.torsoX -= ext * 0.25; tg.bodyY += ext * 0.03; tg.lx -= ext * 0.5;
    }
    if ((k = this.act('reach', dt, 1.3)) >= 0) {
      const e = Math.sin(k * Math.PI);
      tg.rx = -0.9 - e * 0.1; tg.rf = -0.2 - e * 0.1; tg.torsoX += e * 0.25; tg.neckX += e * 0.1;
    }
    if ((k = this.act('hit', dt, 2.6)) >= 0) {
      const e = Math.sin(k * Math.PI);
      tg.neckX -= e * 0.55; tg.neckZ += this.hitSide * e * 0.3; tg.torsoX -= e * 0.25; tg.torsoY += this.hitSide * e * 0.35; tg.torsoZ += this.hitSide * e * 0.15;
      tg.lx += e * 0.4; tg.rx += e * 0.4;
    }
    if ((k = this.act('drink', dt, 1.1)) >= 0) {
      const e = Math.sin(k * Math.PI);
      tg.rx = -0.9 - e * 1.15; tg.rf = -1.6 - e * 0.95; tg.rz = -0.45 * e; tg.neckX -= e * 0.5;
      tg.handR = -e * 1.1;
    } else tg.handR = 0;
    if ((k = this.act('stagger', dt, 3)) >= 0) { const e = Math.sin(k * Math.PI); tg.torsoX -= e * 0.3; tg.neckX -= e * 0.4; }
    if ((k = this.act('laugh', dt, 0.9)) >= 0) {
      const e = Math.sin(k * Math.PI);
      tg.torsoX -= e * 0.25 - Math.sin(k * 40) * 0.05 * e; tg.neckX -= e * 0.35; tg.mouth = 1 + e; tg.bodyY += Math.abs(Math.sin(k * 40)) * 0.01 * e;
      tg.lx -= e * 0.5; tg.rx -= e * 0.5;
    }
    if ((k = this.act('gesture', dt, 0.8)) >= 0) {
      const e = Math.sin(k * Math.PI), a = this.gestureArm ? 'r' : 'l';
      tg[a + 'x'] = -1.0 - e * 0.4 + Math.sin(k * 20) * 0.15 * e; tg[a + 'f'] = -1.2 + e * 0.6; tg[a + 'z'] = (this.gestureArm ? -1 : 1) * (0.3 + e * 0.4);
    }
    if ((k = this.act('nod', dt, 2.2)) >= 0) tg.neckX += Math.sin(k * Math.PI * 2) * 0.25;
    if ((k = this.act('throw', dt, 1.6)) >= 0) {
      const e = k < 0.6 ? k / 0.6 : 1 - (k - 0.6) / 0.4; // wind back then release
      tg.rx = -1.9 + (k > 0.6 ? (k - 0.6) / 0.4 * 0.5 : 0); tg.rf = -1.6 + (k > 0.6 ? (k - 0.6) / 0.4 * 1.5 : -e * 0.2); tg.rz = -0.2;
      tg.torsoX += (k > 0.6 ? 0.1 : 0);
    }
    if ((k = this.act('strike', dt, 2)) >= 0) {
      const e = k < 0.5 ? k * 2 : 1 - (k - 0.5) * 2;
      tg.rx = -0.9 + e * 0.5; tg.rf = -0.9 - e * 0.4;
    }
    if ((k = this.act('jerk', dt, 6)) >= 0) { const e = Math.sin(k * Math.PI); tg.torsoX += e * 0.15; tg.lx -= e * 0.5; tg.rx -= e * 0.5; tg.torsoZ += (this.rnd() - 0.5) * 0.1 * e; }
    if ((k = this.act('cheer', dt, 1)) >= 0) { const e = Math.sin(k * Math.PI); tg.lx = tg.rx = -2.6 * e + 0.1 * (1 - e); tg.lf = tg.rf = -0.3; tg.neckX -= e * 0.3; tg.bodyY += e * 0.04; }
    // ---- continuous arm blends driven by mini-games ----
    if (this.reachR > 0.001) {
      const e = this.reachR;
      const P = this.reachPose;
      tg.rx = lerp(tg.rx, P.rx, e); tg.rf = lerp(tg.rf, P.rf, e); tg.rz = lerp(tg.rz, P.rz, e);
      tg.torsoX += P.lean * e; tg.neckX += 0.25 * e;
    }
    if (this.liftR > 0.001) {
      const e = this.liftR;
      const P = this.liftPose;
      tg.rx = lerp(tg.rx, P.rx, e); tg.rf = lerp(tg.rf, P.rf, e); tg.rz = lerp(tg.rz, P.rz, e);
      tg.neckX -= 0.5 * this.tiltR * e; tg.torsoX -= 0.12 * this.tiltR * e;
    }
    // ---- knocked out / slumped ----
    const ko = this.ko;
    tg.bodyTilt = -Math.PI / 2 * ko;
    tg.bodyY += 0.15 * ko;
    if (this.slump > 0) { tg.torsoX += this.slump * 0.9; tg.neckX += this.slump * 0.4; tg.lx = tg.rx = -1.4 * this.slump + tg.lx * (1 - this.slump); }


    // ======== v2 layer: knees, feet, spine, collarbones, wrists, jaw, weight and breath ========
    const fight = this.pose === 'fight';
    const lg = this.legGeom();
    if (sitting) {
      // seated legs by two-bone IK: feet flat on the floor when they reach it (chairs), else on a foot rail
      // in reach (Patron.footRests, e.g. the bar's brass rail), else hanging with the toes down
      const hipY = tg.torsoH + 0.02, floorY = lg.ankleY;
      const rest = this.footRestLocal();
      for (const [h, k, a, side] of [['hipL', 'kneeL', 'ankleL', -1], ['hipR', 'kneeR', 'ankleR', 1]]) {
        const kz = lg.T * Math.sin(lg.a0 - tg[h]) + 0.07;          // the shin leans a little forward of the knee
        let sol = this.legIK(lg, hipY, floorY, kz);
        let toes = 0;
        if (!sol && rest) { sol = this.legIK(lg, hipY, rest.y + 0.1 / this.height, rest.z - (side > 0 ? 0.12 : 0.09) / this.height); toes = 0.12; }
        if (sol) { tg[h] = sol.h; tg[k] = sol.k; }
        else { tg[k] = Math.max(tg[k], lg.b0 - tg[h] + 0.12); toes = 0.45; }   // hang, shin a touch back
        tg[a] = -(tg[h] + tg[k]) + toes;
      }
    } else {
      // planted-leg flex: the thigh tips forward by half the knee bend so the foot stays under the hip
      let flexL = 0.05, flexR = 0.05;                          // never locked straight
      if (fight) { flexL += 0.28; flexR += 0.28; }
      if (this.pose === 'lean') { flexL += 0.12; flexR += 0.22; }
      tg.kneeL += flexL; tg.kneeR += flexR; tg.hipL -= flexL / 2; tg.hipR -= flexR / 2;
      if (w > 0.01) {                                          // flex the swinging leg as it passes under the body
        const cph = Math.cos(this.walkPhase);
        tg.kneeL += w * 0.75 * Math.max(0, -cph); tg.kneeR += w * 0.75 * Math.max(0, cph);
        tg.bodyY -= Math.abs(Math.sin(this.walkPhase)) * 0.025 * w;   // v1's walk bob: the grounding below makes the real one
      }
      // a forward-swung leg bends a little at the knee
      tg.kneeL = Math.max(tg.kneeL, -tg.hipL * 0.35); tg.kneeR = Math.max(tg.kneeR, -tg.hipR * 0.35);
    }
    // weight shift while standing: hips drift over one leg, the other knee softens
    const idleStand = !sitting && !fight && w < 0.05 && this.ko < 0.05 ? 1 : 0;
    const shift = Math.sin(t * 0.33 * this.sway + this.shiftPhase) * idleStand;
    tg.hipsX = 0.018 * shift; tg.hipsRoll = -0.04 * shift;
    // leaning over a table: hips go in toward it, so the curved spine still puts the hands where v1's straight one did
    tg.hipsZ = this.pose === 'lean' ? 0.065 : 0;
    tg.kneeR += 0.14 * Math.max(0, shift); tg.kneeL += 0.14 * Math.max(0, -shift);
    if (!sitting) {
      // feet stay near level: undo most of the leg's swing at the ankle
      tg.ankleL = -(tg.hipL + tg.kneeL) * 0.6; tg.ankleR = -(tg.hipR + tg.kneeR) * 0.6;
      // grounding: the lower foot sits on the floor whatever the knees and hips are doing
      const hy = tg.torsoH + 0.02;
      const low = Math.min(this.ankleY(lg, hy, tg.hipL, tg.kneeL), this.ankleY(lg, hy, tg.hipR, tg.kneeR));
      tg.bodyY += (lg.ankleY - low) * this.height * (1 - this.ko);
    }
    // hands: a held prop closes the fingers round it and turns the palm toward it; otherwise a relaxed curl
    for (let i = 0; i < 2; i++) tg['grip' + i] = (this.prop && this.propArm === i) || this.grip[i] > 0.5 ? 1 : 0;
    // breathing: chest rises, collarbones follow
    const breath = Math.sin(t * (sitting ? 1.5 : 1.8));
    tg.breath = breath;
    // collarbones lift and roll forward with the arms
    for (const [a, x] of [['l', tg.lx], ['r', tg.rx]]) {
      tg['clav' + a] = clamp((-x - 1.0) * 0.28, 0, 0.32) + 0.012 * breath;
      tg['clavF' + a] = clamp(-x * 0.06, -0.05, 0.12);
    }
    // wrists: relaxed curl, plus the drinking tilt on the prop hand
    tg.wristL = 0.12 + clamp(-tg.lf * 0.05, 0, 0.1); tg.wristR = 0.12 + clamp(-tg.rf * 0.05, 0, 0.1);
    // jaw: opens with the mood mouth, laughs and chatters while talking
    const chatter = (this.pose === 'talk' || this.pose === 'flirt') ? Math.max(0, Math.sin(t * 11) * Math.sin(t * 2.9)) * 0.09 : 0;
    const laughing = this.acts.laugh != null ? Math.abs(Math.sin(this.acts.laugh * 28)) * 0.08 : 0;
    // the mood mouth (width) stays closed; the jaw opens to talk, to laugh, and on a very broad grin
    tg.jaw = (clamp((tg.mouth - 1.6) * 0.2, 0, 0.08) + chatter + laughing) * this.jawScale;

    // ---- ease toward targets ----
    const c = this.cur;
    const rate = 9;
    for (const key of Object.keys(tg)) c[key] = c[key] == null ? tg[key] : damp(c[key], tg[key], key === 'bodyTilt' ? 4 : rate, dt);
    const B = this.bones, [L, R] = this.arms;   // arms[0] = x < 0 side (v1 "L"), arms[1] = x > 0 (v1 "R")
    B.Hips.position.set(c.hipsX || 0, c.torsoH + 0.02, c.hipsZ || 0);
    B.Hips.rotation.set(0, 0, c.hipsRoll || 0);
    B.RightUpLeg.rotation.set(c.hipL, 0, -(c.hipsRoll || 0)); B.LeftUpLeg.rotation.set(c.hipR, 0, -(c.hipsRoll || 0));
    B.RightLeg.rotation.x = c.kneeL; B.LeftLeg.rotation.x = c.kneeR;
    B.RightKneeHelper.rotation.x = c.kneeL / 2; B.LeftKneeHelper.rotation.x = c.kneeR / 2;
    B.RightFoot.rotation.x = c.ankleL; B.LeftFoot.rotation.x = c.ankleR;
    // the v1 waist bend, spread over three spine bones (Spine keeps the share other code adds to torso)
    const sx = c.torsoX * 1.1, sy = c.torsoY, sz = c.torsoZ - (c.hipsRoll || 0);
    // most of the pitch at the lowest bone so the shoulders land where v1 put them (hands on the bar stay on it)
    B.Spine.rotation.set(sx * 0.62, sy * 0.3, sz * 0.5);
    B.Spine1.rotation.set(sx * 0.24, sy * 0.35, sz * 0.3);
    B.Spine2.rotation.set(sx * 0.14 - 0.015 * (c.breath || 0), sy * 0.35, sz * 0.2);
    B.Neck.rotation.set(c.neckX * 0.4, c.neckY * 0.4, c.neckZ * 0.4);
    B.Head.rotation.set(c.neckX * 0.6, c.neckY * 0.6, c.neckZ * 0.6);
    B.Jaw.rotation.x = c.jaw || 0;
    // the lip strip rides the jaw; as the jaw opens it grows upward to fill the gap with mouth shadow
    const gap = Math.max(0, (c.jaw || 0) - 0.01) * Math.max(this.mouthRest.z, 0.03);
    this.mouth.position.y = this.mouthRest.y + gap / 2;
    this.mouth.scale.y = 1 + gap / 0.0034;
    // blinking every 2-6 s (now and then a double blink); eyes shut when knocked out, heavy when slumped
    if (this.lids.length) {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) { this.blinkT = 0; this.blinkIn = this.rnd() < 0.15 ? 0.32 : 2 + this.rnd() * 4; }
      let shut = 0;
      if (this.blinkT >= 0) { this.blinkT += dt; const k = this.blinkT / 0.16; shut = k < 1 ? Math.sin(k * Math.PI) : 0; if (k >= 1) this.blinkT = -1; }
      shut = Math.max(shut, clamp(this.ko * 1.2, 0, 1), this.slump * 0.45);
      for (const lid of this.lids) { lid.scale.y = Math.max(shut, 0.001); lid.visible = shut > 0.03; }
    }
    L.clav.rotation.set(0, -(c.clavFl || 0), -(c.clavl || 0)); R.clav.rotation.set(0, (c.clavFr || 0), (c.clavr || 0));
    L.pivot.rotation.set(c.lx, 0, c.lz); R.pivot.rotation.set(c.rx, 0, c.rz);
    L.fore.rotation.x = c.lf; R.fore.rotation.x = c.rf;
    // v1's drinking tilt: most of it turns the glass in the fingers, the rest bends the wrist. Gripping turns the
    // palm (which hangs facing the body) toward the prop, along the forearm; the prop socket turns back, so
    // props sit exactly where v1 put them.
    for (const [i, a] of [[0, L], [1, R]]) {
      const g = c['grip' + i] || 0, sign = -a.side;            // Right hand: palm faces +x, curls toward +x
      const twist = -sign * 1.2 * g;
      a.wrist.rotation.set((i ? c.wristR + 0.4 * (c.handR || 0) : c.wristL), twist, 0);
      a.twist.rotation.y = twist / 2;
      const tight = this.propUpright && i === this.propArm ? 0.6 : 1;   // a pint is fat: fingers wrap it, not through it
      a.f1.rotation.z = sign * (0.18 + 0.95 * g * tight); a.f2.rotation.z = sign * (0.15 + 1.05 * g * tight);
      a.hand.rotation.set(i ? 0.6 * (c.handR || 0) : 0, -twist, 0);
      a.hand.position.copy(a.socketRest).applyAxisAngle(_yAxis, -twist);
    }
    this.mouth.scale.x = c.mouth;
    // library clips over the procedural pose
    this.ambientClips(dt);
    this.applyClips(dt);
    const sipTilt = this.sipFix();
    // an upright glass: world-upright in the body's heading, tipped back toward the mouth by the drink
    if (this.prop && this.propUpright && this.prop.parent) {
      this.root.getWorldQuaternion(_q1);
      _q2.setFromAxisAngle(_xAxis, 1.2 * (c.handR || 0) - sipTilt); _q1.multiply(_q2);
      this.prop.parent.getWorldQuaternion(_q2);
      this.prop.quaternion.copy(_q2.invert().multiply(_q1));
    }
    this.body.rotation.x = c.bodyTilt;
    this.body.position.y = c.bodyY;
  }
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

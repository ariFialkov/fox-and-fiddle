/**
 * Low-poly bar patrons built from primitives, with enough joints to sell walking, sitting,
 * drinking, talking, laughing, leaning over a pool table, throwing darts, fighting and
 * getting knocked out. Poses set per-frame targets; everything eases toward them so
 * transitions look natural. One-shot actions (punch, drink, laugh...) layer on top.
 */
import * as THREE from 'three';

const SHIRTS = [0x8a2b2b, 0x2c4a7a, 0x3d6b3a, 0x6b4a2a, 0x4a4a4a, 0x7a3a6b, 0x9a6a2a, 0x2a6b6b];
const SKINS = [0xf1c9a5, 0xd9a278, 0xb07a4e, 0x8a5a3a, 0xe8b790];
let seq = 0;
const lerp = THREE.MathUtils.lerp;
const damp = (a, b, k, dt) => THREE.MathUtils.damp(a, b, k, dt);

export class Patron {
  constructor({ name = 'Patron', female = false, shirt, skin, hair, height = 1.0, seed = seq++ } = {}) {
    this.name = name;
    this.female = female;
    const rnd = mulberry(seed * 7919 + 13);
    shirt = shirt ?? SHIRTS[Math.floor(rnd() * SHIRTS.length)];
    skin = skin ?? SKINS[Math.floor(rnd() * SKINS.length)];
    hair = hair ?? [0x1a120c, 0x3a2414, 0x6b4a2a, 0xc9a23a, 0x8a1a1a][Math.floor(rnd() * 5)];
    this.height = height;

    this.root = new THREE.Group();   // position + yaw only
    const g = new THREE.Group();     // body: tilts when knocked out
    this.root.add(g);
    this.body = g;
    const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.75 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.95 });
    const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 });

    // legs hang from hip pivots
    this.hips = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.11, 0.8, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.6, 4, 8), pantsMat);
      leg.position.y = -0.4; leg.castShadow = true;
      hip.add(leg); g.add(hip); this.hips.push(hip);
    }
    this.torso = new THREE.Group(); this.torso.position.y = 0.78; g.add(this.torso);
    const bodyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(female ? 0.16 : 0.2, 0.42, 4, 10), shirtMat);
    bodyMesh.position.y = 0.3; bodyMesh.castShadow = true; bodyMesh.scale.set(1.15, 1, 0.8);
    this.torso.add(bodyMesh);
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * (female ? 0.22 : 0.27), 0.52, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.26, 4, 8), shirtMat);
      upper.position.y = -0.16; upper.castShadow = true;
      const fore = new THREE.Group(); fore.position.y = -0.3;
      const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.24, 4, 8), skinMat);
      forearm.position.y = -0.14;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), skinMat);
      hand.position.y = -0.3;
      fore.add(forearm, hand);
      pivot.add(upper, fore);
      this.torso.add(pivot);
      this.arms.push({ pivot, fore, hand, side: s });
    }
    this.neck = new THREE.Group(); this.neck.position.y = 0.78; this.torso.add(this.neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), skinMat);
    head.position.y = 0.1; head.scale.set(0.95, 1.1, 0.95); head.castShadow = true;
    this.neck.add(head);
    this.head = head;
    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, female ? 1.6 : 1.3), hairMat);
    hairMesh.position.y = female ? 0.12 : 0.13;
    if (female) hairMesh.scale.set(1.05, 1.25, 1.05);
    this.neck.add(hairMesh);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), eyeMat);
      eye.position.set(s * 0.045, 0.12, 0.115);
      this.neck.add(eye);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.01), eyeMat);
    mouth.position.set(0, 0.05, 0.12);
    this.neck.add(mouth);
    this.mouth = mouth;
    if (!female && rnd() > 0.5) {
      const beard = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8, 0, Math.PI * 2, 1.3, 1.2), hairMat);
      beard.position.y = 0.09; beard.position.z = 0.03;
      this.neck.add(beard);
    }
    g.scale.setScalar(height);

    this.t = rnd() * 10;
    this.pose = 'idle';
    this.mood = 0.5;          // pick-up lines
    this.ko = 0;              // 0 standing .. 1 knocked out
    this.slump = 0;           // 0 .. 1 slumped over the bar
    this.walk = 0;            // walk blend 0..1 (driven by the NPC director / fight)
    this.walkPhase = 0;
    this.sway = 0.6 + rnd() * 0.6;
    this.hp = 100;
    this.prop = null;         // held item (glass, cue, dart)
    this.headTarget = null;   // world point to look at
    this.busy = false;        // claimed by a mini-game: the director leaves it alone
    this.seatH = 0;
    this.acts = {};           // one-shot action timers
    this.cur = {};            // eased joint values
    this.rnd = rnd;
  }

  get position() { return this.root.position; }
  lookAt(v) { const p = v.clone(); p.y = this.root.position.y; this.root.lookAt(p); }
  faceYaw() { return this.root.rotation.y; }

  sit(seatH = 0.72) { this.pose = 'sit'; this.seatH = seatH; }
  stand() { if (this.pose === 'sit') this.pose = 'idle'; }

  // one-shots
  punch() { this.acts.punch = 0; this.punchArm = this.punchArm === 1 ? 0 : 1; }
  drink() { this.acts.drink = 0; }
  stagger() { this.acts.stagger = 0; }
  hit(side = 1) { this.acts.hit = 0; this.hitSide = side; }
  kick() { this.acts.kick = 0; }
  reach() { this.acts.reach = 0; }
  laugh() { this.acts.laugh = 0; }
  gesture() { this.acts.gesture = 0; this.gestureArm = this.rnd() < 0.5 ? 0 : 1; }
  nod() { this.acts.nod = 0; }
  throwDart() { this.acts.throw = 0; }
  strike() { this.acts.strike = 0; }
  jerk() { this.acts.jerk = 0; }
  cheer() { this.acts.cheer = 0; }
  holdGlass(mesh) { this.hold(mesh, 1, [0, -0.03, 0.04]); }
  hold(mesh, armIdx = 1, pos = [0, -0.03, 0.04], rot = [0, 0, 0]) {
    if (this.prop) this.prop.parent?.remove(this.prop);
    this.prop = mesh;
    if (mesh) { mesh.position.set(...pos); mesh.rotation.set(...rot); this.arms[armIdx].hand.add(mesh); }
  }

  /** Advance a one-shot timer; returns progress 0..1 or -1 when inactive. */
  act(name, dt, speed) {
    if (this.acts[name] == null) return -1;
    this.acts[name] += dt * speed;
    if (this.acts[name] >= 1) { delete this.acts[name]; return 1; }
    return this.acts[name];
  }

  update(dt) {
    this.t += dt;
    const t = this.t, tg = {};
    const [L, R] = this.arms;
    const sitting = this.pose === 'sit';
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
        if (this.block === 'low') { tg.hipR = -1.1; tg.torsoX = 0.3; tg.lx = -0.6; tg.rx = -0.6; tg.lf = -1.2; tg.rf = -1.2; tg.bodyY = 0.02; }
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
        tg.lx = tg.rx = -0.6; tg.lf = tg.rf = -1.2; tg.torsoX = 0.2;
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
      tg.hipR = -0.9 * wind - 1.5 * ext; tg.hipL = 0.2 * ext; tg.torsoX -= ext * 0.25; tg.bodyY += ext * 0.03; tg.lx -= ext * 0.5;
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
    // ---- knocked out / slumped ----
    const ko = this.ko;
    tg.bodyTilt = -Math.PI / 2 * ko;
    tg.bodyY += 0.15 * ko;
    if (this.slump > 0) { tg.torsoX += this.slump * 0.9; tg.neckX += this.slump * 0.4; tg.lx = tg.rx = -1.4 * this.slump + tg.lx * (1 - this.slump); }

    // ---- ease toward targets ----
    const c = this.cur;
    const rate = 9;
    for (const key of Object.keys(tg)) c[key] = c[key] == null ? tg[key] : damp(c[key], tg[key], key === 'bodyTilt' ? 4 : rate, dt);
    this.hips[0].rotation.x = c.hipL; this.hips[1].rotation.x = c.hipR;
    this.hips[0].position.y = this.hips[1].position.y = c.torsoH + 0.02;
    this.torso.position.y = c.torsoH;
    this.torso.rotation.set(c.torsoX, c.torsoY, c.torsoZ);
    this.neck.rotation.set(c.neckX, c.neckY, c.neckZ);
    L.pivot.rotation.x = c.lx; R.pivot.rotation.x = c.rx; L.pivot.rotation.z = c.lz; R.pivot.rotation.z = c.rz;
    L.fore.rotation.x = c.lf; R.fore.rotation.x = c.rf;
    R.hand.rotation.x = c.handR || 0;
    this.mouth.scale.x = c.mouth;
    this.body.rotation.x = c.bodyTilt;
    this.body.position.y = c.bodyY;
  }
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

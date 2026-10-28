/**
 * Low-poly bar patrons built from primitives, with enough joints to sell
 * idle sway, drinking, punching, flirting and getting knocked out.
 */
import * as THREE from 'three';

const SHIRTS = [0x8a2b2b, 0x2c4a7a, 0x3d6b3a, 0x6b4a2a, 0x4a4a4a, 0x7a3a6b, 0x9a6a2a, 0x2a6b6b];
const SKINS = [0xf1c9a5, 0xd9a278, 0xb07a4e, 0x8a5a3a, 0xe8b790];
let seq = 0;

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

    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.62, 4, 8), pantsMat);
      leg.position.set(s * 0.11, 0.4, 0);
      leg.castShadow = true;
      g.add(leg); this.legs.push(leg);
    }
    // hips/torso
    this.torso = new THREE.Group(); this.torso.position.y = 0.78; g.add(this.torso);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(female ? 0.16 : 0.2, 0.42, 4, 10), shirtMat);
    body.position.y = 0.3; body.castShadow = true; body.scale.set(1.15, 1, 0.8);
    this.torso.add(body);
    // arms
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
      pivot.rotation.z = s * 0.15;
      this.torso.add(pivot);
      this.arms.push({ pivot, fore, hand });
    }
    // head
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
      beard.position.y = 0.09; beard.position.z = 0.03; beard.scale.set(1, 1, 1);
      this.neck.add(beard);
    }
    g.scale.setScalar(height);

    this.t = Math.random() * 10;
    this.pose = 'idle';
    this.mood = 0.5;      // used by pick-up lines
    this.ko = 0;          // 0 standing .. 1 knocked out
    this.punchT = -1;
    this.punchArm = 1;
    this.drinkT = -1;
    this.staggerT = -1;
    this.sway = 0.5 + rnd() * 0.5;
    this.hp = 100;
    this.prop = null;     // held item (glass)
  }

  get position() { return this.root.position; }
  lookAt(v) { const p = v.clone(); p.y = this.root.position.y; this.root.lookAt(p); }

  sit() { this.pose = 'sit'; this.legs.forEach((l) => { l.rotation.x = -Math.PI / 2; l.position.y = 0.52; l.position.z = 0.3; }); this.torso.position.y = 0.55; }
  stand() { this.pose = 'idle'; this.legs.forEach((l) => { l.rotation.x = 0; l.position.y = 0.4; l.position.z = 0; }); this.torso.position.y = 0.78; }

  punch() { this.punchT = 0; this.punchArm = this.punchArm === 1 ? 0 : 1; }
  drink() { this.drinkT = 0; }
  stagger() { this.staggerT = 0; }
  holdGlass(mesh) { if (this.prop) this.arms[1].hand.remove(this.prop); this.prop = mesh; if (mesh) { mesh.position.set(0, -0.03, 0.04); this.arms[1].hand.add(mesh); } }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const idle = this.pose === 'sit' ? 0.4 : 1;
    // breathing / sway
    this.torso.rotation.z = Math.sin(t * 0.9 * this.sway) * 0.02 * idle;
    this.torso.rotation.x = Math.sin(t * 1.3 * this.sway) * 0.015;
    this.neck.rotation.y = Math.sin(t * 0.5 * this.sway) * 0.25 * idle;
    this.neck.rotation.z = Math.sin(t * 0.7) * 0.05;

    const [L, R] = this.arms;
    // default arms: hang, or mood-driven for flirting
    let lx = 0.1, rx = 0.1, lz = 0.15, rz = -0.15, lf = -0.3, rf = -0.3;
    if (this.pose === 'flirt') {
      const m = this.mood; // 0 cold .. 1 warm
      lz = 0.15 + (1 - m) * 0.9;  // crossed arms when cold
      rz = -0.15 - (1 - m) * 0.9;
      lf = -0.3 - (1 - m) * 1.6; rf = -0.3 - (1 - m) * 1.6;
      lx = rx = -0.2 * (1 - m);
      this.torso.rotation.x += (0.5 - m) * 0.25;         // lean away when cold, in when warm
      this.neck.rotation.x = (m - 0.5) * 0.3;
      this.neck.rotation.z += (m - 0.5) * 0.25;
      this.mouth.scale.x = 0.6 + m * 1.2;
      this.mouth.position.y = 0.045 + m * 0.012;
    } else if (this.pose === 'fight') {
      lx = -1.2; rx = -1.2; lz = 0.35; rz = -0.35; lf = -1.9; rf = -1.9;
      this.torso.rotation.x += 0.12;
    } else if (this.pose === 'sit' || this.pose === 'drinkSit') {
      lx = -0.9; rx = -0.9; lf = -1.6; rf = -1.6;
    }
    L.pivot.rotation.x = lx; R.pivot.rotation.x = rx; L.pivot.rotation.z = lz; R.pivot.rotation.z = rz;
    L.fore.rotation.x = lf; R.fore.rotation.x = rf;

    if (this.punchT >= 0) {
      this.punchT += dt * 4;
      const k = Math.sin(Math.min(1, this.punchT) * Math.PI);
      const a = this.arms[this.punchArm];
      a.pivot.rotation.x = -1.2 - k * 0.6; a.fore.rotation.x = -1.9 + k * 1.9; a.pivot.rotation.z = (this.punchArm ? -1 : 1) * 0.1;
      this.torso.rotation.y = (this.punchArm ? -1 : 1) * k * 0.35;
      if (this.punchT >= 1) this.punchT = -1;
    } else this.torso.rotation.y *= 0.8;

    if (this.drinkT >= 0) {
      this.drinkT += dt * 1.2;
      const k = Math.sin(Math.min(1, this.drinkT) * Math.PI);
      R.pivot.rotation.x = -0.9 - k * 1.1; R.fore.rotation.x = -1.6 - k * 0.9; R.pivot.rotation.z = -0.5 * k;
      this.neck.rotation.x = -k * 0.5;
      if (this.drinkT >= 1) this.drinkT = -1;
    }
    if (this.staggerT >= 0) {
      this.staggerT += dt * 3;
      const k = Math.sin(Math.min(1, this.staggerT) * Math.PI);
      this.torso.rotation.x -= k * 0.3; this.neck.rotation.x = -k * 0.4;
      if (this.staggerT >= 1) this.staggerT = -1;
    }
    // knocked out: fall backwards
    const target = this.ko;
    this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, -Math.PI / 2 * target, Math.min(1, dt * 4));
    this.body.position.y = THREE.MathUtils.lerp(this.body.position.y, 0.15 * target, Math.min(1, dt * 4));
  }
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

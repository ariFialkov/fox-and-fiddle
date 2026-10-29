/**
 * The Fox and Fiddle. A 16m x 11m dive bar built from primitives + procedural
 * textures. Exposes colliders (AABBs), activity stations, props and patrons.
 *
 *  z = -5.5 ........ north wall: back bar, bottles, neon sign, bar counter
 *  east wall x = 8 : dartboard, oche
 *  south wall z = 5.5: entrance door (x=-5), window with OPEN sign, jukebox (SE)
 *  west side       : foosball table
 */
import * as THREE from 'three';
import * as T from './textures.js';
import { Patron } from './Patron.js';

export const ROOM = { minX: -8, maxX: 8, minZ: -5.5, maxZ: 5.5, height: 3.4 };

export class Bar {
  constructor(scene, { lowEnd = false } = {}) {
    this.scene = scene;
    this.lowEnd = lowEnd;
    this.colliders = [];   // {minX,maxX,minZ,maxZ}
    this.props = [];       // throwable items
    this.patrons = [];
    this.stations = [];
    this.lights = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mats = {
      floor: new THREE.MeshStandardMaterial({ map: T.woodPlanks([10, 7], '#4e3220'), roughness: 0.85 }),
      wood: new THREE.MeshStandardMaterial({ map: T.woodPlanks([2, 1], '#5a3a22'), roughness: 0.6 }),
      darkWood: new THREE.MeshStandardMaterial({ map: T.woodPlanks([1, 1], '#3a2414'), roughness: 0.7 }),
      brick: new THREE.MeshStandardMaterial({ map: T.brick([6, 2]), roughness: 0.95 }),
      plaster: new THREE.MeshStandardMaterial({ map: T.plaster([4, 1], '#4a3a30'), roughness: 0.95 }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x2a1e18, roughness: 1 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.8, roughness: 0.35 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xb08d3a, metalness: 0.9, roughness: 0.3 }),
      leather: new THREE.MeshStandardMaterial({ color: 0x5a1f1a, roughness: 0.7 }),
      felt: new THREE.MeshStandardMaterial({ map: T.felt('#1f6b3a'), roughness: 1 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xdfeee6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
      black: new THREE.MeshStandardMaterial({ color: 0x151210, roughness: 0.9 }),
    };
    this.build();
  }

  box(w, h, d, mat, x, y, z, { shadow = true, group = this.group, collide = false } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true;
    group.add(m);
    if (collide) this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return m;
  }
  cyl(rt, rb, h, mat, x, y, z, seg = 12, group = this.group) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    return m;
  }
  addCollider(x, z, w, d) { this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }); }

  build() {
    const { mats: M } = this;
    const W = ROOM.maxX - ROOM.minX, D = ROOM.maxZ - ROOM.minZ, H = ROOM.height;
    // floor + ceiling
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.floor);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.group.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.ceiling);
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H; this.group.add(ceil);
    for (let i = -3; i <= 3; i++) this.box(0.18, 0.22, D, M.darkWood, i * 2.3, H - 0.11, 0, { shadow: false });
    // walls (brick north/east, plaster south/west with wainscot)
    const wallN = this.box(W, H, 0.2, M.brick, 0, H / 2, ROOM.minZ - 0.1, { shadow: false });
    const wallS = this.box(W, H, 0.2, M.plaster, 0, H / 2, ROOM.maxZ + 0.1, { shadow: false });
    const wallE = this.box(0.2, H, D, M.brick, ROOM.maxX + 0.1, H / 2, 0, { shadow: false });
    const wallW = this.box(0.2, H, D, M.plaster, ROOM.minX - 0.1, H / 2, 0, { shadow: false });
    wallE.material = M.brick.clone(); wallE.material.map = T.brick([4, 2]);
    // wainscot on plaster walls
    this.box(W, 1.0, 0.06, M.darkWood, 0, 0.5, ROOM.maxZ - 0.03, { shadow: false });
    this.box(0.06, 1.0, D, M.darkWood, ROOM.minX + 0.03, 0.5, 0, { shadow: false });
    // skirting
    this.box(W, 0.12, 0.05, M.black, 0, 0.06, ROOM.minZ + 0.025, { shadow: false });
    this.box(0.05, 0.12, D, M.black, ROOM.maxX - 0.025, 0.06, 0, { shadow: false });

    this.buildEntrance();
    this.buildBar();
    this.buildPoolTable();
    this.buildDarts();
    this.buildFoosball();
    this.buildTables();
    this.buildJukebox();
    this.buildDecor();
    this.buildLights();
    this.buildPatrons();
  }

  buildEntrance() {
    const { mats: M } = this;
    // door in south wall at x=-5
    const door = this.box(1.0, 2.2, 0.08, M.darkWood, -5, 1.1, ROOM.maxZ - 0.06, { shadow: false });
    door.material = M.darkWood.clone();
    this.box(0.06, 2.3, 0.14, M.black, -5.55, 1.15, ROOM.maxZ - 0.06, { shadow: false });
    this.box(0.06, 2.3, 0.14, M.black, -4.45, 1.15, ROOM.maxZ - 0.06, { shadow: false });
    this.box(1.2, 0.08, 0.14, M.black, -5, 2.26, ROOM.maxZ - 0.06, { shadow: false });
    const knob = this.cyl(0.03, 0.03, 0.06, M.brass, -4.65, 1.05, ROOM.maxZ - 0.12, 8); knob.rotation.x = Math.PI / 2;
    // small window with OPEN sign
    const win = this.box(1.4, 0.9, 0.05, new THREE.MeshStandardMaterial({ color: 0x0a0d1a, roughness: 0.2, metalness: 0.4 }), -2.4, 2.0, ROOM.maxZ - 0.03, { shadow: false });
    win.material.emissive = new THREE.Color(0x101830);
    const open = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.35), new THREE.MeshBasicMaterial({ map: T.neonText('OPEN', '#4fd9ff', 512, 160, 'bold 110px Georgia'), transparent: true }));
    open.position.set(-2.4, 2.0, ROOM.maxZ - 0.07); open.rotation.y = Math.PI; this.group.add(open);
    // coat rack by the door
    const rack = new THREE.Group(); rack.position.set(-6.6, 0, 4.7); this.group.add(rack);
    this.cyl(0.03, 0.03, 1.8, M.brass, 0, 0.9, 0, 8, rack);
    this.cyl(0.22, 0.26, 0.04, M.darkWood, 0, 0.02, 0, 12, rack);
    for (let i = 0; i < 4; i++) {
      const hook = this.cyl(0.015, 0.015, 0.22, M.brass, 0, 1.7, 0, 6, rack);
      hook.rotation.z = Math.PI / 2; hook.rotation.y = (i * Math.PI) / 2; hook.position.set(Math.cos(i * Math.PI / 2) * 0.11, 1.7, Math.sin(i * Math.PI / 2) * 0.11);
    }
    this.coatHook = new THREE.Vector3(-6.6 + 0.2, 1.7, 4.7);
    this.addCollider(-6.6, 4.7, 0.5, 0.5);
    // a hanging coat already there
    const coat = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 8), new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.95 }));
    coat.position.set(-6.6, 1.35, 4.9); coat.scale.set(1.3, 1, 0.6); coat.castShadow = true; this.group.add(coat);
    // the player's coat (used by the intro), starts hidden
    this.playerCoat = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 4, 8), new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.95 }));
    this.playerCoat.scale.set(1.3, 1, 0.6); this.playerCoat.castShadow = true; this.playerCoat.visible = false;
    this.group.add(this.playerCoat);
    // welcome mat
    this.box(1.2, 0.02, 0.7, new THREE.MeshStandardMaterial({ color: 0x4a2a1a, roughness: 1 }), -5, 0.01, 4.9, { shadow: false });
  }

  buildBar() {
    const { mats: M } = this;
    const z = -4.25, x0 = -4.5, x1 = 3.5, len = x1 - x0, cx = (x0 + x1) / 2;
    // counter body + top + brass rail
    this.box(len, 1.05, 0.62, M.darkWood, cx, 0.525, z, { collide: true });
    this.box(len + 0.1, 0.06, 0.74, M.wood, cx, 1.08, z);
    const rail = this.cyl(0.02, 0.02, len, M.brass, cx, 0.25, z + 0.42, 8); rail.rotation.z = Math.PI / 2;
    for (let x = x0 + 0.5; x < x1; x += 2) this.cyl(0.015, 0.015, 0.25, M.brass, x, 0.13, z + 0.4, 6);
    // beer taps
    for (let i = 0; i < 4; i++) {
      this.cyl(0.03, 0.035, 0.25, M.metal, -1.6 + i * 0.22, 1.23, z - 0.1, 10);
      this.cyl(0.02, 0.02, 0.14, i % 2 ? M.darkWood : M.brass, -1.6 + i * 0.22, 1.42, z - 0.1, 8);
    }
    // back bar: counter, shelves, mirror, bottles
    this.box(len, 0.95, 0.5, M.darkWood, cx, 0.475, ROOM.minZ + 0.35, { collide: true });
    this.box(len, 0.04, 0.55, M.wood, cx, 0.97, ROOM.minZ + 0.35);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.4, 1.3), new THREE.MeshStandardMaterial({ color: 0x8a9aa8, metalness: 0.9, roughness: 0.15 }));
    mirror.position.set(cx, 1.9, ROOM.minZ + 0.02); this.group.add(mirror);
    for (let s = 0; s < 3; s++) {
      const y = 1.25 + s * 0.42;
      this.box(len - 0.4, 0.03, 0.28, M.wood, cx, y, ROOM.minZ + 0.17);
      for (let x = x0 + 0.35; x < x1 - 0.3; x += 0.19) this.bottle(x + (s % 2) * 0.07, y + 0.015, ROOM.minZ + 0.17, s);
    }
    // stools
    this.stoolX = [];
    for (let x = x0 + 0.5; x <= x1 - 0.5; x += 0.8) { this.stool(x, z + 0.85); this.stoolX.push(x); }
    // glasses on the bar
    for (let i = 0; i < 6; i++) this.glass(x0 + 1 + i * 1.3, 1.11, z + 0.15, i % 2 === 0);
    // bar top position for drinking contest glasses
    this.barTopY = 1.11; this.barZ = z;
    // bartender area bar flap at the right end
    this.box(0.62, 0.05, 0.62, M.wood, x1 + 0.31, 1.08, z);
  }

  stool(x, z) {
    const { mats: M } = this;
    const seat = this.cyl(0.18, 0.18, 0.06, M.leather, x, 0.72, z, 14);
    this.cyl(0.025, 0.025, 0.7, M.metal, x, 0.35, z, 8);
    this.cyl(0.17, 0.2, 0.03, M.metal, x, 0.015, z, 14);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 16), M.metal);
    ring.position.set(x, 0.25, z); ring.rotation.x = Math.PI / 2; this.group.add(ring);
    this.addCollider(x, z, 0.4, 0.4);
    return seat;
  }

  bottle(x, y, z, kind = 0) {
    const colors = [0x1a4a2a, 0x7a3a1a, 0xdfd0a0, 0x2a2a5a, 0x8a1a1a, 0x3a6a7a];
    const mat = new THREE.MeshPhysicalMaterial({ color: colors[Math.abs(Math.floor(x * 13 + kind)) % colors.length], roughness: 0.15, metalness: 0.1, transmission: 0.3, transparent: true, opacity: 0.9 });
    const g = new THREE.Group(); g.position.set(x, y, z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.22, 10), mat); body.position.y = 0.11; body.castShadow = true;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.1, 8), mat); neck.position.y = 0.27;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.025, 8), this.mats.metal); cap.position.y = 0.33;
    const lbl = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.041, 0.08, 10, 1, true), new THREE.MeshStandardMaterial({ color: [0xeeeeee, 0xd8b45a, 0x222222][kind % 3], roughness: 0.8 }));
    lbl.position.y = 0.11;
    g.add(body, neck, cap, lbl);
    this.group.add(g);
    return g;
  }

  /** A glass with a liquid in it. spec: { color, fill 0..1, foam, garnish: 'lime'|'olive'|null, opacity } */
  glass(x, y, z, pint = true, group = this.group, spec = {}) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const h = pint ? 0.16 : 0.09, r = pint ? 0.04 : 0.035;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, h, 14, 1, true), this.mats.glass); m.position.y = h / 2; m.renderOrder = 2;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.006, 14), this.mats.glass); base.position.y = 0.003; base.renderOrder = 2;
    const fill = spec.fill ?? 0.8;
    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.8, h * fill, 14), new THREE.MeshStandardMaterial({ color: spec.color ?? (pint ? 0xd89a2a : 0xa85a1a), roughness: 0.15, transparent: true, opacity: spec.opacity ?? 0.92 }));
    liquid.position.y = 0.006 + h * fill / 2; liquid.renderOrder = 1;
    g.add(m, base, liquid); g.userData.liquid = liquid; g.userData.h = h; g.userData.fill = fill; g.userData.r = r;
    if (spec.foam) {
      const foam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.012, 14), new THREE.MeshStandardMaterial({ color: 0xfff4dc, roughness: 0.9 }));
      foam.position.y = 0.006 + h * fill + 0.006; g.add(foam); g.userData.foam = foam;
    }
    if (spec.garnish === 'lime') {
      const lime = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 12, 1, false, 0, Math.PI * 0.9), new THREE.MeshStandardMaterial({ color: 0x9bd44a, roughness: 0.6, side: THREE.DoubleSide }));
      lime.position.set(r * 0.8, h + 0.004, 0); lime.rotation.set(Math.PI / 2, 0, 0.5); g.add(lime);
    } else if (spec.garnish === 'olive') {
      const olive = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshStandardMaterial({ color: 0x5a6b2a, roughness: 0.6 }));
      olive.position.set(0, 0.006 + h * fill - 0.01, 0); g.add(olive);
    } else if (spec.garnish === 'straw') {
      const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, h * 1.3, 6), new THREE.MeshStandardMaterial({ color: 0xd62828 }));
      straw.position.set(r * 0.4, h * 0.65, 0); straw.rotation.z = 0.25; g.add(straw);
    }
    group.add(g);
    return g;
  }
  /** Scale a glass's liquid down to `k` of its original fill. */
  setGlassLevel(g, k) {
    const l = g.userData.liquid, h = g.userData.h, fill = g.userData.fill;
    l.scale.y = Math.max(0.02, k); l.position.y = 0.006 + h * fill * Math.max(0.02, k) / 2;
    if (g.userData.foam) { g.userData.foam.position.y = 0.006 + h * fill * Math.max(0.02, k) + 0.006; g.userData.foam.visible = k > 0.05; }
  }

  buildPoolTable() {
    const { mats: M } = this;
    const cx = 4.3, cz = 1.2, L = 2.3, Wd = 1.15, y = 0.8;
    const g = new THREE.Group(); g.position.set(cx, 0, cz); this.group.add(g);
    this.pool = { group: g, cx, cz, L, W: Wd, y };
    this.box(L + 0.3, 0.16, Wd + 0.3, M.darkWood, 0, y - 0.08, 0, { group: g });
    const bed = this.box(L, 0.02, Wd, M.felt, 0, y + 0.01, 0, { group: g });
    bed.receiveShadow = true;
    // rails (cushions)
    const railMat = M.felt;
    this.box(L + 0.3, 0.06, 0.15, railMat, 0, y + 0.05, -(Wd / 2 + 0.075), { group: g });
    this.box(L + 0.3, 0.06, 0.15, railMat, 0, y + 0.05, Wd / 2 + 0.075, { group: g });
    this.box(0.15, 0.06, Wd + 0.3, railMat, -(L / 2 + 0.075), y + 0.05, 0, { group: g });
    this.box(0.15, 0.06, Wd + 0.3, railMat, L / 2 + 0.075, y + 0.05, 0, { group: g });
    this.box(L + 0.5, 0.06, 0.1, M.darkWood, 0, y + 0.05, -(Wd / 2 + 0.2), { group: g });
    this.box(L + 0.5, 0.06, 0.1, M.darkWood, 0, y + 0.05, Wd / 2 + 0.2, { group: g });
    this.box(0.1, 0.06, Wd + 0.5, M.darkWood, -(L / 2 + 0.2), y + 0.05, 0, { group: g });
    this.box(0.1, 0.06, Wd + 0.5, M.darkWood, L / 2 + 0.2, y + 0.05, 0, { group: g });
    // pockets
    for (const [px, pz] of [[-L / 2, -Wd / 2], [0, -Wd / 2], [L / 2, -Wd / 2], [-L / 2, Wd / 2], [0, Wd / 2], [L / 2, Wd / 2]]) {
      const p = this.cyl(0.07, 0.07, 0.04, M.black, px, y + 0.02, pz, 12, g);
      p.castShadow = false;
    }
    // legs
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(0.18, y - 0.16, 0.18, M.darkWood, lx * (L / 2 - 0.1), (y - 0.16) / 2, lz * (Wd / 2 - 0.05), { group: g });
    this.addCollider(cx, cz, L + 0.6, Wd + 0.6);
    // a few balls on the table while nobody is betting on it
    this.poolDecor = new THREE.Group(); g.add(this.poolDecor);
    this.poolBalls = [];
    const ballGeo = new THREE.SphereGeometry(0.0286, 14, 10);
    [[0xf7f3e8, -0.6, 0.1], [0xf2c200, 0.3, -0.2], [0xd62828, 0.5, 0.25], [0x1d4fd8, -0.1, 0.3], [0x111111, 0.7, -0.05], [0x1b7a3f, 0.05, -0.4]].forEach(([c, u, v]) => {
      const m = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.25 }));
      m.position.set(u, y + 0.02 + 0.0286, v); m.castShadow = true;
      this.poolDecor.add(m); this.poolBalls.push(m);
    });
    // cue rack on the east wall
    for (let i = 0; i < 4; i++) { const c = this.cyl(0.008, 0.016, 1.45, M.wood, ROOM.maxX - 0.08, 1.0, 1.0 + i * 0.18, 6); c.castShadow = false; }
    this.stations.push({
      id: 'billiards', gameId: 'billiards', label: 'Billiards', blurb: 'Eight-ball against the local shark. Pot your group, then the 8. Loser buys.',
      pos: new THREE.Vector3(cx, 0, cz + 1.55), look: new THREE.Vector3(cx, 0.85, cz), radius: 1.3,
    });
  }

  buildDarts() {
    const { mats: M } = this;
    const z = -2.4, y = 1.73, x = ROOM.maxX - 0.05;
    const cab = this.box(0.08, 1.2, 1.1, M.darkWood, x - 0.02, y, z, { shadow: false });
    const board = new THREE.Mesh(new THREE.CylinderGeometry(0.2255, 0.2255, 0.04, 40), new THREE.MeshStandardMaterial({ map: T.dartboard(), roughness: 0.9 }));
    // cylinder axis -> world -x (cap faces the room); extra local-Y turn so the 20 sits at the top
    board.rotation.set(0, Math.PI / 2, Math.PI / 2, 'ZYX');
    board.position.set(x - 0.08, y, z);
    this.group.add(board);
    // scoring radius: texture ring outer edge = 0.47 of the 0.451m texture span
    this.dartboard = { pos: new THREE.Vector3(x - 0.1, y, z), normal: new THREE.Vector3(-1, 0, 0), R: 0.2255 * 0.94, x: x - 0.1 };
    // oche (throw line) 2.37m from the board face
    const oche = this.box(0.04, 0.01, 0.9, new THREE.MeshStandardMaterial({ color: 0xd8d0b0 }), x - 0.1 - 2.37, 0.006, z, { shadow: false });
    oche.receiveShadow = false;
    // chalk scoreboard
    const cb = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshStandardMaterial({ map: T.chalkboard() }));
    cb.position.set(x - 0.001, 1.75, z + 1.1); cb.rotation.y = -Math.PI / 2; this.group.add(cb);
    this.stations.push({
      id: 'darts', gameId: 'darts', label: 'Darts', blurb: 'Three darts each, highest total takes it. The regular throws first.',
      pos: new THREE.Vector3(x - 0.1 - 2.37 - 0.15, 0, z), look: new THREE.Vector3(x, y, z), radius: 1.1,
    });
  }

  buildFoosball() {
    const { mats: M } = this;
    const cx = -4.6, cz = 0.4, L = 1.2, Wd = 0.7, y = 0.9;
    const g = new THREE.Group(); g.position.set(cx, 0, cz); this.group.add(g);
    this.foos = { group: g, cx, cz, L, W: Wd, y };
    this.box(L + 0.16, 0.12, Wd + 0.16, M.darkWood, 0, y - 0.19, 0, { group: g });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(Wd, L), new THREE.MeshStandardMaterial({ map: T.foosballPitch(), roughness: 0.9 }));
    pitch.rotation.set(-Math.PI / 2, 0, Math.PI / 2); pitch.position.y = y - 0.129; pitch.receiveShadow = true; g.add(pitch);
    // walls of the box (open top)
    this.box(L + 0.16, 0.14, 0.08, M.darkWood, 0, y - 0.07, -(Wd / 2 + 0.04), { group: g });
    this.box(L + 0.16, 0.14, 0.08, M.darkWood, 0, y - 0.07, Wd / 2 + 0.04, { group: g });
    this.box(0.08, 0.14, Wd + 0.16, M.darkWood, -(L / 2 + 0.04), y - 0.07, 0, { group: g });
    this.box(0.08, 0.14, Wd + 0.16, M.darkWood, L / 2 + 0.04, y - 0.07, 0, { group: g });
    // goals
    for (const s of [-1, 1]) this.box(0.02, 0.08, 0.2, M.black, s * (L / 2 + 0.03), y - 0.09, 0, { group: g });
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(0.08, y - 0.22, 0.08, M.metal, lx * (L / 2 - 0.1), (y - 0.22) / 2, lz * (Wd / 2 - 0.05), { group: g });
    this.addCollider(cx, cz, L + 0.5, Wd + 0.6);
    this.foosDecor = new THREE.Group(); g.add(this.foosDecor);
    this.foosRods = [];
    const rodMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.9, roughness: 0.3 });
    const rows = [[-0.525, 'you', 1], [-0.375, 'you', 2], [-0.225, 'bot', 3], [-0.075, 'you', 5], [0.075, 'bot', 5], [0.225, 'you', 3], [0.375, 'bot', 2], [0.525, 'bot', 1]];
    const offs = { 1: [0], 2: [-0.12, 0.12], 3: [-0.18, 0, 0.18], 5: [-0.24, -0.12, 0, 0.12, 0.24] };
    const manMat = { you: new THREE.MeshStandardMaterial({ color: 0x2b5fd9 }), bot: new THREE.MeshStandardMaterial({ color: 0xd93b2b }) };
    for (const [rx, team, n] of rows) {
      const rg = new THREE.Group(); rg.position.set(rx, y - 0.06, 0); this.foosDecor.add(rg);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, Wd + 0.36, 8), rodMat);
      rod.rotation.x = Math.PI / 2; rod.position.z = team === 'you' ? 0.18 : -0.18; rg.add(rod);
      const men = new THREE.Group(); rg.add(men);
      for (const o of offs[n]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.026), manMat[team]); m.position.set(0, -0.04, o); men.add(m); }
      this.foosRods.push({ team, men, w: 0 });
    }
    this.foosBall = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf4efe0 }));
    this.foosBall.position.set(0.1, y - 0.129 + 0.017, 0.05); this.foosDecor.add(this.foosBall);
    this.stations.push({
      id: 'foosball', gameId: 'foosball', label: 'Foosball', blurb: 'First to three goals. Spin wisely; the table is older than you.',
      pos: new THREE.Vector3(cx, 0, cz + Wd / 2 + 0.75), look: new THREE.Vector3(cx, y - 0.1, cz), radius: 1.1,
    });
  }

  buildTables() {
    const { mats: M } = this;
    this.tables = [];
    this.chairs = [];
    for (const [x, z] of [[-1.6, 3.2], [1.9, 3.6], [-6.6, -2.4], [6.2, -4.3]]) {
      this.cyl(0.42, 0.42, 0.04, M.wood, x, 0.74, z, 18);
      this.cyl(0.03, 0.03, 0.72, M.metal, x, 0.36, z, 8);
      this.cyl(0.25, 0.3, 0.03, M.metal, x, 0.015, z, 14);
      this.addCollider(x, z, 0.9, 0.9);
      this.tables.push({ x, z });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + x;
        this.chair(x + Math.cos(a) * 0.7, z + Math.sin(a) * 0.7, a + Math.PI);
        this.chairs.push({ x: x + Math.cos(a) * 0.72, z: z + Math.sin(a) * 0.72, tx: x, tz: z, table: this.tables.length - 1 });
      }
      this.glass(x + 0.15, 0.76, z - 0.1, true);
      const b = this.bottle(x - 0.2, 0.76, z + 0.12, 1);
      this.props.push({ mesh: b, kind: 'bottle' });
      this.props.push({ mesh: this.glass(x - 0.05, 0.76, z + 0.25, false), kind: 'glass' });
    }
    // bottles on the bar counter are throwable too
    for (let i = 0; i < 3; i++) this.props.push({ mesh: this.bottle(-3.5 + i * 2.6, this.barTopY, this.barZ + 0.2, i), kind: 'bottle' });
  }

  chair(x, z, rot) {
    const { mats: M } = this;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -rot + Math.PI / 2; this.group.add(g);
    this.box(0.4, 0.04, 0.4, M.darkWood, 0, 0.46, 0, { group: g });
    this.box(0.4, 0.45, 0.04, M.darkWood, 0, 0.7, -0.18, { group: g });
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(0.04, 0.46, 0.04, M.darkWood, lx * 0.17, 0.23, lz * 0.17, { group: g, shadow: false });
    this.addCollider(x, z, 0.3, 0.3);
  }

  buildJukebox() {
    const { mats: M } = this;
    const x = 7.15, z = 4.75;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -Math.PI * 0.75; this.group.add(g);
    this.box(0.9, 1.5, 0.6, new THREE.MeshStandardMaterial({ color: 0x5a1a1a, roughness: 0.5 }), 0, 0.75, 0, { group: g });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 16, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x5a1a1a, roughness: 0.5 }));
    top.rotation.set(Math.PI / 2, 0, Math.PI / 2); top.rotation.z = 0; top.position.y = 1.5; top.rotation.x = Math.PI / 2; g.add(top);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: 0xffd080, emissive: 0xff9040, emissiveIntensity: 1.2 }));
    glow.position.set(0, 1.05, 0.31); g.add(glow);
    const tube = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 8, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0xff5a8c, emissive: 0xff5a8c, emissiveIntensity: 2 }));
    tube.position.set(0, 1.5, 0.3); g.add(tube);
    const light = new THREE.PointLight(0xff8a5a, this.lowEnd ? 1.5 : 3, 4, 2); light.position.set(0, 1.3, 0.8); g.add(light);
    this.addCollider(x, z, 1.1, 1.1);
    this.jukebox = g;
  }

  buildDecor() {
    const { mats: M } = this;
    // neon sign above the back bar
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshBasicMaterial({ map: T.neonText('Fox & Fiddle'), transparent: true }));
    sign.position.set(-0.5, 2.85, ROOM.minZ + 0.06); this.group.add(sign);
    this.neon = sign;
    // posters
    const posters = [
      [T.poster('LIVE MUSIC', 'every Friday, the Lonesome Pines'), -7.2, 1.9, ROOM.minZ + 0.12, 0],
      [T.poster('FOX & FIDDLE', 'est. 1974 · cold beer · warm welcome', '#2a3a5a'), 2.5, 1.9, ROOM.maxZ - 0.12, Math.PI],
      [T.poster('NO FIGHTING', '(we mean it, Mick)', '#3a3a3a'), ROOM.maxX - 0.12, 1.9, 3.0, -Math.PI / 2],
      [T.poster('DARTS LEAGUE', 'Tuesdays · sign up at the bar', '#5a3a1a'), ROOM.maxX - 0.12, 1.9, -0.5, -Math.PI / 2],
      [T.poster('HAPPY HOUR', '5 til 7 · half price regrets', '#1a4a3a'), ROOM.minX + 0.12, 1.9, 2.5, Math.PI / 2],
    ];
    for (const [tex, x, y, z, ry] of posters) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      p.position.set(x, y, z); p.rotation.y = ry; this.group.add(p);
    }
    // ceiling fan
    const fan = new THREE.Group(); fan.position.set(0.5, ROOM.height - 0.35, 1.0); this.group.add(fan);
    this.cyl(0.04, 0.04, 0.35, M.metal, 0, 0.17, 0, 8, fan);
    for (let i = 0; i < 4; i++) { const b = this.box(0.9, 0.02, 0.14, M.darkWood, 0, 0, 0, { group: fan, shadow: false }); b.position.x = Math.cos(i * Math.PI / 2) * 0.5; b.position.z = Math.sin(i * Math.PI / 2) * 0.5; b.rotation.y = -i * Math.PI / 2; }
    this.fan = fan;
    // TV in the corner
    const tv = this.box(0.9, 0.55, 0.06, M.black, -7.0, 2.4, ROOM.minZ + 0.5, { shadow: false });
    tv.rotation.y = 0.5;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.47), new THREE.MeshStandardMaterial({ color: 0x244a6a, emissive: 0x2a6a9a, emissiveIntensity: 0.8 }));
    screen.position.set(-6.98, 2.4, ROOM.minZ + 0.52); screen.rotation.y = 0.5; screen.position.x += Math.sin(0.5) * 0.035; screen.position.z += Math.cos(0.5) * 0.035;
    this.group.add(screen);
    // pipes along the ceiling
    for (const z of [-4.6, 4.8]) { const p = this.cyl(0.05, 0.05, 15.6, M.metal, 0, ROOM.height - 0.3, z, 8); p.rotation.z = Math.PI / 2; p.castShadow = false; }
    // a radiator and a plant for good measure
    this.box(0.9, 0.6, 0.12, M.metal, -0.5, 0.35, ROOM.maxZ - 0.1, { shadow: false });
    const pot = this.cyl(0.18, 0.14, 0.3, new THREE.MeshStandardMaterial({ color: 0x7a4a2a }), ROOM.minX + 0.4, 0.15, ROOM.maxZ - 0.4, 10);
    const plant = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 7), new THREE.MeshStandardMaterial({ color: 0x2f6a2a, roughness: 1 }));
    plant.position.set(ROOM.minX + 0.4, 0.75, ROOM.maxZ - 0.4); plant.castShadow = true; this.group.add(plant);
    this.addCollider(ROOM.minX + 0.4, ROOM.maxZ - 0.4, 0.6, 0.6);
  }

  buildLights() {
    const low = this.lowEnd;
    this.scene.add(new THREE.AmbientLight(0xffb070, low ? 0.45 : 0.32));
    const hemi = new THREE.HemisphereLight(0xffd0a0, 0x1a0e08, low ? 0.5 : 0.42); this.scene.add(hemi);
    const pendant = (x, y, z, color = 0xffb060, intensity = 6, dist = 7, shadow = false) => {
      const g = new THREE.Group(); g.position.set(x, y, z); this.group.add(g);
      const cord = this.cyl(0.006, 0.006, ROOM.height - y, this.mats.black, 0, (ROOM.height - y) / 2, 0, 4, g); cord.castShadow = false;
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a4a3a, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }));
      shade.position.y = 0.05; g.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xffc070, emissiveIntensity: 3 }));
      bulb.position.y = -0.02; g.add(bulb);
      if (low && intensity < 4) return g; // low-end: small pendants are emissive only, fewer lights in the shader
      const l = new THREE.PointLight(color, low ? intensity * 0.8 : intensity, dist, 2);
      l.position.y = -0.08;
      if (shadow && !low) { l.castShadow = true; l.shadow.mapSize.set(512, 512); l.shadow.bias = -0.004; }
      g.add(l);
      this.lights.push(l);
      return g;
    };
    pendant(-3, 2.3, -3.6); pendant(-0.5, 2.3, -3.6, 0xffb060, 6, 7, true); pendant(2, 2.3, -3.6);
    pendant(this.pool.cx - 0.6, 2.0, this.pool.cz, 0xffd090, 5, 5, true); pendant(this.pool.cx + 0.6, 2.0, this.pool.cz, 0xffd090, 5, 5);
    for (const t of this.tables) pendant(t.x, 2.2, t.z, 0xffa050, 3.5, 5);
    pendant(this.foos.cx, 2.2, this.foos.cz, 0xffc080, 4, 5);
    pendant(-3.6, 2.4, 4.0, 0xffb060, 3.5, 6); pendant(5.6, 2.3, 3.6, 0xffb060, 3, 6);
    // wall lamp over the coat rack so the entrance reads
    const sconce = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xffc070, emissiveIntensity: 2.5, side: THREE.DoubleSide }));
    sconce.position.set(ROOM.minX + 0.08, 2.2, 4.4); sconce.rotation.y = Math.PI / 2; this.group.add(sconce);
    const sconceL = new THREE.PointLight(0xffc080, 6, 5, 2); sconceL.position.set(ROOM.minX + 0.35, 2.1, 4.4); this.group.add(sconceL);
    // dartboard spot
    const spot = new THREE.SpotLight(0xfff0d0, low ? 3 : 4.5, 6, 0.7, 0.9, 1.2);
    spot.position.set(ROOM.maxX - 1.6, 3.0, this.dartboard.pos.z); spot.target.position.copy(this.dartboard.pos);
    this.group.add(spot, spot.target);
    // neon glow
    const neonL = new THREE.PointLight(0xff5a8c, low ? 4 : 8, 6, 2); neonL.position.set(-0.5, 2.7, ROOM.minZ + 0.6); this.group.add(neonL);
    const openL = new THREE.PointLight(0x4fd9ff, 3, 4, 2); openL.position.set(-2.4, 2.0, ROOM.maxZ - 0.5); this.group.add(openL);
    this.neonLight = neonL;
  }

  buildPatrons() {
    const add = (opts, x, z, lookX, lookZ, sit = false) => {
      const p = new Patron(opts);
      p.root.position.set(x, 0, z);
      if (sit) p.sit();
      p.lookAt(new THREE.Vector3(lookX, 0, lookZ));
      this.group.add(p.root);
      this.patrons.push(p);
      return p;
    };
    // bartender
    this.bartender = add({ name: 'Dee', female: true, shirt: 0x111111, height: 0.98 }, -0.8, -4.95, -0.8, 0);
    // Sal, the drinking contest regular, at the left end of the bar
    this.sal = add({ name: 'Sal', shirt: 0x6b4a2a, height: 1.03 }, this.stoolX[0], this.barZ + 0.85, this.stoolX[0], -6, true);
    this.stations.push({
      id: 'drinking', gameId: 'drinking', label: 'Drinking contest with Sal', blurb: 'Round for round with the bar\'s most dedicated regular. Cash out while you can still see.',
      pos: new THREE.Vector3(this.stoolX[2], 0, this.barZ + 1.5), look: new THREE.Vector3(this.stoolX[0], 1.3, this.barZ + 0.85), radius: 1.2, patron: this.sal, patrons: [this.sal, this.bartender],
      seat: new THREE.Vector3(this.stoolX[2], 0, this.barZ + 0.85),
    });
    // the regulars: the NPC director decides where they go
    for (const o of [{ name: 'Earl', height: 0.97 }, { name: 'Marge', female: true, height: 0.95 }, { name: 'Lou' }, { name: 'Benny' },
      { name: 'Vic', shirt: 0x9a6a2a, height: 1.02 }, { name: 'Pearl', female: true, shirt: 0x2a6b6b, height: 0.96 }, { name: 'Rudy', shirt: 0x7a3a6b, height: 0.99 },
      { name: 'Gus', shirt: 0x4a4a4a, height: 1.0 }, { name: 'Nell', female: true, shirt: 0x8a2b2b, height: 0.94 }, { name: 'Frank', height: 1.03 }]) add(o, 0, 0, 0, 1);
    // Big Mick and his mates, standing mid-room
    this.mick = add({ name: 'Big Mick', shirt: 0x4a4a4a, skin: 0xd9a278, height: 1.12 }, 1.0, -0.6, 1.0, 3);
    this.mates = [
      add({ name: 'Tiny', shirt: 0x8a2b2b, height: 1.0 }, 2.0, -1.0, 1.0, -0.6),
      add({ name: 'Doug', shirt: 0x2c4a7a, height: 1.04 }, 0.1, -1.3, 1.0, -0.6),
      add({ name: 'Sharkey', shirt: 0x3d6b3a, height: 1.06 }, 2.9, -0.2, 1.0, -0.6),
    ];
    this.stations.push({
      id: 'barfight', gameId: 'barfight', label: 'Pick a fight with Big Mick', blurb: 'He has been eyeing your stool all night. His mates may or may not stay out of it.',
      pos: new THREE.Vector3(1.0, 0, 1.0), look: new THREE.Vector3(1.0, 1.5, -0.6), radius: 1.4, patron: this.mick, patrons: [this.mick, ...this.mates],
    });
    // Rose by the jukebox
    this.rose = add({ name: 'Rose', female: true, shirt: 0x7a3a6b, hair: 0x8a1a1a, height: 0.97 }, 6.35, 4.1, 7.15, 4.75);
    this.stations.push({
      id: 'pickup', gameId: 'pickup', label: 'Talk to Rose', blurb: 'She is picking a song. Pick a line. Keep going, or ask her to get out of here.',
      pos: new THREE.Vector3(5.2, 0, 3.3), look: new THREE.Vector3(6.35, 1.45, 4.1), radius: 1.3, patron: this.rose, patrons: [this.rose],
    });
  }

  update(dt, t) {
    for (const p of this.patrons) p.update(dt);
    this.fan.rotation.y += dt * 2.2;
    // neon flicker
    const f = 0.92 + Math.sin(t * 17) * 0.03 + (Math.sin(t * 61) > 0.97 ? -0.3 : 0);
    this.neon.material.opacity = f;
    this.neonLight.intensity = (this.lowEnd ? 4 : 8) * f;
  }
}

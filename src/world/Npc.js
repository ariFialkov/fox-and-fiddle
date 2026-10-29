/**
 * NPC director: keeps the regulars busy. Each patron runs an activity (sit at the bar, drink at a
 * table, stand and talk, shoot pool, throw darts, play foosball, a drinking contest, the odd
 * brawl, or just milling about). Activities are small state machines that walk patrons along a
 * waypoint graph, set poses and fire one-shot animations. Mini-games claim patrons (`busy`) or
 * evict activities from a station while they run.
 */
import * as THREE from 'three';
import { Patron } from './Patron.js';
import { wrap, turnToward } from '../engine/Player.js';

const NODES = [
  [-5.0, 4.0], [-3.2, 2.6], [-6.0, 1.5], [-6.3, -0.8], [-3.0, -1.6], [-1.0, -2.3], [1.5, -2.4], [3.9, -2.6],
  [5.6, -1.0], [6.9, 1.2], [6.3, 3.0], [4.0, 3.3], [0.3, 1.6], [-1.6, 0.1], [2.2, 0.9], [-4.6, -2.3], [5.0, -4.3],
];
const STAND_SPOTS = [
  [[-2.3, 0.7, 0.9], [-1.5, 1.0, -2.2]],
  [[-6.4, 3.4, 2.2], [-6.9, 2.7, -0.9]],
  [[4.3, -3.6, 2.5], [4.9, -3.1, -0.6]],
  [[6.6, 0.2, 2.8], [6.1, -0.4, -0.3]],
];

export class NpcDirector {
  constructor(bar, scene, player) {
    this.bar = bar; this.scene = scene; this.player = player;
    this.t = 0;
    this.nodes = NODES.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.edges = this.nodes.map((a, i) => this.nodes.map((b, j) => i !== j && a.distanceTo(b) < 5.5 && this.clear(a, b)).map((ok, j) => ok ? j : -1).filter((j) => j >= 0));
    this.npcs = [];
    this.sessions = [];    // group activities in progress
    this.lastBrawl = 0;
    this.fx = new THREE.Group(); scene.add(this.fx);
    this.setup();
  }

  // ---------- navigation ----------
  clear(a, b, margin = 0.4) {
    const steps = Math.ceil(a.distanceTo(b) / 0.15);
    for (let i = 0; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps;
      for (const c of this.bar.colliders) {
        if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin) return false;
      }
    }
    return true;
  }
  nearestNode(p) {
    let best = -1, bd = Infinity;
    this.nodes.forEach((n, i) => { const d = n.distanceTo(p); if (d < bd && this.clear(p, n, 0.3)) { bd = d; best = i; } });
    if (best < 0) this.nodes.forEach((n, i) => { const d = n.distanceTo(p); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  path(from, to) {
    if (this.clear(from, to, 0.3)) return [to.clone()];
    const s = this.nearestNode(from), e = this.nearestNode(to);
    const prev = new Map([[s, null]]); const q = [s];
    while (q.length) {
      const n = q.shift(); if (n === e) break;
      for (const m of this.edges[n]) if (!prev.has(m)) { prev.set(m, n); q.push(m); }
    }
    const out = [];
    if (prev.has(e)) { let n = e; while (n != null) { out.unshift(this.nodes[n].clone()); n = prev.get(n); } }
    out.push(to.clone());
    return out;
  }

  // ---------- setup ----------
  setup() {
    const b = this.bar;
    const mk = (patron, activity, opts = {}) => {
      const n = { patron, activity: null, path: null, target: null, face: null, speed: 0.95 + Math.random() * 0.3, yaw: yawOf(patron.root), timer: 0, state: 0, data: {}, fixed: !!opts.fixed, props: [] };
      this.npcs.push(n);
      this.begin(n, activity, { instant: true, ...opts });
      return n;
    };
    mk(b.sal, 'salBar', { fixed: true });
    mk(b.bartender, 'bartend', { fixed: true });
    mk(b.rose, 'juke', { fixed: true });
    mk(b.mick, 'mickGroup', { fixed: true, slot: 0 });
    b.mates.forEach((m, i) => mk(m, 'mickGroup', { fixed: true, slot: i + 1 }));
    // the regulars: start them in sensible places
    const free = b.patrons.filter((p) => ![b.sal, b.bartender, b.rose, b.mick, ...b.mates].includes(p));
    const starts = ['barSit', 'barSit', 'tableSit', 'tableSit', 'standTalk', 'standTalk', 'pool', 'pool', 'foos', 'foos', 'darts', 'wander'];
    free.forEach((p, i) => mk(p, starts[i % starts.length]));
  }

  // ---------- public hooks for mini-games ----------
  suspend(station) {
    const evict = { billiards: ['pool'], darts: ['darts'], foosball: ['foos'], drinking: ['contest'], barfight: ['brawl', 'standTalk'], pickup: [] }[station.gameId] || [];
    for (const n of this.npcs) {
      if (station.patrons?.includes(n.patron)) { n.patron.busy = true; this.end(n, true); continue; }
      if (evict.includes(n.activity)) this.begin(n, 'wander');
    }
    this.evicted = evict;
  }
  resume(station) {
    for (const n of this.npcs) {
      if (station.patrons?.includes(n.patron)) {
        n.patron.busy = false; n.patron.ko = 0; n.patron.slump = 0; n.patron.walk = 0;
        n.yaw = yawOf(n.patron.root);
        this.begin(n, n.fixed ? n.home : 'wander', { instant: true, slot: n.homeSlot });
      }
    }
    this.evicted = null;
  }

  // ---------- activity lifecycle ----------
  begin(n, name, opts = {}) {
    if (n.activity) this.end(n);
    n.activity = name; n.timer = 0; n.state = 0; n.data = { ...opts };
    if (n.fixed && !n.home) { n.home = name; n.homeSlot = opts.slot; }
    const act = ACTS[name];
    act.enter?.(this, n, opts);
  }
  end(n, keepPose = false) {
    const act = ACTS[n.activity];
    act?.exit?.(this, n);
    for (const pr of n.props) pr.parent?.remove(pr);
    n.props = [];
    if (n.patron.prop) n.patron.hold(null);
    if (!keepPose) { n.patron.pose = 'idle'; n.patron.headTarget = null; n.patron.slump = 0; }
    n.activity = null; n.path = null;
    const s = n.session; if (s) { s.members = s.members.filter((m) => m !== n); n.session = null; }
  }
  /** Pick something new to do. */
  choose(n) {
    const counts = {};
    for (const o of this.npcs) counts[o.activity] = (counts[o.activity] || 0) + 1;
    const options = [];
    const add = (name, w) => { if (w > 0) options.push([name, w]); };
    add('barSit', (counts.barSit || 0) < this.bar.stoolX.length - 3 ? 3 : 0);
    add('tableSit', (counts.tableSit || 0) < 8 ? 3 : 0);
    add('standTalk', (counts.standTalk || 0) < 4 ? 2.5 : 0);
    add('pool', (counts.pool || 0) < 2 && !this.evicted?.includes('pool') ? 2 : 0);
    add('foos', (counts.foos || 0) < 2 && !this.evicted?.includes('foos') ? 1.5 : 0);
    add('darts', (counts.darts || 0) < 1 && !this.evicted?.includes('darts') ? 1.5 : 0);
    add('contest', (counts.contest || 0) < 2 && !this.evicted?.includes('contest') ? 1.2 : 0);
    add('wander', 1.5);
    add('brawl', (counts.brawl || 0) < 2 && this.t - this.lastBrawl > 90 && !this.evicted?.includes('brawl') ? 1.4 : 0);
    let total = options.reduce((s, o) => s + o[1], 0), r = Math.random() * total;
    for (const [name, w] of options) { r -= w; if (r <= 0) { this.begin(n, name); return; } }
    this.begin(n, 'wander');
  }

  // ---------- walking ----------
  goTo(n, target, face = null) {
    const from = n.patron.root.position;
    n.path = this.path(from, target);
    n.target = target.clone(); n.face = face;
  }
  arrived(n) { return !n.path; }
  walk(n, dt) {
    const p = n.patron, pos = p.root.position;
    if (!n.path) { p.walk = THREE.MathUtils.damp(p.walk, 0, 8, dt); this.faceToward(n, n.face, dt); return; }
    const next = n.path[0];
    const dx = next.x - pos.x, dz = next.z - pos.z;
    const d = Math.hypot(dx, dz);
    const last = n.path.length === 1;
    if (d < (last ? 0.06 : 0.25)) {
      n.path.shift();
      if (!n.path.length) { n.path = null; pos.x = next.x; pos.z = next.z; return; }
      return;
    }
    // steering: toward the waypoint, away from other patrons and the player
    let sx = dx / d, sz = dz / d;
    for (const o of this.bar.patrons) {
      if (o === p) continue;
      const ox = pos.x - o.root.position.x, oz = pos.z - o.root.position.z, od = Math.hypot(ox, oz);
      if (od < 0.7 && od > 0) { sx += ox / od * (0.7 - od) * 2.5; sz += oz / od * (0.7 - od) * 2.5; }
    }
    const pl = this.player.pos;
    const px = pos.x - pl.x, pz = pos.z - pl.z, pd = Math.hypot(px, pz);
    if (pd < 0.9 && pd > 0) { sx += px / pd * (0.9 - pd) * 3; sz += pz / pd * (0.9 - pd) * 3; }
    const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
    const speed = n.speed * (last && d < 0.5 ? Math.max(0.35, d / 0.5) : 1);
    const nx = pos.x + sx * speed * dt, nz = pos.z + sz * speed * dt;
    const blockedN = this.player.blocked(nx, nz, p, 0.28);
    if (!blockedN) { pos.x = nx; pos.z = nz; }
    else {
      // slide: try each axis
      if (!this.player.blocked(nx, pos.z, p, 0.28)) pos.x = nx;
      else if (!this.player.blocked(pos.x, nz, p, 0.28)) pos.z = nz;
      n.stuck = (n.stuck || 0) + dt;
      if (n.stuck > 2.5) { n.stuck = 0; n.path = null; return; }
    }
    p.walk = THREE.MathUtils.damp(p.walk, Math.min(1, speed / 1.1), 8, dt);
    p.walkPhase += speed * dt / 0.36 * Math.PI;
    n.yaw = turnToward(n.yaw, Math.atan2(sx, sz), 6 * dt);
    p.root.rotation.set(0, n.yaw, 0);
  }
  faceToward(n, target, dt) {
    if (!target) return;
    const pos = n.patron.root.position;
    const want = target.isVector3 ? Math.atan2(target.x - pos.x, target.z - pos.z) : target;
    n.yaw = turnToward(n.yaw, want, 4 * dt);
    n.patron.root.rotation.set(0, n.yaw, 0);
  }

  // ---------- props ----------
  glassFor(n, pint = true) {
    const g = this.bar.glass(0, 0, 0, pint, this.fx);
    n.patron.holdGlass(g); n.props.push(g);
    return g;
  }
  cueFor(n) {
    const cue = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.013, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.5 }));
    n.patron.hold(cue, 1, [0, -0.05, 0.2], [Math.PI / 2 + 0.1, 0, 0]);
    n.props.push(cue);
    return cue;
  }
  flyDart(from, to, color = 0xdd3333) {
    const d = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 }));
    shaft.rotation.x = Math.PI / 2; shaft.position.z = -0.03;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.03), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
    fl.position.set(0, 0.012, -0.1);
    d.add(shaft, fl);
    this.fx.add(d);
    const ctrl = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.2, 0));
    this.flights = this.flights || [];
    this.flights.push({ d, from, to, ctrl, t: 0 });
    return d;
  }

  // ---------- main update ----------
  update(dt) {
    this.t += dt;
    for (const n of this.npcs) {
      if (n.patron.busy) continue;
      if (!n.activity) { this.choose(n); continue; }
      n.timer += dt;
      this.walk(n, dt);
      const done = ACTS[n.activity].update(this, n, dt);
      if (done) { this.end(n); this.choose(n); }
    }
    // dart flights
    if (this.flights) {
      for (const f of this.flights) {
        f.t += dt / 0.45;
        const k = Math.min(1, f.t);
        f.d.position.set(0, 0, 0).addScaledVector(f.from, (1 - k) * (1 - k)).addScaledVector(f.ctrl, 2 * (1 - k) * k).addScaledVector(f.to, k * k);
        f.d.lookAt(f.to.clone().add(new THREE.Vector3(1, 0, 0)));
      }
      this.flights = this.flights.filter((f) => f.t < 1 || (f.keep = true));
    }
    // decorative pool balls rolling
    for (const ball of this.bar.poolBalls) {
      if (!ball.userData.vel) continue;
      const v = ball.userData.vel, pool = this.bar.pool;
      ball.position.x += v.x * dt; ball.position.z += v.z * dt;
      const u = ball.position.x - pool.cx, w = ball.position.z - pool.cz;
      if (Math.abs(u) > pool.L / 2 - 0.03) { v.x *= -0.7; ball.position.x = pool.cx + Math.sign(u) * (pool.L / 2 - 0.03); }
      if (Math.abs(w) > pool.W / 2 - 0.03) { v.z *= -0.7; ball.position.z = pool.cz + Math.sign(w) * (pool.W / 2 - 0.03); }
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0) { const ns = Math.max(0, sp - 0.5 * dt); v.x *= ns / sp; v.z *= ns / sp; if (ns === 0) ball.userData.vel = null; }
      ball.rotation.x += v.z * dt / 0.028; ball.rotation.z -= v.x * dt / 0.028;
    }
    // foosball decor rods settle
    for (const rod of this.bar.foosRods) { rod.w = (rod.w || 0) * Math.exp(-3 * dt); rod.men.rotation.z += rod.w * dt; }
  }

  /** Find or create a two-person session for an activity. */
  session(n, name, max = 2) {
    let s = this.sessions.find((x) => x.name === name && x.members.length < max && !x.closed);
    if (!s) { s = { name, members: [], t: 0, data: {} }; this.sessions.push(s); }
    s.members.push(n); n.session = s;
    this.sessions = this.sessions.filter((x) => x.members.length);
    return s;
  }
  partner(n) { return n.session?.members.find((m) => m !== n) || null; }
  headAt(p) { return new THREE.Vector3(p.root.position.x, 1.5 * p.height, p.root.position.z); }
  randomPatronNear(n, r = 5) {
    const c = this.bar.patrons.filter((p) => p !== n.patron && p.root.position.distanceTo(n.patron.root.position) < r);
    return c.length ? c[Math.floor(Math.random() * c.length)] : null;
  }
  /** Everyone within `r` looks at a point for a while. */
  attention(point, r = 4.5, except = []) {
    for (const o of this.npcs) {
      if (except.includes(o) || o.patron.busy) continue;
      if (o.patron.root.position.distanceTo(point) < r) { o.patron.headTarget = point.clone(); o.data.lookUntil = this.t + 6 + Math.random() * 4; }
    }
  }
}

function yawOf(obj) { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion); return Math.atan2(f.x, f.z); }
const rr = (a, b) => a + Math.random() * (b - a);
const chance = (dt, perSec) => Math.random() < dt * perSec;

/** Shared "chat" behaviour: look at a partner, gesture, nod, laugh. */
function chatter(dir, n, dt, partnerPatron) {
  const p = n.patron;
  if (partnerPatron) p.headTarget = dir.headAt(partnerPatron);
  else if (n.data.lookUntil && dir.t > n.data.lookUntil) { p.headTarget = null; n.data.lookUntil = 0; }
  if (chance(dt, 0.25)) p.gesture();
  if (chance(dt, 0.2)) p.nod();
  if (chance(dt, 0.07)) { p.laugh(); if (partnerPatron && Math.random() < 0.6) partnerPatron.laugh(); }
}

const ACTS = {
  // ---- fixed station characters ----
  salBar: {
    enter(dir, n) { const b = dir.bar; n.patron.root.position.set(b.stoolX[0], 0, b.barZ + 0.85); n.yaw = Math.PI; n.patron.root.rotation.set(0, Math.PI, 0); n.patron.sit(0.72); dir.glassFor(n, true); },
    update(dir, n, dt) {
      const p = n.patron;
      if (chance(dt, 0.12)) p.drink();
      if (chance(dt, 0.1)) { const o = dir.randomPatronNear(n, 4); p.headTarget = o ? dir.headAt(o) : null; }
      if (chance(dt, 0.04)) p.laugh();
      return false;
    },
  },
  bartend: {
    enter(dir, n) { n.patron.pose = 'bartend'; n.data.spots = [-3, -0.6, 2.2]; n.data.next = 1; n.patron.root.position.set(-0.6, 0, -4.95); n.yaw = 0; n.patron.root.rotation.set(0, 0, 0); },
    update(dir, n, dt) {
      const p = n.patron;
      if (dir.arrived(n)) {
        p.pose = 'bartend';
        if (chance(dt, 0.3)) p.gesture();
        if (chance(dt, 0.1)) { const o = dir.randomPatronNear(n, 4); p.headTarget = o ? dir.headAt(o) : null; }
        if (chance(dt, 0.06)) { const x = n.data.spots[Math.floor(Math.random() * 3)]; dir.goTo(n, new THREE.Vector3(x, 0, -4.95), 0); p.pose = 'idle'; }
      }
      return false;
    },
  },
  juke: {
    enter(dir, n) { const j = dir.bar.jukebox; n.patron.root.position.set(6.35, 0, 4.1); n.yaw = Math.atan2(j.position.x - 6.35, j.position.z - 4.1); n.patron.root.rotation.set(0, n.yaw, 0); n.patron.pose = 'juke'; n.patron.mood = 0.5; },
    update(dir, n, dt) {
      const p = n.patron;
      if (p.pose !== 'flirt') p.pose = 'juke';
      p.torso.rotation.z += Math.sin(dir.t * 3.2) * 0.03; // moving to the music
      if (chance(dt, 0.15)) p.gesture();
      if (chance(dt, 0.08)) { const o = dir.randomPatronNear(n, 5); p.headTarget = o ? dir.headAt(o) : null; }
      return false;
    },
  },
  mickGroup: {
    enter(dir, n, opts) {
      const spots = [[1.0, -0.6], [2.0, -1.0], [0.1, -1.3], [2.9, -0.2]];
      const [x, z] = spots[opts.slot ?? 0];
      n.patron.root.position.set(x, 0, z); n.patron.pose = 'talk';
      n.yaw = Math.atan2(1.3 - x, -0.8 - z); n.patron.root.rotation.set(0, n.yaw, 0);
      if (opts.slot === 0) n.yaw = Math.atan2(1.0 - x, 3 - z), n.patron.root.rotation.set(0, n.yaw, 0);
    },
    update(dir, n, dt) {
      const p = n.patron; p.pose = 'talk';
      const mates = [dir.bar.mick, ...dir.bar.mates].filter((m) => m !== p);
      if (chance(dt, 0.15)) p.headTarget = dir.headAt(mates[Math.floor(Math.random() * mates.length)]);
      chatter(dir, n, dt, null);
      return false;
    },
  },
  // ---- rotating activities ----
  wander: {
    enter(dir, n, opts) {
      const node = dir.nodes[Math.floor(Math.random() * dir.nodes.length)];
      const tgt = node.clone().add(new THREE.Vector3(rr(-0.4, 0.4), 0, rr(-0.4, 0.4)));
      if (opts.instant) n.patron.root.position.copy(tgt); else dir.goTo(n, tgt, null);
      n.data.linger = rr(3, 9);
    },
    update(dir, n, dt) {
      if (!dir.arrived(n)) return false;
      n.patron.pose = 'idle';
      if (chance(dt, 0.2)) { const o = dir.randomPatronNear(n, 6); n.patron.headTarget = o ? dir.headAt(o) : null; }
      n.data.linger -= dt;
      return n.data.linger <= 0;
    },
  },
  barSit: {
    enter(dir, n, opts) {
      const b = dir.bar;
      const taken = new Set(dir.npcs.filter((o) => o !== n && o.activity === 'barSit').map((o) => o.data.stool));
      const free = b.stoolX.map((x, i) => i).filter((i) => i >= 3 && !taken.has(i));
      if (!free.length) { n.data.fail = true; return; }
      const i = free[Math.floor(Math.random() * free.length)];
      n.data.stool = i;
      const seat = new THREE.Vector3(b.stoolX[i], 0, b.barZ + 0.85);
      if (opts.instant) { n.patron.root.position.copy(seat); n.yaw = Math.PI; n.patron.root.rotation.set(0, Math.PI, 0); n.patron.sit(0.72); dir.glassFor(n, Math.random() < 0.7); n.state = 1; }
      else dir.goTo(n, seat, Math.PI);
      n.data.until = rr(45, 120);
    },
    update(dir, n, dt) {
      if (n.data.fail) return true;
      const p = n.patron;
      if (!dir.arrived(n)) return false;
      if (n.state === 0) { if (Math.abs(wrap(n.yaw - Math.PI)) < 0.2) { p.sit(0.72); dir.glassFor(n, Math.random() < 0.7); n.state = 1; } return false; }
      if (chance(dt, 0.1)) p.drink();
      const neighbour = dir.npcs.find((o) => o !== n && (o.activity === 'barSit' || o.activity === 'salBar') && Math.abs(o.patron.root.position.x - p.root.position.x) < 1.0);
      if (neighbour) { if (chance(dt, 0.5)) chatter(dir, n, dt * 4, neighbour.patron); }
      else if (chance(dt, 0.08)) { const o = dir.randomPatronNear(n, 5); p.headTarget = o ? dir.headAt(o) : null; }
      if (n.timer > n.data.until) { p.stand(); p.hold(null); return true; }
      return false;
    },
  },
  tableSit: {
    enter(dir, n, opts) {
      const taken = new Set(dir.npcs.filter((o) => o !== n && o.activity === 'tableSit').map((o) => o.data.chair));
      const chairs = dir.bar.chairs.map((c, i) => i).filter((i) => !taken.has(i));
      if (!chairs.length) { n.data.fail = true; return; }
      // prefer a table that already has someone
      const busyTables = new Set(dir.npcs.filter((o) => o !== n && o.activity === 'tableSit').map((o) => dir.bar.chairs[o.data.chair].table));
      const pref = chairs.filter((i) => busyTables.has(dir.bar.chairs[i].table));
      const pool = pref.length && Math.random() < 0.7 ? pref : chairs;
      const i = pool[Math.floor(Math.random() * pool.length)];
      n.data.chair = i;
      const c = dir.bar.chairs[i];
      const seat = new THREE.Vector3(c.x, 0, c.z);
      const face = Math.atan2(c.tx - c.x, c.tz - c.z);
      if (opts.instant) { n.patron.root.position.copy(seat); n.yaw = face; n.patron.root.rotation.set(0, face, 0); n.patron.sit(0.46); dir.glassFor(n, true); n.state = 1; }
      else dir.goTo(n, seat, face);
      n.data.until = rr(45, 130);
    },
    update(dir, n, dt) {
      if (n.data.fail) return true;
      const p = n.patron, c = dir.bar.chairs[n.data.chair];
      if (!dir.arrived(n)) return false;
      if (n.state === 0) { const face = Math.atan2(c.tx - c.x, c.tz - c.z); if (Math.abs(wrap(n.yaw - face)) < 0.2) { p.sit(0.46); dir.glassFor(n, true); n.state = 1; } return false; }
      if (chance(dt, 0.09)) p.drink();
      const mates = dir.npcs.filter((o) => o !== n && o.activity === 'tableSit' && dir.bar.chairs[o.data.chair]?.table === c.table);
      if (mates.length) { const m = mates[Math.floor(Math.random() * mates.length)]; if (chance(dt, 0.6)) chatter(dir, n, dt * 3, m.patron); }
      else if (chance(dt, 0.08)) { const o = dir.randomPatronNear(n, 5); p.headTarget = o ? dir.headAt(o) : null; }
      if (n.timer > n.data.until) { p.stand(); p.hold(null); return true; }
      return false;
    },
  },
  standTalk: {
    enter(dir, n, opts) {
      const s = dir.session(n, 'standTalk');
      if (s.members.length === 1) {
        const used = new Set(dir.sessions.filter((x) => x !== s && x.name === 'standTalk').map((x) => x.data.spot));
        const free = STAND_SPOTS.map((_, i) => i).filter((i) => !used.has(i));
        s.data.spot = free.length ? free[Math.floor(Math.random() * free.length)] : Math.floor(Math.random() * STAND_SPOTS.length);
        s.data.until = rr(35, 90);
      }
      const [x, z, yaw] = STAND_SPOTS[s.data.spot][s.members.length - 1];
      const spot = new THREE.Vector3(x, 0, z);
      if (opts.instant) { n.patron.root.position.copy(spot); n.yaw = yaw; n.patron.root.rotation.set(0, yaw, 0); }
      else dir.goTo(n, spot, yaw);
    },
    update(dir, n, dt) {
      if (!dir.arrived(n)) return false;
      const other = dir.partner(n);
      n.patron.pose = other && dir.arrived(other) ? 'talk' : 'idle';
      chatter(dir, n, dt, other && dir.arrived(other) ? other.patron : null);
      if (n.session && n.session.t === 0) n.session.t = dir.t;
      if (n.session && dir.t - n.session.t > n.session.data.until) { n.session.closed = true; return true; }
      return false;
    },
    exit(dir, n) { if (n.session) n.session.closed = true; },
  },
  pool: {
    enter(dir, n, opts) {
      const s = dir.session(n, 'pool');
      const pool = dir.bar.pool;
      const idx = s.members.length - 1;
      const spot = new THREE.Vector3(pool.cx + (idx === 0 ? -pool.L / 2 - 0.7 : pool.L / 2 + 0.7), 0, pool.cz + 0.35);
      n.data.rest = spot; n.data.idx = idx;
      if (opts.instant) { n.patron.root.position.copy(spot); }
      else dir.goTo(n, spot, new THREE.Vector3(pool.cx, 0, pool.cz));
      n.data.until = rr(60, 150);
      s.data.turn = s.data.turn ?? 0; s.data.phase = s.data.phase || 'idle';
    },
    update(dir, n, dt) {
      const p = n.patron, s = n.session, pool = dir.bar.pool;
      if (!s) return true;
      if (!p.prop && dir.arrived(n)) dir.cueFor(n);
      const partner = dir.partner(n);
      const myTurn = s.data.turn === n.data.idx;
      if (!myTurn) {
        if (dir.arrived(n) && !n.data.returning) { p.pose = 'idle'; p.headTarget = partner ? dir.headAt(partner.patron) : null; }
        if (dir.arrived(n)) n.data.returning = false;
        if (chance(dt, 0.05)) p.nod();
        if (!partner && n.timer > 8) { // nobody came: practise alone
          s.data.turn = n.data.idx;
        }
      } else {
        // my shot: walk to a spot on the rail, lean, strike, roll a ball, hand over
        const d = n.data;
        if (!d.shotPhase) {
          const side = Math.random() < 0.5 ? -1 : 1;
          const u = rr(-pool.L / 2 + 0.3, pool.L / 2 - 0.3);
          d.shotSpot = new THREE.Vector3(pool.cx + u, 0, pool.cz + side * (pool.W / 2 + 0.55));
          dir.goTo(n, d.shotSpot, new THREE.Vector3(pool.cx + u * 0.3, 0, pool.cz));
          d.shotPhase = 'walk';
        } else if (d.shotPhase === 'walk' && dir.arrived(n)) { p.pose = 'lean'; d.shotPhase = 'aim'; d.aimT = rr(1.4, 2.6); p.headTarget = new THREE.Vector3(pool.cx, pool.y, pool.cz); }
        else if (d.shotPhase === 'aim') {
          d.aimT -= dt;
          if (d.aimT <= 0) { p.strike(); d.shotPhase = 'hit'; d.aimT = 0.35; }
        } else if (d.shotPhase === 'hit') {
          d.aimT -= dt;
          if (d.aimT <= 0) {
            const balls = dir.bar.poolBalls; const ball = balls[Math.floor(Math.random() * balls.length)];
            const a = Math.random() * Math.PI * 2, sp = rr(0.8, 2.2);
            ball.userData.vel = { x: Math.cos(a) * sp, z: Math.sin(a) * sp };
            if (Math.random() < 0.25) { p.cheer(); if (partner) partner.patron.stagger(); }
            d.shotPhase = 'watch'; d.aimT = 1.8; p.pose = 'idle';
          }
        } else if (d.shotPhase === 'watch') {
          d.aimT -= dt;
          if (d.aimT <= 0) { d.shotPhase = null; s.data.turn = partner ? partner.data.idx : n.data.idx; dir.goTo(n, d.rest, new THREE.Vector3(pool.cx, 0, pool.cz)); n.data.returning = true; }
        }
      }
      if (n.timer > n.data.until) return true;
      return false;
    },
    exit(dir, n) { n.patron.pose = 'idle'; },
  },
  darts: {
    enter(dir, n, opts) {
      const b = dir.bar.dartboard;
      const oche = new THREE.Vector3(b.x - 2.37 - 0.1, 0, b.pos.z);
      n.data.oche = oche; n.data.thrown = 0; n.data.wait = 1.5; n.data.darts = [];
      if (opts.instant) n.patron.root.position.copy(oche); else dir.goTo(n, oche, new THREE.Vector3(b.pos.x, 0, b.pos.z));
      n.data.until = rr(40, 100);
    },
    update(dir, n, dt) {
      const p = n.patron, d = n.data, b = dir.bar.dartboard;
      if (!dir.arrived(n)) return false;
      if (d.collecting) {
        p.pose = 'idle';
        d.wait -= dt;
        if (d.wait <= 0) { for (const dd of d.darts) dir.fx.remove(dd); d.darts = []; d.collecting = false; d.thrown = 0; dir.goTo(n, d.oche, new THREE.Vector3(b.pos.x, 0, b.pos.z)); d.wait = 1.5; }
        return false;
      }
      p.pose = 'darts'; p.headTarget = b.pos.clone();
      d.wait -= dt;
      if (d.wait <= 0) {
        p.throwDart();
        const from = p.root.position.clone().add(new THREE.Vector3(0.3, 1.45, -0.2));
        const r = Math.random() * 0.16, a = Math.random() * Math.PI * 2;
        const to = b.pos.clone().add(new THREE.Vector3(-0.045, Math.sin(a) * r, Math.cos(a) * r));
        const dart = dir.flyDart(from, to);
        d.darts.push(dart);
        d.thrown++; d.wait = d.thrown >= 3 ? 1.2 : rr(2, 3.2);
        if (d.thrown >= 3) { d.collecting = true; d.wait = 2.2; dir.goTo(n, new THREE.Vector3(b.x - 0.6, 0, b.pos.z), new THREE.Vector3(b.pos.x, 0, b.pos.z)); }
        if (Math.random() < 0.15) dir.after?.(0.5, () => p.cheer());
      }
      if (n.timer > n.data.until && !d.darts.length) return true;
      return false;
    },
    exit(dir, n) { for (const dd of n.data.darts || []) dir.fx.remove(dd); },
  },
  foos: {
    enter(dir, n, opts) {
      const s = dir.session(n, 'foos');
      const f = dir.bar.foos;
      const side = s.members.length === 1 ? 1 : -1;
      const spot = new THREE.Vector3(f.cx, 0, f.cz + side * (f.W / 2 + 0.55));
      n.data.side = side;
      if (opts.instant) { n.patron.root.position.copy(spot); n.yaw = side > 0 ? Math.PI : 0; n.patron.root.rotation.set(0, n.yaw, 0); }
      else dir.goTo(n, spot, new THREE.Vector3(f.cx, 0, f.cz));
      n.data.until = rr(40, 100);
    },
    update(dir, n, dt) {
      const p = n.patron;
      if (!dir.arrived(n)) return false;
      const partner = dir.partner(n);
      p.pose = 'foos';
      const f = dir.bar.foos; p.headTarget = new THREE.Vector3(f.cx + rr(-0.3, 0.3), f.y - 0.1, f.cz);
      if (chance(dt, 1.4)) { p.jerk(); const rods = dir.bar.foosRods.filter((r) => r.team === (n.data.side > 0 ? 'you' : 'bot')); const r = rods[Math.floor(Math.random() * rods.length)]; r.w = (Math.random() < 0.5 ? -1 : 1) * rr(6, 18); r.men.position.z = THREE.MathUtils.clamp(r.men.position.z + rr(-0.06, 0.06), -0.12, 0.12); }
      if (chance(dt, 0.06)) { p.cheer(); if (partner) partner.patron.stagger(); }
      if (chance(dt, 2)) { const ball = dir.bar.foosBall; ball.position.x = THREE.MathUtils.clamp(ball.position.x + rr(-0.12, 0.12), f.cx - 0.55, f.cx + 0.55); ball.position.z = THREE.MathUtils.clamp(ball.position.z + rr(-0.08, 0.08), f.cz - 0.3, f.cz + 0.3); }
      if (n.timer > n.data.until) return true;
      return false;
    },
  },
  contest: {
    enter(dir, n, opts) {
      const s = dir.session(n, 'contest');
      const b = dir.bar;
      if (s.members.length === 1) {
        const taken = new Set(dir.npcs.filter((o) => o.activity === 'barSit').map((o) => o.data.stool));
        const pairs = []; for (let i = 3; i < b.stoolX.length - 1; i++) if (!taken.has(i) && !taken.has(i + 1)) pairs.push(i);
        s.data.stool = pairs.length ? pairs[Math.floor(Math.random() * pairs.length)] : b.stoolX.length - 2;
        s.data.round = 0; s.data.next = 0;
      }
      const i = s.data.stool + s.members.length - 1;
      n.data.stool = i;
      const seat = new THREE.Vector3(b.stoolX[i], 0, b.barZ + 0.85);
      if (opts.instant) { n.patron.root.position.copy(seat); n.yaw = Math.PI; n.patron.root.rotation.set(0, Math.PI, 0); n.patron.sit(0.72); dir.glassFor(n, false); n.state = 1; }
      else dir.goTo(n, seat, Math.PI);
      n.data.rounds = Math.floor(rr(5, 9));
    },
    update(dir, n, dt) {
      const p = n.patron, s = n.session;
      if (!s) return true;
      if (!dir.arrived(n)) return false;
      if (n.state === 0) { if (Math.abs(wrap(n.yaw - Math.PI)) < 0.2) { p.sit(0.72); dir.glassFor(n, false); n.state = 1; } return false; }
      const partner = dir.partner(n);
      if (!partner || partner.state !== 1) { if (n.timer > 25) return true; return false; }
      p.headTarget = dir.headAt(partner.patron);
      if (s.data.loser) {
        if (s.data.loser === n) { p.slump = 1; } else if (chance(dt, 0.3)) p.laugh();
        s.data.doneT = (s.data.doneT || 0) + dt;
        if (s.data.doneT > 12 / 2) { p.slump = 0; p.stand(); p.hold(null); s.closed = true; return true; }
        return false;
      }
      // alternate drinks, the first member leads
      const lead = s.members[0] === n;
      s.data.next -= dt / 2;
      if (lead && s.data.next <= 0) {
        s.data.next = rr(2.2, 3.4); s.data.round++;
        p.drink(); setTimeout(() => partner.patron.drink(), 600);
        if (s.data.round >= n.data.rounds) { s.data.loser = Math.random() < 0.5 ? n : partner; setTimeout(() => { const w = s.data.loser === n ? partner : n; w.patron.cheer(); dir.attention(w.patron.root.position.clone().setY(1.2), 4, [n, partner]); }, 1200); }
      }
      return false;
    },
    exit(dir, n) { n.patron.slump = 0; n.patron.stand(); if (n.session) n.session.closed = true; },
  },
  brawl: {
    enter(dir, n, opts) {
      const s = dir.session(n, 'brawl');
      if (s.members.length === 1) {
        const i = Math.floor(Math.random() * STAND_SPOTS.length);
        s.data.spot = i; s.data.phase = 'gather'; s.data.hits = 0; s.data.maxHits = Math.floor(rr(5, 9));
        dir.lastBrawl = dir.t;
      }
      const [x, z] = STAND_SPOTS[s.data.spot][s.members.length - 1];
      dir.goTo(n, new THREE.Vector3(x, 0, z), null);
      n.data.idx = s.members.length - 1;
    },
    update(dir, n, dt) {
      const p = n.patron, s = n.session;
      if (!s) return true;
      const partner = dir.partner(n);
      if (!partner) { if (n.timer > 20) return true; return false; }
      if (!dir.arrived(n) || !dir.arrived(partner)) return false;
      const pp = partner.patron;
      n.face = pp.root.position;
      if (s.data.phase === 'gather') {
        p.pose = 'fight'; p.headTarget = dir.headAt(pp);
        s.data.phase = 'fight'; s.data.next = 1.0;
        dir.attention(p.root.position.clone().lerp(pp.root.position, 0.5).setY(1.2), 5, s.members);
      }
      if (s.data.phase === 'fight') {
        p.pose = 'fight';
        if (n.data.idx === 0) {
          s.data.next -= dt;
          if (s.data.next <= 0) {
            s.data.next = rr(0.6, 1.1);
            const attacker = Math.random() < 0.5 ? n : partner, victim = attacker === n ? partner : n;
            attacker.patron.punch(); setTimeout(() => victim.patron.stagger(), 150);
            s.data.hits++;
            if (s.data.hits >= s.data.maxHits) { s.data.phase = 'down'; s.data.loser = victim; s.data.downT = 0; setTimeout(() => { victim.patron.ko = 1; attacker.patron.cheer(); }, 200); }
          }
        }
        return false;
      }
      if (s.data.phase === 'down') {
        if (n.data.idx === 0) s.data.downT += dt;
        const loser = s.data.loser === n;
        if (loser) { p.pose = 'idle'; }
        else { p.pose = 'idle'; p.headTarget = dir.headAt(s.data.loser.patron); if (chance(dt, 0.15)) p.gesture(); }
        if (s.data.downT > 7) {
          if (loser) { p.ko = 0; p.stagger(); }
          s.closed = true; return true;
        }
        return false;
      }
      return false;
    },
    exit(dir, n) { n.patron.pose = 'idle'; n.patron.ko = 0; if (n.session) n.session.closed = true; },
  },
};

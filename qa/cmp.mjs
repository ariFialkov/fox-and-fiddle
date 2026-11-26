import * as THREE from 'three';
import { Patron as P1 } from '/home/claude/verify/src/world/Patron.js';
import { Patron as P2 } from '/home/claude/verify/src/world/Patron2.js';
const v = new THREE.Vector3();
const run = (P, setup, n = 150) => { const p = new P({ name: 'Sal', height: 1.03, seed: 3 }); setup(p); for (let i = 0; i < n; i++) p.update(1 / 60); p.root.updateMatrixWorld(true);
  return [p.arms[0].hand, p.arms[1].hand, p.head].map(o => o.getWorldPosition(v).toArray().map(x => +x.toFixed(3))); };
const cases = { idle: p => {}, sit: p => p.sit(0.72), sitLift: p => { p.sit(0.72); p.liftR = 1; }, sitReach: p => { p.sit(0.72); p.reachR = 1; }, fight: p => { p.pose = 'fight'; }, lean: p => { p.pose = 'lean'; }, talk: p => { p.pose = 'talk'; }, walk: p => { p.walk = 1; }, ko: p => { p.ko = 1; } };
let worst = 0;
for (const [k, f] of Object.entries(cases)) { const a = run(P1, f), b = run(P2, f); const d = a.map((x, i) => Math.hypot(...x.map((y, j) => y - b[i][j]))); worst = Math.max(worst, ...d.slice(0,2)); console.log(k.padEnd(9), 'handL', d[0].toFixed(3), 'handR', d[1].toFixed(3), 'head', d[2].toFixed(3), ' v1R', a[1].join(','), ' v2R', b[1].join(',')); }
console.log('worst hand drift', worst.toFixed(3));

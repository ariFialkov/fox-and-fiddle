/**
 * Dress a Patron v2 (Patron2.js) in a character GLB built on the v2 standard skeleton (RIG_SPEC.md).
 *
 * The GLB's bones carry Mixamo names and this character's own proportions (knee height, head pivot,
 * wrist), all at identity rest orientation. dressPatron2 copies those rest positions onto the
 * Patron's bones, binds the skinned mesh to them, hides the capsule figure, and moves the GLB's mouth
 * strip onto the jaw. Patron's height scale still applies. One GLB can dress any number of Patrons.
 *
 *   const gltf = await loader.loadAsync('western/v2/sal.glb');
 *   dressPatron2(sal, gltf);
 */
import * as THREE from 'three';

const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });

/** A mesh's geometry as plain float positions in its node's space (undoes any quantization transform). */
function bake(mesh, node) {
  const g = new THREE.BufferGeometry();
  const pos = mesh.geometry.attributes.position, arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { arr[i * 3] = pos.getX(i); arr[i * 3 + 1] = pos.getY(i); arr[i * 3 + 2] = pos.getZ(i); }
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  if (mesh.geometry.index) g.setIndex(mesh.geometry.index.clone());
  if (mesh.geometry.attributes.uv) g.setAttribute('uv', mesh.geometry.attributes.uv);   // lids wear the face texture
  if (mesh !== node) { mesh.updateMatrix(); g.applyMatrix4(mesh.matrix); }
  g.computeVertexNormals();
  return g;
}

// Hair strands and hat fringes are single-sided cards with volume normals (see the builder's hair.py): light them
// the same from either side, without the back-face normal flip a double-sided material does. One per source material.
const hairCache = new WeakMap();
function hairCards(mat) {
  if (hairCache.has(mat)) return hairCache.get(mat);
  const m = mat.clone();
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace(/normal \*= faceDirection;/g, '').replace(/nonPerturbedNormal \*= faceDirection;/g, ''));
  };
  m.customProgramCacheKey = () => 'hair-cards';
  hairCache.set(mat, m);
  return m;
}

/**
 * Elbow placement. The character GLBs put each elbow joint on a straight line under the shoulder, but the modelled
 * arms hang with the elbows a little back (4-8 cm on most of the cast). Bending about a joint that sits in front of
 * the arm swings the forearm through an arc: it reads as a long, curved, rubbery arm. This moves each elbow (and the
 * forearm-twist helper between elbow and wrist) to the centre of the arm's cross-section, and updates the inverse
 * binds to match, so the rest pose is unchanged and every bend happens inside the arm.
 * It also lets the upper arm's sleeve follow the arm (see below). The skin weights are changed in place, once.
 * Computed once per GLB: { inverses: Matrix4[] for the skin's bones, local: { boneName: Vector3 } rest offsets }.
 */
const elbowFix = new WeakMap();
const ARM_BONES = ['Arm', 'ForeArm', 'ForeArmTwist', 'Hand'];
function fixElbows(gltf, src) {
  if (elbowFix.has(gltf)) return elbowFix.get(gltf);
  const sk = src.skeleton, bones = sk.bones, inv = sk.boneInverses.map((m) => m.clone());
  const geo = src.geometry, pos = geo.attributes.position, ji = geo.attributes.skinIndex, wi = geo.attributes.skinWeight;
  const idx = (n) => bones.findIndex((b) => b.name === n);
  const node = (n) => gltf.scene.getObjectByName(n);
  gltf.scene.updateMatrixWorld(true);
  const res = { inverses: inv, local: {} };
  let released = 0;
  for (const side of ['Left', 'Right']) {
    const ids = Object.fromEntries(ARM_BONES.map((n) => [n, idx(side + n)]));
    if (Object.values(ids).some((i) => i < 0) || !node(side + 'ForeArm')) continue;
    // joints in the mesh's own (quantized) space, and that space's metres
    const J = (i) => new THREE.Vector3().setFromMatrixPosition(inv[i].clone().invert());
    const S = J(ids.Arm), E = J(ids.ForeArm), W = J(ids.Hand);
    const unit = S.distanceTo(E) / node(side + 'ForeArm').position.length();
    if (!(unit > 0)) continue;
    // the arm's cross-section at elbow height: vertices that belong to this arm (most of their weight on it)
    const chain = new Set(Object.values(ids)), out = side === 'Left' ? 1 : -1;   // Left is +x
    const c = new THREE.Vector3(), v = new THREE.Vector3();
    let n = 0;
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      if (Math.abs(v.y - E.y) > 0.015 * unit || v.distanceTo(E) > 0.16 * unit || (v.x - E.x) * out < -0.12 * unit) continue;
      let a = 0; for (let q = 0; q < 4; q++) if (chain.has(ji.getComponent(k, q))) a += wi.getComponent(k, q);
      if (a < 0.6) continue;
      c.add(v); n++;
    }
    if (n < 12) continue;
    c.divideScalar(n);
    const d = new THREE.Vector3(c.x - E.x, 0, c.z - E.z);
    if (d.length() / unit < 0.01) d.set(0, 0, 0);              // already centred
    d.clampLength(0, 0.1 * unit);                               // never more than 10 cm
    const E2 = E.clone().add(d);
    const T2 = E2.clone().lerp(W, 0.5);                         // twist helper half way down the new forearm
    // metres in the bones' frame: the same linear map the inverse binds carry (bones rest unrotated)
    const toM = (rawDelta) => rawDelta.clone().divideScalar(unit);
    // new inverse bind = translate(old joint - new joint, in metres) * old inverse bind
    const moveInv = (i, rawPos) => { const dm = toM(J(i).sub(rawPos)); inv[i] = new THREE.Matrix4().makeTranslation(dm.x, dm.y, dm.z).multiply(inv[i]); };
    if (d.lengthSq() > 0) { moveInv(ids.ForeArm, E2); moveInv(ids.ForeArmTwist, T2); }
    // Upper-arm vertices partly tied to the spine (up to a third of their weight on the sleeves' inner side) stay
    // behind when the arm lifts and stretch the sleeve down the chest. Away from the shoulder, a vertex that is
    // mostly arm follows the arm alone; the release ramps in from 40 % to 55 % of the way to the elbow.
    const ax = E2.clone().sub(S), axL2 = ax.lengthSq();
    const arm = ids.Arm, wts = new Map();
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const t = v.clone().sub(S).dot(ax) / axL2;
      if (t < 0.4 || t > 1) continue;
      if (v.distanceTo(S.clone().addScaledVector(ax, t)) > 0.16 * unit) continue;
      wts.clear();
      let a = 0;
      for (let q = 0; q < 4; q++) { const w = wi.getComponent(k, q); if (w <= 0) continue; const b = ji.getComponent(k, q); wts.set(b, (wts.get(b) || 0) + w); if (chain.has(b)) a += w; }
      if (a < 0.6 || a > 0.999) continue;
      const f = THREE.MathUtils.smoothstep(t, 0.4, 0.55);
      let moved = 0;
      for (const [b, w] of wts) if (!chain.has(b)) { wts.set(b, w * (1 - f)); moved += w * f; }
      wts.set(arm, (wts.get(arm) || 0) + moved);
      const top = [...wts].filter(([, w]) => w > 1e-4).sort((x, y) => y[1] - x[1]).slice(0, 4);
      const sum = top.reduce((s2, [, w]) => s2 + w, 0);
      for (let q = 0; q < 4; q++) { const e = top[q]; ji.setComponent(k, q, e ? e[0] : 0); wi.setComponent(k, q, e ? e[1] / sum : 0); }
      released++;
    }
    // rest offsets (parent-local, metres): ForeArm under Arm, Twist and Hand under ForeArm
    if (d.lengthSq() > 0) {
      res.local[side + 'ForeArm'] = toM(E2.clone().sub(S));
      res.local[side + 'ForeArmTwist'] = toM(T2.clone().sub(E2));
      res.local[side + 'Hand'] = toM(W.clone().sub(E2));
    }
  }
  if (released) { ji.needsUpdate = true; wi.needsUpdate = true; }
  elbowFix.set(gltf, res);
  return res;
}

export function dressPatron2(p, gltf) {
  if (p.version !== 2) throw new Error('dressPatron2: this Patron is not a v2 Patron');
  const srcs = [];
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) srcs.push(o); });   // the body, and the hair cards if any
  if (!srcs.length) throw new Error('dressPatron2: no skinned mesh in this GLB');
  const src = srcs[0];

  // this character's proportions: rest translations straight from the GLB
  gltf.scene.traverse((o) => { const b = p.bones[o.name]; if (b && !o.isMesh) b.position.copy(o.position); });
  const elbows = fixElbows(gltf, srcs[0]);
  for (const [n, v] of Object.entries(elbows.local)) p.bones[n].position.copy(v);
  p.restHipsY = p.bones.Hips.position.y;
  p._lg = null;   // leg proportions changed
  for (const a of p.arms) a.socketRest.copy(a.hand.position);
  const jaw = gltf.scene.getObjectByName('Jaw');
  if (jaw && jaw.userData.jawScale) p.jawScale = jaw.userData.jawScale;

  const bones = src.skeleton.bones.map((b) => p.bones[b.name]);
  const missing = src.skeleton.bones.filter((b, i) => !bones[i]).map((b) => b.name);
  if (missing.length) throw new Error('dressPatron2: unknown bones ' + missing.join(', '));
  const skeleton = new THREE.Skeleton(bones, elbows.inverses.map((m) => m.clone()));
  let skin = null;
  for (const s of srcs) {
    const m = s.material.name === 'hair-cards' ? hairCards(s.material) : s.material;
    const sk = new THREE.SkinnedMesh(s.geometry, m);
    sk.name = s === src ? 'westernSkin' : 'westernHair';
    sk.castShadow = true;
    sk.frustumCulled = false;
    p.body.add(sk);
    sk.bind(skeleton, new THREE.Matrix4());   // identity: quantized GLBs carry their decode in the inverse binds
    if (!skin) skin = sk;
  }

  p.body.traverse((o) => { if (o.isMesh && o.userData.primitive && o !== p.mouth) { o.material = HIDDEN; o.castShadow = false; } });

  const mNode = gltf.scene.getObjectByName('mouth');
  let mMesh = null;
  if (mNode) mNode.traverse((o) => { if (o.isMesh && !mMesh) mMesh = o; });
  if (mMesh) {
    const g = new THREE.BufferGeometry();
    const pos = mMesh.geometry.attributes.position, arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { arr[i * 3] = pos.getX(i); arr[i * 3 + 1] = pos.getY(i); arr[i * 3 + 2] = pos.getZ(i); }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    if (mMesh.geometry.index) g.setIndex(mMesh.geometry.index.clone());
    if (mMesh !== mNode) { mMesh.updateMatrix(); g.applyMatrix4(mMesh.matrix); }
    g.computeVertexNormals();
    p.mouth.geometry = g; p.mouth.material = mMesh.material; p.mouth.position.copy(mNode.position);
    p.mouthRest.copy(mNode.position);
    p.mouth.material.visible = true;
  }
  // eyelids: small lid patches on the head, pivot on their top edge; Patron v2 scales them in y to blink
  p.lids = [];
  for (const nm of ['eyelid_R', 'eyelid_L']) {
    const node = gltf.scene.getObjectByName(nm);
    let lm = null;
    if (node) node.traverse((o) => { if (o.isMesh && !lm) lm = o; });
    if (!lm) continue;
    const g = bake(lm, node);
    const mat = lm.material.clone(); mat.color.multiplyScalar(0.85);   // a closed lid sits in a little shadow
    const lid = new THREE.Mesh(g, mat);
    lid.position.copy(node.position); lid.scale.y = 0.001; lid.visible = false; lid.name = nm;
    p.bones.Head.add(lid); p.lids.push(lid);
  }
  p.dressed = true;
  return skin;
}

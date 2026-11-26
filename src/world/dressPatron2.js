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

export function dressPatron2(p, gltf) {
  if (p.version !== 2) throw new Error('dressPatron2: this Patron is not a v2 Patron');
  const srcs = [];
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) srcs.push(o); });   // the body, and the hair cards if any
  if (!srcs.length) throw new Error('dressPatron2: no skinned mesh in this GLB');
  const src = srcs[0];

  // this character's proportions: rest translations straight from the GLB
  gltf.scene.traverse((o) => { const b = p.bones[o.name]; if (b && !o.isMesh) b.position.copy(o.position); });
  p.restHipsY = p.bones.Hips.position.y;
  p._lg = null;   // leg proportions changed
  for (const a of p.arms) a.socketRest.copy(a.hand.position);
  const jaw = gltf.scene.getObjectByName('Jaw');
  if (jaw && jaw.userData.jawScale) p.jawScale = jaw.userData.jawScale;

  const bones = src.skeleton.bones.map((b) => p.bones[b.name]);
  const missing = src.skeleton.bones.filter((b, i) => !bones[i]).map((b) => b.name);
  if (missing.length) throw new Error('dressPatron2: unknown bones ' + missing.join(', '));
  const skeleton = new THREE.Skeleton(bones, src.skeleton.boneInverses.map((m) => m.clone()));
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

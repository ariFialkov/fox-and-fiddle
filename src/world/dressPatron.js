/**
 * Fox & Fiddle Western reskin: dress a Patron in a character GLB.
 *
 * Each character GLB holds one skinned mesh whose joints are named after Patron's own joint objects
 * (torso, hip_0/1, pivot_0/1, fore_0/1, hand_0/1, neck; index 0 = the x < 0 side, as hips[0] / arms[0]),
 * at Patron's rest pose and height 1.0 proportions. dressPatron binds that mesh to the Patron's real
 * joint objects, so every pose and one-shot in Patron.update() drives it unchanged, the body bends
 * smoothly at every joint, and Patron's own `height` scale still applies.
 *
 * The primitive capsules are switched to an invisible material rather than hidden, so anything
 * parented to them (glasses, cues, darts on arms[i].hand) keeps rendering. The GLB's `mouth` mesh
 * replaces Patron's mouth geometry: a thin strip on the painted lip line, still scaled in x for mood.
 *
 * Usage, once per character after `new Patron({...})`:
 *   const gltf = await loader.loadAsync('characters/sal.glb');
 *   dressPatron(sal, gltf);
 * One GLB can dress any number of Patrons (geometry, material and texture are shared).
 */
import * as THREE from 'three';

const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });

export function dressPatron(p, gltf) {
  let src = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !src) src = o; });
  if (!src) throw new Error('dressPatron: no skinned mesh in this GLB');

  const joint = {
    torso: p.torso, neck: p.neck, hip_0: p.hips[0], hip_1: p.hips[1],
    pivot_0: p.arms[0].pivot, fore_0: p.arms[0].fore, hand_0: p.arms[0].hand,
    pivot_1: p.arms[1].pivot, fore_1: p.arms[1].fore, hand_1: p.arms[1].hand,
  };
  const bones = src.skeleton.bones.map((b) => joint[b.name]);
  if (bones.some((b) => !b)) throw new Error('dressPatron: unexpected joint names in this GLB');
  // inverse bind matrices are the GLB's: the inverse of each joint's rest transform in body space
  const skeleton = new THREE.Skeleton(bones, src.skeleton.boneInverses.map((m) => m.clone()));

  const skin = new THREE.SkinnedMesh(src.geometry, src.material);
  skin.name = 'westernSkin';
  skin.castShadow = true;
  skin.frustumCulled = false;            // skinned bounds move with the joints
  p.body.add(skin);
  // identity bind matrix + 'attached' mode: world = sum(w * jointWorld * inverseBind) * restVertex
  // works for plain and quantized (KHR_mesh_quantization) GLBs: a quantized file carries its decode
  // transform inside the inverse bind matrices, so the bind matrix stays identity either way
  skin.bind(skeleton, new THREE.Matrix4());

  // primitive look off (keep the objects: props hang from arms[i].hand)
  const prims = [p.torso.children[0], p.head];
  p.hips.forEach((h) => prims.push(h.children[0]));
  p.arms.forEach((a) => prims.push(a.pivot.children[0], a.fore.children[0], a.hand));
  for (const c of p.neck.children) if (c !== p.mouth) prims.push(c);
  for (const m of prims) if (m && m.isMesh) { m.material = HIDDEN; m.castShadow = false; }

  // mouth: the 'mouth' node (or the mesh under it); bake any decode transform so Patron can scale it in x
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
  }
  p.dressed = true;
  return skin;
}

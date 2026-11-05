/**
 * Asset catalog render studio. Builds every registry asset from the real game code, photographs
 * it on a transparent background from fixed angles and measures it. Driven by
 * scripts/catalog-render.mjs; open /catalog-studio/ under `npm run dev` to look at it by hand.
 *
 * window.studio.list()            -> [{ id, views }]
 * window.studio.render(id, view)  -> data URL (image/webp)
 * window.studio.meta(id)          -> catalog entry (sizes, materials, joints, ...)
 */
import * as THREE from 'three';
import { Bar } from '../src/world/Bar.js';
import { Patron } from '../src/world/Patron.js';
import { ballTexture } from '../src/minigames/billiards.js';
import { ASSETS, CATEGORIES, CHARACTER_RIG } from './registry.js';

const W = 960, H = 720;            // hero image
const SW = 640, SH = 480;          // other views
const deg = THREE.MathUtils.degToRad;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ---- studio scene: soft neutral lighting and a shadow catcher ----
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a40, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7); scene.add(fill);
const rim = new THREE.DirectionalLight(0xfff0e0, 1.0); scene.add(rim);
const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.28 }));
shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);
const camera = new THREE.PerspectiveCamera(28, W / H, 0.005, 200);

// ---- the bar, built once off-screen so every bar asset exists exactly as in the game ----
const barScene = new THREE.Scene();
const bar = new Bar(barScene, { lowEnd: false });
const ctx = { bar };

const VIEWS = {
  hero: { label: '3/4', az: 35, el: 20 },
  front: { label: 'Front', az: 0, el: 4 },
  side: { label: 'Side', az: 90, el: 4 },
  top: { label: 'Top', az: 0, el: 89 },
  below: { label: 'From below', az: 25, el: -35 },
  fp: { label: 'In game (first person)' },
};
const viewsFor = (a) => a.kind === 'texture' || a.kind === 'file' ? ['image'] : a.viewmodel ? ['fp', 'hero', 'side'] : (a.views || ['hero', 'front', 'side']);

// ---------------------------------------------------------------------------------------------
// building
// ---------------------------------------------------------------------------------------------
function stripLights(obj) {
  const lights = [];
  obj.traverse((o) => { if (o.isLight) lights.push(o); });
  for (const l of lights) l.parent?.remove(l);
  return lights;
}

function patronByName(name) { return bar.patrons.find((p) => p.name === name); }

/** Stand a patron upright in the neutral idle pose at the origin, facing +Z. */
function poseNeutral(p) {
  p.pose = 'idle'; p.walk = 0; p.headTarget = null; p.ko = 0; p.slump = 0; p.mood = 0.5; p.acts = {};
  p.reachR = 0; p.liftR = 0; p.tiltR = 0; p.block = null;
  if (p.prop) p.hold(null);
  p.root.position.set(0, 0, 0); p.root.rotation.set(0, 0, 0);
  for (let i = 0; i < 24; i++) { p.t = -0.5; p.update(0.5); }
  p.root.updateMatrixWorld(true);
}

const extraPatrons = {};
function build(a) {
  const info = { lights: [] };
  let obj;
  if (a.kind === 'character') {
    let p = a.patron ? patronByName(a.patron) : extraPatrons[a.id];
    if (!p) { p = new Patron(a.patronOpts); extraPatrons[a.id] = p; }
    poseNeutral(p);
    obj = p.root; info.patron = p; info.live = true;
  } else if (a.build) {
    obj = a.build(ctx);
  } else if (a.cap) {
    const inst = bar.catalog[a.cap];
    if (!inst || !inst.length) throw new Error(`nothing recorded for ${a.cap}`);
    const parts = inst[0];
    if (a.local && parts.length === 1) {
      obj = parts[0].clone(true);
      obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0);
    } else {
      obj = new THREE.Group();
      for (const part of parts) obj.add(part.clone(true));
    }
    info.instances = inst.length;
  }
  for (const name of a.hide || []) { const h = obj.getObjectByName(name); if (h) h.visible = false; }
  info.lights = stripLights(obj).map((l) => ({ type: l.type.replace('Light', '').toLowerCase(), color: '#' + l.color.getHexString(), intensity: +l.intensity.toFixed(2), distance: l.distance || null }));
  // wrapper: turn the front to +Z, then sit the bounding box's bottom-centre on the origin
  const wrap = new THREE.Group();
  wrap.add(obj);
  if (a.face) obj.rotation.y += a.face;
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true);
  const centre = box.getCenter(new THREE.Vector3());
  // remember where the asset's own origin ended up relative to its box (its pivot)
  const originWorld = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
  obj.position.x -= centre.x; obj.position.z -= centre.z; obj.position.y -= box.min.y;
  wrap.updateMatrixWorld(true);
  info.box = new THREE.Box3().setFromObject(obj, true);
  info.originRel = originWorld.sub(new THREE.Vector3(centre.x, box.min.y, centre.z));
  info.obj = obj; info.wrap = wrap;
  return info;
}

function unbuild(a, info) {
  info.wrap.remove(info.obj);
  if (info.live) { // put the patron back where the bar keeps it
    bar.group.add(info.obj);
  }
}

// ---------------------------------------------------------------------------------------------
// measuring
// ---------------------------------------------------------------------------------------------
const texNames = new Map();
function nameTexture(tex, name) { if (tex && !texNames.has(tex)) texNames.set(tex, name); }

function measure(a, info) {
  const obj = info.obj;
  let tris = 0, verts = 0, meshes = 0;
  const mats = new Map(), texs = new Map();
  obj.traverse((o) => {
    if (!o.visible) return;
    if (o.isMesh || o.isSprite) {
      meshes++;
      const g = o.geometry;
      if (g) {
        const n = g.index ? g.index.count : g.attributes.position.count;
        tris += Math.round(n / 3); verts += g.attributes.position.count;
      }
      for (const m of [].concat(o.material)) if (m && !mats.has(m.uuid)) mats.set(m.uuid, m);
    }
  });
  const materials = [...mats.values()].map((m) => {
    const out = { type: m.type.replace('Material', ''), color: m.color ? '#' + m.color.getHexString() : null };
    if (m.emissive && m.emissive.getHex() && (m.emissiveIntensity ?? 1) > 0) out.emissive = '#' + m.emissive.getHexString();
    if (m.roughness !== undefined) out.roughness = +m.roughness.toFixed(2);
    if (m.metalness) out.metalness = +m.metalness.toFixed(2);
    if (m.transparent && m.opacity < 1) out.opacity = +m.opacity.toFixed(2);
    if (m.transmission) out.transmission = +m.transmission.toFixed(2);
    if (m.map) {
      const img = m.map.image;
      const t = { name: texNames.get(m.map) || 'generated', size: img ? `${img.width} x ${img.height}` : '?' };
      if (m.map.repeat && (m.map.repeat.x !== 1 || m.map.repeat.y !== 1)) t.repeat = `${+m.map.repeat.x.toFixed(2)} x ${+m.map.repeat.y.toFixed(2)}`;
      out.texture = t.name; texs.set(t.name + t.size, t);
    }
    return out;
  });
  const size = info.box.getSize(new THREE.Vector3());
  const r3 = (v) => +v.toFixed(3);
  const entry = {
    dims: { w: r3(size.x), h: r3(size.y), d: r3(size.z) },
    tris, verts, meshes, materials, textures: [...texs.values()], lights: info.lights,
  };
  // palette: distinct base colours, most used first
  entry.palette = [...new Set(materials.map((m) => m.color).filter(Boolean))].slice(0, 8);
  // pivot: where the asset's own origin sits relative to its bounding box
  if (a.local || a.build || a.kind === 'character') {
    const o = info.originRel, sx = Math.max(size.x, 1e-6), sy = Math.max(size.y, 1e-6), sz = Math.max(size.z, 1e-6);
    const axis = (v, s, lo, mid, hi) => { const k = v / s; if (Math.abs(k) < 0.08) return mid; if (k <= -0.42) return lo; if (k >= 0.42) return hi; return `${Math.round(v * 1000)} mm`; };
    const ky = o.y / sy;
    const yWord = ky < 0.06 ? 'bottom' : ky > 0.94 ? 'top' : Math.abs(ky - 0.5) < 0.08 ? 'middle' : `${Math.round(o.y * 1000)} mm up`;
    entry.pivot = `${yWord}, ${axis(o.x, sx, 'left', 'centre', 'right')} (x), ${axis(o.z, sz, 'back', 'centre', 'front')} (z)`;
    if (a.id === 'pool-cue') entry.pivot = 'at the tip';
    if (a.id === 'dart') entry.pivot = 'at the point (per dart)';
  } else {
    entry.pivot = 'placed in world space (no local origin); bottom centre recommended';
  }
  if (info.instances) entry.instances = info.instances;
  // characters: joint positions in the neutral pose, feet at the origin
  if (info.patron) {
    const p = info.patron;
    p.root.position.set(0, 0, 0); p.root.updateMatrixWorld(true);
    const wp = (o) => o.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3));
    entry.joints = {
      'hip.L': wp(p.hips[0]), 'hip.R': wp(p.hips[1]), torso: wp(p.torso),
      'shoulder.L': wp(p.arms[0].pivot), 'shoulder.R': wp(p.arms[1].pivot),
      'elbow.L': wp(p.arms[0].fore), 'elbow.R': wp(p.arms[1].fore),
      'hand.L': wp(p.arms[0].hand), 'hand.R': wp(p.arms[1].hand),
      neck: wp(p.neck), head: wp(p.head),
    };
    entry.rig = CHARACTER_RIG;
    entry.scale = p.height;
    entry.bodyType = p.female ? 'female build' : 'male build';
  }
  return entry;
}

// ---------------------------------------------------------------------------------------------
// photographing
// ---------------------------------------------------------------------------------------------
function frame(view, box, aspect, az, el) {
  // generous clip planes while framing; the previous asset's planes may be far too tight
  camera.aspect = aspect; camera.near = 0.001; camera.far = 1e5; camera.updateProjectionMatrix();
  const centre = box.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(Math.sin(deg(az)) * Math.cos(deg(el)), Math.sin(deg(el)), Math.cos(deg(az)) * Math.cos(deg(el))).normalize();
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const radius = box.getSize(new THREE.Vector3()).length() / 2 || 0.1;
  // pull back until every corner of the box is inside the frame with a margin
  let d = radius * 0.6;
  const v = new THREE.Vector3();
  for (let i = 0; i < 400; i++) {
    camera.position.copy(centre).addScaledVector(dir, d);
    if (Math.abs(el) > 85) camera.up.set(0, 0, -1); else camera.up.set(0, 1, 0);
    camera.lookAt(centre); camera.updateMatrixWorld(true);
    let ok = true;
    for (const c of corners) { v.copy(c).project(camera); if (v.z > 1 || Math.abs(v.x) > 0.86 || Math.abs(v.y) > 0.84) { ok = false; break; } }
    if (ok) break;
    d *= 1.04;
  }
  camera.near = Math.max(0.002, d / 500); camera.far = d * 10 + radius * 4; camera.updateProjectionMatrix();
  // lights follow the camera so every view is lit the same way
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  if (right.lengthSq() < 0.01) right.set(1, 0, 0);
  key.position.copy(centre).addScaledVector(dir, d).addScaledVector(right, -d * 0.7).add(new THREE.Vector3(0, d * 0.9 + radius, 0));
  key.target.position.copy(centre);
  const sr = radius * 1.6;
  Object.assign(key.shadow.camera, { left: -sr, right: sr, top: sr, bottom: -sr, near: 0.01, far: d * 4 + radius * 4 });
  key.shadow.camera.updateProjectionMatrix();
  fill.position.copy(centre).addScaledVector(dir, d).addScaledVector(right, d * 0.9);
  rim.position.copy(centre).addScaledVector(dir, -d).add(new THREE.Vector3(0, d * 0.6, 0));
}

function photograph(a, info, view) {
  const wide = view === 'hero';
  const w = wide ? W : SW, h = wide ? H : SH;
  renderer.setSize(w, h, false);
  scene.add(info.wrap);
  const box = info.box;
  const size = box.getSize(new THREE.Vector3());
  const grounded = a.ground !== false && !a.viewmodel;
  shadowCatcher.visible = grounded && view !== 'below';
  shadowCatcher.scale.set(Math.max(size.x, size.z) * 6 + 1, Math.max(size.x, size.z) * 6 + 1, 1);
  shadowCatcher.position.set(0, 0, 0);
  info.obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const V = VIEWS[view];
  let az = V.az, el = V.el;
  if (view === 'hero' && a.viewAz !== undefined) az = a.viewAz;
  frame(view, box, w / h, az, el);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/webp', 0.9);
  scene.remove(info.wrap);
  return url;
}

/** First-person viewmodel: what you see in game (camera at the origin, 72 degree FOV). */
function photographFP(a, info) {
  renderer.setSize(SW, SH, false);
  const vm = a.build(ctx);
  stripLights(vm);
  const fpScene = new THREE.Scene();
  fpScene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a40, 1.1));
  const k = new THREE.DirectionalLight(0xffffff, 2.0); k.position.set(-1, 2, 1.5); fpScene.add(k);
  const cam = new THREE.PerspectiveCamera(72, SW / SH, 0.01, 50);
  cam.add(vm); fpScene.add(cam);
  // the boot is hidden until a kick in game; show it here, swung up as in a kick
  vm.traverse((o) => { if (o.isMesh && o.geometry?.parameters?.depth === 0.28) { o.visible = true; o.position.set(0.12, -0.42, -0.85); o.rotation.x = -0.9; } });
  renderer.render(fpScene, cam);
  return renderer.domElement.toDataURL('image/webp', 0.9);
}

/** Flat texture: draw the canvas (downscaled to at most 1024 px) onto a transparent image. */
function photographTexture(a) {
  if (a.id === 'tex-pool-balls') {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const g = c.getContext('2d');
    for (let i = 0; i < 16; i++) { const t = ballTexture(i); g.drawImage(t.image, (i % 4) * 256, Math.floor(i / 4) * 128, 256, 128); }
    return { url: c.toDataURL('image/webp', 0.92), size: '256 x 128 each (16)' };
  }
  const t = a.make();
  const img = t.image;
  const s = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { url: c.toDataURL('image/webp', 0.92), size: `${img.width} x ${img.height}` };
}

// texture names for the material lists
for (const a of ASSETS) if (a.kind === 'texture' && a.make) { try { nameTexture(a.make(), a.name); } catch {} }
for (let i = 0; i < 16; i++) nameTexture(ballTexture(i), i === 0 ? 'Cue ball' : `Ball ${i}`);

// ---------------------------------------------------------------------------------------------
// public API for the driver script
// ---------------------------------------------------------------------------------------------
const built = new Map();
function ensure(a) { if (!built.has(a.id)) built.set(a.id, build(a)); return built.get(a.id); }
function release(a) { const info = built.get(a.id); if (info) { unbuild(a, info); built.delete(a.id); } }

window.studio = {
  categories: CATEGORIES,
  views: VIEWS,
  list: () => ASSETS.map((a) => ({ id: a.id, views: viewsFor(a) })),
  render(id, view) {
    const a = ASSETS.find((x) => x.id === id);
    if (a.kind === 'texture') return photographTexture(a).url;
    if (a.kind === 'file') return null; // copied as-is by the driver
    if (view === 'fp') return photographFP(a);
    const info = ensure(a);
    return photograph(a, info, view);
  },
  meta(id) {
    const a = ASSETS.find((x) => x.id === id);
    const base = {
      id: a.id, name: a.name, category: a.category, categories: a.categories || [a.category], kind: a.kind || 'model',
      description: a.description, usedIn: a.usedIn || [], notes: a.notes || [], tags: a.tags || [], source: a.source,
      views: viewsFor(a).map((v) => ({ view: v, label: v === 'image' ? 'Image' : VIEWS[v].label })),
    };
    if (a.kind === 'texture') { const t = photographTexture(a); return { ...base, textureSize: t.size }; }
    if (a.kind === 'file') return { ...base, file: a.file };
    const info = ensure(a);
    const m = measure(a, info);
    release(a);
    return { ...base, ...m };
  },
  done(id) { const a = ASSETS.find((x) => x.id === id); release(a); },
};
window.studio.ready = true;

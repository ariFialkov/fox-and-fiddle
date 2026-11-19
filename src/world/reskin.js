/**
 * Western reskin: loads the art drops unpacked into public/western/ and hands them to the code
 * that builds the bar, the characters and the games. Every lookup returns null when a file is not
 * there, and the caller keeps today's procedural version, so the game runs with none, some or all
 * of the drops in place.
 *
 * Files are found by name (see scripts/reskin-files.js). Conventions from the art drops: metres,
 * +Y up, front +Z, the asset catalog's origins and node names.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import index from 'virtual:reskin-files';

// dressPatron.js ships in drop W6; it is picked up when copied to src/world/. Bundled eagerly: the
// game ships as one inlined page, where a separately loaded chunk would be looked for in the wrong folder.
const dressModules = import.meta.glob('./dressPatron.js', { eager: true });

/** The 20 characters: Patron name -> GLB. */
export const CHARACTER_FILES = {
  Dee: 'dee.glb', Sal: 'sal.glb', Rose: 'rose.glb', 'Big Mick': 'mick.glb', Tiny: 'tiny.glb', Doug: 'doug.glb',
  Sharkey: 'sharkey.glb', Earl: 'earl.glb', Marge: 'marge.glb', Lou: 'lou.glb', Benny: 'benny.glb', Vic: 'vic.glb',
  Pearl: 'pearl.glb', Rudy: 'rudy.glb', Gus: 'gus.glb', Nell: 'nell.glb', Frank: 'frank.glb',
  Fergus: 'fergus.glb', Shark: 'shark.glb', Nadia: 'nadia.glb',
};

const MODELS = [
  // world space
  'bar-counter.glb', 'back-bar.glb', 'beer-tap.glb', 'bar-stool.glb', 'pub-table.glb', 'potted-plant.glb', 'door.glb',
  'radiator.glb', 'cue-rack.glb', 'wall-sconce.glb', 'coat-hanging.glb', 'dartboard.glb', 'tv.glb', 'window-frame.glb',
  // inside existing groups
  'chair.glb', 'coat-rack.glb', 'jukebox.glb', 'pool-table.glb', 'foosball-table.glb', 'pendant-lamp.glb', 'ceiling-fan.glb', 'coat-player.glb',
  // props and drinks
  'bottle.glb', 'pint-glass.glb', 'rocks-glass.glb', ...Array.from({ length: 10 }, (_, i) => `drink-${i + 1}.glb`),
  // first person and table soccer
  'fp-fight.glb', 'fp-drink.glb', 'fp-cue-hands.glb', 'foosball-figure-cavalry.glb', 'foosball-figure-outlaw.glb', 'foosball-rod.glb',
];

const TEXTURES = [
  'tex-floor-planks', 'tex-wood-light', 'tex-wood-dark', 'tex-brick', 'tex-plaster', 'tex-felt', 'tex-foosball-pitch',
  'tex-dartboard', 'tex-chalkboard', 'tex-neon-fox', 'tex-neon-open', 'tex-hit-flash', 'tex-window-street',
  'poster-live-music', 'poster-fox-fiddle', 'poster-no-fighting', 'poster-darts-league', 'poster-happy-hour',
];

const gltfs = new Map();      // file name -> gltf
const textures = new Map();   // stem -> Texture
const poolBalls = [];         // index 0..15 -> Texture
let dressPatronFn = null;
let videoUrl = null;
let loaded = false;

const url = (rel) => new URL(rel, document.baseURI).href;
function fileFor(name) { return index.byName[name.toLowerCase()] || null; }
function textureFile(stem) {
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) { const f = fileFor(`${stem}.${ext}`); if (f) return f; }
  return null;
}

/**
 * Load everything that is present. Call once before the bar is built.
 * onProgress(fraction) is called as files arrive.
 */
export async function loadReskin(onProgress = () => {}) {
  if (loaded) return reskin;
  loaded = true;
  const gltfLoader = new GLTFLoader();
  const texLoader = new THREE.TextureLoader();
  const jobs = [];
  for (const name of [...MODELS, ...Object.values(CHARACTER_FILES)]) {
    const f = fileFor(name);
    if (f && !gltfs.has(name)) jobs.push(() => gltfLoader.loadAsync(url(f)).then((g) => gltfs.set(name, g)));
  }
  for (const stem of TEXTURES) {
    const f = textureFile(stem);
    if (f) jobs.push(() => texLoader.loadAsync(url(f)).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; textures.set(stem, t); }));
  }
  // pool balls: the files inside a tex-pool-balls/ folder, numbered 0..15 by the last number in
  // each name ("cue" counts as 0)
  for (const f of index.files.filter((p) => /\/tex-pool-balls\//i.test(p) && /\.(png|jpe?g|webp)$/i.test(p))) {
    const stem = f.split('/').pop().replace(/\.[^.]+$/, '');
    const nums = stem.match(/\d+/g);
    const n = /cue/i.test(stem) && !nums ? 0 : nums ? Number(nums[nums.length - 1]) : NaN;
    if (n >= 0 && n <= 15) jobs.push(() => texLoader.loadAsync(url(f)).then((t) => { t.colorSpace = THREE.SRGBColorSpace; poolBalls[n] = t; }));
  }
  const video = fileFor('tv-window-street-loop.webm') || fileFor('tv-window-street-loop.mp4');
  if (video) {
    const webm = fileFor('tv-window-street-loop.webm'), mp4 = fileFor('tv-window-street-loop.mp4');
    const probe = document.createElement('video');
    videoUrl = url(webm && probe.canPlayType('video/webm') ? webm : (mp4 || webm));
  }
  const dm = dressModules['./dressPatron.js'];
  if (dm) dressPatronFn = dm.dressPatron || dm.default || null;
  let done = 0;
  const total = jobs.length;
  // a few at a time keeps phones responsive while 20 characters stream in
  const queue = jobs.slice();
  const worker = async () => {
    while (queue.length) {
      const job = queue.shift();
      try { await job(); } catch (e) { console.warn('[reskin] could not load a file', e); }
      done++; onProgress(total ? done / total : 1);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, total) }, worker));
  if (total) console.info(`[reskin] loaded ${gltfs.size} models, ${textures.size + poolBalls.filter(Boolean).length} textures${videoUrl ? ', the street video' : ''}${dressPatronFn ? ', dressPatron' : ''}`);
  return reskin;
}

export const reskin = {
  /** True once any reskin file is in use. */
  get active() { return gltfs.size > 0 || textures.size > 0; },
  gltf(name) { return gltfs.get(name) || null; },
  /** A fresh copy of a model's scene, or null. */
  model(name) {
    const g = gltfs.get(name);
    if (!g) return null;
    const m = g.scene.clone(true);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return m;
  },
  /** A texture with its own repeat (the image is shared), or null. */
  tex(stem, repeat = [1, 1]) {
    const t = textures.get(stem);
    if (!t) return null;
    const c = t.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    return c;
  },
  poolBall(i) { return poolBalls[i] || null; },
  get videoUrl() { return videoUrl; },
  /** Skin a Patron with its character GLB, if both the GLB and dressPatron.js are present. */
  dress(patron) {
    const file = CHARACTER_FILES[patron.name];
    const g = file && gltfs.get(file);
    if (!g || !dressPatronFn) return false;
    try { dressPatronFn(patron, g); return true; } catch (e) { console.warn(`[reskin] could not dress ${patron.name}`, e); return false; }
  },
};

/** An invisible material: hides a mesh but keeps its children rendering. */
export const INVISIBLE = new THREE.MeshBasicMaterial({ visible: false });

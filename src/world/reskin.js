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
import { Patron } from './Patron.js';
import { Patron as Patron2, loadPatronClips } from './Patron2.js';

// Patron v2 (standard skeleton): a character uses it when its <name>-v2.glb is present. URL overrides:
// ?v2=off (everyone on v1), ?v2=sal,dee (only those), ?v2=all (the default).
const V2_PARAM = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('v2')) || '';

// dressPatron.js ships in drop W6; it is picked up when copied to src/world/. Bundled eagerly: the
// game ships as one inlined page, where a separately loaded chunk would be looked for in the wrong folder.
const dressModules = import.meta.glob(['./dressPatron.js', './dressPatron2.js'], { eager: true });

/** Characters on the Patron v2 skeleton: their GLB is named <name>-v2.glb (e.g. sal-v2.glb). */
export const v2File = (file) => file.replace(/\.glb$/, '-v2.glb');

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
  'radiator.glb', 'cue-rack.glb', 'wall-sconce.glb', 'coat-hanging.glb', 'dartboard.glb', 'tv.glb', 'window-frame.glb', 'foot-rail.glb',
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
let dressPatron2Fn = null;
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
  for (const name of [...MODELS, ...Object.values(CHARACTER_FILES), ...Object.values(CHARACTER_FILES).map(v2File)]) {
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
  // animation clips for Patron v2 (retargeted library motions)
  const clipsFile = fileFor('patron-clips.json');
  if (clipsFile) jobs.push(() => fetch(url(clipsFile)).then((r) => r.json()).then((j) => loadPatronClips(j)));
  const dm = dressModules['./dressPatron.js'];
  if (dm) dressPatronFn = dm.dressPatron || dm.default || null;
  const dm2 = dressModules['./dressPatron2.js'];
  if (dm2) dressPatron2Fn = dm2.dressPatron2 || null;
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
    const v2 = patron.version === 2;
    const g = file && gltfs.get(v2 ? v2File(file) : file);
    const fn = v2 ? dressPatron2Fn : dressPatronFn;
    if (!g || !fn) return false;
    try { fn(patron, g); return true; } catch (e) { console.warn(`[reskin] could not dress ${patron.name}`, e); return false; }
  },
  /** True when a v2 GLB exists for this Patron name (used to pick Patron v2 for it). */
  hasV2(name) { const f = CHARACTER_FILES[name]; return !!(f && gltfs.get(v2File(f)) && dressPatron2Fn); },
  /** True when this character should be built on Patron v2 (its v2 GLB is here and the URL allows it). */
  useV2(name) {
    if (V2_PARAM === 'off') return false;
    const list = V2_PARAM && V2_PARAM !== 'all' ? V2_PARAM.toLowerCase().split(',') : null;
    return (!list || list.includes(name.toLowerCase())) && this.hasV2(name);
  },
  /** A new Patron for these options, v1 or v2 as available, dressed in its character GLB. */
  patron(opts) {
    const p = this.useV2(opts.name) ? new Patron2(opts) : new Patron(opts);
    this.dress(p);
    return p;
  },
};

/** An invisible material: hides a mesh but keeps its children rendering. */
export const INVISIBLE = new THREE.MeshBasicMaterial({ visible: false });

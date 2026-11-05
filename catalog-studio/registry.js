/**
 * Asset catalog registry: every visual asset in Fox and Fiddle, with what an artist needs to
 * reskin it. Geometry, sizes, triangle counts, materials, textures and joints are measured from
 * the real game code by studio.js; the descriptions, usage and constraints live here.
 *
 * source: where the asset is built.   cap: id recorded by Bar.catBegin/catEnd.
 * build(ctx): returns a fresh Object3D for assets not built by the bar.
 * face: yaw (radians) that turns the asset's front towards +Z.   ground: false for wall/ceiling items.
 */
import * as THREE from 'three';
import * as T from '../src/world/textures.js';
import { Patron } from '../src/world/Patron.js';
import { makeCue, ballTexture, makeCueViewmodel } from '../src/minigames/billiards.js';
import { Darts } from '../src/minigames/darts.js';
import { foosMaterials, makeFoosFigure, makeFoosRod } from '../src/minigames/foosball.js';
import { makeFightArms, flashTexture } from '../src/minigames/barfight.js';
import { makeDrinkHand, SPECS } from '../src/minigames/drinking.js';
import { DRINKS } from '../src/content/lines.js';

export const CATEGORIES = [
  { id: 'characters', label: 'Characters' },
  { id: 'weapons', label: 'Weapons & throwables' },
  { id: 'props', label: 'Props' },
  { id: 'drinks', label: 'Drinks' },
  { id: 'equipment', label: 'Game equipment' },
  { id: 'viewmodels', label: 'First-person' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'decor', label: 'Decor & signage' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'textures', label: 'Textures' },
  { id: 'ui', label: 'Effects & UI' },
];

const GLASS_NOTES = [
  'Origin at the base centre; Y up. The base sits exactly on the surface it is placed on.',
  'Keep the liquid as its own mesh, anchored at the base: drinking scales its height down from the bottom (setGlassLevel), and the foam layer rides on top of it.',
  'The glass shell is drawn transparent after the liquid (renderOrder 2 vs 1); keep the shell thin and open-topped so the liquid reads through it.',
];

// ---------------------------------------------------------------------------------------------
// Characters. All patrons share one procedural rig (src/world/Patron.js); they differ in body
// type, colours, hair, beard and scale.
// ---------------------------------------------------------------------------------------------
export const CHARACTER_RIG = {
  joints: ['root (feet, yaw only)', 'body (tilts on knock-out)', 'hip.L / hip.R', 'torso (waist)', 'shoulder.L / shoulder.R', 'elbow.L / elbow.R', 'hand.L / hand.R (prop socket: right hand)', 'neck', 'head'],
  poses: ['idle', 'sit (bar stool 0.72 m, chair 0.46 m)', 'talk', 'fight (+ block high / block low)', 'lean (over the pool table)', 'foos (hands on two rods)', 'darts (throwing stance)', 'juke (leaning on the jukebox)', 'bartend', 'flirt (body language driven by a 0..1 mood)'],
  actions: ['walk cycle', 'punch (wind-up, snap, recover)', 'kick', 'hit reaction', 'stagger', 'block', 'drink', 'reach (pick up from a surface)', 'lift to mouth + head tilt', 'laugh', 'gesture', 'nod', 'cheer', 'throw dart', 'cue strike', 'foosball jerk', 'slump over the bar', 'knock-out fall', 'head tracking (look at a point)'],
};

const CHAR_NOTES = [
  'Origin at the feet centre, facing +Z, Y up. Real-world scale (1 unit = 1 m).',
  'Needs a skeleton with at least the listed joints at roughly the listed positions; every pose and action is driven per joint in code, so keep the pivots where they are or update Patron.js to match.',
  'Props (glasses, bottles, pool cues, darts) attach to the right hand.',
  'The mouth width animates with mood (pick-up lines); a separate mouth mesh or blend shape keeps that working.',
];

const C = (id, name, opts, description, usedIn, extra = {}) => ({
  id, name, category: 'characters', kind: 'character', patron: opts.bar ? opts.bar : null, patronOpts: opts.bar ? null : opts,
  description, usedIn, source: 'src/world/Patron.js · Patron', notes: CHAR_NOTES, tags: ['character', 'npc', 'rigged', ...(extra.tags || [])], ...extra,
});

const characters = [
  C('char-dee', 'Dee (bartender)', { bar: 'Dee' }, 'Runs the bar. Walks the length of the back bar, serves both glasses in the drinking contest and chats with whoever is at the counter.', ['Behind the bar', 'Drinking contest (serves the rounds)'], { tags: ['staff', 'female'] }),
  C('char-sal', 'Sal', { bar: 'Sal' }, 'The bar\'s most dedicated regular. Sits on the end stool, drinks steadily, and is the opponent in the drinking contest: turns to the bar, picks up his glass, turns back and chugs.', ['Bar, left end stool', 'Drinking contest opponent'], { tags: ['opponent', 'seated', 'male'] }),
  C('char-rose', 'Rose', { bar: 'Rose' }, 'Leans on the jukebox picking songs. The pick-up lines conversation partner; her posture opens up or closes off as the conversation goes well or badly.', ['By the jukebox', 'Pick-up lines'], { tags: ['opponent', 'female'] }),
  C('char-mick', 'Big Mick', { bar: 'Big Mick' }, 'The biggest man in the bar. Holds court mid-room with his crew; the bar fight starts one-on-one with him.', ['Mid-room with his crew', 'Bar fight opponent'], { tags: ['opponent', 'fighter', 'male'] }),
  C('char-tiny', 'Tiny', { bar: 'Tiny' }, 'One of Mick\'s crew. May join the bar fight; one of the crew is sometimes the "bruiser" who will not go down.', ['Mid-room with Mick', 'Bar fight (joins)'], { tags: ['fighter', 'male'] }),
  C('char-doug', 'Doug', { bar: 'Doug' }, 'One of Mick\'s crew. May join the bar fight.', ['Mid-room with Mick', 'Bar fight (joins)'], { tags: ['fighter', 'male'] }),
  C('char-sharkey', 'Sharkey', { bar: 'Sharkey' }, 'One of Mick\'s crew. May join the bar fight.', ['Mid-room with Mick', 'Bar fight (joins)'], { tags: ['fighter', 'male'] }),
  C('char-earl', 'Earl', { bar: 'Earl' }, 'Regular. Wanders between the bar, tables, pool, darts and foosball; joins drinking contests and the occasional brawl.', ['Anywhere (NPC director)'], { tags: ['regular', 'male'] }),
  C('char-marge', 'Marge', { bar: 'Marge' }, 'Regular. Same activity set as the other regulars.', ['Anywhere (NPC director)'], { tags: ['regular', 'female'] }),
  C('char-lou', 'Lou', { bar: 'Lou' }, 'Regular.', ['Anywhere (NPC director)'], { tags: ['regular', 'male'] }),
  C('char-benny', 'Benny', { bar: 'Benny' }, 'Regular.', ['Anywhere (NPC director)'], { tags: ['regular', 'male'] }),
  C('char-vic', 'Vic', { bar: 'Vic' }, 'Regular.', ['Anywhere (NPC director)'], { tags: ['regular', 'male'] }),
  C('char-pearl', 'Pearl', { bar: 'Pearl' }, 'Regular.', ['Anywhere (NPC director)'], { tags: ['regular', 'female'] }),
  C('char-rudy', 'Rudy', { bar: 'Rudy' }, 'Regular.', ['Anywhere (NPC director)'], { tags: ['regular', 'male'] }),
  C('char-gus', 'Gus', { bar: 'Gus' }, 'Regular.', ['Anywhere (NPC director)'], { tags: ['regular', 'male'] }),
  C('char-nell', 'Nell', { bar: 'Nell' }, 'Regular.', ['Anywhere (NPC director)'], { tags: ['regular', 'female'] }),
  C('char-frank', 'Frank', { bar: 'Frank' }, 'Regular.', ['Anywhere (NPC director)'], { tags: ['regular', 'male'] }),
  C('char-fergus', 'Fergus', { name: 'Fergus', shirt: 0x3d6b3a, height: 1.02, seed: 77 }, 'The darts opponent. Throws from beside the oche and answers your score.', ['Darts opponent (only appears during darts)'], { tags: ['opponent', 'male'], source: 'src/minigames/darts.js · Darts.start' }),
  C('char-shark', 'Shark', { name: 'Shark', shirt: 0x151515, height: 1.05, seed: 404 }, 'The billiards opponent. Walks round the table to his shot, leans in with his cue, strikes, then stands back with the cue upright.', ['Billiards opponent (only appears during billiards)'], { tags: ['opponent', 'male'], source: 'src/minigames/billiards.js · Billiards.start' }),
  C('char-nadia', 'Nadia', { name: 'Nadia', female: true, shirt: 0xd93b2b, height: 0.98, seed: 909 }, 'The foosball opponent. Stands at the far side of the table working the red rods.', ['Foosball opponent (only appears during foosball)'], { tags: ['opponent', 'female'], source: 'src/minigames/foosball.js · Foosball.start' }),
];

// ---------------------------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------------------------
const glassSpecFor = (i) => SPECS[i];

const drinks = DRINKS.map((d, i) => {
  const spec = glassSpecFor(i);
  const garnish = spec.garnish || null;
  return {
    id: `drink-${i + 1}`,
    name: d.name.replace(/^a(n)? /, '').replace(/^\w/, (c) => c.toUpperCase()),
    category: 'drinks', kind: 'model',
    description: `Round ${i + 1} of the drinking contest. Dee serves two of these, one for you and one for Sal.`,
    usedIn: [`Drinking contest, round ${i + 1}`],
    source: 'src/minigames/drinking.js · SPECS + Bar.glass',
    tags: ['drink', 'glass', d.pint ? 'pint glass' : 'rocks glass', garnish ? `garnish: ${garnish}` : 'no garnish', spec.foam ? 'foam' : 'no foam'],
    notes: [...GLASS_NOTES, `Liquid colour #${spec.color.toString(16).padStart(6, '0')}, ${Math.round((spec.fill ?? 0.8) * 100)}% full${spec.opacity ? `, ${Math.round(spec.opacity * 100)}% opaque` : ''}.`],
    build: (ctx) => ctx.bar.glass(0, 0, 0, d.pint, new THREE.Group(), spec),
  };
});

const models = [
  // ---- weapons & props ----
  { id: 'bottle', cap: 'bottle', name: 'Bottle', category: 'props', categories: ['props', 'weapons'], local: true,
    description: 'The bar\'s all-purpose bottle: lines the back-bar shelves, sits on every table, and is the main improvised weapon in the bar fight (grab, throw, or smash over someone).',
    usedIn: ['Back-bar shelves', 'Tables', 'Bar counter', 'Bar fight: grab / throw / smash'],
    source: 'src/world/Bar.js · Bar.bottle', tags: ['bottle', 'throwable', 'weapon', 'glass'],
    notes: ['Origin at the base centre, Y up.', 'Six glass colours and three label colours are mixed along the shelves; a variant set (or a tintable material) keeps that variety.', 'When thrown it spins end over end, so the silhouette should read from any angle.', 'Held in the first-person fight anchor and in patrons\' right hands.'] },
  { id: 'pint-glass', cap: 'pintGlass', name: 'Pint glass (half-finished)', category: 'props', categories: ['props'], build: (ctx) => ctx.bar.glass(0, 0, 0, true, new THREE.Group()),
    description: 'A pint of lager left on the bar and tables, and the glass the regulars hold while they drink.', usedIn: ['Bar counter', 'Tables', 'Patrons\' hands'],
    source: 'src/world/Bar.js · Bar.glass', tags: ['glass', 'pint', 'drink'], notes: GLASS_NOTES },
  { id: 'rocks-glass', cap: 'rocksGlass', name: 'Rocks glass', category: 'props', categories: ['props', 'weapons'], build: (ctx) => ctx.bar.glass(0, 0, 0, false, new THREE.Group()),
    description: 'Short glass with a spirit in it. Sits on the tables and is a throwable in the bar fight (lighter than a bottle).', usedIn: ['Tables', 'Bar fight: grab / throw / smash'],
    source: 'src/world/Bar.js · Bar.glass', tags: ['glass', 'throwable', 'weapon', 'drink'], notes: GLASS_NOTES },
  { id: 'pool-cue', name: 'Pool cue', category: 'props', categories: ['props', 'equipment'], build: () => makeCue(),
    description: 'Two-piece cue: ash shaft with a blue tip and a dark wrapped butt. Used by you (first person and on the table) and by Shark.', usedIn: ['Billiards: your cue on the table', 'Billiards: carried in first person', 'Billiards: Shark\'s cue'],
    source: 'src/minigames/billiards.js · makeCue', tags: ['cue', 'billiards', 'stick'],
    notes: ['Origin at the tip, the stick runs along -Z. The aim, power pull-back and strike all move it along that axis.', 'Current length is 1.88 m (longer than a real 1.47 m cue); a regulation cue is fine, the code places it by the tip.'] },
  { id: 'pool-balls', name: 'Pool balls (full set)', category: 'equipment', categories: ['equipment', 'props'],
    build: () => {
      const g = new THREE.Group();
      const geo = new THREE.SphereGeometry(0.0286, 32, 20);
      const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 15, 7];
      let k = 0; const gap = 0.0286 * 2.05;
      for (let row = 0; row < 5; row++) for (let i = 0; i <= row; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ballTexture(order[k++]), roughness: 0.25, metalness: 0.05 }));
        m.position.set((i - row / 2) * gap, 0.0286, -row * gap * 0.866); m.rotation.y = -Math.PI / 2; g.add(m);
      }
      const cue = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ballTexture(0), roughness: 0.25 }));
      cue.position.set(0, 0.0286, 0.12); g.add(cue);
      return g;
    },
    description: 'Sixteen balls: cue ball, solids 1 to 7, the 8, and stripes 9 to 15, shown racked. Each ball\'s texture is generated (number circle on both sides; stripes are a band).',
    usedIn: ['Billiards', 'A few sit on the pool table between games (plain colours)'], source: 'src/minigames/billiards.js · ballTexture', tags: ['billiards', 'balls', 'set'],
    notes: ['Radius must stay 28.6 mm (57.2 mm diameter): the physics simulation uses it.', 'Balls roll by rotating the mesh, so put the numbers and stripes in a texture (or UV layout) that reads while rolling.'] },
  { id: 'dart', name: 'Dart', category: 'equipment', categories: ['equipment', 'props', 'weapons'],
    build: () => {
      const g = new THREE.Group();
      const blue = Darts.prototype.makeDart.call(null, 0x3355dd); blue.position.x = -0.03; g.add(blue);
      const red = Darts.prototype.makeDart.call(null, 0xdd3333); red.position.x = 0.03; g.add(red);
      return g;
    },
    description: 'Steel-tip dart: needle point, knurled tungsten barrel, nylon shaft with a gold ring, four printed flights. Blue flights are yours, red are Fergus\'s (shown side by side).',
    usedIn: ['Darts (your throws and Fergus\'s)', 'Darts thrown by regulars at the board'], source: 'src/minigames/darts.js · Darts.makeDart', tags: ['darts', 'throwable'],
    notes: ['Origin at the point, the dart points along +Z. It is aimed by pointing +Z along its flight path and spins about that axis, and sticks into the board 8 mm deep.', 'About 139 mm long; flights span 35 mm.', 'Flights are self-lit slightly so they read with the board light in front of them; a flight texture with team colour is enough.'] },
  { id: 'coat-hanging', cap: 'coat', name: 'Coat on the rack', category: 'props', categories: ['props'], description: 'Somebody\'s coat that has been on the rack all night.', usedIn: ['Coat rack by the door'], source: 'src/world/Bar.js · buildEntrance', tags: ['coat', 'clothing'], notes: ['Hangs from the rack hook at 1.7 m.'] },
  { id: 'coat-player', cap: 'playerCoat', name: 'Your coat', category: 'props', categories: ['props'], description: 'The player\'s coat. Carried in front of the camera in the opening and hung on the rack.', usedIn: ['Opening: carried in first person and hung on the rack'], source: 'src/world/Bar.js · buildEntrance + src/engine/Game.js · updateIntro', tags: ['coat', 'clothing', 'intro', 'player'], notes: ['Moved by its origin (centre) from just below the camera to the hook at 1.7 m, tilting as it goes.'] },

  // ---- game equipment ----
  { id: 'pool-table', cap: 'poolTable', name: 'Pool table', category: 'equipment', local: true, hide: ['poolDecor'],
    description: 'Seven-foot bar table: dark wood frame, green felt bed and cushions, six pockets, four square legs.', usedIn: ['Billiards', 'NPCs shoot pool here'], source: 'src/world/Bar.js · buildPoolTable', tags: ['billiards', 'table', 'felt'],
    notes: ['Physics constraint: the playing surface (inside the cushions) is 2.30 x 1.15 m and the bed top sits at 0.82 m. Pockets are at the four corners and the middle of each long side (corner mouths 68 mm, side 58 mm). Keep these or update poolPhysics.js.', 'Origin at floor level under the table centre; the long axis runs along X.', 'The camera gets very close to the felt and the rails when aiming, so they deserve the most texture detail.'] },
  { id: 'cue-rack', cap: 'cueRack', name: 'Cue rack', category: 'equipment', categories: ['equipment', 'decor'], face: Math.PI / 2, ground: false, description: 'Four house cues standing against the wall behind the pool table.', usedIn: ['East wall by the pool table'], source: 'src/world/Bar.js · buildPoolTable', tags: ['billiards', 'cues', 'wall'], notes: ['Decorative only; a proper wall rack holding these would improve it.'] },
  { id: 'dartboard', cap: 'dartboard', name: 'Dartboard and cabinet', category: 'equipment', face: Math.PI / 2, ground: false,
    description: 'Regulation bristle board (451 mm) with a printed number ring, in a dark wood cabinet panel.', usedIn: ['Darts', 'NPCs throw at it'], source: 'src/world/Bar.js · buildDarts + textures.js · dartboard', tags: ['darts', 'board', 'wall'],
    notes: ['Scoring constraint: the board face is a disc of radius 225.5 mm; the double ring\'s outer edge is at 80% of it (180 mm) and all other rings scale from there (treble 58 to 63%, outer bull 9.4%, bull 3.7% of 180 mm). 20 at the top, numbers clockwise 20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5. Keep the layout exact or scoring stops matching what players see.', 'Board centre is 1.73 m off the floor; the face points into the room.', 'During darts the board fills most of the screen, so it needs a high-resolution face texture (the current one is 2048 px).'] },
  { id: 'oche', cap: 'oche', name: 'Oche (throw line)', category: 'equipment', views: ['hero', 'top'], description: 'The cream throw line on the floor, 2.37 m from the board face.', usedIn: ['Darts'], source: 'src/world/Bar.js · buildDarts', tags: ['darts', 'floor marker'], notes: ['Must stay 2.37 m from the board face.'] },
  { id: 'chalkboard', cap: 'chalkboard', name: 'Chalk scoreboard', category: 'decor', categories: ['decor', 'equipment'], face: Math.PI / 2, ground: false, views: ['front', 'hero'], description: 'Chalkboard by the dartboard with tonight\'s games written on it.', usedIn: ['Wall beside the dartboard'], source: 'src/world/Bar.js · buildDarts + textures.js · chalkboard', tags: ['sign', 'chalk', 'wall'], notes: ['A flat textured panel; the text is part of the texture.'] },
  { id: 'foosball-table', cap: 'foosballTable', name: 'Foosball table', category: 'equipment', local: true,
    description: 'Wooden foosball table with a printed pitch, open box sides, two goals, metal legs and eight rods. The bar version shown here uses simple block figures; the playable figures are the next entry.', usedIn: ['Foosball', 'NPCs play here'], source: 'src/world/Bar.js · buildFoosball', tags: ['foosball', 'table'],
    notes: ['Physics constraint: the pitch is 1.20 x 0.70 m with its surface at 0.77 m; goals are 0.20 m wide in the middle of each end; rod rows are 0.15 m apart at x = -0.525 to +0.525. Keep these or update foosball.js.', 'Origin at floor level under the table centre; long axis along X.', 'During foosball the camera looks down the length of the table from behind your goal, filling the screen, so the pitch and inner walls need the most detail.'] },
  { id: 'foosball-rod', name: 'Foosball rod (3 figures)', category: 'equipment', build: () => { const r = makeFoosRod('you', [-0.18, 0, 0.18], foosMaterials()); return r.group; },
    description: 'A playable rod: steel bar, rubber handle on its owner\'s side, figures fixed to it. Rods come with 3 (goalie, forwards, defence on one side), 2 or 5 figures.', usedIn: ['Foosball (8 rods per game)'], source: 'src/minigames/foosball.js · makeFoosRod', tags: ['foosball', 'rod'],
    notes: ['Origin on the rod axis at the table\'s centre line; Z runs across the table. The rod slides along Z and spins about Z.', 'The selected rod\'s handle is recoloured amber; keep the handle a separate mesh or material.'] },
  { id: 'foosball-figure', name: 'Foosball figure', category: 'equipment', build: () => { const m = foosMaterials(); const g = new THREE.Group(); const a = makeFoosFigure(m.youMat, m); a.position.x = -0.03; const b = makeFoosFigure(m.botMat, m); b.position.x = 0.03; g.add(a, b); return g; },
    description: 'One figure on a rod, in your blue and Nadia\'s red (shown side by side).', usedIn: ['Foosball'], source: 'src/minigames/foosball.js · makeFoosFigure', tags: ['foosball', 'figure', 'team colours'],
    notes: ['Origin where the rod passes through the chest; the feet hang 7 cm below it. Kick physics uses that foot length (65 mm from the rod axis).', 'Spins full circles on the rod, so it must look right upside down.', 'Two team colours: blue (you) and red (opponent).'] },

  // ---- first-person ----
  { id: 'fp-fight', name: 'Fight arms and boot', category: 'viewmodels', categories: ['viewmodels', 'weapons'], viewmodel: true, build: () => { const f = makeFightArms(); return f.hands; },
    description: 'Your arms in the bar fight: two arms (sleeve to fist) for punching and blocking, and a boot that swings up for kicks. A grabbed bottle or glass is held at an anchor in front of the right hand.', usedIn: ['Bar fight'], source: 'src/minigames/barfight.js · makeFightArms', tags: ['first person', 'arms', 'fists', 'boot', 'weapon'],
    notes: ['Camera-local: the camera is at the origin looking down -Z, 72 degree field of view. Each arm hangs from a shoulder pivot (x = +/-0.30, y = -0.32) and bends at an elbow pivot.', 'Guard, punch, high block and low block poses rotate those two pivots; keep them as separate bones.', 'The boot is normally hidden and only shown during a kick.'] },
  { id: 'fp-drink', name: 'Drinking hand', category: 'viewmodels', viewmodel: true, build: () => { const h = makeDrinkHand(); h.position.set(0.32, -0.42, -0.5); const g = new THREE.Group(); g.add(h); return g; },
    description: 'Your right hand and sleeve in the drinking contest. Reaches down to the bar, takes the glass, brings it to your mouth and tips it back.', usedIn: ['Drinking contest'], source: 'src/minigames/drinking.js · makeDrinkHand', tags: ['first person', 'hand'],
    notes: ['Camera-local; origin at the palm centre. The glass is parented to the hand while drinking, sitting 3 cm below the palm.', 'Rotates about X up to about 65 degrees to tip the glass toward the mouth.'] },
  { id: 'fp-cue', name: 'Cue in hand and chalk', category: 'viewmodels', categories: ['viewmodels', 'equipment'], viewmodel: true, build: () => { const v = makeCueViewmodel(); const g = new THREE.Group(); v.handL.position.set(-0.05, -0.18, -0.55); g.add(v.handCue, v.handL); return g; },
    description: 'While it is not your shot: your cue held low in the right hand, tip up and away. The left hand holds a cube of blue chalk and rubs the tip when you chalk your cue.', usedIn: ['Billiards (while waiting and chalking)'], source: 'src/minigames/billiards.js · makeCueViewmodel', tags: ['first person', 'hand', 'cue', 'chalk'],
    notes: ['Camera-local. The chalking animation swings the cue tip up in front of the camera and moves the chalk hand to it.', 'The chalk hand is shown here beside the cue; in game it only appears while chalking.'] },

  // ---- furniture ----
  { id: 'bar-counter', cap: 'barCounter', name: 'Bar counter', category: 'furniture', description: 'The main bar: dark wood body, lighter top with an overhang, brass foot rail on posts, and a lift-up flap at the bartender\'s end.', usedIn: ['North side of the room'], source: 'src/world/Bar.js · buildBar', tags: ['bar', 'counter', 'brass'],
    notes: ['Gameplay constraint: the top surface is at 1.11 m. Drinking-contest glasses and the regulars\' pints are placed at that height.', 'The front face is what players see most; seated patrons sit 0.85 m in front of it.', 'About 8.6 m long, built as long boxes; tiling textures or modular sections both work.'] },
  { id: 'beer-tap', cap: 'beerTap', name: 'Beer tap', category: 'furniture', categories: ['furniture', 'props'], description: 'Chrome tap with a handle; four sit along the middle of the bar. Handles alternate brass and wood.', usedIn: ['Bar counter (x4)'], source: 'src/world/Bar.js · buildBar', tags: ['bar', 'tap', 'chrome'], notes: ['Static.'] },
  { id: 'back-bar', cap: 'backBar', name: 'Back bar', category: 'furniture', description: 'Low back counter, a long mirror, and three wooden shelves (the bottles on them are the Bottle asset).', usedIn: ['Behind the bar (north wall)'], source: 'src/world/Bar.js · buildBar', tags: ['bar', 'shelves', 'mirror'], notes: ['Bottles are placed every 19 cm along each shelf at 1.25, 1.67 and 2.09 m.', 'The neon "Fox & Fiddle" sign hangs above it.'] },
  { id: 'bar-stool', cap: 'barStool', name: 'Bar stool', category: 'furniture', description: 'Round red leather seat on a chrome pole with a foot ring and a round base.', usedIn: ['Along the bar (x10)'], source: 'src/world/Bar.js · Bar.stool', tags: ['stool', 'seat', 'leather', 'chrome'], notes: ['Gameplay constraint: seat height 0.72 m (the seated pose is fitted to it), seat radius 0.18 m.', 'Origin at the floor under the pole.'] },
  { id: 'pub-table', cap: 'pubTable', name: 'Pub table', category: 'furniture', description: 'Round wooden table top on a metal pedestal.', usedIn: ['Four around the room'], source: 'src/world/Bar.js · buildTables', tags: ['table'], notes: ['Top surface at 0.76 m (glasses and bottles are placed on it).', 'Three chairs sit around each table at 0.7 m.'] },
  { id: 'chair', cap: 'chair', name: 'Chair', category: 'furniture', local: true, description: 'Simple wooden chair.', usedIn: ['Around the tables (x12)'], source: 'src/world/Bar.js · Bar.chair', tags: ['chair', 'seat'], notes: ['Gameplay constraint: seat height 0.46 m (the seated pose is fitted to it).', 'Origin at the floor centre; the seat faces +Z (backrest at -Z).'] },
  { id: 'coat-rack', cap: 'coatRack', name: 'Coat rack', category: 'furniture', local: true, description: 'Brass pole with four hooks on a round wooden base.', usedIn: ['By the entrance'], source: 'src/world/Bar.js · buildEntrance', tags: ['coat rack', 'brass', 'entrance'], notes: ['Hooks at 1.7 m: the opening animation hangs your coat there.'] },
  { id: 'jukebox', cap: 'jukebox', name: 'Jukebox', category: 'furniture', categories: ['furniture', 'lighting', 'decor'], local: true,
    description: 'Arched red cabinet with a glowing amber panel and a pink neon tube round the arch. Lights up its corner of the room.', usedIn: ['South-east corner', 'Rose leans on it'], source: 'src/world/Bar.js · buildJukebox', tags: ['jukebox', 'neon', 'emissive', 'music'],
    notes: ['Origin at the floor centre; the front faces +Z.', 'The glow panel and neon tube are self-lit (emissive) and there is a warm point light 0.8 m in front of the panel.', 'Rose stands 0.9 m in front of it with one hand on the cabinet.'] },

  // ---- decor ----
  { id: 'neon-sign', cap: 'neonSign', name: 'Neon sign "Fox & Fiddle"', category: 'decor', categories: ['decor', 'lighting'], ground: false, views: ['front', 'hero'], description: 'The bar\'s name in pink neon script above the back bar. Flickers occasionally.', usedIn: ['Above the back bar'], source: 'src/world/Bar.js · buildDecor + textures.js · neonText', tags: ['neon', 'sign', 'emissive', 'branding'], notes: ['Currently an unlit transparent plane (4.2 x 1.05 m) with a painted glow; a pink point light in front of it lights the bar.', 'Flicker is done by fading the material\'s opacity, so keep it one material.'] },
  { id: 'open-sign', cap: 'openSign', name: 'Neon sign "OPEN"', category: 'decor', categories: ['decor', 'lighting'], local: true, ground: false, views: ['front', 'hero'], description: 'Blue neon OPEN in the front window.', usedIn: ['Front window'], source: 'src/world/Bar.js · buildEntrance', tags: ['neon', 'sign', 'emissive'], notes: ['Unlit transparent plane, 1.1 x 0.35 m, with a blue point light inside the window.'] },
  { id: 'poster-live-music', cap: 'posterLiveMusic', name: 'Poster: Live music', category: 'decor', local: true, ground: false, views: ['front'], description: '"LIVE MUSIC — every Friday, the Lonesome Pines".', usedIn: ['North wall, west end'], source: 'src/world/Bar.js · buildDecor + textures.js · poster', tags: ['poster', 'wall'], notes: ['0.6 x 0.9 m flat panel; artwork is the texture (256 x 384).'] },
  { id: 'poster-fox-fiddle', cap: 'posterFoxFiddle', name: 'Poster: Fox & Fiddle', category: 'decor', local: true, ground: false, views: ['front'], description: '"FOX & FIDDLE — est. 1974, cold beer, warm welcome".', usedIn: ['South wall'], source: 'src/world/Bar.js · buildDecor + textures.js · poster', tags: ['poster', 'wall', 'branding'], notes: ['0.6 x 0.9 m flat panel; artwork is the texture (256 x 384).'] },
  { id: 'poster-no-fighting', cap: 'posterNoFighting', name: 'Poster: No fighting', category: 'decor', local: true, ground: false, views: ['front'], description: '"NO FIGHTING — (we mean it, Mick)".', usedIn: ['East wall'], source: 'src/world/Bar.js · buildDecor + textures.js · poster', tags: ['poster', 'wall'], notes: ['0.6 x 0.9 m flat panel; artwork is the texture (256 x 384).'] },
  { id: 'poster-darts-league', cap: 'posterDartsLeague', name: 'Poster: Darts league', category: 'decor', local: true, ground: false, views: ['front'], description: '"DARTS LEAGUE — Tuesdays, sign up at the bar".', usedIn: ['East wall near the dartboard'], source: 'src/world/Bar.js · buildDecor + textures.js · poster', tags: ['poster', 'wall', 'darts'], notes: ['0.6 x 0.9 m flat panel; artwork is the texture (256 x 384).'] },
  { id: 'poster-happy-hour', cap: 'posterHappyHour', name: 'Poster: Happy hour', category: 'decor', local: true, ground: false, views: ['front'], description: '"HAPPY HOUR — 5 til 7, half price regrets".', usedIn: ['West wall'], source: 'src/world/Bar.js · buildDecor + textures.js · poster', tags: ['poster', 'wall'], notes: ['0.6 x 0.9 m flat panel; artwork is the texture (256 x 384).'] },
  { id: 'tv', cap: 'tv', name: 'TV', category: 'decor', face: -0.5, ground: false, views: ['front', 'hero', 'side'], description: 'Wall-mounted TV angled into the room, showing a blue glow.', usedIn: ['North-west corner'], source: 'src/world/Bar.js · buildDecor', tags: ['tv', 'screen', 'emissive'], notes: ['The screen is a separate self-lit plane; a moving texture (sports, static) would add life.'] },
  { id: 'ceiling-fan', cap: 'ceilingFan', name: 'Ceiling fan', category: 'decor', local: true, ground: false, views: ['hero', 'front', 'below'], description: 'Four wooden blades on a metal downrod.', usedIn: ['Ceiling, mid-room'], source: 'src/world/Bar.js · buildDecor', tags: ['fan', 'ceiling', 'animated'], notes: ['Origin at the hub; spins about Y continuously (2.2 rad/s).'] },
  { id: 'ceiling-pipe', cap: 'ceilingPipe', name: 'Ceiling pipe', category: 'architecture', categories: ['architecture', 'decor'], ground: false, views: ['hero', 'front'], description: 'Exposed metal pipe running the length of the ceiling (two of them).', usedIn: ['Ceiling, along the north and south walls'], source: 'src/world/Bar.js · buildDecor', tags: ['pipe', 'ceiling', 'industrial'], notes: ['15.6 m long, 0.1 m diameter; fittings and brackets would help.'] },
  { id: 'radiator', cap: 'radiator', name: 'Radiator', category: 'decor', categories: ['decor', 'architecture'], face: Math.PI, description: 'Metal radiator under the front window.', usedIn: ['South wall'], source: 'src/world/Bar.js · buildDecor', tags: ['radiator', 'metal'], notes: ['Currently a plain box; fins would sell it.'] },
  { id: 'potted-plant', cap: 'pottedPlant', name: 'Potted plant', category: 'decor', description: 'A tired plant in a terracotta pot.', usedIn: ['South-west corner'], source: 'src/world/Bar.js · buildDecor', tags: ['plant', 'pot'], notes: ['Currently a cone; any leafy low-poly plant.'] },

  // ---- lighting ----
  { id: 'pendant-lamp', cap: 'pendantLamp', name: 'Pendant lamp', category: 'lighting', local: true, ground: false, views: ['hero', 'front', 'below'], description: 'Green enamel shade with a warm bulb on a black cord. Hangs over the bar, tables, pool table and foosball.', usedIn: ['Throughout the room (x14)'], source: 'src/world/Bar.js · buildLights', tags: ['lamp', 'light', 'emissive'], notes: ['Origin at the shade; the cord runs up to the ceiling, so its length varies per lamp (1.0 to 1.4 m).', 'The bulb is self-lit and a point light hangs just below it; two of them cast shadows.'] },
  { id: 'wall-sconce', cap: 'wallSconce', name: 'Wall lamp', category: 'lighting', local: true, ground: false, views: ['front', 'hero'], description: 'Half-globe wall lamp above the coat rack, so the opening is lit.', usedIn: ['West wall above the coat rack'], source: 'src/world/Bar.js · buildLights', tags: ['lamp', 'light', 'emissive', 'entrance'], notes: ['Self-lit with a warm point light 0.27 m out from the wall.'] },

  // ---- architecture ----
  { id: 'floor', cap: 'floor', name: 'Floor', category: 'architecture', ground: false, views: ['hero', 'top'], description: 'Dark wooden plank floor covering the whole room.', usedIn: ['Whole room'], source: 'src/world/Bar.js · build + textures.js · woodPlanks', tags: ['floor', 'planks', 'tiling'], notes: ['16 x 11 m. The plank texture repeats 10 x 7 times.', 'The camera is always about 1.6 m above it, so it fills the lower part of most views.'] },
  { id: 'ceiling', cap: 'ceiling', name: 'Ceiling and beams', category: 'architecture', ground: false, views: ['below', 'hero'], description: 'Dark ceiling at 3.4 m with seven exposed wooden beams.', usedIn: ['Whole room'], source: 'src/world/Bar.js · build', tags: ['ceiling', 'beams'], notes: ['Room height 3.4 m; beams 0.18 x 0.22 m, 2.3 m apart.'] },
  { id: 'wall-brick', cap: 'wallBrick', name: 'Brick walls', category: 'architecture', ground: false, views: ['hero'], viewAz: -45, description: 'Exposed red brick on the north (behind the bar) and east (darts, pool) walls, with a black skirting board.', usedIn: ['North and east walls'], source: 'src/world/Bar.js · build + textures.js · brick', tags: ['wall', 'brick', 'tiling'], notes: ['North wall 16 m, east wall 11 m, both 3.4 m high. Brick texture repeats 6 x 2 (north) and 4 x 2 (east).'] },
  { id: 'wall-plaster', cap: 'wallPlaster', name: 'Plaster walls with wainscot', category: 'architecture', ground: false, views: ['hero'], viewAz: 135, description: 'Stained brown plaster on the south (entrance) and west walls, with dark wood panelling to 1 m.', usedIn: ['South and west walls'], source: 'src/world/Bar.js · build + textures.js · plaster', tags: ['wall', 'plaster', 'wainscot', 'tiling'], notes: ['South wall 16 m, west wall 11 m, 3.4 m high; wainscot 1 m high.'] },
  { id: 'door', cap: 'door', name: 'Entrance door', category: 'architecture', face: Math.PI, description: 'Dark wooden front door with a black frame and a brass knob.', usedIn: ['South wall (you enter here)'], source: 'src/world/Bar.js · buildEntrance', tags: ['door', 'entrance'], notes: ['1.0 x 2.2 m. The opening starts just inside it.'] },
  { id: 'window', cap: 'window', name: 'Front window', category: 'architecture', face: Math.PI, ground: false, views: ['front', 'hero'], description: 'Dark night-time window in the front wall (the OPEN sign hangs in it).', usedIn: ['South wall'], source: 'src/world/Bar.js · buildEntrance', tags: ['window', 'night'], notes: ['1.4 x 0.9 m, centre 2.0 m up. Currently a dark reflective panel; a night street view would add depth.'] },
  { id: 'doormat', cap: 'doormat', name: 'Doormat', category: 'architecture', categories: ['architecture', 'props'], views: ['hero', 'top'], description: 'Brown mat inside the door.', usedIn: ['Entrance'], source: 'src/world/Bar.js · buildEntrance', tags: ['mat', 'entrance'], notes: ['1.2 x 0.7 m.'] },
];

// ---------------------------------------------------------------------------------------------
// Textures (generated on canvases at load time)
// ---------------------------------------------------------------------------------------------
const tex = (id, name, make, description, usedIn, extra = {}) => ({ id, name, category: 'textures', kind: 'texture', make, description, usedIn, source: extra.source || 'src/world/textures.js', tags: ['texture', ...(extra.tags || [])], notes: extra.notes || [] });

const textures = [
  tex('tex-floor-planks', 'Floor planks', () => T.woodPlanks([10, 7], '#4e3220'), 'Dark wood planks with grain lines and seams.', ['Floor'], { tags: ['wood', 'tiling'], notes: ['Tiles 10 x 7 across the 16 x 11 m floor (one tile covers 1.6 x 1.57 m).'] }),
  tex('tex-wood-light', 'Wood', () => T.woodPlanks([2, 1], '#5a3a22'), 'Mid-brown wood.', ['Bar top', 'Back-bar top and shelves', 'Table tops', 'Cue shafts on the rack'], { tags: ['wood', 'tiling'] }),
  tex('tex-wood-dark', 'Dark wood', () => T.woodPlanks([1, 1], '#3a2414'), 'Dark stained wood.', ['Bar counter body', 'Back bar', 'Pool and foosball tables', 'Chairs', 'Door', 'Ceiling beams', 'Wainscot', 'Fan blades'], { tags: ['wood', 'tiling'] }),
  tex('tex-brick', 'Brick', () => T.brick([6, 2]), 'Red brick with dark mortar and soot patches.', ['North and east walls'], { tags: ['brick', 'tiling', 'wall'] }),
  tex('tex-plaster', 'Plaster', () => T.plaster([4, 1], '#4a3a30'), 'Stained brown plaster.', ['South and west walls'], { tags: ['plaster', 'tiling', 'wall'] }),
  tex('tex-felt', 'Pool felt', () => T.felt('#1f6b3a'), 'Green baize with fine grain.', ['Pool table bed and cushions'], { tags: ['felt', 'tiling', 'billiards'] }),
  tex('tex-dartboard', 'Dartboard face', () => T.dartboard(), 'Full board face: segments, rings, wires, number ring and rim.', ['Dartboard'], { tags: ['darts', 'scoring'], notes: ['Ring radii are tied to scoring (see the Dartboard entry). Painted at 2048 px because the board fills the screen during darts.'] }),
  tex('tex-foosball-pitch', 'Foosball pitch', () => T.foosballPitch(), 'Green pitch with white lines, centre circle and goal boxes.', ['Foosball table'], { tags: ['foosball', 'pitch'] }),
  tex('tex-chalkboard', 'Chalkboard', () => T.chalkboard(), 'Tonight\'s games in chalk, wooden frame.', ['Chalk scoreboard'], { tags: ['chalk', 'sign'] }),
  tex('tex-neon-fox', 'Neon "Fox & Fiddle"', () => T.neonText('Fox & Fiddle'), 'Pink neon script with a painted glow, on transparency.', ['Neon sign above the bar'], { tags: ['neon', 'branding', 'transparent'] }),
  tex('tex-neon-open', 'Neon "OPEN"', () => T.neonText('OPEN', '#4fd9ff', 512, 160, 'bold 110px Georgia'), 'Blue neon OPEN on transparency.', ['Front window'], { tags: ['neon', 'transparent'] }),
  tex('tex-pool-balls', 'Pool ball textures', null, 'All sixteen ball textures (cue ball, 1 to 15), each a 256 x 128 wrap with the number circle on both sides.', ['Pool balls'], { tags: ['billiards', 'balls'], source: 'src/minigames/billiards.js · ballTexture', notes: ['Stripes (9 to 15) are a colour band on white; solids are the full colour.'] }),
  tex('tex-hit-flash', 'Hit flash', () => flashTexture(), 'Radial white-to-orange flash drawn as a sprite where a punch or kick lands.', ['Bar fight'], { tags: ['effect', 'sprite', 'transparent'], source: 'src/minigames/barfight.js · flashTexture' }),
];
textures.forEach((t) => { if (t.id === 'tex-hit-flash') { t.category = 'ui'; t.categories = ['ui', 'textures']; } });

const ui = [
  { id: 'app-icon', name: 'App icon', category: 'ui', kind: 'file', file: 'public/icons/icon-512.png', description: 'Fox face in a neon ring, used as the browser tab icon and home-screen icon.', usedIn: ['Browser tab', 'Home screen (iOS "Add to Home Screen")'], source: 'scripts/make-icons.js', tags: ['icon', 'branding'], notes: ['Generated at 192 and 512 px, plus a 512 px full-bleed version for Android masks.'] },
];

export const ASSETS = [...characters, ...models, ...drinks, ...textures, ...ui];

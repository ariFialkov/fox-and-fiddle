# Patron v2 rig spec

The standard character rig for reskins and prototypes. Patron v2 (`src/world/Patron2.js`) has the same public API as Patron v1. It runs on a 31-bone humanoid skeleton (23 Mixamo-named bones, two finger joints per hand, and four helpers: knees and forearm twists), and any character GLB built to this spec dresses it.

## Conventions

- **Units and axes:** metres, +Y up, character faces +Z.
- **Height:** a GLB is authored at height 1.0, where the shoulders are at 1.30. `new Patron({ height })` scales the whole body.
- **Rest pose:** every bone rests with identity orientation (no rotation). Angles therefore mean the same thing as in v1:
  - x = pitch: arms and legs swing forward on negative x.
  - y = yaw.
  - z = roll.
- **Bone names:** Mixamo names, anatomical sides. The character's left is +X.
- **Proportions:** they live only in the bones' rest translations. Each GLB carries its own (knee height, head pivot, wrist), and `dressPatron2` copies them onto the Patron.

## Skeleton

Positions are world positions at height 1.0, using the defaults in `restLayout()`. A GLB overrides them per character.

| Bone | Parent | Default position | Driven by |
|---|---|---|---|
| Hips | body | (0, 0.80, 0) | sitting height, weight shift (x drift and roll) |
| Spine | Hips | (0, 0.78, 0) | 62% of v1 torso pitch (`p.torso` points here) |
| Spine1 | Spine | (0, 0.95, 0) | 24% of torso pitch |
| Spine2 | Spine1 | (0, 1.12, 0) | 14% of torso pitch, plus breathing |
| Neck | Spine2 | (0, 1.56, 0) | 40% of v1 neck rotation (`p.neck`) |
| Head | Neck | (0, 1.63, 0); Sal: (0, 1.61, 0.08) | 60% of neck rotation |
| Jaw | Head | (0, 1.60, 0.03) | mouth mood, laugh, talk chatter; carries `p.mouth` |
| Right/LeftShoulder | Spine2 | (∓0.05, 1.25, 0) | lifts and rolls forward when the arm goes above about 60° |
| Right/LeftArm | Shoulder | (∓0.27, 1.30, 0); female ∓0.22 | v1 pivot (`arms[i].pivot`) |
| Right/LeftForeArm | Arm | (∓0.27, 1.00, 0) | v1 fore (`arms[i].fore`) |
| Right/LeftForeArmTwist | ForeArm | half way down the forearm | turns half as far as the wrist's twist (skinning only) |
| Right/LeftHand | ForeArm | (∓0.27, 0.76, 0); built GLBs: the middle of the real wrist | wrist: a relaxed curl plus 40% of the drinking tilt; turns the palm toward a held prop (`arms[i].wrist`) |
| Right/LeftHandFingers1 / 2 | Hand / Fingers1 | knuckles / middle joints | the four fingers curl together (thumb stays with the hand): relaxed, or closed round a held prop (`arms[i].f1`, `f2`) |
| Right/LeftHandSocket | Hand | (∓0.27, 0.70, 0) | where props attach (`arms[i].hand`): 60% of the drinking tilt |
| Right/LeftUpLeg | Hips | (∓0.11, 0.80, 0) | v1 hip (`hips[i]`); tips forward by half the knee bend so the foot stays planted |
| Right/LeftLeg | UpLeg | (∓0.11, 0.40, 0); built GLBs: 0.42, set toward the back of the leg | knee: seated legs by IK, a bend in the fight stance, flex in the walk, chamber for the kick |
| Right/LeftKneeHelper | UpLeg | same as Leg | turns half as far as the knee; carries the middle of the knee's skin blend so the crease folds instead of pinching (skinning only) |
| Right/LeftFoot | Leg | (∓0.11, 0.07, 0); built GLBs: 0.10 | ankle: keeps the sole level on the floor, toes a little down on a rail, down when hanging |

**Compatibility handles.** These keep v1's index order: `arms[0]` and `hips[0]` are the x < 0 side (Right…), and `arms[1]` and `hips[1]` are the x > 0 side (Left…). Props still go to `arms[1].hand`.

## Feet

- **Standing:** every frame the lower foot is put on the floor (the body moves up or down by what the knees and hips lose or gain), so bent knees, the weight shift and the walk never sink or float the feet.
- **Seated:** two-bone leg IK. The feet go flat on the floor when they reach it (table chairs). Otherwise they go on the nearest foot rest in reach: `Patron.footRests` (static) holds world-space rails as `{a: [x, y, z], b: [x, y, z]}` at the rail's top. Bar.js registers the brass foot rail along the bar front (`foot-rail.glb`). With nothing in reach the shins hang a little back with the toes down.

## Hands

- A prop given with `hold()` (or `p.grip[i] = 1` for props the game positions itself, as the drinking contest does) closes that hand: the palm turns toward the prop along the forearm and the fingers close round it. The prop socket turns back, so props sit exactly where v1 put them.
- `holdGlass()` glasses stay upright in the body's heading whatever the arm is doing, and tip back to the mouth with the drink one-shot. (v1 glasses turned with the hand, so they lay on their side in some poses.)

## Face

- **Jaw:** opens to talk (chatter), to laugh, and on a very broad grin; the mood mouth width stays closed. `p.jawScale` per character comes from the GLB's `Jaw` node extras (`jawScale`, 1.6 for beards). The lip strip grows to fill the opening with mouth shadow.
- **Blinks:** `eyelid_R` / `eyelid_L` meshes on the Head (pivot on their top edge, wearing the face texture of the lid skin just above the eye). Patron v2 blinks every 2–6 s with the odd double blink, shuts the eyes when knocked out and half-shuts them when slumped.

## API

Everything v1 has is still there:

- poses
- one-shots
- `hold()`
- `mood`, `ko`, `walk`, `slump`
- `reachR`, `liftR`, `tiltR`
- `headTarget`, `cur`, `acts`

v2 adds:

- `p.version === 2`
- `p.bones[name]` for every bone
- `arms[i].wrist` and `arms[i].clav`
- the exports `restLayout(female)` and `PARENTS`

Without a GLB, v2 draws v1's capsule figure, now with knees, feet and a jaw.

How far v2 moves from v1, measured across the poses (`qa/cmp.mjs`):

- Hands are within 2–6 cm of v1 in every pose (leaning over the pool table included: the hips move in toward the table to make up for the curved spine).
- Head, mouth and the drinking glass are within 3 cm.

## Character GLB requirements

- **Skinned mesh:** one skinned mesh, with at most 4 influences per vertex.
- **Skin joints:** the 23 bone names above. Sockets may carry zero weight.
- **Inverse bind matrices:** pure translations, the inverse of each bone's rest world position.
  - Quantizing with gltfpack (`-kn -km -ke`) is fine. The decode is baked into the inverse binds, so `dressPatron2` binds with an identity bind matrix.
- **Mouth:** an optional `mouth` node, child of `Jaw`, holding a thin lip strip. `p.mouth` takes over its geometry and keeps scaling it in x for mood.
- **Eyelids:** optional `eyelid_R` / `eyelid_L` mesh nodes, children of `Head`, with UVs into the character texture.
- **Jaw extras:** optional `jawScale` on the `Jaw` node.
- **File name:** `<name>-v2.glb` (for example `sal-v2.glb`), placed anywhere under `public/western/`.

## Weights (how our pipeline builds them)

`python3 build_v2_all.py [names]` builds every character (cast overrides in `west_char_cast.py`, v2-only ones in `v2_overrides.json`) and quantizes them into the game. For one character, `RIGV2=1 python3 west_char_rig.py <name> <female> '<overrides>'` writes `models/west/chars/parts_v2/<name>.glb`. It starts from the v1 weights and splits them as follows:

- **Torso** splits by height into Hips, Spine, Spine1 and Spine2, with soft 8 cm blends at 0.87, 1.01 and 1.15. Up to 75% of the outer upper chest goes to the collarbones.
- **Legs** split at the knee and the ankle:
  - The mesh gets finer triangles around the knee.
  - The knee axis sits 30% of the way from the back of the leg to the front (`kneeAxis`), so the calf can't swing up through the back of the thigh on a deep bend.
  - The middle of the knee blend rides the knee helper (half angle); the back of the knee gets a wider blend than the front.
  - Knee and ankle heights default to 0.42 and 0.10. Overrides: `kneeY`, `ankleY`.
- **Face:** the lip line and the eyes are found on a front texture probe of the head (`mouthY`, `eyeY`, `eyeX` override them, read off the probe image `<name>_face.png`). `beardSmooth` rounds off a lumpy beard bottom (Sal: 30 passes).
- **v1 neck** splits into:
  - Neck, below the chin;
  - Head;
  - Jaw, the lower lip and chin, with a hinge in front of the ears.
- **v1 hand joint** becomes the wrist.

## Switching characters to v2

`reskin.patron(opts)` builds a character with Patron v2 when its `<name>-v2.glb` is present (else v1) and dresses it; the bar and all three mini-games (billiards, darts, foosball) use it. URL overrides:

| URL | Result |
|---|---|
| `?v2=off` | everyone on v1 |
| `?v2=sal,dee` | only the characters listed |
| `?v2=all` | every character that has a v2 GLB (the default) |

`rigv2.html` (run with `npx vite`, then open `/rigv2.html`) shows v1 and v2 side by side for any pose.

## Animation clips

35 motion-capture clips from the Meshy animation library play on every v2 patron. They live in `public/western/anim/patron-clips.json` (1.5 MB, 1.1 MB gzipped) and load once at start-up (`loadPatronClips`).

| Set | Clips |
|---|---|
| Idle (ambient) | idle1, idle3, idle4, idle7, scratch, handRub |
| Talk (ambient) | chat, talkHandsOpen, talkPassionate, talkHandOnHip, agree, shrug, listen |
| Jukebox (ambient) | sway, joyDance |
| Seated (ambient, with pauses) | sitArmsCrossed, sitTalk, sitThumbsUp, sitFingerWag, sitLeanBack |
| Sips (`drink()`) | sitDrinkM (seated, mirrored to the glass hand), standDrink |
| Reactions (`react()`) | win: victory, victoryCheer, fistPump, cheerBothHands, cheerOneHand. lose: headache, angryStomp, shrug. no: fingerWag. Seated: sitFistPump, sitClap, sitThumbsUp, sitFingerWag, sitLeanBack |
| Loaded, not in a set | boxingGuard, wave |

**How they play:**

- Each pose with an ambient set (`idle`, `talk`, `juke`, `sit`) picks a weighted random clip, never the same one twice in a row, and cross-fades to the next 0.45 s before the end. Seated patrons also sit still for 3–7 s between clips.
- **Seated clips** (`LOWER_BODY` mask): the chair keeps the hips and legs, so seat height and the feet on the floor or rail stay as they were. The clip's pelvis tilt moves into the spine, so the upper body keeps the clip's angle.
- **Sips:** `drink()` plays the sip part of a drinking clip, about 4 s, at most once every 10 s. Without clips, or without an upright glass, it falls back to v1's quick drink.
  - The clips were made on another body, so a two-bone IK guides the glass hand to this character's mouth during the sip. The elbow stays low and out to the side, and the glass tips toward the lips.
  - Standing sips keep the head's own movement; the clip bowed it toward the glass.
- `cheer()` plays a win reaction. `react('win' | 'lose' | 'no')` plays a reaction, using the seated version when sitting. It returns false without clips, so game code calls `p.react?.('lose') || p.stagger()` to work on v1 too.
- Clips that need both hands (scratch, handRub, sitLeanBack, sitClap) are skipped while the patron holds something.
- Clips fade out while the patron walks, is KO'd or slumped, or does a scripted move (`reachR`, `liftR` or `tiltR`, as in the drinking contest). Small procedural acts (gesture, nod, laugh, cheer) play on top instead of stopping the clip. Punches, hits, dart throws, cue strikes and the like stop a reaction clip.
- A hand gripping a cue or glass keeps its procedural grip, except during a sip. The head keeps following `headTarget`.
- The knee helper and forearm twist follow the clip.
- Cost: about 0.4 ms per frame for the whole bar.

**Game hooks:**

- Pool: the shark reacts when the player wins (billiards), and NPC players sometimes react to a bad shot.
- Darts: Fergus reacts on a bust and at the end of the game; NPC players sometimes react after a throw.
- Drinking contest: Sal pumps a fist when the player loses.

The library has no pool-shot or dart-throw clips, so cue strikes and dart throws stay procedural.

**API:**

- `p.playClip(name, {loop, fade, speed, slot, mask, weight, start, end})`
- `p.stopClips(slot, fade)`
- `p.react(kind)`
- `p.autoClips = false` turns the ambient picker, sips and reactions off for one patron.

**Adding clips:**

1. Put library action ids in `CLIPS` in `scripts/anim_fetch2.py` and run it. It uses Sal's existing rig task and costs 3 credits per clip, in tasks of 10. The library list is `GET /v1/animations/library`.
2. Run `scripts/retarget.py`.
   - The rig was made from Sal's v2 rest pose, so the retarget is direct: target world rotation = source world × source rest⁻¹.
   - The hips height is scaled to v2. Drift across the floor and turning are removed so clips loop in place.
   - `SKIP` leaves clips out of the shipped file; `MIRROR` also ships a mirrored copy (`<name>M`).
3. Add the clip name to a set in `AMBIENT` or `REACT` in `Patron2.js`, or call `playClip` from game code.

`rigv2.html` has `__clip(name, t)`, `__clipSit(name, t)` and `__clipNames()` for checking a clip on any character.

## Next steps this rig makes possible

- **Finer face:** blendshapes on the head for visemes.
- **Pool and dart clips:** hand-keyed or motion-capture clips from outside the Meshy library, to replace the procedural strike and throw.

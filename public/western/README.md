# Fox & Fiddle Western: drop W6 (quality pass)

A review of every model, texture and animation, in a studio and in the running game.
**Every file here replaces the file of the same name from earlier drops (W1, W2, W4.4, W5).**
Names, sizes, origins, node names and materials are unchanged.

## What was fixed
| Issue | Fix | Files |
|---|---|---|
| No vertex normals on any prop, furniture, first-person or table-soccer model, so three.js drew them flat-shaded (faceted bottles, glasses, barrels, fists) | Smooth normals added, hard edges kept where faces meet at more than 50 degrees | `models/`, `props/`, `fp/`, `foosball/` (all) |
| Wood and leather read red-orange (hue 16–25°, saturation up to 0.72), which turned the whole bar red in game | Wood and leather tones pulled to weathered brown (about 28°, saturation x0.66). Brass, glass, candles, felt, paint and glow maps untouched | the 21 textured models in `models/`, `textures/tex-wood-light.png`, `tex-wood-dark.png`, `tex-floor-planks.png` |
| The mood mouth stretched past the lips into a dark bar when Patron widens it (flirt up to 1.8x, laugh 2x) | Narrower, lens-shaped mouth whose curve fits the widened shape | `characters/` (all 20) |
| Characters were 18 MB in total | Mesh data quantized (KHR_mesh_quantization, read natively by three.js GLTFLoader, no decoder needed): 11 MB, visually identical | `characters/` (all 20) |
| `dressPatron` did not handle quantized files | Updated; works with both plain and quantized GLBs | `code/dressPatron.js` |

`preview/` shows the room before and after, the wood regrade, every Patron pose and one-shot
(`animation-check.png`), and all six games in the running game (`in-game.jpg`).

## Recommended code change found in this pass (team)
- **Lamp light colour:** the pendants use saturated orange (`0xffb060` / `0xffa050`). Warm white
  `0xffd2a0` for every lamp, and hemisphere sky `0xffe2c4`, keeps the golden mood without dyeing
  every surface red. This joins the W5 notes (neon and OPEN lights, window placement, window glass).

## Checked and fine
Scale and origins against the catalog, texture sizes (1024 px; first-person 512 px), shoulders,
elbows and wrists in all 10 poses and 12 one-shots, walk and knock-out, props staying in hands, the
first-person fight, drink and cue views, table-soccer rods, darts scoring geometry.

## Still limited by the rig (code)
Patron has no knee joint, so seated legs stick straight out. Deep elbow bends lose a little volume
because Patron's elbow pivot sits mid-arm (see the W4.4 notes for the one-line fix).

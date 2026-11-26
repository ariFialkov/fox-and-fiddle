# Fox and Fiddle

A first-person dive bar where every activity is a wager. Walk in, hang up your coat, and wander
between the pool table, the dartboard, the foosball table, Big Mick, Sal at the bar and Rose by
the jukebox. Runs as a PWA on desktop and mobile.

The games look and feel skill-based. They are not: every round's result is decided by a
provably-fair RNG on the outcome server before the mini-game starts, at a configurable RTP
(default 96%). The mini-games are choreographed so that what you see always lands on that result.

## Running it

```bash
npm install
npm run dev        # outcome server on :8787 + Vite dev server on :5173 (proxies /api)
```

Production:

```bash
npm run build      # builds the game into dist/ as one self-contained index.html (+ icons, sw.js)
npm start          # serves dist/ and the API from one Node process on :8787
```

Environment variables for the server: `PORT`, `RTP` (0.5 - 0.99, default 0.96), `STARTING_BALANCE`
(demo wallet, default 1000), `ADMIN_KEY` (for the live RTP endpoint).

```bash
npm test           # outcome maths, RNG, engine, pool physics/rules
```

If the API is unreachable (static hosting, offline) the client falls back to a local engine with
the same maths so the PWA still plays. That mode is for demos only: a client can be inspected.

The build is deliberately host-agnostic: all paths are relative and the script and styles are
inlined into `index.html`, so it runs from any folder, over plain http, or inside a sandboxed
iframe (where storage and WebCrypto may be blocked; the game falls back to in-memory settings and a
plain-JS SHA-256). If it still cannot start, the loading screen says why.

## How the betting layer works

`shared/outcomes.js` is the single source of truth and runs on the server (and in the offline
fallback). Two outcome families:

- **Versus** (billiards, darts, foosball, bar fight): one win/lose decision. Payout 2x, so
  P(win) = RTP / 2 = 0.48 at 96%.
- **Stepper** (drinking contest, pick-up lines): crash-style ladder. Step *i* survives with
  probability p_i; the multiplier after n steps is RTP / (p_1 ... p_n), so cashing out at any
  step has an expected return of exactly RTP. The crash step is rolled when the round starts,
  but the server only reveals one step at a time.

Rolls are `HMAC-SHA256(serverSeed, clientSeed:nonce:block)`. The server publishes the seed hash
up front (the ⓘ menu in game), and the seed can be rotated to reveal it for auditing.

Changing the RTP: set `RTP=0.94` when starting the server, or live:

```bash
curl -X POST localhost:8787/api/admin/rtp -H 'x-admin-key: change-me' -H 'content-type: application/json' -d '{"rtp":0.94}'
```

### How each game lands on its result

| Game | What the player does | How the result is enforced |
| --- | --- | --- |
| Billiards | Real 2D physics, eight-ball rules, bot opponent | Every shot (yours and the bot's) is pre-simulated. If it would end the game the wrong way, the angle is nudged a fraction of a degree until it does not. The bot searches ghost-ball shots at every pocket and plays to its fated skill. |
| Darts | Swipe to throw: angle = left/right, speed = high/low, wobble = scatter | The bot throws first to a total drawn for the round. Your dart is moved to the nearest board point that keeps the result reachable, and only when a landing would contradict it. |
| Foosball | Rods, spin, slide, bot opponent | Bot skill scales with the result. On the decisive goal the loser's shot hits the post and the winner's shot slips through the defenders. |
| Bar fight | Punch, kick, throw, smash | A fated loss brings in more of Mick's mates and one of them does not go down. A fated win gives you a second wind. |
| Drinking | Drink or cash out | Each drink asks the server for the next step. A failing step fades the screen to black while you drink; each survived step blurs the view a little more. |
| Pick-up lines | Choose one of two lines or leave together | Same as drinking with dialogue. Rose's body language warms up as you climb, and turns cold on the failing step. |

## Controls

Walk: `W`/`S` forward and back, `A`/`D` strafe (joystick on touch). There is no turn key: the view
smoothly follows the direction you are walking, so holding `A` alone walks you round in a circle.
Dragging on the screen nudges the view. The camera breathes while idle and bobs while walking.
Near an activity, `Space` / click / tap plays.

- Billiards: `A`/`D` aim (drag sideways on touch), drag back and release to strike,
  `W`/`S` follow/draw, `Space` chalk.
- Darts: pick "Highest total" or "501" on the stake panel, then swipe up. Long swipes are steadier:
  sideways drift sets left/right, flick speed sets high/low, wobble scatters the dart.
- Foosball: `1` forwards, `2` midfield, `3` defence, `4` goalie; scroll to spin, `Space` for a quick
  kick; move the mouse to slide the rod. On touch, tap a rod tab, drag sideways to slide and flick
  vertically to spin.
- Bar fight: `X` punch, `C` kick, hold `Shift` to block high and `Z` to block low, hold `Space` to grab
  a bottle and release to throw, `Space`+`X`/`C` to smash it over whoever is in front of you.
- Drinking / pick-up lines: buttons (`Space` drinks, `1`/`2` choose a line, `Esc` cashes out).

## The regulars

`src/world/Npc.js` keeps the patrons busy. Each one runs an activity (sit at the bar, drink at a
table, stand and talk, shoot pool, throw darts, play foosball, a drinking contest, milling about,
and every so often a brawl) as a small state machine. Patrons walk a waypoint graph between
activities, steer round each other and the player, and fire animations (drink, gesture, nod,
laugh, lean, strike, throw, punch, stagger, cheer, knock-out). Mini-games claim the characters
they need (`busy`) and evict NPC activities from the station in use.

Debug flags: `?skipintro=1`, `?lowend=1` (no bloom/shadows, fewer lights), `?timescale=4`.

## Western reskin

The Western art (drops W1 to W6 and V2) is committed under `public/western/`: models, textures, posters,
signs, the first-person models, the window loop, the 20 characters (`characters/` for Patron v1,
`characters/v2/` for Patron v2) and the animation clips (`anim/patron-clips.json`). Files are found by
name, so any folder layout works; a later drop overwrites a repeated name. Review material from the drops
(`preview/`, `screens/`, `masters/`, `refs/`, `thumbs/`) is not committed; `preview/` and `screens/` are left
out of the build if you unpack them anyway.

`src/world/reskin.js` loads what is there before the bar is built, and `Bar.applyReskin()`, the
character hooks and the first-person and table-soccer builders swap each asset in. Anything not
found keeps today's procedural version, so the game works with none, some or all of the art.

### Patron v2 and animation clips

Characters run on Patron v2 (`src/world/Patron2.js`, dressed by `src/world/dressPatron2.js`): the same
API as Patron v1 on a 31-bone Mixamo-named skeleton, with knees, feet that stay on the floor or the bar's
foot rail, hands that grip props, a jaw, blinking eyelids and 35 motion-capture clips (ambient idle, talk,
jukebox and seated motion, sips, win and lose reactions). `reskin.patron(opts)` builds v2 when a
character has a `<name>-v2.glb`, else v1. `?v2=off` forces v1; `?v2=sal,dee` limits v2 to those characters.

The full spec, the clip list and how to add clips are in [`docs/RIG_SPEC.md`](docs/RIG_SPEC.md).
`rigv2.html` (open `/rigv2.html?c=sal` on the dev server) shows v1 and v2 side by side for any pose
or clip. `node qa/cmp.mjs` compares v1 and v2 hand, head and glass positions across the poses.
`tools/western/` holds the Python pipeline that built the characters and clips (Meshy API, rigging,
retargeting), for reference; paths in it point at the machine it ran on.

## Asset catalog

`asset-catalog/` is a browsable catalog of every character, prop, piece of furniture, texture and
first-person model, for artists reskinning the game. GitHub Pages serves it at
`/<repo>/asset-catalog/` (the Pages workflow copies it in; it is not part of the game build).

Its images and measurements (size, triangles, materials, textures, origin, character joints) are
generated from the game's own code, so regenerate them after changing a model:

```bash
npm i -D playwright && npx playwright install chromium   # once
npm run catalog                                          # everything (about a minute)
npm run catalog -- jukebox dart                          # just these asset ids
```

Descriptions, usage and reskin notes live in `catalog-studio/registry.js`. The studio page itself
(`/catalog-studio/` under `npm run dev`) renders the images; `scripts/catalog-render.mjs` drives it.

## Layout

```
shared/outcomes.js   RTP maths, outcome resolution (pure)
shared/rng.js        provably-fair float generation
server/engine.js     sessions, balances, rounds, settlement
server/index.js      Express API (+ serves dist/ in production)
src/engine/          renderer + state machine, player controller, input, HUD
src/world/           procedural textures, the bar, patrons, NPC director (Npc.js)
src/minigames/       one file per game + poolPhysics.js (pure, tested)
src/net/             API client + offline fallback engine
public/              service worker, icons (npm run icons)
asset-catalog/       the asset catalog page, images and catalog.json (generated)
catalog-studio/      asset registry + render studio that generates the catalog
```

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
npm run build      # builds the PWA into dist/
npm start          # serves dist/ and the API from one Node process on :8787
```

Environment variables for the server: `PORT`, `RTP` (0.5 - 0.99, default 0.96), `STARTING_BALANCE`
(demo wallet, default 1000), `ADMIN_KEY` (for the live RTP endpoint).

```bash
npm test           # outcome maths, RNG, engine, pool physics/rules
```

If the API is unreachable (static hosting, offline) the client falls back to a local engine with
the same maths so the PWA still plays. That mode is for demos only: a client can be inspected.

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

Walk: `WASD` (joystick on touch). The view auto-rotates toward where you walk; dragging on the
screen also looks around. Near an activity, `Space` / click / tap plays.

- Billiards: `A`/`D` aim (drag sideways on touch), drag back and release to strike,
  `W`/`S` follow/draw, `Space` chalk.
- Darts: swipe up.
- Foosball: `E` forwards, `D` midfield, `C` defence, `Space` goalie; scroll to spin; move the mouse
  to slide the rod. On touch, tap a rod tab, drag sideways to slide and flick vertically to spin.
- Bar fight: `X` punch, `C` kick, hold `Space` to grab a bottle and release to throw, `Space`+`X`/`C`
  to smash it over whoever is in front of you.
- Drinking / pick-up lines: buttons (`Space` drinks, `1`/`2` choose a line, `Esc` cashes out).

## Layout

```
shared/outcomes.js   RTP maths, outcome resolution (pure)
shared/rng.js        provably-fair float generation
server/engine.js     sessions, balances, rounds, settlement
server/index.js      Express API (+ serves dist/ in production)
src/engine/          renderer + state machine, player controller, input, HUD
src/world/           procedural textures, the bar, patrons
src/minigames/       one file per game + poolPhysics.js (pure, tested)
src/net/             API client + offline fallback engine
public/              manifest, service worker, icons (npm run icons)
```

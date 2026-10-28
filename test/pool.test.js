import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rackState, simulate, botShot, judge, constrainShot, verdict, targets } from '../src/minigames/poolPhysics.js';

test('break is deterministic and moves balls', () => {
  const s = rackState();
  const a = simulate(s.balls, { angle: 0.02, speed: 4, spin: 0 });
  const b = simulate(s.balls, { angle: 0.02, speed: 4, spin: 0 });
  assert.deepEqual(a.balls, b.balls);
  assert.ok(a.firstHit != null);
  assert.ok(a.steps > 100);
});

test('bot finds potting shots and a fated-to-win bot wins games', () => {
  let rnd = 12345;
  const r = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
  let wins = 0;
  for (let game = 0; game < 4; game++) {
    const s = rackState();
    s.turn = 'bot';
    let n = 0;
    while (!s.winner && n < 120) {
      const shooter = s.turn;
      let shot;
      if (shooter === 'bot') shot = botShot(s, 1, 'bot', r);
      else {
        // clumsy player who just whacks the nearest target
        const cue = s.balls.find((b) => b.id === 0);
        const t = targets(s, 'you')[0];
        const base = { angle: Math.atan2(t.v - cue.v, t.u - cue.u) + (r() - 0.5) * 0.3, speed: 1 + r() * 2, spin: 0 };
        const c = constrainShot(s, base, 'you', 'bot');
        shot = { shot: c.shot, res: c.result };
      }
      assert.notEqual(verdict(s, shot.res, shooter), 'you', 'player must never win when bot is fated');
      judge(s, shot.res, shooter);
      n++;
    }
    if (s.winner === 'bot') wins++;
    assert.notEqual(s.winner, 'you');
  }
  assert.ok(wins >= 3, `bot should close out games, won ${wins}/4`);
});

test('constrainShot nudges a winning 8-ball pot into a miss when the player must lose', () => {
  const s = rackState();
  // leave only cue + 8 near a pocket, player is solids and cleared
  s.balls = [{ id: 0, u: -0.3, v: 0.3, vu: 0, vv: 0, on: true }, { id: 8, u: 0.9, v: 0.45, vu: 0, vv: 0, on: true }, { id: 9, u: -0.9, v: -0.4, vu: 0, vv: 0, on: true }];
  s.group = { you: 'solid', bot: 'stripe' };
  const cue = s.balls[0], e = s.balls[1];
  const gu = e.u + (e.u - 1.15) / Math.hypot(e.u - 1.15, e.v - 0.575) * 2 * 0.0286;
  const gv = e.v + (e.v - 0.575) / Math.hypot(e.u - 1.15, e.v - 0.575) * 2 * 0.0286;
  const shot = { angle: Math.atan2(gv - cue.v, gu - cue.u), speed: 2.2, spin: 0 };
  const raw = simulate(s.balls, shot);
  assert.equal(verdict(s, raw, 'you'), 'you', 'the raw shot should win');
  const c = constrainShot(s, shot, 'you', 'bot');
  assert.ok(c.nudged);
  assert.notEqual(verdict(s, c.result, 'you'), 'you');
});

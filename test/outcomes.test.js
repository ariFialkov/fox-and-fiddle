import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { GAMES, resolveOutcome, stepperLadder, expectedReturn, stepperPayout, floatsNeeded } from '../shared/outcomes.js';
import { rollFloats } from '../shared/rng.js';
import { Engine } from '../server/engine.js';

const hmac = (k, m) => crypto.createHmac('sha256', k).update(m).digest();

test('every fixed strategy returns the configured RTP', () => {
  for (const rtp of [0.9, 0.96, 0.98]) {
    for (const id of Object.keys(GAMES)) {
      const g = GAMES[id];
      const steps = g.type === 'versus' ? 1 : g.survival.length;
      for (let n = 1; n <= steps; n++) {
        assert.ok(Math.abs(expectedReturn(id, n, rtp) - rtp) < 0.006, `${id} step ${n} rtp ${rtp}`);
      }
    }
  }
});

test('ladder multipliers increase', () => {
  const l = stepperLadder('drinking');
  for (let i = 1; i < l.length; i++) assert.ok(l[i] > l[i - 1]);
});

test('resolveOutcome is deterministic from floats', () => {
  const a = resolveOutcome('darts', [0.1, 0.5, 0.5]);
  const b = resolveOutcome('darts', [0.1, 0.5, 0.5]);
  assert.deepEqual(a, b);
  assert.equal(a.win, true);
  assert.equal(resolveOutcome('darts', [0.49, 0, 0]).win, false);
  const s = resolveOutcome('drinking', [0.1, 0.1, 0.9, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
  assert.equal(s.crashStep, 3);
  assert.equal(stepperPayout(s, 10, 2), Math.round(10 * s.ladder[1] * 100) / 100);
  assert.equal(stepperPayout(s, 10, 3), 0);
});

test('rng floats are reproducible and in range', async () => {
  const a = await rollFloats(hmac, 'seed', 'client', 1, 12);
  const b = await rollFloats(hmac, 'seed', 'client', 1, 12);
  assert.deepEqual(a, b);
  for (const f of a) assert.ok(f >= 0 && f < 1);
  const c = await rollFloats(hmac, 'seed', 'client', 2, 12);
  assert.notDeepEqual(a, c);
});

test('simulated play converges to RTP', async () => {
  const eng = new Engine({ rtp: 0.96, startingBalance: 1e9 });
  const ses = eng.createSession('x');
  const N = 20000;
  let staked = 0;
  for (let i = 0; i < N; i++) {
    const r = await eng.startRound(ses.sessionId, 'billiards', 1);
    staked += 1;
    eng.finish(ses.sessionId, r.roundId);
  }
  const ret = (eng.getSession(ses.sessionId).balance - 1e9 + staked) / staked;
  assert.ok(Math.abs(ret - 0.96) < 0.03, `versus RTP ${ret}`);

  const ses2 = eng.createSession('y');
  staked = 0;
  for (let i = 0; i < N; i++) {
    const r = await eng.startRound(ses2.sessionId, 'drinking', 1);
    staked += 1;
    // strategy: always try for 3 steps
    for (let k = 0; k < 3; k++) {
      const st = eng.step(ses2.sessionId, r.roundId);
      if (!st.survived) break;
      if (k === 2) eng.cashout(ses2.sessionId, r.roundId);
    }
  }
  const ret2 = (eng.getSession(ses2.sessionId).balance - 1e9 + staked) / staked;
  assert.ok(Math.abs(ret2 - 0.96) < 0.04, `stepper RTP ${ret2}`);
});

test('engine refuses bad input and settles abandoned rounds', async () => {
  const eng = new Engine({ rtp: 0.96, startingBalance: 10 });
  const ses = eng.createSession();
  await assert.rejects(() => eng.startRound(ses.sessionId, 'nope', 1));
  await assert.rejects(() => eng.startRound(ses.sessionId, 'darts', 3));
  await assert.rejects(() => eng.startRound(ses.sessionId, 'darts', 100));
  const r = await eng.startRound(ses.sessionId, 'darts', 5);
  assert.equal(eng.getSession(ses.sessionId).balance, 5);
  assert.equal(floatsNeeded('darts'), 3);
  // starting another round settles the open one using the server's stored result
  const r2 = await eng.startRound(ses.sessionId, 'pickup', 1);
  assert.ok(eng.rounds.get(r.roundId).settled);
  assert.throws(() => eng.finish(ses.sessionId, r.roundId));
  assert.throws(() => eng.cashout(ses.sessionId, r2.roundId)); // no step yet
});

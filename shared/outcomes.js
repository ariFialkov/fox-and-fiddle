/**
 * Fox and Fiddle - deterministic outcome engine.
 *
 * Everything the player sees as "skill" is a visualisation of a result that
 * was decided here, from RNG rolls, before the mini-game started. This module
 * is pure (no I/O) so it can run on the server and - for offline demo play -
 * inside the client.
 *
 * Two outcome families:
 *   versus  - one win/lose decision against a bot (billiards, darts, foosball,
 *             bar fight). Payout multiplier M, P(win) = RTP / M.
 *   stepper - crash-style ladder (drinking contest, pick-up lines). Each step i
 *             survives with probability p_i; the multiplier after n steps is
 *             RTP / prod(p_1..p_n), so cashing out at ANY step has EV = RTP.
 */

export const DEFAULT_RTP = 0.96;

export const GAMES = {
  billiards: { type: 'versus', label: 'Billiards', payout: 2 },
  darts:     { type: 'versus', label: 'Darts', payout: 2 },
  foosball:  { type: 'versus', label: 'Foosball', payout: 2 },
  barfight:  { type: 'versus', label: 'Bar Fight', payout: 2 },
  drinking:  {
    type: 'stepper', label: 'Drinking Contest',
    survival: [0.85, 0.82, 0.78, 0.74, 0.70, 0.65, 0.60, 0.55, 0.50, 0.45],
  },
  pickup: {
    type: 'stepper', label: 'Pick-up Lines',
    survival: [0.80, 0.78, 0.75, 0.72, 0.68, 0.64, 0.60, 0.55],
  },
};

export const STAKES = [1, 2, 5, 10, 25, 50, 100];

export function clampRtp(rtp) {
  const r = Number(rtp);
  if (!Number.isFinite(r)) return DEFAULT_RTP;
  return Math.min(0.99, Math.max(0.5, r));
}

/** Multiplier ladder for a stepper game at a given RTP. Index 0 = after 1 step. */
export function stepperLadder(gameId, rtp = DEFAULT_RTP) {
  const g = GAMES[gameId];
  if (!g || g.type !== 'stepper') throw new Error(`not a stepper game: ${gameId}`);
  const out = [];
  let surv = 1;
  for (const p of g.survival) {
    surv *= p;
    out.push(round2(rtp / surv));
  }
  return out;
}

/** Win probability for a versus game at a given RTP. */
export function versusWinProb(gameId, rtp = DEFAULT_RTP) {
  const g = GAMES[gameId];
  if (!g || g.type !== 'versus') throw new Error(`not a versus game: ${gameId}`);
  return rtp / g.payout;
}

/**
 * Resolve a round from uniform floats in [0,1).
 * floats[0] decides a versus game; floats[i] decides stepper step i+1.
 * Returns a complete, immutable description of the round's fate.
 */
export function resolveOutcome(gameId, floats, rtp = DEFAULT_RTP, extra = {}) {
  const g = GAMES[gameId];
  if (!g) throw new Error(`unknown game: ${gameId}`);
  rtp = clampRtp(rtp);
  if (g.type === 'versus') {
    const p = versusWinProb(gameId, rtp);
    const win = floats[0] < p;
    return {
      gameId, type: 'versus', rtp, win, payoutMultiplier: win ? g.payout : 0,
      flavour: versusFlavour(gameId, floats.slice(1), win),
    };
  }
  // stepper: crashStep = first step (1-based) that fails; Infinity if all survive
  const ladder = stepperLadder(gameId, rtp);
  let crashStep = Infinity;
  for (let i = 0; i < g.survival.length; i++) {
    if (floats[i] >= g.survival[i]) { crashStep = i + 1; break; }
  }
  return { gameId, type: 'stepper', rtp, ladder, crashStep, maxSteps: g.survival.length };
}

/** Deterministic cosmetic variation that does NOT affect EV (e.g. how many patrons join a fight). */
function versusFlavour(gameId, floats, win) {
  const f = (i) => (floats[i] ?? 0.5);
  switch (gameId) {
    case 'barfight':
      // if the player must lose, more patrons jump in (1-3 extra). If they must win, 0-2 extra.
      return { extraPatrons: win ? Math.floor(f(0) * 3) : 1 + Math.floor(f(0) * 3), bruiser: !win };
    case 'darts':
      // bot total: losing player faces 100-150, winning player faces 41-95
      return { botTotal: win ? 41 + Math.floor(f(0) * 55) : 100 + Math.floor(f(0) * 51) };
    case 'foosball':
      return { botSkill: win ? 0.35 + f(0) * 0.25 : 0.7 + f(0) * 0.3, target: 3 };
    case 'billiards':
      return { botSkill: win ? 0.45 + f(0) * 0.2 : 0.75 + f(0) * 0.2 };
    default:
      return {};
  }
}

/** Number of RNG floats a round needs. */
export function floatsNeeded(gameId) {
  const g = GAMES[gameId];
  if (!g) throw new Error(`unknown game: ${gameId}`);
  return g.type === 'versus' ? 3 : g.survival.length;
}

/** Payout for cashing out a stepper round after `steps` successful steps. */
export function stepperPayout(outcome, stake, steps) {
  if (steps <= 0) return 0;
  if (steps >= outcome.crashStep) return 0;
  const m = outcome.ladder[Math.min(steps, outcome.ladder.length) - 1];
  return round2(stake * m);
}

/** Theoretical RTP check: expected return for every fixed cash-out strategy. */
export function expectedReturn(gameId, cashoutAt = 1, rtp = DEFAULT_RTP) {
  const g = GAMES[gameId];
  if (g.type === 'versus') return versusWinProb(gameId, rtp) * g.payout;
  const ladder = stepperLadder(gameId, rtp);
  let surv = 1;
  for (let i = 0; i < cashoutAt; i++) surv *= g.survival[i];
  return surv * ladder[cashoutAt - 1];
}

/** Convert 4 bytes of an HMAC digest to a float in [0,1). */
export function bytesToFloat(bytes, offset = 0) {
  const n = ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
  return n / 4294967296;
}

function round2(x) { return Math.round(x * 100) / 100; }

/**
 * Deterministic 2D eight-ball physics + rules + shot search. Pure JS (no THREE) so it can be
 * unit-tested and so a shot can be pre-simulated before it is played: that is how the game
 * makes sure the balls only ever fall the way the round's result says they must.
 *
 * Table coords: u along the length (x), v across (z). Origin at the table centre.
 */
export const L = 2.3, W = 1.15, R = 0.0286;
const STEP = 1 / 240;
const FRICTION = 0.75;      // m/s^2 rolling deceleration
const CUSHION = 0.72;       // restitution
const BALL_E = 0.96;
const POCKETS = [
  { u: -L / 2, v: -W / 2, r: 0.068 }, { u: 0, v: -W / 2, r: 0.058 }, { u: L / 2, v: -W / 2, r: 0.068 },
  { u: -L / 2, v: W / 2, r: 0.068 }, { u: 0, v: W / 2, r: 0.058 }, { u: L / 2, v: W / 2, r: 0.068 },
];
export { POCKETS };

export function rackState() {
  const balls = [];
  balls.push({ id: 0, u: -L / 4, v: 0, vu: 0, vv: 0, on: true });
  // standard triangle: apex at the foot spot, 8 in the middle, corners of different groups
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 15, 7];
  let k = 0;
  const gap = R * 2.02;
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      const id = order[k++];
      balls.push({ id, u: L / 4 + row * gap * 0.866, v: (i - row / 2) * gap, vu: 0, vv: 0, on: true });
    }
  }
  return { balls, group: { you: null, bot: null }, turn: 'you', ballInHand: false, winner: null, shots: 0 };
}

export const isSolid = (id) => id >= 1 && id <= 7;
export const isStripe = (id) => id >= 9 && id <= 15;
export const groupOf = (id) => (isSolid(id) ? 'solid' : isStripe(id) ? 'stripe' : null);

export function cloneBalls(balls) { return balls.map((b) => ({ ...b })); }

/** Advance all balls by one fixed step. Returns events generated this step. */
export function stepBalls(balls, ctx) {
  const ev = [];
  for (const b of balls) {
    if (!b.on) continue;
    const sp = Math.hypot(b.vu, b.vv);
    if (sp === 0) continue;
    b.u += b.vu * STEP; b.v += b.vv * STEP;
    const ns = Math.max(0, sp - FRICTION * STEP);
    if (ns < 0.015) { b.vu = b.vv = 0; } else { b.vu *= ns / sp; b.vv *= ns / sp; }
    // pockets
    for (const p of POCKETS) {
      if (Math.hypot(b.u - p.u, b.v - p.v) < p.r) { b.on = false; b.vu = b.vv = 0; ev.push({ type: 'pot', id: b.id }); break; }
    }
    if (!b.on) continue;
    // cushions (skip near pocket mouths so balls can drop)
    const nearCorner = Math.abs(Math.abs(b.u) - L / 2) < 0.08 && Math.abs(Math.abs(b.v) - W / 2) < 0.08;
    const nearSide = Math.abs(b.u) < 0.07 && Math.abs(Math.abs(b.v) - W / 2) < 0.05;
    if (!nearCorner) {
      if (b.u < -L / 2 + R) { b.u = -L / 2 + R; b.vu = Math.abs(b.vu) * CUSHION; ev.push({ type: 'cushion', id: b.id }); }
      if (b.u > L / 2 - R) { b.u = L / 2 - R; b.vu = -Math.abs(b.vu) * CUSHION; ev.push({ type: 'cushion', id: b.id }); }
    }
    if (!nearCorner && !nearSide) {
      if (b.v < -W / 2 + R) { b.v = -W / 2 + R; b.vv = Math.abs(b.vv) * CUSHION; ev.push({ type: 'cushion', id: b.id }); }
      if (b.v > W / 2 - R) { b.v = W / 2 - R; b.vv = -Math.abs(b.vv) * CUSHION; ev.push({ type: 'cushion', id: b.id }); }
    }
    if (b.u < -L / 2 - 0.1 || b.u > L / 2 + 0.1 || b.v < -W / 2 - 0.1 || b.v > W / 2 + 0.1) { b.on = false; ev.push({ type: 'pot', id: b.id }); }
  }
  // ball-ball collisions
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i]; if (!a.on) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j]; if (!b.on) continue;
      const du = b.u - a.u, dv = b.v - a.v;
      const d = Math.hypot(du, dv);
      if (d >= 2 * R || d === 0) continue;
      const nu = du / d, nv = dv / d;
      const overlap = 2 * R - d;
      a.u -= nu * overlap / 2; a.v -= nv * overlap / 2; b.u += nu * overlap / 2; b.v += nv * overlap / 2;
      const rel = (a.vu - b.vu) * nu + (a.vv - b.vv) * nv;
      if (rel <= 0) continue;
      const imp = rel * (1 + BALL_E) / 2;
      a.vu -= imp * nu; a.vv -= imp * nv; b.vu += imp * nu; b.vv += imp * nv;
      ev.push({ type: 'hit', a: a.id, b: b.id, speed: rel });
      // cue-ball spin: applied on the cue ball's first object-ball contact
      if (ctx && ctx.spin && !ctx.spinUsed && (a.id === 0 || b.id === 0)) {
        ctx.spinUsed = true;
        const cue = a.id === 0 ? a : b;
        const k = ctx.spin * 0.45 * rel;
        cue.vu += ctx.dirU * k; cue.vv += ctx.dirV * k;
      }
    }
  }
  return ev;
}

export function allStopped(balls) { return balls.every((b) => !b.on || (b.vu === 0 && b.vv === 0)); }

/** Simulate a shot to rest. Returns { balls, potted[], firstHit, scratch, steps }. */
export function simulate(balls, shot, maxSec = 25) {
  const bs = cloneBalls(balls);
  const cue = bs.find((b) => b.id === 0);
  cue.on = true;
  const dirU = Math.cos(shot.angle), dirV = Math.sin(shot.angle);
  cue.vu = dirU * shot.speed; cue.vv = dirV * shot.speed;
  const ctx = { spin: shot.spin || 0, spinUsed: false, dirU, dirV };
  const potted = []; let firstHit = null; let steps = 0;
  const max = Math.floor(maxSec / STEP);
  while (steps < max) {
    const ev = stepBalls(bs, ctx);
    for (const e of ev) {
      if (e.type === 'pot') potted.push(e.id);
      if (e.type === 'hit' && firstHit == null && (e.a === 0 || e.b === 0)) firstHit = e.a === 0 ? e.b : e.a;
    }
    steps++;
    if (allStopped(bs)) break;
  }
  return { balls: bs, potted, firstHit, scratch: potted.includes(0), steps };
}

/** Apply eight-ball rules to a finished shot. Mutates `state`, returns a summary. */
export function judge(state, result, shooter) {
  const other = shooter === 'you' ? 'bot' : 'you';
  const g = state.group;
  const objectPots = result.potted.filter((id) => id !== 0 && id !== 8);
  const eightPotted = result.potted.includes(8);
  const before = state.balls; // balls before the shot (for "group cleared" check)
  const remainingOfGroup = (grp) => before.filter((b) => b.on && b.id !== 0 && b.id !== 8 && groupOf(b.id) === grp).length;
  let out = { shooter, continue: false, foul: false, winner: null, message: '' };

  // assign groups on first legal object pot when open
  if (!g[shooter] && objectPots.length) {
    const grp = groupOf(objectPots[0]);
    g[shooter] = grp; g[other] = grp === 'solid' ? 'stripe' : 'solid';
    out.message = `${shooter === 'you' ? 'You are' : 'Shark is'} ${grp}s`;
  }
  if (eightPotted) {
    const cleared = g[shooter] && remainingOfGroup(g[shooter]) === 0;
    if (cleared && !result.scratch) { out.winner = shooter; out.message = '8-ball down'; }
    else { out.winner = other; out.message = result.scratch ? 'Scratched on the 8' : '8-ball too early'; }
  } else if (result.scratch) {
    out.foul = true; out.message = 'Scratch, ball in hand';
  } else if (objectPots.some((id) => groupOf(id) === g[shooter])) {
    out.continue = true; out.message = out.message || 'Nice pot';
  } else if (!g[shooter] && objectPots.length) {
    out.continue = true;
  } else {
    out.message = out.message || (result.firstHit == null ? 'Nothing hit' : 'No pot');
  }
  // commit
  state.balls = result.balls;
  state.shots++;
  if (out.winner) state.winner = out.winner;
  else if (out.continue) state.turn = shooter;
  else { state.turn = other; state.ballInHand = out.foul; }
  if (result.scratch && !out.winner) {
    const cue = state.balls.find((b) => b.id === 0);
    Object.assign(cue, findFreeSpot(state.balls, -L / 4, 0), { on: true, vu: 0, vv: 0 });
  }
  return out;
}

export function findFreeSpot(balls, u0, v0) {
  for (let r = 0; r < 0.6; r += 0.04) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const u = u0 + Math.cos(a) * r, v = v0 + Math.sin(a) * r;
      if (Math.abs(u) > L / 2 - 2 * R || Math.abs(v) > W / 2 - 2 * R) continue;
      if (balls.every((b) => !b.on || b.id === 0 || Math.hypot(b.u - u, b.v - v) > 2.2 * R)) return { u, v };
    }
  }
  return { u: u0, v: v0 };
}

/** Would this (simulated) shot make `shooter` win or lose outright? */
export function verdict(state, result, shooter) {
  const other = shooter === 'you' ? 'bot' : 'you';
  if (!result.potted.includes(8)) return null;
  const grp = state.group[shooter];
  const cleared = grp && state.balls.filter((b) => b.on && b.id !== 0 && b.id !== 8 && groupOf(b.id) === grp).length === 0;
  return cleared && !result.scratch ? shooter : other;
}

/**
 * Make sure a shot does not contradict the round. `mustWin` is who must eventually win ('you'|'bot').
 * Returns a (possibly nudged) shot and its simulation.
 */
export function constrainShot(state, shot, shooter, mustWin) {
  const bad = (res) => { const v = verdict(state, res, shooter); return v != null && v !== mustWin; };
  let res = simulate(state.balls, shot);
  if (!bad(res)) return { shot, result: res, nudged: false };
  const deltas = [];
  for (let i = 1; i <= 24; i++) deltas.push(i * 0.004, -i * 0.004);
  for (const pk of [1, 0.85, 1.15, 0.7, 0.5]) {
    for (const d of deltas) {
      const s = { ...shot, angle: shot.angle + d, speed: shot.speed * pk };
      const r = simulate(state.balls, s);
      if (!bad(r)) return { shot: s, result: r, nudged: true };
    }
  }
  // last resort: a soft tap that cannot pot anything
  const s = { ...shot, speed: 0.25, spin: 0 };
  return { shot: s, result: simulate(state.balls, s), nudged: true };
}

/** Legal target balls for a shooter. */
export function targets(state, shooter) {
  const grp = state.group[shooter];
  const on = state.balls.filter((b) => b.on && b.id !== 0);
  if (!grp) return on.filter((b) => b.id !== 8);
  const mine = on.filter((b) => groupOf(b.id) === grp);
  return mine.length ? mine : on.filter((b) => b.id === 8);
}

/**
 * Bot shot selection. skill in [0,1]. mustWin = 'you'|'bot' (the round's result).
 * Searches ghost-ball shots at every pocket, then random shots, always filtered by the result.
 */
export function botShot(state, skill, mustWin, rnd = Math.random) {
  const cue = state.balls.find((b) => b.id === 0);
  const tg = targets(state, 'bot');
  const shooterMustWin = mustWin === 'bot';
  const bad = (res) => { const v = verdict(state, res, 'bot'); return v != null && v !== mustWin; };
  const candidates = [];
  for (const b of tg) {
    for (const p of POCKETS) {
      const du = b.u - p.u, dv = b.v - p.v;
      const d = Math.hypot(du, dv) || 1;
      const gu = b.u + (du / d) * 2 * R, gv = b.v + (dv / d) * 2 * R;
      const angle = Math.atan2(gv - cue.v, gu - cue.u);
      const dist = Math.hypot(gu - cue.u, gv - cue.v) + d;
      for (const spd of [1.2 + dist * 0.9, 1.0 + dist * 1.4]) {
        const shot = { angle, speed: Math.min(4.2, spd), spin: 0 };
        const res = simulate(state.balls, shot);
        if (bad(res)) continue;
        const legalPot = res.potted.includes(b.id) && !res.scratch;
        candidates.push({ shot, res, legalPot, wins: verdict(state, res, 'bot') === 'bot' });
      }
    }
  }
  let pots = candidates.filter((c) => c.legalPot);
  if (shooterMustWin) {
    const w = pots.filter((c) => c.wins);
    if (w.length) return w[0];
    if (!pots.length) {
      // wider random search so the bot always finds a way forward
      for (let i = 0; i < 160 && !pots.length; i++) {
        const shot = { angle: rnd() * Math.PI * 2, speed: 1 + rnd() * 3, spin: 0 };
        const res = simulate(state.balls, shot);
        if (bad(res) || res.scratch) continue;
        if (res.potted.some((id) => tg.find((t) => t.id === id))) pots.push({ shot, res, legalPot: true });
      }
    }
    if (pots.length) return pots[Math.floor(rnd() * Math.min(3, pots.length))];
  } else {
    // bot is fated to lose: pot with probability `skill`, but never the winning ball
    pots = pots.filter((c) => !c.wins);
    if (pots.length && rnd() < skill) return pots[Math.floor(rnd() * pots.length)];
    if (pots.length) {
      // deliberate near miss off a real potting line
      const c = pots[Math.floor(rnd() * pots.length)];
      for (let i = 0; i < 12; i++) {
        const shot = { ...c.shot, angle: c.shot.angle + (rnd() < 0.5 ? 1 : -1) * (0.03 + rnd() * 0.05) };
        const res = simulate(state.balls, shot);
        if (!bad(res) && !res.scratch && !res.potted.includes(c.res.potted.find((id) => id !== 0))) return { shot, res, legalPot: false };
      }
    }
  }
  // safety: softly hit the nearest target ball
  let best = null;
  for (const b of tg) {
    const d = Math.hypot(b.u - cue.u, b.v - cue.v);
    if (!best || d < best.d) best = { b, d };
  }
  for (let i = 0; i < 30; i++) {
    const base = best ? Math.atan2(best.b.v - cue.v, best.b.u - cue.u) : rnd() * Math.PI * 2;
    const shot = { angle: base + (rnd() - 0.5) * 0.1 * i, speed: 0.6 + rnd() * 0.8, spin: 0 };
    const res = simulate(state.balls, shot);
    if (!bad(res) && !res.scratch) return { shot, res, legalPot: false };
  }
  const shot = { angle: rnd() * Math.PI * 2, speed: 0.3, spin: 0 };
  return { shot, res: simulate(state.balls, shot), legalPot: false };
}

/** First object the cue ball would hit along `angle` (for the aim guide). */
export function aimGuide(balls, angle) {
  const cue = balls.find((b) => b.id === 0);
  const du = Math.cos(angle), dv = Math.sin(angle);
  let best = null;
  for (const b of balls) {
    if (!b.on || b.id === 0) continue;
    const ru = b.u - cue.u, rv = b.v - cue.v;
    const t = ru * du + rv * dv;
    if (t <= 0) continue;
    const perp = Math.abs(ru * dv - rv * du);
    if (perp >= 2 * R) continue;
    const back = Math.sqrt(4 * R * R - perp * perp);
    const dist = t - back;
    if (dist < 0) continue;
    if (!best || dist < best.dist) best = { dist, ball: b };
  }
  if (best) {
    const gu = cue.u + du * best.dist, gv = cue.v + dv * best.dist;
    const ou = best.ball.u - gu, ov = best.ball.v - gv;
    const on = Math.hypot(ou, ov) || 1;
    return { dist: best.dist, ghost: { u: gu, v: gv }, ball: best.ball, objDir: { u: ou / on, v: ov / on } };
  }
  // cushion distance
  let t = Infinity;
  if (du > 0) t = Math.min(t, (L / 2 - R - cue.u) / du); if (du < 0) t = Math.min(t, (-L / 2 + R - cue.u) / du);
  if (dv > 0) t = Math.min(t, (W / 2 - R - cue.v) / dv); if (dv < 0) t = Math.min(t, (-W / 2 + R - cue.v) / dv);
  return { dist: Math.max(0, t), ghost: null };
}

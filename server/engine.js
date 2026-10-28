/**
 * Server-side round engine. Holds sessions, balances and rounds in memory.
 * Swap `store` for a database in production; the logic is the interesting part.
 */
import crypto from 'node:crypto';
import {
  GAMES, STAKES, clampRtp, DEFAULT_RTP, resolveOutcome, floatsNeeded, stepperPayout,
} from '../shared/outcomes.js';
import { rollFloats } from '../shared/rng.js';

const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export class Engine {
  constructor({ rtp = DEFAULT_RTP, startingBalance = 1000 } = {}) {
    this.rtp = clampRtp(rtp);
    this.startingBalance = startingBalance;
    this.sessions = new Map();
    this.rounds = new Map();
  }

  setRtp(rtp) { this.rtp = clampRtp(rtp); return this.rtp; }

  config() {
    return { rtp: this.rtp, stakes: STAKES, games: GAMES };
  }

  createSession(clientSeed) {
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const s = {
      id: 'ses_' + crypto.randomBytes(12).toString('hex'),
      balance: this.startingBalance,
      serverSeed,
      serverSeedHash: sha256(serverSeed),
      clientSeed: clientSeed || crypto.randomBytes(8).toString('hex'),
      nonce: 0,
      openRound: null,
      history: [],
    };
    this.sessions.set(s.id, s);
    return this.publicSession(s);
  }

  getSession(id) {
    const s = this.sessions.get(id);
    if (!s) throw httpError(404, 'unknown session');
    return s;
  }

  publicSession(s) {
    return {
      sessionId: s.id, balance: s.balance, serverSeedHash: s.serverSeedHash,
      clientSeed: s.clientSeed, nonce: s.nonce, rtp: this.rtp,
      openRound: s.openRound ? this.publicRound(this.rounds.get(s.openRound)) : null,
    };
  }

  /** Rotate the seed: reveal the old one so past rounds can be verified. */
  rotateSeed(sessionId, clientSeed) {
    const s = this.getSession(sessionId);
    const revealed = { serverSeed: s.serverSeed, serverSeedHash: s.serverSeedHash, nonceUsed: s.nonce };
    s.serverSeed = crypto.randomBytes(32).toString('hex');
    s.serverSeedHash = sha256(s.serverSeed);
    if (clientSeed) s.clientSeed = String(clientSeed).slice(0, 64);
    s.nonce = 0;
    return { revealed, ...this.publicSession(s) };
  }

  async startRound(sessionId, gameId, stake) {
    const s = this.getSession(sessionId);
    const g = GAMES[gameId];
    if (!g) throw httpError(400, 'unknown game');
    stake = Number(stake);
    if (!STAKES.includes(stake)) throw httpError(400, 'invalid stake');
    if (s.openRound) {
      // A round left open (tab closed mid-game) is settled as-is before a new one starts.
      this.abandonRound(s);
    }
    if (s.balance < stake) throw httpError(402, 'insufficient balance');

    s.nonce += 1;
    const floats = await rollFloats(hmac, s.serverSeed, s.clientSeed, s.nonce, floatsNeeded(gameId));
    const outcome = resolveOutcome(gameId, floats, this.rtp);
    s.balance -= stake;

    const r = {
      id: 'rnd_' + crypto.randomBytes(8).toString('hex'),
      sessionId: s.id, gameId, stake, nonce: s.nonce, outcome,
      steps: 0, settled: false, payout: 0, createdAt: Date.now(),
    };
    this.rounds.set(r.id, r);
    s.openRound = r.id;
    return { ...this.publicRound(r), balance: s.balance };
  }

  /** What the client is allowed to know. Stepper rounds reveal one step at a time. */
  publicRound(r) {
    if (!r) return null;
    const base = { roundId: r.id, gameId: r.gameId, stake: r.stake, nonce: r.nonce, settled: r.settled, payout: r.payout };
    if (r.outcome.type === 'versus') {
      return { ...base, type: 'versus', win: r.outcome.win, flavour: r.outcome.flavour, payoutMultiplier: r.outcome.payoutMultiplier };
    }
    return {
      ...base, type: 'stepper', ladder: r.outcome.ladder, maxSteps: r.outcome.maxSteps, steps: r.steps,
      currentMultiplier: r.steps > 0 ? r.outcome.ladder[r.steps - 1] : 0,
    };
  }

  /** Stepper: take the next step. Reveals only whether this step survived. */
  step(sessionId, roundId) {
    const s = this.getSession(sessionId);
    const r = this.openRoundOf(s, roundId);
    if (r.outcome.type !== 'stepper') throw httpError(400, 'not a stepper round');
    const stepNo = r.steps + 1;
    const survived = stepNo < r.outcome.crashStep;
    if (!survived) {
      r.steps = stepNo;
      this.settle(s, r, 0);
      return { ...this.publicRound(r), survived: false, balance: s.balance };
    }
    r.steps = stepNo;
    let auto = null;
    if (r.steps >= r.outcome.maxSteps) {
      // reached the top of the ladder: automatic cash-out
      const payout = stepperPayout(r.outcome, r.stake, r.steps);
      this.settle(s, r, payout);
      auto = 'max';
    }
    return { ...this.publicRound(r), survived: true, autoCashout: auto, balance: s.balance };
  }

  cashout(sessionId, roundId) {
    const s = this.getSession(sessionId);
    const r = this.openRoundOf(s, roundId);
    if (r.outcome.type !== 'stepper') throw httpError(400, 'not a stepper round');
    if (r.steps < 1) throw httpError(400, 'take at least one step first');
    const payout = stepperPayout(r.outcome, r.stake, r.steps);
    this.settle(s, r, payout);
    return { ...this.publicRound(r), balance: s.balance };
  }

  /** Versus: the client reports it finished animating; the SERVER's stored result decides the payout. */
  finish(sessionId, roundId) {
    const s = this.getSession(sessionId);
    const r = this.openRoundOf(s, roundId);
    if (r.outcome.type !== 'versus') throw httpError(400, 'not a versus round');
    const payout = r.outcome.win ? r.stake * r.outcome.payoutMultiplier : 0;
    this.settle(s, r, payout);
    return { ...this.publicRound(r), balance: s.balance };
  }

  abandonRound(s) {
    const r = this.rounds.get(s.openRound);
    if (!r || r.settled) { s.openRound = null; return; }
    if (r.outcome.type === 'versus') {
      this.settle(s, r, r.outcome.win ? r.stake * r.outcome.payoutMultiplier : 0);
    } else {
      this.settle(s, r, stepperPayout(r.outcome, r.stake, r.steps));
    }
  }

  settle(s, r, payout) {
    r.settled = true;
    r.payout = payout;
    s.balance += payout;
    s.openRound = null;
    s.history.push({ roundId: r.id, gameId: r.gameId, stake: r.stake, payout, nonce: r.nonce, at: Date.now() });
    if (s.history.length > 200) s.history.shift();
  }

  openRoundOf(s, roundId) {
    const r = this.rounds.get(roundId);
    if (!r || r.sessionId !== s.id) throw httpError(404, 'unknown round');
    if (r.settled) throw httpError(409, 'round already settled');
    return r;
  }

  history(sessionId) { return this.getSession(sessionId).history.slice().reverse(); }

  /** Dev helper: top up a demo wallet. */
  topUp(sessionId, amount = 1000) {
    const s = this.getSession(sessionId);
    s.balance += amount;
    return this.publicSession(s);
  }
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

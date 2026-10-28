/**
 * Offline/demo fallback: the same outcome maths as the server, run in the
 * browser with WebCrypto HMAC. Balance persists in localStorage.
 * NOT for real-money play: the client can be inspected. It exists so the PWA
 * works with no network and so the game can be hosted statically for demos.
 */
import { resolveOutcome, floatsNeeded, stepperPayout, DEFAULT_RTP, STAKES } from '../../shared/outcomes.js';
import { rollFloats } from '../../shared/rng.js';

const KEY = 'ff.local';
const enc = new TextEncoder();

async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const rndHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

export class LocalEngine {
  async init() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch {}
    if (!s || !s.serverSeed) {
      s = { sessionId: 'local_' + rndHex(6), balance: 1000, serverSeed: rndHex(32), clientSeed: rndHex(8), nonce: 0, rtp: DEFAULT_RTP };
    }
    this.s = s;
    this.rounds = new Map();
    this.save();
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch {} }
  async session() {
    return { sessionId: this.s.sessionId, balance: this.s.balance, rtp: this.s.rtp, clientSeed: this.s.clientSeed, serverSeedHash: await sha256hex(this.s.serverSeed), nonce: this.s.nonce };
  }
  async topUp() { this.s.balance += 1000; this.save(); return this.session(); }
  async rotate() { this.s.serverSeed = rndHex(32); this.s.nonce = 0; this.save(); return this.session(); }

  async start({ gameId, stake }) {
    stake = Number(stake);
    if (!STAKES.includes(stake)) throw new Error('invalid stake');
    if (this.s.balance < stake) throw new Error('insufficient balance');
    this.s.nonce += 1;
    const floats = await rollFloats(hmac, this.s.serverSeed, this.s.clientSeed, this.s.nonce, floatsNeeded(gameId));
    const outcome = resolveOutcome(gameId, floats, this.s.rtp);
    this.s.balance -= stake;
    const r = { roundId: 'lrnd_' + rndHex(4), gameId, stake, outcome, steps: 0, settled: false, payout: 0 };
    this.rounds.set(r.roundId, r);
    this.save();
    return { ...this.pub(r), balance: this.s.balance };
  }
  pub(r) {
    const base = { roundId: r.roundId, gameId: r.gameId, stake: r.stake, settled: r.settled, payout: r.payout };
    if (r.outcome.type === 'versus') return { ...base, type: 'versus', win: r.outcome.win, flavour: r.outcome.flavour, payoutMultiplier: r.outcome.payoutMultiplier };
    return { ...base, type: 'stepper', ladder: r.outcome.ladder, maxSteps: r.outcome.maxSteps, steps: r.steps, currentMultiplier: r.steps > 0 ? r.outcome.ladder[r.steps - 1] : 0 };
  }
  settle(r, payout) { r.settled = true; r.payout = payout; this.s.balance += payout; this.save(); }
  async step({ roundId }) {
    const r = this.rounds.get(roundId);
    if (!r || r.settled) throw new Error('bad round');
    const n = r.steps + 1;
    const survived = n < r.outcome.crashStep;
    r.steps = n;
    if (!survived) { this.settle(r, 0); return { ...this.pub(r), survived: false, balance: this.s.balance }; }
    let auto = null;
    if (n >= r.outcome.maxSteps) { this.settle(r, stepperPayout(r.outcome, r.stake, n)); auto = 'max'; }
    return { ...this.pub(r), survived: true, autoCashout: auto, balance: this.s.balance };
  }
  async cashout({ roundId }) {
    const r = this.rounds.get(roundId);
    if (!r || r.settled || r.steps < 1) throw new Error('bad round');
    this.settle(r, stepperPayout(r.outcome, r.stake, r.steps));
    return { ...this.pub(r), balance: this.s.balance };
  }
  async finish({ roundId }) {
    const r = this.rounds.get(roundId);
    if (!r || r.settled) throw new Error('bad round');
    this.settle(r, r.outcome.win ? r.stake * r.outcome.payoutMultiplier : 0);
    return { ...this.pub(r), balance: this.s.balance };
  }
}

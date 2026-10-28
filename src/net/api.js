/**
 * Client for the outcome server. If the server cannot be reached (offline PWA,
 * static hosting without the backend), it falls back to a local engine so the
 * game remains playable in demo mode. In production the server is authoritative.
 */
import { LocalEngine } from './localEngine.js';

const SESSION_KEY = 'ff.session';

export class Api {
  constructor() {
    this.sessionId = null;
    this.balance = 0;
    this.rtp = 0.96;
    this.serverSeedHash = '';
    this.clientSeed = '';
    this.offline = false;
    this.local = null;
    this.listeners = new Set();
  }

  onBalance(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  setBalance(b) { if (typeof b === 'number') { this.balance = b; this.listeners.forEach((f) => f(b)); } }

  async init() {
    const saved = safeJson(localStorage.getItem(SESSION_KEY));
    try {
      let s = null;
      if (saved?.sessionId) {
        s = await this.req('GET', `/api/session/${saved.sessionId}`).catch(() => null);
      }
      if (!s) s = await this.req('POST', '/api/session', { clientSeed: saved?.clientSeed });
      this.adopt(s);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId: s.sessionId, clientSeed: s.clientSeed }));
      this.offline = false;
    } catch (e) {
      console.warn('[api] outcome server unreachable, using local demo engine', e);
      this.offline = true;
      this.local = new LocalEngine();
      await this.local.init();
      this.adopt(await this.local.session());
    }
    return this;
  }

  adopt(s) {
    this.sessionId = s.sessionId;
    this.rtp = s.rtp;
    this.serverSeedHash = s.serverSeedHash;
    this.clientSeed = s.clientSeed;
    this.setBalance(s.balance);
  }

  async startRound(gameId, stake) {
    const r = await this.call('start', { sessionId: this.sessionId, gameId, stake });
    this.setBalance(r.balance);
    return r;
  }
  async step(roundId) {
    const r = await this.call('step', { sessionId: this.sessionId, roundId });
    this.setBalance(r.balance);
    return r;
  }
  async cashout(roundId) {
    const r = await this.call('cashout', { sessionId: this.sessionId, roundId });
    this.setBalance(r.balance);
    return r;
  }
  async finish(roundId) {
    const r = await this.call('finish', { sessionId: this.sessionId, roundId });
    this.setBalance(r.balance);
    return r;
  }
  async topUp() {
    const s = this.offline ? await this.local.topUp() : await this.req('POST', `/api/session/${this.sessionId}/topup`);
    this.setBalance(s.balance);
    return s;
  }
  async rotateSeed() {
    const s = this.offline ? await this.local.rotate() : await this.req('POST', `/api/session/${this.sessionId}/rotate`);
    this.adopt(s);
    return s;
  }

  call(action, body) {
    if (this.offline) return this.local[action](body);
    return this.req('POST', `/api/round/${action}`, body);
  }

  async req(method, url, body) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(url, {
        method, headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } finally { clearTimeout(t); }
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

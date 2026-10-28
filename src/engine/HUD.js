/** All 2D UI. Minimal, grouped around the edges so the 3D view stays the focus. */
import { STAKES } from '../../shared/outcomes.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export class HUD {
  constructor(root, api) {
    this.root = root;
    this.api = api;
    this.canvas = document.getElementById('game');

    this.tl = h('div', 'hud-corner hud-tl');
    this.balance = h('div', 'chip', 'Wallet <b>0</b>');
    this.tl.append(this.balance);
    this.tr = h('div', 'hud-corner hud-tr');
    this.rtpChip = h('div', 'chip tiny', 'RTP 96%');
    this.infoBtn = h('button', 'icon', 'i');
    this.tr.append(this.rtpChip, this.infoBtn);
    this.info = h('div', 'info');
    this.infoBtn.onclick = () => this.toggleInfo();

    this.toast = h('div', 'toast');
    this.prompt = h('div', 'prompt');
    this.panel = h('div', 'panel');
    this.score = h('div', 'score');
    this.hints = h('div', 'hints');
    this.dialogue = h('div', 'dialogue');
    this.result = h('div', 'result');
    this.vignette = h('div', 'vignette');
    this.blackout = h('div', 'blackout');
    this.hurt = h('div', 'hurt');
    this.crosshair = h('div', 'crosshair');
    this.health = h('div', 'healthbars');
    this.power = h('div', 'powerbar', '<i></i>');
    this.actions = h('div', 'mobile-actions');
    this.rodTabs = h('div', 'rod-tabs');

    root.append(this.vignette, this.hurt, this.blackout, this.crosshair, this.toast, this.prompt, this.panel, this.score,
      this.hints, this.dialogue, this.health, this.power, this.actions, this.rodTabs, this.tl, this.tr, this.info, this.result);

    api.onBalance((b) => { this.balance.querySelector('b').textContent = fmt(b); });
    this.balance.querySelector('b').textContent = fmt(api.balance);
    this.rtpChip.textContent = `RTP ${Math.round(api.rtp * 100)}%${api.offline ? ' · offline demo' : ''}`;
  }

  toggleInfo(force) {
    const on = force ?? !this.info.classList.contains('show');
    if (on) {
      this.info.innerHTML = `<h3>Provably fair</h3>
        Every round's result is fixed by RNG before you pick up a cue, dart or drink. What you see is a skill-flavoured replay of that result.<br><br>
        Server seed hash: <code>${this.api.serverSeedHash}</code><br>
        Client seed: <code>${this.api.clientSeed}</code><br>
        Session: <code>${this.api.sessionId}</code>${this.api.offline ? '<br><br><b>Offline demo</b>: outcomes are computed locally.' : ''}`;
      const top = h('button', 'btn', 'Top up demo wallet (+1000)');
      top.onclick = () => this.api.topUp();
      const rot = h('button', 'btn', 'Rotate seed (reveal current)');
      rot.onclick = async () => { await this.api.rotateSeed(); this.toggleInfo(true); };
      this.info.append(top, rot);
    }
    this.info.classList.toggle('show', on);
  }

  showToast(title, sub, ms = 3200) {
    this.toast.innerHTML = `<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}`;
    this.toast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toast.classList.remove('show'), ms);
  }

  showPrompt(label, sub, onClick) {
    this.prompt.innerHTML = '';
    const b = h('button', '', `${label}<small>${sub}</small>`);
    b.onclick = () => onClick && onClick();
    this.prompt.append(b);
    this.prompt.classList.add('show');
  }
  hidePrompt() { this.prompt.classList.remove('show'); }

  /** Stake picker. Resolves with stake or null. */
  showBet(title, blurb, isTouch) {
    return new Promise((resolve) => {
      let stake = Number(localStorage.getItem('ff.stake')) || 5;
      this.panel.innerHTML = '';
      this.panel.append(h('h2', '', title), h('p', '', blurb));
      const stakes = h('div', 'stakes');
      const btns = STAKES.map((s) => {
        const b = h('button', s === stake ? 'sel' : '', String(s));
        b.onclick = () => { stake = s; btns.forEach((x) => x.classList.toggle('sel', x === b)); };
        stakes.append(b);
        return b;
      });
      const row = h('div', 'row');
      const cancel = h('button', 'btn', 'Walk away');
      const play = h('button', 'btn primary', 'Play');
      row.append(cancel, play);
      this.panel.append(stakes, row);
      const done = (v) => { this.panel.classList.remove('show'); window.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); done(stake); } if (e.code === 'Escape') done(null); };
      cancel.onclick = () => done(null);
      play.onclick = () => {
        if (this.api.balance < stake) { this.showToast('Not enough in the wallet', 'top up from the ⓘ menu'); return; }
        localStorage.setItem('ff.stake', String(stake));
        done(stake);
      };
      setTimeout(() => window.addEventListener('keydown', onKey), 50);
      this.panel.classList.add('show');
    });
  }

  setScore(big, sub) {
    if (big == null) { this.score.classList.remove('show'); return; }
    this.score.innerHTML = `<div class="big">${big}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    this.score.classList.add('show');
  }
  setHints(html) {
    if (!html) { this.hints.classList.remove('show'); return; }
    this.hints.innerHTML = html;
    this.hints.classList.add('show');
  }
  setCrosshair(on) { this.crosshair.classList.toggle('show', on); }
  setPower(v) { this.power.classList.toggle('show', v != null); if (v != null) this.power.firstChild.style.width = `${Math.round(v * 100)}%`; }

  /** Health bars: [{label, hp, max, enemy}] */
  setHealth(list) {
    if (!list) { this.health.classList.remove('show'); return; }
    this.health.innerHTML = '';
    for (const b of list) {
      const el = h('div', 'hb' + (b.enemy ? ' enemy' : ''), `<label>${b.label}</label><i style="width:${Math.max(0, b.hp / b.max) * 100}%"></i>`);
      el.style.marginTop = '14px';
      this.health.append(el);
    }
    this.health.classList.add('show');
  }

  /** Touch action buttons: [{label, big, onDown, onUp}] */
  setActions(list) {
    this.actions.innerHTML = '';
    if (!list || !list.length) { this.actions.classList.remove('show'); return; }
    for (const a of list) {
      const b = h('button', a.big ? 'big' : '', a.label);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); a.onDown && a.onDown(); });
      b.addEventListener('pointerup', (e) => { e.preventDefault(); a.onUp && a.onUp(); });
      b.addEventListener('pointercancel', () => a.onUp && a.onUp());
      this.actions.append(b);
    }
    this.actions.classList.add('show');
  }

  setRodTabs(list, sel, onSel) {
    this.rodTabs.innerHTML = '';
    if (!list) { this.rodTabs.classList.remove('show'); return; }
    list.forEach((l, i) => {
      const b = h('button', i === sel ? 'sel' : '', l);
      b.onclick = () => onSel(i);
      this.rodTabs.append(b);
    });
    this.rodTabs.classList.add('show');
  }

  /** Dialogue box with speaker line and buttons. ladder: {steps, done} optional. */
  setDialogue({ who, text, choices, ladder }) {
    if (!who && !text) { this.dialogue.classList.remove('show'); return; }
    this.dialogue.innerHTML = '';
    if (ladder) {
      const l = h('div', 'ladder');
      ladder.values.forEach((v, i) => {
        const s = h('span', i < ladder.done ? 'done' : i === ladder.done ? 'next' : '', `${v.toFixed(2)}x`);
        l.append(s);
      });
      this.dialogue.append(l);
    }
    this.dialogue.append(h('div', 'bubble', `<span class="who">${who}</span>${text}`));
    if (choices && choices.length) {
      const c = h('div', 'choices');
      for (const row of choices) {
        const r = h('div', 'row');
        for (const ch of row) {
          const b = h('button', 'btn ' + (ch.cls || 'line'), ch.label);
          b.disabled = !!ch.disabled;
          b.onclick = () => ch.onClick && ch.onClick();
          r.append(b);
        }
        c.append(r);
      }
      this.dialogue.append(c);
    }
    this.dialogue.classList.add('show');
  }

  setBlackout(v) { this.blackout.style.opacity = String(Math.max(0, Math.min(1, v))); }
  setBlur(px) { this.canvas.style.filter = px > 0.05 ? `blur(${px.toFixed(1)}px)` : ''; }
  flashHurt(strength = 1) {
    this.hurt.style.opacity = String(Math.min(1, strength));
    clearTimeout(this._hurtT);
    this._hurtT = setTimeout(() => { this.hurt.style.opacity = '0'; }, 180);
  }

  showResult({ win, title, line, payout, stake }) {
    return new Promise((resolve) => {
      this.result.innerHTML = '';
      this.result.append(h('h1', win ? 'win' : 'lose', title));
      const p = win ? `+${fmt(payout)} <span style="color:var(--ink-dim)">(stake ${fmt(stake)})</span>` : `-${fmt(stake)}`;
      this.result.append(h('p', '', `${line}<br><b>${p}</b>`));
      const b = h('button', 'btn primary', 'Back to the bar');
      const done = () => { this.result.classList.remove('show'); window.removeEventListener('keydown', onKey); resolve(); };
      const onKey = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); done(); } };
      b.onclick = done;
      this.result.append(b);
      this.result.classList.add('show');
      setTimeout(() => window.addEventListener('keydown', onKey), 400);
    });
  }

  clearGameUI() {
    this.setScore(null); this.setHints(null); this.setCrosshair(false); this.setPower(null);
    this.setHealth(null); this.setActions(null); this.setRodTabs(null); this.setDialogue({});
    this.setBlackout(0); this.setBlur(0);
  }
}

export const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Drinking contest with Sal: a crash-style ladder. Each round both of you drink.
 * Survive -> Sal gives you a line, the multiplier climbs, your vision blurs.
 * Blow it -> the screen fades to black while you drink. Cash out any time after round 1.
 */
import * as THREE from 'three';
import { MiniGame } from './base.js';
import { DRINKS, SAL } from '../content/lines.js';

export class Drinking extends MiniGame {
  async start() {
    const st = this.station;
    this.sal = st.patron;
    this.steps = 0;
    this.busy = true;
    this.player.enabled = false;
    this.blur = 0;
    this.black = 0;
    this.sway = 0;
    this.hud.setHints(null);
    // sit down: camera glides to the stool and lowers
    const seat = st.seat;
    const sitEye = new THREE.Vector3(seat.x, 1.28, seat.z);
    const focus = new THREE.Vector3(this.sal.root.position.x + 0.45, 1.12, this.bar.barZ - 0.2);
    this.focus = focus;
    this.sitEye = sitEye;
    await this.moveCamera(new THREE.Vector3(seat.x, 1.62, seat.z + 0.5), focus, 0.8);
    await this.moveCamera(sitEye, focus, 0.9);
    this.sal.lookAt(sitEye);
    this.sal.lookAt(new THREE.Vector3(seat.x, 0, seat.z));
    this.hud.setDialogue({ who: 'Sal', text: pick(SAL.open), ladder: this.ladder() });
    this.bartenderBrings(0).then(() => this.offer());
  }

  ladder() { return { values: this.round.ladder, done: this.steps }; }

  /** Dee walks over and sets two drinks on the bar. */
  async bartenderBrings(i) {
    const dee = this.bar.bartender;
    const drink = DRINKS[Math.min(i, DRINKS.length - 1)];
    this.drink = drink;
    const home = dee.root.position.clone();
    const to = new THREE.Vector3(this.sitEye.x - 0.5, 0, this.bar.barZ - 0.75);
    dee.pose = 'idle'; dee.walk = 1;
    await this.glide(dee.root.position, to, 0.9, () => { dee.lookAt(this.sitEye); dee.walkPhase += 0.25; });
    dee.walk = 0; dee.pose = 'bartend';
    this.clearGlasses();
    this.glasses = [
      this.bar.glass(this.sitEye.x - 0.15, this.bar.barTopY, this.bar.barZ + 0.08, drink.pint, this.group),
      this.bar.glass(this.sal.root.position.x + 0.2, this.bar.barTopY, this.bar.barZ + 0.05, drink.pint, this.group),
    ];
    dee.punch();
    await this.wait(0.5);
    dee.walk = 1; dee.pose = 'idle';
    this.glide(dee.root.position, home, 1.0, () => { dee.lookAt(new THREE.Vector3(home.x, 0, 0)); dee.walkPhase += 0.25; }).then(() => { dee.walk = 0; dee.pose = 'bartend'; });
  }

  clearGlasses() { if (this.glasses) for (const g of this.glasses) this.group.remove(g); this.glasses = null; }

  offer() {
    this.busy = false;
    const next = this.round.ladder[this.steps];
    const cur = this.steps > 0 ? this.round.ladder[this.steps - 1] : 0;
    const stake = this.round.stake;
    this.hud.setDialogue({
      who: 'Sal', text: this.lastLine || pick(SAL.open), ladder: this.ladder(),
      choices: [[
        { label: `Drink ${this.drink.name} <small>(for ${(next * stake).toFixed(2)})</small>`, cls: 'go', onClick: () => this.drinkRound() },
        { label: this.steps > 0 ? `Cash out ${(cur * stake).toFixed(2)}` : 'Cash out', cls: 'danger', disabled: this.steps < 1, onClick: () => this.cashOut() },
      ]],
    });
    this.hud.setHints(`<kbd>space</kbd> drink · <kbd>esc</kbd> cash out`);
  }

  async drinkRound() {
    if (this.busy || this.done) return;
    this.busy = true;
    this.hud.setDialogue({ who: 'You', text: pick(SAL.playerDrink), ladder: this.ladder() });
    let res;
    try { res = await this.api.step(this.round.roundId); }
    catch (e) { this.finish({ win: false, title: 'Bar closed', line: String(e.message) }); return; }
    // both drink: Sal's animation + your glass rising into view
    this.sal.drink();
    const mine = this.glasses[0];
    const start = mine.position.clone();
    const dur = res.survived ? 1.6 : 3.2;
    const t0 = performance.now();
    await new Promise((r) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
        const up = Math.sin(Math.min(1, k * 1.4) * Math.PI);
        const held = this.camera.localToWorld(new THREE.Vector3(0.05, -0.12 + up * 0.03, -0.35));
        mine.position.lerpVectors(start, held, Math.min(1, k * 3));
        mine.rotation.x = -up * 1.1;
        mine.userData.liquid.scale.y = 1 - k * 0.95;
        mine.userData.liquid.position.y = mine.userData.h * 0.36 * (1 - k * 0.95);
        this.camera.rotation.x = this.camBasePitch + up * 0.22;
        if (!res.survived) { this.black = k < 0.25 ? 0 : (k - 0.25) / 0.75; this.hud.setBlackout(this.black); }
        if (k < 1 && !this.done) requestAnimationFrame(step); else r();
      };
      this.camBasePitch = this.camera.rotation.x;
      step();
    });
    if (!res.survived) {
      await this.wait(0.6);
      this.finish({ win: false, title: 'Blacked out', line: pick(SAL.lose), payout: 0 });
      return;
    }
    this.steps += 1;
    this.blur = this.steps * 0.55;
    this.sway = this.steps * 0.25;
    this.sal.stagger();
    if (res.autoCashout) {
      this.hud.setDialogue({ who: 'Sal', text: SAL.max, ladder: this.ladder() });
      await this.wait(2.2);
      this.finish({ win: true, title: 'Sal is under the table', line: SAL.max, payout: res.payout });
      return;
    }
    this.lastLine = SAL.survive[Math.min(this.steps - 1, SAL.survive.length - 1)];
    this.hud.setDialogue({ who: 'Sal', text: this.lastLine, ladder: this.ladder() });
    await this.bartenderBrings(this.steps);
    this.offer();
  }

  async cashOut() {
    if (this.busy || this.done || this.steps < 1) return;
    this.busy = true;
    this.hud.setDialogue({ who: 'You', text: SAL.playerCashout, ladder: this.ladder() });
    let res;
    try { res = await this.api.cashout(this.round.roundId); }
    catch (e) { this.finish({ win: false, title: 'Bar closed', line: String(e.message) }); return; }
    await this.wait(1.2);
    const line = pick(SAL.cashout);
    this.hud.setDialogue({ who: 'Sal', text: line, ladder: this.ladder() });
    await this.wait(1.6);
    this.finish({ win: true, title: `Cashed out at ${this.round.ladder[this.steps - 1].toFixed(2)}x`, line, payout: res.payout });
  }

  update(dt) {
    super.update(dt);
    if (!this.busy) {
      if (this.input.justPressed('Space')) this.drinkRound();
      if (this.input.justPressed('Escape')) this.cashOut();
    }
    // impairment: blur + slow sway
    this.hud.setBlur(this.blur);
    if (this.sway > 0) {
      const s = Math.sin(this.t * 0.9) * 0.01 * this.sway;
      this.camera.rotation.z = s;
      this.camera.position.x = this.sitEye.x + Math.sin(this.t * 0.6) * 0.01 * this.sway;
    }
  }

  glide(pos, to, sec, each) {
    const from = pos.clone();
    const t0 = performance.now();
    return new Promise((r) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
        pos.lerpVectors(from, to, k * k * (3 - 2 * k));
        each && each();
        if (k < 1 && !this.done) requestAnimationFrame(step); else r();
      };
      step();
    });
  }

  dispose() {
    super.dispose();
    this.hud.setBlur(0); this.hud.setBlackout(0);
    this.camera.rotation.z = 0;
  }
}

export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

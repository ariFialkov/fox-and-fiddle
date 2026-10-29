/**
 * Pick-up lines with Rose: a crash-style ladder with dialogue. Each step you choose one of two
 * lines; the choice is flavour, the step's fate was rolled before you opened your mouth.
 * Rose's body language warms up as you climb, and goes cold on the step that fails.
 */
import * as THREE from 'three';
import { MiniGame } from './base.js';
import { ROSE } from '../content/lines.js';
import { pick } from './drinking.js';

export class Pickup extends MiniGame {
  async start() {
    this.rose = this.station.patron;
    this.steps = 0;
    this.busy = true;
    this.player.enabled = false;
    this.rose.pose = 'flirt';
    this.rose.mood = 0.45;
    const rp = this.rose.root.position;
    const dir = new THREE.Vector3(this.station.pos.x - rp.x, 0, this.station.pos.z - rp.z).normalize();
    const standAt = rp.clone().add(dir.multiplyScalar(1.35));
    this.eye = new THREE.Vector3(standAt.x, 1.6, standAt.z);
    this.face = new THREE.Vector3(rp.x, 1.42, rp.z);
    this.rose.lookAt(standAt);
    await this.moveCamera(this.eye, this.face, 1.0);
    this.hud.setDialogue({ who: 'Rose', text: ROSE.open, ladder: this.ladder() });
    await this.wait(1.4);
    this.offer();
  }

  ladder() { return { values: this.round.ladder, done: this.steps }; }

  beat() { return ROSE.beats[Math.min(this.steps, ROSE.beats.length - 1)]; }

  offer() {
    this.busy = false;
    const beat = this.beat();
    const cur = this.steps > 0 ? this.round.ladder[this.steps - 1] : 0;
    const stake = this.round.stake;
    const next = this.round.ladder[this.steps];
    const text = this.lastLine ? `${this.lastLine} <span style="color:var(--ink-dim)">${beat.prompt}</span>` : `${ROSE.open} <span style="color:var(--ink-dim)">${beat.prompt}</span>`;
    this.hud.setDialogue({
      who: 'Rose', text, ladder: this.ladder(),
      choices: [
        [{ label: `“${beat.options[0].say}”`, onClick: () => this.say(0) }],
        [{ label: `“${beat.options[1].say}”`, onClick: () => this.say(1) }],
        [{ label: this.steps > 0 ? `“${ROSE.playerCashout}” <small>(take ${(cur * stake).toFixed(2)})</small>` : `“${ROSE.playerCashout}”`, cls: 'danger', disabled: this.steps < 1, onClick: () => this.cashOut() }],
      ],
    });
    this.hud.setScore(`next line pays <em>${next.toFixed(2)}x</em>`, this.steps > 0 ? `holding ${cur.toFixed(2)}x` : 'say something');
    this.hud.setHints(`<kbd>1</kbd> <kbd>2</kbd> choose a line · <kbd>esc</kbd> leave together`);
  }

  async say(idx) {
    if (this.busy || this.done) return;
    this.busy = true;
    const opt = this.beat().options[idx];
    this.hud.setDialogue({ who: 'You', text: `“${opt.say}”`, ladder: this.ladder() });
    let res;
    try { res = await this.api.step(this.round.roundId); }
    catch (e) { this.finish({ win: false, title: 'Bar closed', line: String(e.message) }); return; }
    await this.wait(1.5);
    if (!res.survived) {
      this.rose.mood = 0;
      const bad = pick(ROSE.bad);
      this.hud.setDialogue({ who: 'Rose', text: bad, ladder: this.ladder() });
      // she turns away
      const away = this.rose.root.position.clone().add(new THREE.Vector3(0, 0, 3));
      await this.wait(1.2);
      this.rose.lookAt(away);
      await this.wait(1.4);
      this.finish({ win: false, title: 'Struck out', line: bad, payout: 0 });
      return;
    }
    this.steps += 1;
    this.rose.mood = Math.min(1, 0.45 + this.steps * 0.08);
    if (res.autoCashout) {
      this.hud.setDialogue({ who: 'Rose', text: ROSE.max, ladder: this.ladder() });
      await this.wait(2.4);
      this.finish({ win: true, title: 'She asked you', line: ROSE.max, payout: res.payout });
      return;
    }
    this.lastLine = opt.reply;
    this.offer();
  }

  async cashOut() {
    if (this.busy || this.done || this.steps < 1) return;
    this.busy = true;
    this.hud.setDialogue({ who: 'You', text: `“${ROSE.playerCashout}”`, ladder: this.ladder() });
    let res;
    try { res = await this.api.cashout(this.round.roundId); }
    catch (e) { this.finish({ win: false, title: 'Bar closed', line: String(e.message) }); return; }
    await this.wait(1.2);
    const line = pick(ROSE.cashout);
    this.rose.mood = 1;
    this.hud.setDialogue({ who: 'Rose', text: line, ladder: this.ladder() });
    await this.wait(1.8);
    this.finish({ win: true, title: 'Taking her home', line, payout: res.payout });
  }

  update(dt) {
    super.update(dt);
    if (!this.busy) {
      if (this.input.justPressed('Digit1')) this.say(0);
      if (this.input.justPressed('Digit2')) this.say(1);
      if (this.input.justPressed('Escape')) this.cashOut();
    }
    // lean in a touch as things warm up
    const lean = (this.rose.mood - 0.45) * 0.25;
    const target = this.eye.clone().addScaledVector(new THREE.Vector3().subVectors(this.face, this.eye).setY(0).normalize(), lean);
    this.stand = this.stand || this.eye.clone();
    this.stand.lerp(target, Math.min(1, dt * 2));
    this.idleCam(this.stand, this.face, dt);
  }

  dispose() {
    super.dispose();
    this.rose.mood = 0.5;
  }
}

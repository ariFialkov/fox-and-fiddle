/**
 * Drinking contest with Sal: a crash-style ladder. Each round Dee brings two of the same drink,
 * you reach down, grab yours and chug it in first person while Sal does the same beside you.
 * Survive -> Sal gives you a line, the multiplier climbs, your vision blurs a little more.
 * Blow it -> the screen fades to black mid-chug. Cash out any time after round 1.
 */
import * as THREE from 'three';
import { MiniGame } from './base.js';
import { DRINKS, SAL } from '../content/lines.js';

/** What each round's drink looks like. */
const SPECS = [
  { color: 0xe3a82a, foam: true },
  { color: 0x1a0f0a, foam: true },
  { color: 0xb8651c, fill: 0.45 },
  { color: 0xf3e6b0, fill: 0.5, garnish: 'lime', opacity: 0.8 },
  { color: 0x3a1a0c, garnish: 'lime', straw: true },
  { color: 0xa8521a, fill: 0.5 },
  { color: 0x8f5a2a, garnish: 'straw', fill: 0.85 },
  { color: 0xf7f7ff, fill: 0.5, opacity: 0.6 },
  { color: 0x3cb043, garnish: 'olive', fill: 0.75 },
  { color: 0x6b5a2a, opacity: 0.85 },
];

export class Drinking extends MiniGame {
  async start() {
    const st = this.station;
    this.sal = st.patron;
    this.steps = 0;
    this.busy = true;
    this.player.enabled = false;
    this.blur = 0;
    this.sway = 0;
    this.headTilt = 0;
    this.hud.setHints(null);
    // first-person arm
    this.hand = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b790, roughness: 0.7 });
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skin); palm.scale.set(1, 0.75, 1.1);
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.09), skin); fingers.position.set(0, 0.02, -0.03);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.42, 8), new THREE.MeshStandardMaterial({ color: 0x6b3a1e, roughness: 0.9 }));
    arm.rotation.x = Math.PI / 2 - 0.5; arm.position.set(0.02, 0.1, 0.22);
    this.hand.add(palm, fingers, arm);
    this.handRest = new THREE.Vector3(0.32, -0.42, -0.5);
    this.hand.position.copy(this.handRest);
    this.camera.add(this.hand);
    // sit down: camera glides to the stool and lowers
    const seat = st.seat;
    this.sitEye = new THREE.Vector3(seat.x, 1.28, seat.z);
    this.focus = new THREE.Vector3(this.sal.root.position.x + 0.45, 1.12, this.bar.barZ - 0.2);
    await this.moveCamera(new THREE.Vector3(seat.x, 1.62, seat.z + 0.5), this.focus, 0.7);
    await this.moveCamera(this.sitEye, this.focus, 0.8);
    this.seated = true;
    this.sal.headTarget = this.sitEye.clone();
    this.sal.lookAt(new THREE.Vector3(seat.x, 0, seat.z));
    this.sal.sit(0.72);
    this.hud.setDialogue({ who: 'Sal', text: pick(SAL.open), ladder: this.ladder() });
    this.bartenderBrings(0).then(() => this.offer());
  }

  ladder() { return { values: this.round.ladder, done: this.steps }; }

  /** Dee walks over and sets two drinks on the bar. */
  async bartenderBrings(i) {
    const dee = this.bar.bartender;
    const drink = DRINKS[Math.min(i, DRINKS.length - 1)];
    const spec = SPECS[Math.min(i, SPECS.length - 1)];
    this.drink = drink;
    const home = dee.root.position.clone();
    const to = new THREE.Vector3(this.sitEye.x - 0.5, 0, this.bar.barZ - 0.75);
    dee.pose = 'idle'; dee.walk = 1;
    await this.glide(dee.root.position, to, 0.9, () => { dee.lookAt(this.sitEye); dee.walkPhase += 0.25; });
    dee.walk = 0; dee.pose = 'bartend';
    this.clearGlasses();
    this.mySpot = new THREE.Vector3(this.sitEye.x - 0.12, this.bar.barTopY, this.bar.barZ + 0.1);
    this.salSpot = new THREE.Vector3(this.sal.root.position.x + 0.2, this.bar.barTopY, this.bar.barZ + 0.1);
    this.glasses = [this.bar.glass(this.mySpot.x, this.mySpot.y, this.mySpot.z, drink.pint, this.group, spec), null];
    dee.gesture();
    await this.wait(0.5);
    // then one for Sal
    const toSal = new THREE.Vector3(this.salSpot.x - 0.15, 0, this.bar.barZ - 0.75);
    dee.pose = 'idle'; dee.walk = 1;
    await this.glide(dee.root.position, toSal, 0.5, () => { dee.lookAt(this.sal.root.position); dee.walkPhase += 0.25; });
    dee.walk = 0; dee.pose = 'bartend';
    this.glasses[1] = this.bar.glass(this.salSpot.x, this.salSpot.y, this.salSpot.z, drink.pint, this.group, spec);
    dee.gesture();
    await this.wait(0.45);
    dee.walk = 1; dee.pose = 'idle';
    this.glide(dee.root.position, home, 1.0, () => { dee.lookAt(new THREE.Vector3(home.x, 0, 0)); dee.walkPhase += 0.25; }).then(() => { dee.walk = 0; dee.pose = 'bartend'; });
  }

  clearGlasses() { if (this.glasses) for (const g of this.glasses) g?.parent?.remove(g); this.glasses = null; }

  /** Sal reaches for his glass, lifts it, drinks, and sets it back down. Runs alongside your chug. */
  async salChug(glass, lose, dur) {
    const sal = this.sal, hand = sal.arms[1].hand;
    const seq = (sec, fn) => new Promise((r) => { const t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / (sec * 1000)); fn(k * k * (3 - 2 * k), k); if (k < 1 && !this.done) requestAnimationFrame(step); else r(); }; step(); });
    sal.reach();
    await seq(0.45, () => {});
    // glass into his hand (keeps its world pose for a frame, then settles into the grip)
    hand.attach(glass);
    const p0 = glass.position.clone(), q0 = glass.quaternion.clone();
    sal.drink();
    await seq(0.35, (e) => { glass.position.lerpVectors(p0, new THREE.Vector3(0, -0.02, 0.05), e); glass.quaternion.slerpQuaternions(q0, new THREE.Quaternion(), e); });
    await seq(Math.max(0.6, dur - 0.9), (e, k) => { this.bar.setGlassLevel(glass, 1 - k); });
    if (lose) { sal.laugh(); return; }
    sal.reach();
    await seq(0.45, () => {});
    this.group.attach(glass);
    const p1 = glass.position.clone(), q1 = glass.quaternion.clone();
    await seq(0.3, (e) => { glass.position.lerpVectors(p1, this.salSpot, e); glass.quaternion.slerpQuaternions(q1, new THREE.Quaternion(), e); });
    glass.position.copy(this.salSpot); glass.rotation.set(0, 0, 0);
  }

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

  /** First-person chug: reach, grab, lift, tilt, drain, put down. */
  async chug(glass, lose) {
    const hand = this.hand;
    const seq = (sec, fn) => new Promise((r) => { const t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / (sec * 1000)); fn(k * k * (3 - 2 * k), k); if (k < 1 && !this.done) requestAnimationFrame(step); else r(); }; step(); });
    const rest = this.handRest.clone();
    // reach: hand to the glass (camera-local), palm open
    const glassLocal = () => this.camera.worldToLocal(glass.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0.0, 0.035, 0.0));
    await seq(0.45, (e) => { hand.position.lerpVectors(rest, glassLocal(), e); hand.rotation.set(-0.3 * e, 0, 0); });
    // grab
    hand.add(glass); glass.position.set(0, -0.03, 0); glass.rotation.set(0, 0, 0);
    const mouth = new THREE.Vector3(0.07, -0.1, -0.26);
    const grabPos = hand.position.clone();
    await seq(0.45, (e) => { hand.position.lerpVectors(grabPos, mouth, e); hand.rotation.set(-0.3 + 0.1 * e, 0, 0); });
    // tilt & drain (Sal drinks alongside)
    const dur = lose ? 2.8 : 1.3;
    const salDone = this.salChug(this.glasses[1], lose, dur + 0.6);
    await seq(dur, (e, k) => {
      const tilt = Math.min(1, k * 1.6);
      hand.rotation.set(-0.2 + tilt * 1.15, 0, -0.15 * tilt);
      hand.position.set(mouth.x - tilt * 0.03, mouth.y + tilt * 0.06, mouth.z + tilt * 0.02);
      this.bar.setGlassLevel(glass, 1 - k);
      this.headTilt = tilt * 0.3;
      if (lose) this.hud.setBlackout(k < 0.2 ? 0 : (k - 0.2) / 0.8);
    });
    this.salDone = salDone;
    if (lose) return;
    // put it down
    const downLocal = () => this.camera.worldToLocal(this.mySpot.clone()).add(new THREE.Vector3(0, 0.035, 0));
    const from = hand.position.clone();
    await seq(0.4, (e) => { hand.position.lerpVectors(from, downLocal(), e); hand.rotation.set((1 - e) * 0.9, 0, 0); this.headTilt = (1 - e) * 0.3; });
    this.group.add(glass); glass.position.copy(this.mySpot); glass.rotation.set(0, 0, 0);
    const back = hand.position.clone();
    await seq(0.4, (e) => { hand.position.lerpVectors(back, rest, e); });
    await this.salDone;
  }

  async drinkRound() {
    if (this.busy || this.done) return;
    this.busy = true;
    this.hud.setDialogue({ who: 'You', text: pick(SAL.playerDrink), ladder: this.ladder() });
    let res;
    try { res = await this.api.step(this.round.roundId); }
    catch (e) { this.finish({ win: false, title: 'Bar closed', line: String(e.message) }); return; }
    this.hud.setDialogue({});
    await this.chug(this.glasses[0], !res.survived);
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
      this.sal.slump = 1;
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
    this.sal.laugh();
    await this.wait(1.6);
    this.finish({ win: true, title: `Cashed out at ${this.round.ladder[this.steps - 1].toFixed(2)}x`, line, payout: res.payout });
  }

  update(dt) {
    super.update(dt);
    if (!this.busy) {
      if (this.input.justPressed('Space')) this.drinkRound();
      if (this.input.justPressed('Escape')) this.cashOut();
    }
    if (this.seated) {
      // sitting: breathing, plus a slow drunk sway that grows with each round
      const sw = this.sway;
      const pos = this.sitEye.clone().add(new THREE.Vector3(Math.sin(this.t * 0.6) * 0.012 * sw, Math.sin(this.t * 0.45) * 0.006 * sw, 0));
      this.idleCam(pos, this.focus, dt);
      this.camera.rotateZ(Math.sin(this.t * 0.9) * 0.012 * sw);
      this.camera.rotateX(this.headTilt);
    }
    this.hud.setBlur(this.blur);
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
    this.camera.remove(this.hand);
    this.hud.setBlur(0); this.hud.setBlackout(0);
    this.sal.hold(null); this.sal.slump = 0; this.sal.headTarget = null;
  }
}

export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

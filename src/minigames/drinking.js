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
    // the regulars' half-finished pints between you and Sal are cleared away for the contest
    const sx = this.sal.root.position.x, seatX = st.seat.x;
    this.hiddenGlasses = (this.bar.barGlasses || []).filter((g) => g.visible && g.position.x > Math.min(sx, seatX) - 0.7 && g.position.x < Math.max(sx, seatX) + 0.7);
    for (const g of this.hiddenGlasses) g.visible = false;
    // sit down: camera glides to the stool and lowers
    const seat = st.seat;
    this.sitEye = new THREE.Vector3(seat.x, 1.28, seat.z);
    this.focus = new THREE.Vector3(this.sal.root.position.x + 0.45, 1.12, this.bar.barZ - 0.2);
    await this.moveCamera(new THREE.Vector3(seat.x, 1.62, seat.z + 0.5), this.focus, 0.7);
    await this.moveCamera(this.sitEye, this.focus, 0.8);
    this.seated = true;
    const sp = this.sal.root.position;
    this.sal.sit(0.72);
    this.salFaceYaw = Math.atan2(seat.x - sp.x, seat.z - sp.z);   // turned towards you
    this.salBarYaw = Math.PI;                                      // squared up to the bar
    this.sal.root.rotation.set(0, this.salFaceYaw, 0);
    this.sal.headTarget = this.sitEye.clone();
    this.salGrab = this.salReachPoint();
    this.salHold = null;
    this.allGlasses = [];
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
    // a few centimetres past his fingertips, so his palm closes round the side of the glass
    this.salSpot = new THREE.Vector3(this.salGrab.x, this.bar.barTopY, THREE.MathUtils.clamp(this.salGrab.z - 0.045, this.bar.barZ - 0.25, this.bar.barZ + 0.3));
    this.glasses = [this.bar.glass(this.mySpot.x, this.mySpot.y, this.mySpot.z, drink.pint, this.group, spec), null];
    this.allGlasses.push(this.glasses[0]);
    dee.gesture();
    await this.wait(0.5);
    // then one for Sal
    const toSal = new THREE.Vector3(this.salSpot.x - 0.15, 0, this.bar.barZ - 0.75);
    dee.pose = 'idle'; dee.walk = 1;
    await this.glide(dee.root.position, toSal, 0.5, () => { dee.lookAt(this.sal.root.position); dee.walkPhase += 0.25; });
    dee.walk = 0; dee.pose = 'bartend';
    this.glasses[1] = this.bar.glass(this.salSpot.x, this.salSpot.y, this.salSpot.z, drink.pint, this.group, spec);
    this.allGlasses.push(this.glasses[1]);
    dee.gesture();
    await this.wait(0.45);
    dee.walk = 1; dee.pose = 'idle';
    this.glide(dee.root.position, home, 1.0, () => { dee.lookAt(new THREE.Vector3(home.x, 0, 0)); dee.walkPhase += 0.25; }).then(() => { dee.walk = 0; dee.pose = 'bartend'; });
  }

  clearGlasses() { if (this.glasses) for (const g of this.glasses) g?.parent?.remove(g); this.glasses = null; this.salHold = null; }

  /**
   * Where Sal's right hand ends up when he squares up to the bar and reaches down for his glass.
   * Worked out from his actual rig (pose him, let the joints settle, read the hand, restore him),
   * so the glass is put exactly where he will grab it.
   */
  salReachPoint() {
    const sal = this.sal;
    const saved = { cur: { ...sal.cur }, t: sal.t, acts: { ...sal.acts }, yaw: sal.root.rotation.y, head: sal.headTarget };
    sal.root.rotation.set(0, this.salBarYaw, 0);
    sal.headTarget = null; sal.reachR = 1;
    for (let i = 0; i < 16; i++) sal.update(0.5);
    sal.root.updateMatrixWorld(true);
    const p = sal.arms[1].hand.getWorldPosition(new THREE.Vector3());
    sal.reachR = 0; sal.cur = saved.cur; sal.t = saved.t; sal.acts = saved.acts; sal.headTarget = saved.head;
    sal.root.rotation.set(0, saved.yaw, 0);
    sal.update(0);
    return p;
  }

  /** Turn Sal on his stool to a yaw, smoothly. */
  salTurn(toYaw, sec) {
    const from = this.sal.root.rotation.y;
    const d = Math.atan2(Math.sin(toYaw - from), Math.cos(toYaw - from));
    return this.seq(sec, (e) => this.sal.root.rotation.set(0, from + d * e, 0));
  }

  seq(sec, fn) {
    return new Promise((r) => { const t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / (sec * 1000)); fn(k * k * (3 - 2 * k), k); if (k < 1 && !this.done) requestAnimationFrame(step); else r(); }; step(); });
  }

  /**
   * Sal's round, alongside yours: turn to the bar, reach down and take the glass, turn back to
   * face you, lift it, tip his head back and drain it, then turn, reach and set it back down.
   * While he holds it, the glass follows his hand every frame and stays upright except for the
   * tilt as he drinks, so it never flips over with his wrist.
   */
  async salChug(glass, lose, drainSec) {
    const sal = this.sal, hand = sal.arms[1].hand;
    sal.headTarget = glass.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.08, 0));
    await this.salTurn(this.salBarYaw, 0.4);
    sal.reachR = 1;
    await this.seq(0.45, () => {});
    // take hold: remember where the glass sits relative to his hand, in his own facing frame
    const hw = hand.getWorldPosition(new THREE.Vector3());
    const inv = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -sal.root.rotation.y);
    this.salHold = { glass, off: glass.position.clone().sub(hw).applyQuaternion(inv) };
    sal.reachR = 0;
    sal.headTarget = this.sitEye.clone();
    await this.salTurn(this.salFaceYaw, 0.4);
    sal.liftR = 1;
    await this.seq(0.35, () => {});
    await this.seq(drainSec, (e, k) => { sal.tiltR = Math.min(1, k * 3); this.bar.setGlassLevel(glass, 1 - k); });
    sal.tiltR = 0; sal.liftR = 0;
    if (lose) { sal.laugh(); return; }
    await this.seq(0.45, () => {});
    sal.headTarget = this.salSpot.clone().add(new THREE.Vector3(0, 0.08, 0));
    await this.salTurn(this.salBarYaw, 0.4);
    sal.reachR = 1;
    await this.seq(0.45, () => {});
    // let go: settle the glass flat on the bar where it started
    this.salHold = null;
    const p1 = glass.position.clone(), q1 = glass.quaternion.clone();
    await this.seq(0.15, (e) => { glass.position.lerpVectors(p1, this.salSpot, e); glass.quaternion.slerpQuaternions(q1, new THREE.Quaternion(), e); });
    glass.position.copy(this.salSpot); glass.rotation.set(0, 0, 0);
    sal.reachR = 0;
    sal.headTarget = this.sitEye.clone();
    await this.salTurn(this.salFaceYaw, 0.4);
  }

  /** Keep the glass in Sal's grip: follow his hand, upright apart from the drinking tilt. */
  updateSalHold(dt) {
    const h = this.salHold;
    const sal = this.sal;
    // tip the top of the glass back towards his mouth as he drinks, eased like his arm
    const want = -(0.25 * sal.liftR + 1.55 * sal.tiltR) * sal.liftR;
    this.salTilt = THREE.MathUtils.damp(this.salTilt || 0, want, 8, dt);
    if (!h) return;
    sal.root.updateMatrixWorld(true);
    const hw = sal.arms[1].hand.getWorldPosition(new THREE.Vector3());
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sal.root.rotation.y);
    const tilt = this.salTilt;
    const q = yawQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt));
    h.glass.quaternion.copy(q);
    h.glass.position.copy(hw).add(h.off.clone().applyQuaternion(q));
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
    const dur = lose ? 2.8 : 1.3;
    this.salDone = this.salChug(this.glasses[1], lose, lose ? dur : dur + 0.2);
    // reach: hand to the glass (camera-local), palm open
    const glassLocal = () => this.camera.worldToLocal(glass.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0.0, 0.035, 0.0));
    await seq(0.45, (e) => { hand.position.lerpVectors(rest, glassLocal(), e); hand.rotation.set(-0.3 * e, 0, 0); });
    // grab
    hand.add(glass); glass.position.set(0, -0.03, 0); glass.rotation.set(0, 0, 0);
    const mouth = new THREE.Vector3(0.07, -0.1, -0.26);
    const grabPos = hand.position.clone();
    await seq(0.45, (e) => { hand.position.lerpVectors(grabPos, mouth, e); hand.rotation.set(-0.3 + 0.1 * e, 0, 0); });
    // tilt & drain (Sal is drinking alongside)
    await seq(dur, (e, k) => {
      const tilt = Math.min(1, k * 1.6);
      hand.rotation.set(-0.2 + tilt * 1.15, 0, -0.15 * tilt);
      hand.position.set(mouth.x - tilt * 0.03, mouth.y + tilt * 0.06, mouth.z + tilt * 0.02);
      this.bar.setGlassLevel(glass, 1 - k);
      this.headTilt = tilt * 0.3;
      if (lose) this.hud.setBlackout(k < 0.2 ? 0 : (k - 0.2) / 0.8);
    });
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
    this.updateSalHold(dt);
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
    this.salHold = null;
    for (const g of this.allGlasses || []) g.parent?.remove(g);
    for (const g of this.hiddenGlasses || []) g.visible = true;
    const sal = this.sal;
    sal.hold(null); sal.slump = 0; sal.headTarget = null; sal.reachR = 0; sal.liftR = 0; sal.tiltR = 0;
  }
}

export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

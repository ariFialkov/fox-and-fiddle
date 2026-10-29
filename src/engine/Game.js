/**
 * Top-level game: renderer, world, state machine (intro -> walk -> minigame -> result -> walk).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Bar } from '../world/Bar.js';
import { Player } from './Player.js';
import { NpcDirector } from '../world/Npc.js';
import { Input } from './Input.js';
import { HUD, fmt } from './HUD.js';
import { Api } from '../net/api.js';
import { MINIGAMES } from '../minigames/index.js';
import { GAMES } from '../../shared/outcomes.js';

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.state = 'boot';
    this.clock = new THREE.Clock();
    this.time = 0;
    this.lowEnd = matchMedia('(pointer: coarse)').matches || navigator.hardwareConcurrency <= 4 || new URLSearchParams(location.search).has('lowend');
    this.debug = new URLSearchParams(location.search);
    this.timeScale = Number(this.debug.get('timescale')) || 1; // debug: speed up the clock
  }

  async init() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.lowEnd, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, this.lowEnd ? 1.25 : 1.75));
    r.setSize(innerWidth, innerHeight, false);
    r.shadowMap.enabled = !this.lowEnd;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0705);
    this.scene.fog = new THREE.FogExp2(0x120a06, 0.045);
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 60);
    this.scene.add(this.camera);

    this.api = await new Api().init();
    this.hud = new HUD(this.uiRoot, this.api);
    this.input = new Input(this.canvas, this.uiRoot);
    this.bar = new Bar(this.scene, { lowEnd: this.lowEnd });
    this.player = new Player(this.camera, this.bar);
    this.npcs = new NpcDirector(this.bar, this.scene, this.player);

    if (!this.lowEnd) {
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.9);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    addEventListener('resize', () => this.resize());
    this.resize();

    window.__ff = this; // debug / automated tests hook
    this.startIntro();
    this.loop();
    return this;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
  }

  // ---- intro: walk in, hang the coat ----
  startIntro() {
    this.state = 'intro';
    this.introT = 0;
    const p = this.player;
    p.teleport(new THREE.Vector3(-5, 0, 5.0), 0);
    this.camera.position.set(-5, 1.62, 5.0);
    this.hud.setBlackout(1);
    this.bar.playerCoat.visible = true;
    this.input.showJoystick(false);
    if (this.debug.get('skipintro')) { this.introT = 99; }
  }

  updateIntro(dt) {
    this.introT += dt;
    const t = this.introT;
    const cam = this.camera;
    const coat = this.bar.playerCoat;
    const hook = this.bar.coatHook;
    const ease = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
    // 0-1.2s: fade in, step inside.  1.2-3.2: walk to the rack, turning to face it.
    // 3.2-4.6: coat goes up on the hook.  4.6-5.8: turn to face the room. then control.
    this.hud.setBlackout(1 - ease(0.2, 1.4, t));
    const k1 = ease(0.3, 3.4, t);
    const start = new THREE.Vector3(-5, 0, 5.0), rackSpot = new THREE.Vector3(-5.95, 0, 4.35);
    this.player.pos.lerpVectors(start, rackSpot, k1);
    const yawRack = Math.atan2(-(hook.x - rackSpot.x), -(hook.z - rackSpot.z));
    const yawRoom = Math.atan2(-(1.0 - rackSpot.x), -(0.5 - rackSpot.z));
    const k2 = ease(1.6, 3.4, t), k3 = ease(4.6, 5.9, t);
    this.player.yaw = THREE.MathUtils.lerp(THREE.MathUtils.lerp(0, yawRack, k2), yawRoom, k3);
    this.player.pitch = THREE.MathUtils.lerp(0, -0.12, k2) * (1 - k3);
    this.player.bobT += dt * 7 * (k1 < 1 ? 1 : 0);
    this.player.moving = k1 < 1 ? 1 : 0;
    this.player.applyCamera(dt);
    // coat: carried low in front of the camera, then placed on the hook
    const kc = ease(3.3, 4.5, t);
    const carried = cam.localToWorld(new THREE.Vector3(0.3, -0.5, -0.6));
    coat.position.lerpVectors(carried, new THREE.Vector3(hook.x, hook.y - 0.35, hook.z + 0.1), kc);
    coat.rotation.set(0, this.player.yaw, 0.4 * (1 - kc));
    if (t > 5.9) this.beginWalk(true);
  }

  beginWalk(welcome = false) {
    this.state = 'walk';
    this.player.enabled = true;
    this.player.moving = 0;
    this.input.showJoystick(true);
    this.input.enabled = true;
    this.hud.setBlackout(0);
    this.hud.clearGameUI();
    if (welcome) {
      setTimeout(() => this.hud.showToast('Welcome to the Fox and Fiddle', 'walk around to try different activities', 4200), 300);
    }
  }

  // ---- walking: find nearby stations ----
  updateWalk(dt) {
    const p = this.player;
    let best = null, bestD = Infinity;
    for (const s of this.bar.stations) {
      const d = Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z);
      if (d < s.radius && d < bestD) { best = s; bestD = d; }
    }
    if (best !== this.nearStation) {
      this.nearStation = best;
      if (best) {
        const key = this.input.isTouch ? 'tap to play' : 'press <b>space</b> or click';
        this.hud.showPrompt(best.label, key, () => this.offer(best));
      } else this.hud.hidePrompt();
    }
    p.update(dt, this.input);
    if (best && (this.input.justPressed('Space') || this.input.clicks.length)) this.offer(best);
  }

  async offer(station) {
    if (this.state !== 'walk') return;
    this.state = 'betting';
    this.player.enabled = false;
    this.hud.hidePrompt();
    const g = GAMES[station.gameId];
    const blurb = `${station.blurb}<br>${g.type === 'versus' ? `Pays ${g.payout}x.` : 'Each round multiplies your stake; blow it and the stake is gone.'}`;
    const stake = await this.hud.showBet(station.label, blurb, this.input.isTouch);
    if (!stake) { this.state = 'walk'; this.player.enabled = true; return; }
    try {
      const round = await this.api.startRound(station.gameId, stake);
      await this.runMinigame(station, round);
    } catch (e) {
      console.error(e);
      this.hud.showToast('The house is closed', String(e.message || e));
      this.state = 'walk'; this.player.enabled = true;
    }
  }

  async runMinigame(station, round) {
    this.state = 'minigame';
    this.input.showJoystick(false);
    this.hud.hidePrompt();
    const Cls = MINIGAMES[station.gameId];
    const ctx = {
      game: this, scene: this.scene, camera: this.camera, player: this.player, hud: this.hud, input: this.input,
      api: this.api, bar: this.bar, station, round, isTouch: this.input.isTouch, lowEnd: this.lowEnd,
    };
    const returnPos = this.player.pos.clone();
    const returnYaw = this.player.yaw;
    this.npcs.suspend(station);
    this.minigame = new Cls(ctx);
    let result;
    try {
      result = await this.minigame.run();
      if (round.type === 'versus') {
        const settled = await this.api.finish(round.roundId);
        result = { ...result, win: settled.payout > 0, payout: settled.payout };
      }
    } catch (e) {
      console.error('minigame error', e);
      result = { win: false, title: 'Something broke', line: String(e.message || e), payout: 0, error: true };
      try { if (round.type === 'versus') await this.api.finish(round.roundId); } catch {}
    }
    this.minigame.dispose?.();
    this.minigame = null;
    this.npcs.resume(station);
    this.hud.clearGameUI();
    this.state = 'result';
    await this.hud.showResult({
      win: result.win, title: result.title || (result.win ? 'You win' : 'You lose'),
      line: result.line || '', payout: result.payout || 0, stake: round.stake,
    });
    this.player.teleport(returnPos, returnYaw);
    this.nearStation = undefined; // re-evaluate prompt
    this.beginWalk(false);
  }

  loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, this.clock.getDelta()) * this.timeScale;
      this.time += dt;
      this.npcs.update(dt);
      this.bar.update(dt, this.time);
      if (this.state === 'intro') this.updateIntro(dt);
      else if (this.state === 'walk') this.updateWalk(dt);
      else if (this.state === 'minigame' && this.minigame) this.minigame.update(dt);
      else this.player.applyCamera(dt);
      if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
    };
    tick();
  }
}

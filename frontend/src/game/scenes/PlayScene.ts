import Phaser from "phaser";
import { Contact } from "../entities/Contact";
import { sfxBoom, sfxBreach, sfxError, sfxLaser, sfxSalvo, sfxStreak, sfxSystem, setBed } from "../audio/audio";
import { bus } from "../systems/bus";
import { maxContacts, enemySpeed, ROUND_BANNER_MS, spawnInterval, WORDS_PER_ROUND } from "../systems/difficulty";
import { reducedMotion } from "../systems/motion";
import { mulberry32, seedFromString, chance, type Rng } from "../systems/rng";
import { streakMultiplier, Telemetry, wordPoints } from "../systems/score";
import type { Mode, PowerId, RunSummary } from "../types";
import { BloomPipeline } from "../vfx/BloomPipeline";
import { Backdrop } from "../vfx/Backdrop";
import { generateTextures } from "../vfx/textures";
import { burst } from "../vfx/explosions";
import { trueAdd } from "../vfx/blend";
import { POWER_BANNER, SALVO_MAX } from "../systems/copy";
import { gunshipScale, isPhone, keyboardReserve, spawnPad, stationHeight } from "../systems/layout";
import { bossPhases, hullForWord, pickSupply, pickWord, SYSTEM_WORD } from "../words/pick";
import { wordLayer } from "../../ui/layer";
import { setKeyboard } from "../../ui/keyboard";

export type PlayData = { mode: Mode; seed: string };

type TimedPower = { id: Exclude<PowerId, "aegis" | "shove">; remain: number };

export class PlayScene extends Phaser.Scene {
  private world!: Backdrop;
  private station!: Phaser.GameObjects.Image;
  private gunship!: Phaser.GameObjects.Image;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shards!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private aegisRing!: Phaser.GameObjects.Image;
  private engineWash!: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly flames: {
    img: Phaser.GameObjects.Image;
    ox: number;
    sx: number;
    sy: number;
    phase: number;
  }[] = [];
  private contacts: Contact[] = [];
  private locked: Contact | null = null;
  private used = new Set<string>();
  private rng!: Rng;
  private mode: Mode = "arcade";
  private seed = "";
  private score = 0;
  private round = 1;
  private shields = 3;
  private streak = 0;
  private bestStreak = 0;
  private wordsLeft = WORDS_PER_ROUND;
  private spawnAcc = 0;
  private transitioning = false;
  private over = false;
  private paused = false;
  private aegis = false;
  private timed: TimedPower[] = [];
  private granted = new Set<number>();
  private salvo = SALVO_MAX;
  private suppliesThisWave = 0;
  private telemetry = new Telemetry();
  private onKey = (e: KeyboardEvent) => this.handleKey(e);
  private hudAcc = 0;

  constructor() {
    super("play");
  }

  create(data: PlayData): void {
    generateTextures(this);
    this.mode = data.mode;
    this.seed = data.seed;
    this.rng = mulberry32(seedFromString(data.seed));
    this.score = 0;
    this.round = 1;
    this.shields = 3;
    this.streak = 0;
    this.bestStreak = 0;
    this.wordsLeft = WORDS_PER_ROUND;
    this.contacts = [];
    this.locked = null;
    this.used.clear();
    this.timed = [];
    this.granted.clear();
    this.salvo = SALVO_MAX;
    this.suppliesThisWave = 0;
    this.aegis = false;
    for (const f of this.flames) f.img.destroy();
    this.flames.length = 0;
    this.over = false;
    this.paused = false;
    this.transitioning = false;
    this.telemetry = new Telemetry();

    if (!reducedMotion && this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.cameras.main.setPostPipeline(BloomPipeline);
    }

    this.world = new Backdrop(this);
    const w = this.scale.width;
    const h = this.scale.height;
    this.station = this.add.image(w / 2, h - 30, "station").setDepth(3).setAlpha(0.98);
    this.gunship = this.add.image(w / 2, h - 185, "gunship").setDepth(6);
    this.aegisRing = this.add.image(w / 2, h - 185, "shock").setDepth(5).setBlendMode(trueAdd(this));
    this.aegisRing.setScale(0.7).setAlpha(0).setTint(0xe8a15a);

    for (const [, k] of [[0, 1], [-0.155, 0.66], [0.155, 0.66]] as [number, number][]) {
      const f = this.add.image(this.gunship.x, this.gunship.y, "flame");
      f.setOrigin(0.5, 0).setDepth(5).setBlendMode(trueAdd(this));
      this.flames.push({
        img: f,
        ox: 0,
        sx: 0.2 * k,
        sy: 0.4 * k,
        phase: Math.random() * 100,
      });
    }

    this.engineWash = this.add.particles(w / 2, h - 28, "ember", {
      lifespan: 420,
      speedY: { min: 40, max: 120 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.9, end: 0 },
      frequency: reducedMotion ? 80 : 16,
      blendMode: trueAdd(this),
      follow: this.gunship,
      followOffset: { x: 0, y: 40 },
    });
    this.layoutDeck();
    this.scale.on("resize", this.layoutDeck, this);
    this.engineWash.setDepth(5);

    this.sparks = this.add.particles(0, 0, "spark", {
      lifespan: 560,
      speed: { min: 90, max: 420 },
      scale: { start: 1.1, end: 0 },
      blendMode: trueAdd(this),
      emitting: false,
    });
    this.sparks.setDepth(7);
    this.embers = this.add.particles(0, 0, "ember", {
      lifespan: 1050,
      speed: { min: 60, max: 560 },
      gravityY: 50,
      scale: { start: 2.2, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: trueAdd(this),
      emitting: false,
    });
    this.embers.setDepth(7);
    this.shards = this.add.particles(0, 0, "shard", {
      lifespan: 1200,
      speed: { min: 140, max: 520 },
      rotate: { min: 0, max: 1080 },
      scale: { start: 0.5, end: 0.06 },
      alpha: { start: 0.95, end: 0 },
      tint: 0x7a7168,
      gravityY: 190,
      emitting: false,
    });
    this.shards.setDepth(7);
    this.smoke = this.add.particles(0, 0, "smoke", {
      lifespan: 1400,
      speed: { min: 16, max: 120 },
      scale: { start: 0.6, end: 2.6 },
      alpha: { start: 0.4, end: 0 },
      rotate: { min: 0, max: 360 },
      emitting: false,
    });
    this.smoke.setDepth(6);

    wordLayer.bind(this.game.canvas);
    wordLayer.clear();
    window.addEventListener("keydown", this.onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("keydown", this.onKey);
      this.scale.off("resize", this.layoutDeck, this);
      wordLayer.clear();
    });

    setBed("combat");
    this.beginRound(true);
    this.emitHud();
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(delta, 40) / 1000;
    this.world.update(dt);
    if (this.over || this.paused) return;

    this.gunship.x = this.scale.width / 2;
    this.gunship.y =
      this.gunshipHome() + (reducedMotion ? 0 : Math.sin(this.time.now / 540) * (isPhone() ? 2 : 4.5));

    const boost = this.hasPower("surge") ? 1.45 : 1;
    for (const f of this.flames) {
      const t = this.time.now / 1000 * 38 + f.phase;
      const jitter = Math.sin(t) * 0.17 + Math.sin(t * 2.3) * 0.1 + Math.sin(t * 5.9) * 0.06;
      f.img.setPosition(this.gunship.x + f.ox, this.gunship.y + this.gunship.displayHeight * 0.4);
      f.img.setScale(f.sx * (1 + jitter * 0.3), f.sy * boost * (1 + jitter));
      f.img.setAlpha(0.85 + jitter * 0.45);
    }

    this.aegisRing.setPosition(this.gunship.x, this.gunship.y);
    this.aegisRing.setAlpha(this.aegis ? 0.55 + Math.sin(this.time.now / 160) * 0.18 : 0);
    this.aegisRing.setScale(this.aegis ? 0.58 + Math.sin(this.time.now / 220) * 0.05 : 0.56);
    this.aegisRing.rotation += dt * 0.6;
    this.engineWash.frequency = this.hasPower("surge") ? 8 : reducedMotion ? 80 : 16;
    const heat = 0.96 + Math.sin(this.time.now / 140) * 0.03;
    this.gunship.setAlpha(heat);
    if (this.hasPower("surge")) this.gunship.setTint(0xffd8a0);
    else this.gunship.clearTint();

    if (!this.transitioning) {
      this.tickPowers(dt);
      this.tickContacts(dt);
      this.tickSpawn(dt);
      this.checkRound();
    }

    wordLayer.sync(this.contacts, this.locked, this.hasPower("mark"), this.scale.width, this.scale.height);
    this.hudAcc += dt;
    if (this.hudAcc > 0.12) {
      this.hudAcc = 0;
      this.emitHud();
    }
  }

  private deckY(): number {
    return this.scale.height - keyboardReserve();
  }

  private gunshipHome(): number {
    return this.deckY() - (isPhone() ? 64 : 185);
  }

  private gunline(): number {
    return this.deckY() - (isPhone() ? 32 : 150);
  }

  private layoutDeck(): void {
    if (!this.station || !this.gunship) return;
    const w = this.scale.width;
    const deck = this.deckY();
    this.station.setPosition(w / 2, deck - (isPhone() ? 6 : 30));
    this.station.setDisplaySize(w * 1.04, stationHeight());
    this.gunship.setScale(gunshipScale());
    this.gunship.setPosition(w / 2, this.gunshipHome());
    const gw = this.gunship.displayWidth;
    const gh = this.gunship.displayHeight;
    const slots: [number, number][] = [[0, 1], [-0.155, 0.66], [0.155, 0.66]];
    this.flames.forEach((f, i) => {
      const [ox, k] = slots[i] ?? [0, 1];
      f.ox = gw * ox;
      f.sx = (gw * 0.19 * k) / 80;
      f.sy = (gh * 0.8 * k) / 220;
    });
    if (this.engineWash) this.engineWash.followOffset.y = gh * 0.46;
    this.aegisRing?.setPosition(this.gunship.x, this.gunship.y);
  }

  private hasPower(id: TimedPower["id"]): boolean {
    return this.timed.some((p) => p.id === id && p.remain > 0);
  }

  private tickPowers(dt: number): void {
    this.timed = this.timed
      .map((p) => ({ ...p, remain: p.remain - dt }))
      .filter((p) => p.remain > 0);
  }

  private tickContacts(dt: number): void {
    const fall = enemySpeed(this.round) * (this.hasPower("hold") ? 0.5 : 1);
    for (let i = this.contacts.length - 1; i >= 0; i--) {
      const c = this.contacts[i]!;
      c.held = this.hasPower("hold");
      c.update(dt, fall, reducedMotion ? 0 : 10);
      if (c.y >= this.gunline()) {
        this.breach(c);
      }
    }
  }

  private tickSpawn(dt: number): void {
    if (this.wordsLeft <= 0) return;
    if (this.contacts.length >= maxContacts(this.round)) return;
    this.spawnAcc += dt * 1000;
    const interval = spawnInterval(this.round, this.hasPower("surge"));
    if (this.spawnAcc >= interval) {
      this.spawnAcc = 0;
      this.spawnContact();
    }
  }

  private spawnContact(): void {
    const bossRound = this.round % 3 === 0;
    const hasCapital = this.contacts.some((c) => c.hull === "capital");
    if (bossRound && !hasCapital && this.wordsLeft === WORDS_PER_ROUND) {
      this.spawnBoss();
      return;
    }

    const supply =
      this.round >= 2 &&
      this.suppliesThisWave < 1 &&
      this.wordsLeft <= WORDS_PER_ROUND - 4 &&
      chance(this.rng, 0.045);
    const word = supply
      ? pickSupply(this.used, this.rng)
      : pickWord(this.round, this.used, this.rng);
    if (!word) return;
    if (supply) this.suppliesThisWave += 1;
    this.placeContact(word, hullForWord(word, Boolean(supply && word)));
  }

  private spawnBoss(): void {
    const phases = bossPhases(this.round, this.rng);
    for (const phase of phases) this.used.add(phase[0]!.toLowerCase());
    const x = this.scale.width * (0.35 + this.rng() * 0.3);
    const c = new Contact(this, x, -70, phases[0], "capital", [...phases]);
    this.contacts.push(c);
    this.wordsLeft -= 1;
    setBed("boss");
    bus.emit("banner", { title: "CAPITAL", sub: "Three phases. Escorts inbound." });
  }

  private placeContact(word: string, hull: Contact["hull"]): void {
    this.used.add(word[0]!.toLowerCase());
    const pad = spawnPad();
    const x = pad + this.rng() * Math.max(40, this.scale.width - pad * 2);
    const c = new Contact(this, x, -40, word, hull);
    this.contacts.push(c);
    this.wordsLeft -= 1;
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      this.togglePause();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (this.over || this.paused || this.transitioning) return;
      this.fireSalvo();
      return;
    }
    if (this.over || this.paused || this.transitioning) return;
    if (e.repeat) return;
    if (!/^[a-zA-Z]$/.test(e.key)) return;
    const target = e.target;
    if (target instanceof HTMLElement && target.closest("input, textarea")) return;
    e.preventDefault();
    this.processKey(e.key.toLowerCase());
  }

  processKey(key: string): void {
    if (!this.locked) {
      const target = this.contacts.find((c) => c.word[0]?.toLowerCase() === key);
      if (!target) {
        this.telemetry.miss();
        return;
      }
      this.locked = target;
      target.lock(true);
      this.hit(target);
      return;
    }

    const next = this.locked.word[this.locked.typed]?.toLowerCase();
    if (key === next) {
      this.hit(this.locked);
      if (this.locked.done) this.finishWord(this.locked, false);
      return;
    }

    this.typo(this.locked);
  }

  private hit(c: Contact): void {
    c.typed += 1;
    this.telemetry.hit();
    sfxLaser();
    this.beam(c);
    const wound = c.strike();
    this.sparks.emitParticleAt(wound.x, wound.y, 18);
    this.embers.emitParticleAt(wound.x, wound.y, 10);
    if (!reducedMotion) this.cameras.main.shake(40, 0.0018);
  }

  private typo(c: Contact): void {
    this.telemetry.miss();
    c.errors += 1;
    c.speedMul = 1.2;
    sfxError();
    bus.emit("flash", "hit");
    this.breakStreak();
    if (c.errors >= 3) this.finishWord(c, true);
  }

  private finishWord(c: Contact, failed: boolean): void {
    const finished = c.word;
    const fx = { sparks: this.sparks, embers: this.embers, shards: this.shards, smoke: this.smoke };
    if (!failed && c.advanceBoss()) {
      this.score += wordPoints(finished.length, this.streak + 1, this.hasPower("surge"));
      this.bumpStreak();
      c.scarPhase();
      burst(this, c.x, c.y, "cruiser", fx);
      sfxBoom("cruiser");
      this.clearLock(c);
      return;
    }

    if (failed) {
      this.loseShield();
      burst(this, c.x, c.y, c.hull, fx, true);
      sfxBoom("fail");
      bus.emit("flash", "hit");
    } else {
      this.score += wordPoints(c.word.length, this.streak + 1, this.hasPower("surge"));
      this.bumpStreak();
      burst(this, c.x, c.y, c.hull, fx);
      sfxBoom(c.hull);
      if (c.hull === "capital" || c.hull === "dreadnought") bus.emit("flash", "ok");
      if (c.hull === "supply") this.grant(SYSTEM_WORD[c.word.toLowerCase()] ?? "surge");
      if (c.hull === "capital") setBed("combat");
    }

    this.remove(c);
    this.emitHud();
  }

  private breach(c: Contact): void {
    this.breakStreak();
    sfxBreach();
    bus.emit("flash", "hit");
    if (!reducedMotion) this.cameras.main.shake(180, 0.008);
    this.loseShield();
    this.remove(c);
  }

  private remove(c: Contact): void {
    if (c.phases) {
      for (const phase of c.phases) this.used.delete(phase[0]!.toLowerCase());
    } else {
      this.used.delete(c.word[0]!.toLowerCase());
    }
    this.clearLock(c);
    c.destroy();
    this.contacts = this.contacts.filter((x) => x !== c);
  }

  private clearLock(c: Contact): void {
    if (this.locked === c) {
      c.lock(false);
      this.locked = null;
    }
  }

  private loseShield(): void {
    if (this.aegis) {
      this.aegis = false;
      bus.emit("banner", { title: "AEGIS HELD", sub: "Breach absorbed." });
      return;
    }
    this.shields -= 1;
    if (this.shields <= 0) this.endRun();
  }

  private bumpStreak(): void {
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    for (const n of [8, 15, 25]) {
      if (this.streak === n && !this.granted.has(n)) {
        this.granted.add(n);
        sfxStreak();
        if (n === 8) this.grant("hold");
        if (n === 15) this.grant("aegis");
        if (n === 25) this.grant("shove");
      }
    }
  }

  private breakStreak(): void {
    this.streak = 0;
  }

  private grant(id: PowerId): void {
    sfxSystem();
    if (id === "aegis") {
      this.aegis = true;
      bus.emit("banner", POWER_BANNER.aegis);
      return;
    }
    if (id === "shove") {
      const lift = this.scale.height * 0.22;
      for (const c of this.contacts) c.sprite.y = Math.max(-40, c.y - lift);
      bus.emit("banner", POWER_BANNER.shove);
      burst(this, this.gunship.x, this.gunship.y - 36, "dreadnought", {
        sparks: this.sparks,
        embers: this.embers,
        shards: this.shards,
        smoke: this.smoke,
      });
      const wave = this.add.image(this.gunship.x, this.gunship.y - 20, "shock").setDepth(8).setBlendMode(trueAdd(this));
      wave.setScale(0.2).setTint(0xe8a15a);
      this.tweens.add({
        targets: wave,
        alpha: 0,
        scale: 4.2,
        duration: 520,
        ease: "Cubic.Out",
        onComplete: () => wave.destroy(),
      });
      if (!reducedMotion) this.cameras.main.shake(180, 0.012);
      return;
    }
    const dur = id === "surge" ? 8 : id === "hold" ? 5 : 6;
    const existing = this.timed.find((p) => p.id === id);
    if (existing) existing.remain = dur;
    else this.timed.push({ id, remain: dur });
    bus.emit("banner", POWER_BANNER[id]);
  }

  private fireSalvo(): void {
    if (this.salvo <= 0) {
      bus.emit("banner", { title: "ORDNANCE SPENT", sub: "Two charges. No resupply." });
      return;
    }
    const targets = [...this.contacts];
    if (!targets.length) return;

    this.salvo -= 1;
    sfxSalvo();
    bus.emit("flash", "ok");
    bus.emit("banner", {
      title: "ORDNANCE",
      sub: this.salvo === 1 ? "One charge left." : "Last charge spent.",
    });

    const wave = this.add.image(this.gunship.x, this.gunship.y - 20, "shock").setDepth(8).setBlendMode(trueAdd(this));
    wave.setScale(0.18).setTint(0xffe2b8);
    this.tweens.add({
      targets: wave,
      alpha: 0,
      scale: 5.4,
      duration: 640,
      ease: "Expo.Out",
      onComplete: () => wave.destroy(),
    });
    if (!reducedMotion) this.cameras.main.shake(280, 0.018);

    const fx = { sparks: this.sparks, embers: this.embers, shards: this.shards, smoke: this.smoke };
    targets.forEach((c, i) => {
      this.time.delayedCall(70 * i, () => {
        if (!this.sys.isActive() || this.over) return;
        if (!this.contacts.includes(c)) return;
        this.score += wordPoints(c.word.length, this.streak, this.hasPower("surge"));
        burst(this, c.x, c.y, c.hull, fx);
        sfxBoom(c.hull);
        this.remove(c);
        this.emitHud();
      });
    });
    this.emitHud();
  }

  private beam(c: Contact): void {
    const g = this.add.graphics().setDepth(5);
    const x0 = this.gunship.x;
    const y0 = this.gunship.y - this.gunship.displayHeight * 0.46;
    const proxy = { a: 1 };
    const draw = (a: number) => {
      g.clear();
      g.lineStyle(18, 0xe8a15a, 0.14 * a);
      g.lineBetween(x0, y0, c.x, c.y);
      g.lineStyle(7, 0xf4e4c1, 0.85 * a);
      g.lineBetween(x0, y0, c.x, c.y);
      g.lineStyle(2, 0xffffff, 0.95 * a);
      g.lineBetween(x0, y0, c.x, c.y);
    };
    draw(1);
    const muzzle = this.add.image(x0, y0, "flash").setDepth(7).setBlendMode(trueAdd(this));
    muzzle.setScale(0.55);
    this.tweens.add({
      targets: muzzle,
      alpha: 0,
      scale: 1.15,
      duration: 90,
      onComplete: () => muzzle.destroy(),
    });
    this.sparks.emitParticleAt(x0, y0, 12);
    this.tweens.add({
      targets: proxy,
      a: 0,
      duration: reducedMotion ? 40 : 110,
      onUpdate: () => draw(proxy.a),
      onComplete: () => g.destroy(),
    });
  }

  private checkRound(): void {
    if (this.transitioning || this.wordsLeft > 0 || this.contacts.length > 0) return;
    this.round += 1;
    this.wordsLeft = WORDS_PER_ROUND;
    this.suppliesThisWave = 0;
    this.spawnAcc = 400;
    this.beginRound(false);
  }

  private beginRound(first: boolean): void {
    this.transitioning = true;
    bus.emit("banner", {
      title: first ? "WAVE 01" : `WAVE ${String(this.round).padStart(2, "0")}`,
      sub: this.round % 3 === 0 ? "Capital on approach." : undefined,
    });
    this.time.delayedCall(first ? 900 : ROUND_BANNER_MS, () => {
      this.transitioning = false;
      if (this.wordsLeft > 0 && this.contacts.length === 0) this.spawnContact();
    });
  }

  togglePause(): void {
    if (this.over) return;
    this.paused = !this.paused;
    const pause = document.getElementById("screen-pause");
    pause?.classList.toggle("hidden", !this.paused);
    setKeyboard(!this.paused);
  }

  resumePlay(): void {
    this.paused = false;
    document.getElementById("screen-pause")?.classList.add("hidden");
    setKeyboard(true);
  }

  abortRun(): void {
    this.paused = false;
    document.getElementById("screen-pause")?.classList.add("hidden");
    setKeyboard(false);
    this.over = true;
    setBed("idle");
    wordLayer.clear();
    this.scene.stop();
    this.scene.start("menu");
    bus.emit("abort", null);
  }

  private endRun(): void {
    if (this.over) return;
    this.over = true;
    setKeyboard(false);
    setBed("idle");
    const summary: RunSummary = {
      score: this.score,
      round: this.round,
      wpm: Math.min(250, Math.round(this.telemetry.wpm * 10) / 10),
      accuracy: this.telemetry.accuracy,
      bestStreak: this.bestStreak,
      mode: this.mode,
      seed: this.seed,
    };
    wordLayer.clear();
    bus.emit("gameover", summary);
  }

  private emitHud(): void {
    bus.emit("hud", {
      score: this.score,
      round: this.round,
      shields: Math.max(0, this.shields),
      aegis: this.aegis,
      streak: this.streak,
      multiplier: streakMultiplier(this.streak) * (this.hasPower("surge") ? 2 : 1),
      wpm: this.telemetry.wpm,
      salvo: this.salvo,
      powers: [
        ...this.timed.map((p) => ({ id: p.id as PowerId, remain: p.remain })),
        ...(this.aegis ? [{ id: "aegis" as PowerId, remain: 99 }] : []),
      ],
    });
  }
}

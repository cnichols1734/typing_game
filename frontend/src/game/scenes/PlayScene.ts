import * as THREE from "three";
import { Bolt } from "../entities/Bolt";
import { Contact } from "../entities/Contact";
import { sfxBoom, sfxBreach, sfxCannon, sfxError, sfxLaser, sfxPop, sfxSalvo, sfxStreak, sfxSystem, setBed } from "../audio/audio";
import { bus } from "../systems/bus";
import { maxContacts, enemySpeed, ROUND_BANNER_MS, spawnInterval, WORDS_PER_ROUND } from "../systems/difficulty";
import { reducedMotion } from "../systems/motion";
import { mulberry32, seedFromString, type Rng } from "../systems/rng";
import { streakMultiplier, Telemetry, wordPoints } from "../systems/score";
import type { Mode, PlayPlatform, PowerId, RunSummary } from "../types";
import { POWER_BANNER, SALVO_MAX } from "../systems/copy";
import { isPhone, keyboardReserve, playPlatform, spawnPad } from "../systems/layout";
import { bossPhases, hullForWord, pickBoltLetters, pickSupply, pickWord, SYSTEM_WORD } from "../words/pick";
import { wordLayer } from "../../ui/layer";
import { setKeyboard } from "../../ui/keyboard";
import type { Battlefield } from "../world/Battlefield";

export type PlayData = { mode: Mode; seed: string };

type TimedPower = { id: Exclude<PowerId, "aegis" | "shove">; remain: number };

export class PlayScene {
  private contacts: Contact[] = [];
  private bolts: Bolt[] = [];
  private locked: Contact | null = null;
  private boltAcc = 0;
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
  private live = false;
  private aegis = false;
  private timed: TimedPower[] = [];
  private salvo = SALVO_MAX;
  private suppliesThisWave = 0;
  private telemetry = new Telemetry();
  private lane: PlayPlatform = "desktop";
  private hudAcc = 0;
  private readonly timers: number[] = [];
  private readonly aim = new THREE.Vector3();
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);

  constructor(private readonly world: Battlefield) {}

  start(data: PlayData): void {
    this.disposeRun();
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
    this.bolts = [];
    this.locked = null;
    this.boltAcc = 0;
    this.used.clear();
    this.timed = [];
    this.salvo = SALVO_MAX;
    this.suppliesThisWave = 0;
    this.aegis = false;
    this.over = false;
    this.paused = false;
    this.transitioning = false;
    this.telemetry = new Telemetry();
    this.lane = playPlatform();
    this.live = true;
    this.world.setCombat(true);
    this.world.setAegis(false);
    this.world.setSurge(false);
    this.world.layoutDeck();
    wordLayer.bind(this.world.canvas);
    wordLayer.clear();
    window.addEventListener("keydown", this.onKey);
    setBed("combat");
    this.beginRound(true);
    this.emitHud();
  }

  update(dt: number): void {
    if (!this.live) return;
    if (this.over || this.paused) {
      wordLayer.sync(this.contacts, this.locked, this.hasPower("mark"), this.world.width, this.world.height, this.bolts);
      return;
    }

    if (!this.transitioning) {
      this.tickPowers(dt);
      this.tickContacts(dt);
      this.tickBolts(dt);
      this.tickCapitalFire(dt);
      this.tickSpawn(dt);
      this.checkRound();
    }

    wordLayer.sync(this.contacts, this.locked, this.hasPower("mark"), this.world.width, this.world.height, this.bolts);
    this.hudAcc += dt;
    if (this.hudAcc > 0.12) {
      this.hudAcc = 0;
      this.emitHud();
    }
  }

  dispose(): void {
    this.disposeRun();
  }

  private disposeRun(): void {
    this.live = false;
    window.removeEventListener("keydown", this.onKey);
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.length = 0;
    this.clearBolts();
    for (const c of this.contacts) c.destroy();
    this.contacts = [];
    this.locked = null;
    wordLayer.clear();
    this.world.fx.clear();
    this.world.setCombat(false);
    this.world.setAegis(false);
    this.world.setSurge(false);
  }

  private later(ms: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      if (!this.live) return;
      fn();
    }, ms);
    this.timers.push(id);
  }

  private deckY(): number {
    return this.world.height - keyboardReserve();
  }

  private gunline(): number {
    return this.deckY() - (isPhone() ? 18 : 48);
  }

  private travel(): number {
    return this.gunline() + 40;
  }

  private onPhone(): boolean {
    return this.lane === "mobile";
  }

  private hasPower(id: TimedPower["id"]): boolean {
    return this.timed.some((p) => p.id === id && p.remain > 0);
  }

  private tickPowers(dt: number): void {
    const surge = this.hasPower("surge");
    this.timed = this.timed
      .map((p) => ({ ...p, remain: p.remain - dt }))
      .filter((p) => p.remain > 0);
    if (surge !== this.hasPower("surge")) this.world.setSurge(this.hasPower("surge"));
  }

  private tickContacts(dt: number): void {
    const fall = enemySpeed(this.round, this.travel(), this.onPhone()) * (this.hasPower("hold") ? 0.5 : 1);
    for (let i = this.contacts.length - 1; i >= 0; i--) {
      const c = this.contacts[i]!;
      c.held = this.hasPower("hold");
      const speed = c.hull === "supply" ? fall * 0.72 : fall;
      c.update(dt, speed, reducedMotion ? 0 : 7);
      if (c.y >= this.gunline()) this.breach(c);
    }
  }

  private tickBolts(dt: number): void {
    const fall = enemySpeed(this.round, this.travel(), this.onPhone()) * 0.62 * (this.hasPower("hold") ? 0.5 : 1);
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]!;
      b.update(dt, fall);
      if (b.y >= this.gunline()) this.boltBreach(b);
    }
  }

  private tickCapitalFire(dt: number): void {
    const boss = this.contacts.find((c) => c.hull === "capital");
    if (!boss || this.bolts.length) return;
    this.boltAcc += dt;
    const wait = Math.max(1.55, (2.65 - this.round * 0.05) / (this.round > 5 ? 0.9 : 1)) * (this.onPhone() ? 1.15 : 1);
    if (this.boltAcc >= wait) {
      this.boltAcc = 0;
      this.fireVolley(boss);
    }
  }

  private fireVolley(boss: Contact): void {
    const reserved = new Set(this.used);
    if (this.locked) {
      const next = this.locked.word[this.locked.typed]?.toLowerCase();
      if (next) reserved.add(next);
    }
    const letters = pickBoltLetters(reserved, this.rng, 3);
    if (!letters.length) return;

    const muzzleX = boss.x;
    const muzzleY = boss.y + boss.screenH * 0.38;
    this.world.fx.flash(this.world.toWorld(muzzleX, muzzleY, this.aim).clone(), 0.9);
    sfxCannon();

    letters.forEach((letter, i) => {
      this.used.add(letter);
      this.bolts.push(new Bolt(this.world, muzzleX + (i - 1) * 14, muzzleY + 8, letter, i - 1));
    });
  }

  private tickSpawn(dt: number): void {
    if (this.wordsLeft <= 0) return;
    if (this.contacts.length >= maxContacts(this.round, this.onPhone())) return;
    this.spawnAcc += dt * 1000;
    const interval = spawnInterval(this.round, this.hasPower("surge"), this.onPhone());
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

    const wantSupply =
      this.round >= 2 &&
      this.suppliesThisWave < 1 &&
      this.wordsLeft <= WORDS_PER_ROUND - 3;
    const drop = wantSupply ? pickSupply(this.used, this.rng) : null;
    const word = drop ?? pickWord(this.round, this.used, this.rng);
    if (!word) return;
    if (drop) this.suppliesThisWave += 1;
    this.placeContact(word, hullForWord(word, Boolean(drop)));
  }

  private spawnBoss(): void {
    const phases = bossPhases(this.round, this.rng);
    for (const phase of phases) this.used.add(phase[0]!.toLowerCase());
    const x = this.world.width * (0.35 + this.rng() * 0.3);
    const c = new Contact(this.world, x, -70, phases[0]!, "capital", [...phases]);
    this.contacts.push(c);
    this.wordsLeft -= 1;
    this.boltAcc = 0;
    setBed("boss");
    bus.emit("banner", { title: "CAPITAL SHIP", sub: "Two words. Break the incoming letters." });
  }

  private placeContact(word: string, hull: Contact["hull"]): void {
    this.used.add(word[0]!.toLowerCase());
    const pad = spawnPad();
    const x = pad + this.rng() * Math.max(40, this.world.width - pad * 2);
    const c = new Contact(this.world, x, -40, word, hull);
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
      const bolt = this.bolts.find((b) => b.letter === key);
      if (bolt) {
        this.intercept(bolt);
        return;
      }
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

    const bolt = this.bolts.find((b) => b.letter === key);
    if (bolt) {
      this.intercept(bolt);
      return;
    }

    this.typo(this.locked);
  }

  private intercept(b: Bolt): void {
    this.telemetry.hit();
    sfxLaser();
    this.beam(b);
    this.score += wordPoints(1, this.streak + 1, this.hasPower("surge"));
    this.bumpStreak();
    this.world.fx.pop(this.world.toWorld(b.x, b.y, this.aim).clone());
    sfxPop();
    this.removeBolt(b);
    this.emitHud();
  }

  private hit(c: Contact): void {
    c.typed += 1;
    this.telemetry.hit();
    sfxLaser();
    this.beam(c);
    const wound = c.strike();
    this.world.fx.impact(this.world.toWorld(wound.x, wound.y, this.aim).clone());
    this.world.shake(50, 0.0024);
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
    const at = this.world.toWorld(c.x, c.y, this.aim).clone();
    if (!failed && c.advanceBoss()) {
      this.score += wordPoints(finished.length, this.streak + 1, this.hasPower("surge"));
      this.bumpStreak();
      c.scarPhase();
      this.world.fx.burst(at, "cruiser");
      this.world.shake(180, 0.011);
      sfxBoom("cruiser");
      this.clearLock(c);
      return;
    }

    if (failed) {
      if (c.hull !== "supply") this.loseShield();
      this.world.fx.burst(at, c.hull, true);
      this.world.shake(220, 0.012);
      sfxBoom("fail");
      if (c.hull !== "supply") bus.emit("flash", "hit");
    } else {
      this.score += wordPoints(c.word.length, this.streak + 1, this.hasPower("surge"));
      this.bumpStreak();
      this.world.fx.burst(at, c.hull);
      this.world.shake(
        130 + (c.hull === "capital" ? 80 : c.hull === "dreadnought" ? 40 : 0),
        c.hull === "capital" ? 0.042 : c.hull === "dreadnought" ? 0.02 : c.hull === "cruiser" ? 0.011 : 0.006,
      );
      sfxBoom(c.hull);
      if (c.hull === "capital" || c.hull === "dreadnought") bus.emit("flash", "ok");
      if (c.hull === "supply") this.grant(SYSTEM_WORD[c.word.toLowerCase()] ?? "surge");
      if (c.hull === "capital") setBed("combat");
    }

    this.remove(c);
    this.emitHud();
  }

  private breach(c: Contact): void {
    if (c.hull === "supply") {
      this.remove(c);
      return;
    }
    this.breakStreak();
    sfxBreach();
    bus.emit("flash", "hit");
    this.world.shake(180, 0.008);
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

  private boltBreach(b: Bolt): void {
    this.breakStreak();
    sfxBreach();
    bus.emit("flash", "hit");
    this.world.shake(140, 0.006);
    this.loseShield();
    this.removeBolt(b);
  }

  private removeBolt(b: Bolt): void {
    this.used.delete(b.letter);
    b.destroy();
    this.bolts = this.bolts.filter((x) => x !== b);
  }

  private clearBolts(): void {
    for (const b of this.bolts) {
      this.used.delete(b.letter);
      b.destroy();
    }
    this.bolts = [];
    this.boltAcc = 0;
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
      this.world.setAegis(false);
      bus.emit("banner", { title: "AEGIS", sub: "Hit absorbed." });
      return;
    }
    this.shields -= 1;
    if (this.shields <= 0) this.endRun();
  }

  private bumpStreak(): void {
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    if (this.streak === 8 || this.streak === 15 || this.streak === 25) sfxStreak();
  }

  private breakStreak(): void {
    this.streak = 0;
  }

  private grant(id: PowerId): void {
    sfxSystem();
    if (id === "aegis") {
      this.aegis = true;
      this.world.setAegis(true);
      bus.emit("banner", POWER_BANNER.aegis);
      return;
    }
    if (id === "shove") {
      const lift = this.world.height * 0.22;
      for (const c of this.contacts) c.lift(lift);
      for (const b of this.bolts) b.lift(lift);
      bus.emit("banner", POWER_BANNER.shove);
      const at = this.world.muzzle().clone();
      this.world.fx.burst(at, "dreadnought");
      this.world.fx.shock(at, 3.2);
      this.world.shake(180, 0.012);
      return;
    }
    const dur = id === "surge" ? 8 : id === "hold" ? 5 : 6;
    const existing = this.timed.find((p) => p.id === id);
    if (existing) existing.remain = dur;
    else this.timed.push({ id, remain: dur });
    if (id === "surge") this.world.setSurge(true);
    bus.emit("banner", POWER_BANNER[id]);
  }

  private fireSalvo(): void {
    if (this.salvo <= 0) {
      bus.emit("banner", { title: "EMPTY", sub: "Both shots spent." });
      return;
    }
    const targets = this.contacts.filter((c) => c.hull !== "supply");
    const shots = [...this.bolts];
    if (!targets.length && !shots.length) return;

    this.salvo -= 1;
    sfxSalvo();
    bus.emit("flash", "ok");
    bus.emit("banner", {
      title: "ORDNANCE",
      sub: this.salvo === 1 ? "One shot left." : "Last shot.",
    });

    this.world.fx.shock(this.world.muzzle().clone(), 4.4);
    this.world.shake(280, 0.018);

    targets.forEach((c, i) => {
      this.later(70 * i, () => {
        if (this.over || !this.contacts.includes(c)) return;
        this.score += wordPoints(c.word.length, this.streak, this.hasPower("surge"));
        this.world.fx.burst(this.world.toWorld(c.x, c.y, this.aim).clone(), c.hull);
        sfxBoom(c.hull);
        this.remove(c);
        this.emitHud();
      });
    });
    shots.forEach((b, i) => {
      this.later(40 * i, () => {
        if (this.over || !this.bolts.includes(b)) return;
        this.world.fx.pop(this.world.toWorld(b.x, b.y, this.aim).clone());
        sfxPop();
        this.removeBolt(b);
      });
    });
    this.emitHud();
  }

  private beam(c: { x: number; y: number }): void {
    const from = this.world.muzzle().clone();
    const to = this.world.toWorld(c.x, c.y, this.aim).clone();
    this.world.fx.laser(from, to);
    this.world.fx.flash(from, 0.45);
    this.world.fx.sparks(from, 8);
  }

  private checkRound(): void {
    if (this.transitioning || this.wordsLeft > 0 || this.contacts.length > 0 || this.bolts.length > 0) return;
    this.round += 1;
    this.wordsLeft = WORDS_PER_ROUND;
    this.suppliesThisWave = 0;
    this.spawnAcc = 400;
    this.boltAcc = 0;
    this.beginRound(false);
  }

  private beginRound(first: boolean): void {
    this.transitioning = true;
    bus.emit("banner", {
      title: first ? "WAVE 01" : `WAVE ${String(this.round).padStart(2, "0")}`,
      sub: this.round % 3 === 0 ? "Capital inbound. Intercept the letters." : undefined,
    });
    this.later(first ? 900 : ROUND_BANNER_MS, () => {
      this.transitioning = false;
      if (this.wordsLeft > 0 && this.contacts.length === 0) this.spawnContact();
    });
  }

  togglePause(): void {
    if (this.over || !this.live) return;
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
    this.disposeRun();
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
      platform: this.lane,
    };
    this.clearBolts();
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

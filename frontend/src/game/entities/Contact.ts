import Phaser from "phaser";
import type { Hull } from "../types";
import { hullScale, isPhone } from "../systems/layout";
import { reducedMotion } from "../systems/motion";
import { trueAdd } from "../vfx/blend";

let nextId = 1;

type Mark = {
  crater: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  lick: Phaser.GameObjects.Image | null;
  ox: number;
  oy: number;
  spin: number;
  lickW: number;
};

function hash(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 2246822519);
  n = Math.imul(n ^ (n >>> 13), 3266489917);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function rgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

export class Contact {
  readonly id = `c${nextId++}`;
  word: string;
  typed = 0;
  errors = 0;
  speedMul = 1;
  readonly hull: Hull;
  readonly phases: string[] | null;
  phase = 0;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  reticle: Phaser.GameObjects.Image;
  vx = 0;
  held = false;
  private readonly scene: Phaser.Scene;
  private readonly seed: number;
  private flameX = 1;
  private flameY = 1;
  private readonly phaseOffset = Math.random() * 100;
  private flicker = 0;
  private readonly marks: Mark[] = [];
  private vent: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private fire: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private flashUntil = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    word: string,
    hull: Hull,
    phases: string[] | null = null,
  ) {
    this.scene = scene;
    this.seed = nextId * 9973;
    this.word = word;
    this.hull = hull;
    this.phases = phases;
    const key = hull === "supply" && scene.textures.exists(`supply-${word.toLowerCase()}`)
      ? `supply-${word.toLowerCase()}`
      : hull;
    this.sprite = scene.add.image(x, y, key).setDepth(4);
    this.sprite.setScale(hullScale(hull));
    if (hull !== "supply") this.sprite.setRotation(Math.PI);

    const key2 = hull === "supply" ? "engine" : "flame";
    this.glow = scene.add.image(x, y, key2).setDepth(3).setBlendMode(trueAdd(scene));
    if (hull === "supply") {
      this.glow.setScale(0.7).setAlpha(0.8);
    } else {
      this.flameX = (this.sprite.displayWidth * 0.3) / 80;
      this.flameY = (this.sprite.displayHeight * 0.68) / 220;
      this.glow.setOrigin(0.5, 0).setRotation(Math.PI).setScale(this.flameX, this.flameY);
    }
    this.reticle = scene.add.image(x, y, "reticle").setDepth(5).setVisible(false);
    this.reticle.setScale((hull === "capital" ? 1.5 : 0.8) * (isPhone() ? 0.5 : 1));
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  get remaining(): string {
    return this.word.slice(this.typed);
  }

  get done(): boolean {
    return this.typed >= this.word.length;
  }

  /** 0 clean → 1 wrecked. Capitals accumulate across phases. */
  get integrity(): number {
    const local = this.word.length ? this.typed / this.word.length : 0;
    if (!this.phases) return local;
    return Math.min(1, (this.phase + local) / this.phases.length);
  }

  lock(on: boolean): void {
    this.reticle.setVisible(on);
  }

  advanceBoss(): boolean {
    if (!this.phases) return false;
    this.phase += 1;
    if (this.phase >= this.phases.length) return false;
    this.word = this.phases[this.phase]!;
    this.typed = 0;
    this.errors = 0;
    this.speedMul = 1;
    return true;
  }

  strike(): { x: number; y: number } {
    const mark = this.placeMark(0.7 + this.integrity * 0.55, this.marks.length);
    this.flashUntil = this.scene.time.now + 70;
    this.paintHull();
    this.ensureVents();
    if (this.integrity > 0.38 && mark.lick) mark.lick.setVisible(true);
    return { x: mark.crater.x, y: mark.crater.y };
  }

  scarPhase(): void {
    this.placeMark(1.15, this.marks.length + 17);
    this.placeMark(0.95, this.marks.length + 31);
    this.flashUntil = this.scene.time.now + 140;
    this.paintHull();
    this.ensureVents();
    for (const m of this.marks) {
      if (m.lick) m.lick.setVisible(this.integrity > 0.28);
    }
  }

  update(dt: number, fall: number, sway: number): void {
    this.sprite.y += fall * this.speedMul * dt;
    this.sprite.x += Math.sin(this.sprite.y * 0.01 + this.sprite.x * 0.004) * sway * dt;

    const hurt = this.integrity;
    const base = this.hull === "supply" ? 0 : Math.PI;
    const list = reducedMotion ? 0 : hurt * 0.16;
    this.sprite.rotation = base + Math.sin(this.scene.time.now / 220 + this.phaseOffset) * list;

    if (this.hull === "supply") {
      this.glow.setPosition(this.sprite.x, this.sprite.y);
      this.glow.setAlpha(0.55 + Math.sin(this.sprite.y * 0.08) * 0.25);
    } else {
      this.flicker += dt;
      const f = this.flicker * 34 + this.phaseOffset;
      const jitter = Math.sin(f) * 0.16 + Math.sin(f * 2.7) * 0.09 + Math.sin(f * 6.1) * 0.05;
      const limp = 1 - hurt * 0.35;
      this.glow.setPosition(this.sprite.x, this.sprite.y - this.sprite.displayHeight * 0.36);
      this.glow.setScale(this.flameX * (1 + jitter * 0.35) * limp, this.flameY * (1 + jitter) * limp);
      this.glow.setAlpha((0.82 + jitter * 0.5) * limp);
    }

    this.syncMarks();
    this.reticle.setPosition(this.sprite.x, this.sprite.y);
    this.reticle.rotation += dt * 1.2;

    if (this.vent) this.vent.frequency = Math.max(18, 90 - hurt * 70);
    if (this.fire) this.fire.frequency = hurt > 0.45 ? Math.max(12, 70 - hurt * 50) : 400;

    if (this.scene.time.now < this.flashUntil) this.sprite.setTint(0xfff4e2);
    else this.paintHull();
  }

  destroy(): void {
    for (const m of this.marks) {
      m.crater.destroy();
      m.glow.destroy();
      m.lick?.destroy();
    }
    this.marks.length = 0;
    this.vent?.destroy();
    this.fire?.destroy();
    this.sprite.destroy();
    this.glow.destroy();
    this.reticle.destroy();
  }

  private placeMark(scale: number, index: number): Mark {
    const a = hash(this.seed + index * 17) * Math.PI * 2;
    const r = 0.1 + hash(this.seed + index * 41) * 0.32;
    const ox = Math.cos(a) * this.sprite.displayWidth * r;
    const oy = Math.sin(a) * this.sprite.displayHeight * r;
    const spin = (hash(this.seed + index * 73) - 0.5) * 1.4;
    const size = (0.22 + this.sprite.displayWidth / 520) * scale;

    const crater = this.scene.add.image(this.x, this.y, "crater").setDepth(4.2);
    crater.setScale(size);
    crater.setRotation(spin);
    crater.setAlpha(0.92);

    const glow = this.scene.add.image(this.x, this.y, "wound").setDepth(4.4);
    glow.setBlendMode(trueAdd(this.scene));
    glow.setScale(size * 1.15);
    glow.setAlpha(0.95);

    const lick = this.scene.add.image(this.x, this.y, "flame").setDepth(4.5);
    lick.setBlendMode(trueAdd(this.scene));
    lick.setOrigin(0.5, 0);
    const lickW = (size * 28) / 80;
    lick.setScale(lickW, (size * 70) / 220);
    lick.setVisible(false);

    const mark: Mark = { crater, glow, lick, ox, oy, spin, lickW };
    this.marks.push(mark);
    this.syncMarks();

    if (!reducedMotion) {
      glow.setScale(size * 1.8);
      this.scene.tweens.add({
        targets: glow,
        scale: size * 1.15,
        alpha: 0.72,
        duration: 220,
        ease: "Expo.Out",
      });
    }
    return mark;
  }

  private syncMarks(): void {
    const rot = this.sprite.rotation;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const t = this.scene.time.now / 1000;
    for (const m of this.marks) {
      const x = this.sprite.x + m.ox * cos - m.oy * sin;
      const y = this.sprite.y + m.ox * sin + m.oy * cos;
      m.crater.setPosition(x, y).setRotation(rot + m.spin);
      m.glow.setPosition(x, y).setRotation(rot + m.spin);
      if (m.lick) {
        const pulse = 0.85 + Math.sin(t * 28 + m.spin * 8) * 0.2;
        m.lick.setPosition(x, y);
        m.lick.setRotation(rot + Math.PI);
        m.lick.setAlpha(0.7 + Math.sin(t * 22 + m.oy) * 0.25);
        m.lick.setScale(m.lickW, m.lickW * 2.6 * pulse);
      }
    }
  }

  private paintHull(): void {
    const t = this.integrity;
    if (t < 0.02 && !this.held) {
      this.sprite.clearTint();
      return;
    }
    const fromR = this.held ? 184 : 255;
    const fromG = this.held ? 196 : 244;
    const fromB = this.held ? 212 : 226;
    this.sprite.setTint(rgb(mix(fromR, 62, t), mix(fromG, 38, t), mix(fromB, 28, t)));
  }

  private ensureVents(): void {
    if (this.vent || reducedMotion) return;
    this.vent = this.scene.add.particles(this.x, this.y, "smoke", {
      lifespan: 820,
      speed: { min: 10, max: 46 },
      scale: { start: 0.28, end: 1.05 },
      alpha: { start: 0.38, end: 0 },
      rotate: { min: 0, max: 360 },
      frequency: 70,
      follow: this.sprite,
    });
    this.vent.setDepth(4.1);
    this.fire = this.scene.add.particles(this.x, this.y, "ember", {
      lifespan: 540,
      speed: { min: 16, max: 70 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.9, end: 0 },
      frequency: 400,
      blendMode: trueAdd(this.scene),
      follow: this.sprite,
    });
    this.fire.setDepth(4.6);
  }
}

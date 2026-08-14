import Phaser from "phaser";
import type { Hull } from "../types";
import { reducedMotion } from "../systems/motion";
import { trueAdd } from "./blend";

export const BLAST: Record<
  Hull,
  { scale: number; sparks: number; embers: number; debris: number; smoke: number; shake: number; pulses: number }
> = {
  fighter: { scale: 1.2, sparks: 26, embers: 34, debris: 8, smoke: 6, shake: 0.006, pulses: 1 },
  cruiser: { scale: 1.9, sparks: 46, embers: 62, debris: 14, smoke: 10, shake: 0.011, pulses: 2 },
  dreadnought: { scale: 3.1, sparks: 78, embers: 108, debris: 24, smoke: 16, shake: 0.02, pulses: 4 },
  capital: { scale: 6.0, sparks: 170, embers: 230, debris: 46, smoke: 30, shake: 0.042, pulses: 8 },
  supply: { scale: 1.5, sparks: 34, embers: 42, debris: 10, smoke: 8, shake: 0.008, pulses: 1 },
};

type Emitters = {
  sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  embers: Phaser.GameObjects.Particles.ParticleEmitter;
  shards: Phaser.GameObjects.Particles.ParticleEmitter;
  smoke: Phaser.GameObjects.Particles.ParticleEmitter;
};

function additive(scene: Phaser.Scene, x: number, y: number, key: string): Phaser.GameObjects.Image {
  return scene.add.image(x, y, key).setDepth(9).setBlendMode(trueAdd(scene));
}

export function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  hull: Hull,
  fx: Emitters,
  failed = false,
): void {
  const spec = BLAST[hull];
  const tint = failed ? 0xff7a44 : 0xffffff;
  const heavy = spec.scale >= 3;

  const core = additive(scene, x, y, "fireball");
  core.setScale(spec.scale * 0.34).setTint(tint).setRotation(Math.random() * Math.PI * 2);
  scene.tweens.add({
    targets: core,
    alpha: 0,
    scale: spec.scale * 1.25,
    rotation: core.rotation + 0.6,
    duration: reducedMotion ? 90 : 420 + spec.scale * 90,
    ease: "Quart.Out",
    onComplete: () => core.destroy(),
  });

  const inner = additive(scene, x, y, "fireball");
  inner.setScale(spec.scale * 0.16).setRotation(Math.random() * Math.PI * 2);
  scene.tweens.add({
    targets: inner,
    alpha: 0,
    scale: spec.scale * 0.62,
    duration: reducedMotion ? 70 : 240 + spec.scale * 40,
    ease: "Expo.Out",
    onComplete: () => inner.destroy(),
  });

  const hot = additive(scene, x, y, "flash");
  hot.setScale(spec.scale * 0.5).setTint(tint);
  scene.tweens.add({
    targets: hot,
    alpha: 0,
    scale: spec.scale * 1.5,
    duration: reducedMotion ? 80 : 180 + spec.scale * 30,
    ease: "Expo.Out",
    onComplete: () => hot.destroy(),
  });

  const shock = additive(scene, x, y, "shock");
  shock.setScale(0.08 * spec.scale).setAlpha(0.8).setTint(failed ? 0xffb08a : 0xfff2dc);
  scene.tweens.add({
    targets: shock,
    alpha: 0,
    scale: spec.scale * 0.78,
    duration: reducedMotion ? 110 : 260 + spec.scale * 40,
    ease: "Expo.Out",
    onComplete: () => shock.destroy(),
  });

  if (heavy) {
    const ring = additive(scene, x, y, "shock");
    ring.setScale(0.06 * spec.scale).setAlpha(0.4).setTint(0xffa050);
    scene.tweens.add({
      targets: ring,
      alpha: 0,
      scale: spec.scale * 1.3,
      duration: 520,
      ease: "Expo.Out",
      onComplete: () => ring.destroy(),
    });
  }

  fx.sparks.emitParticleAt(x, y, spec.sparks);
  fx.embers.emitParticleAt(x, y, spec.embers);
  fx.shards.emitParticleAt(x, y, spec.debris);
  fx.smoke.emitParticleAt(x, y, spec.smoke);

  if (!reducedMotion) {
    scene.cameras.main.shake(110 + spec.scale * 55, spec.shake);
  }

  for (let i = 1; i < spec.pulses; i++) {
    scene.time.delayedCall(80 * i, () => {
      if (!scene.sys.isActive()) return;
      const ox = x + (Math.random() - 0.5) * 62 * spec.scale;
      const oy = y + (Math.random() - 0.5) * 46 * spec.scale;
      const f = additive(scene, ox, oy, "fireball");
      f.setScale(spec.scale * 0.12).setRotation(Math.random() * Math.PI * 2);
      scene.tweens.add({
        targets: f,
        alpha: 0,
        scale: spec.scale * 0.42,
        duration: 340,
        ease: "Cubic.Out",
        onComplete: () => f.destroy(),
      });
      fx.embers.emitParticleAt(ox, oy, Math.floor(spec.embers * 0.24));
      fx.sparks.emitParticleAt(ox, oy, Math.floor(spec.sparks * 0.2));
      fx.smoke.emitParticleAt(ox, oy, 3);
    });
  }
}

import Phaser from "phaser";
import { reducedMotion } from "../systems/motion";
import { trueAdd } from "./blend";

export class Backdrop {
  private readonly stars: { img: Phaser.GameObjects.Image; speed: number }[] = [];
  private readonly dust: { img: Phaser.GameObjects.Image; speed: number }[] = [];
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const w = scene.scale.width;
    const h = scene.scale.height;

    for (let i = 0; i < 9; i++) {
      const img = scene.add.image(Math.random() * w, Math.random() * h, "nebula").setDepth(1);
      img.setScale(2.6 + Math.random() * 3.4);
      img.setAlpha(0.3 + Math.random() * 0.22);
      img.setBlendMode(trueAdd(scene));
      img.setTint(i % 3 === 0 ? 0xffb070 : i % 3 === 1 ? 0x5878b0 : 0xd05a34);
      img.setRotation(Math.random() * Math.PI * 2);
      this.dust.push({ img, speed: 4 + Math.random() * 8 });
    }

    for (let i = 0; i < 190; i++) {
      const img = scene.add.image(Math.random() * w, Math.random() * h, "star").setDepth(2);
      const layer = i < 100 ? 1 : i < 155 ? 2 : 3;
      img.setScale(0.16 + layer * 0.15);
      img.setAlpha(0.3 + layer * 0.2);
      img.setBlendMode(trueAdd(scene));
      img.setTint(layer === 3 ? 0xfff2d8 : layer === 2 ? 0xd8c4a4 : 0x8ea4c4);
      this.stars.push({ img, speed: 26 + layer * 46 });
    }

    const size = Math.min(w, h) * (w < 820 ? 0.28 : 0.4);
    const planet = scene.add.image(w * 0.86, h * 0.1, "planet").setDepth(1);
    planet.setDisplaySize(size, size);
    planet.setAlpha(0.82);
  }

  update(dt: number): void {
    const h = this.scene.scale.height;
    const w = this.scene.scale.width;
    const mul = reducedMotion ? 0.2 : 1;
    for (const s of this.stars) {
      s.img.y += s.speed * dt * mul;
      if (s.img.y > h + 8) {
        s.img.y = -8;
        s.img.x = Math.random() * w;
      }
    }
    for (const d of this.dust) {
      d.img.y += d.speed * dt * mul;
      d.img.rotation += dt * 0.012;
      if (d.img.y > h + 400) {
        d.img.y = -400;
        d.img.x = Math.random() * w;
      }
    }
  }
}

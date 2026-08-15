import Phaser from "phaser";
import { isPhone } from "../systems/layout";
import { reducedMotion } from "../systems/motion";
import { trueAdd } from "../vfx/blend";

let nextId = 1;

export class Bolt {
  readonly id = `b${nextId++}`;
  readonly letter: string;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  private readonly scene: Phaser.Scene;
  private readonly sign: number;
  private age = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, letter: string, sign: number) {
    this.scene = scene;
    this.letter = letter;
    this.sign = sign;
    const scale = (isPhone() ? 0.36 : 0.52) * (0.88 + Math.abs(sign) * 0.06);
    this.glow = scene.add.image(x, y, "bolt").setDepth(4.5).setBlendMode(trueAdd(scene));
    this.glow.setOrigin(0.5, 0.58).setScale(scale * 1.35).setTint(0xff6a38).setAlpha(0.55);
    this.sprite = scene.add.image(x, y, "bolt").setDepth(4.7);
    this.sprite.setOrigin(0.5, 0.58).setScale(scale);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  update(dt: number, fall: number): void {
    this.age += dt;
    const fan = this.sign * (4 + this.age * 5);
    this.sprite.x += fan * dt;
    this.sprite.y += fall * dt;
    this.keepOnScreen();
    this.sprite.rotation = Math.atan2(fan, fall);

    const pulse = reducedMotion ? 0 : Math.sin(this.age * 18 + this.sign) * 0.16;
    this.glow.setPosition(this.sprite.x, this.sprite.y);
    this.glow.setRotation(this.sprite.rotation);
    this.glow.setAlpha(0.42 + pulse);
  }

  destroy(): void {
    this.sprite.destroy();
    this.glow.destroy();
  }

  private keepOnScreen(): void {
    const w = this.scene.scale.width;
    const half = this.sprite.displayWidth * 0.45;
    const inset = isPhone() ? 14 : 22;
    const minX = Math.min(inset + half, w * 0.22);
    const maxX = w - minX;
    this.sprite.x = maxX > minX ? Phaser.Math.Clamp(this.sprite.x, minX, maxX) : w / 2;
  }
}

import Phaser from "phaser";
import { reducedMotion } from "../systems/motion";
import { BloomPipeline } from "../vfx/BloomPipeline";
import { Backdrop } from "../vfx/Backdrop";
import { generateTextures } from "../vfx/textures";

export class MenuScene extends Phaser.Scene {
  private world!: Backdrop;

  constructor() {
    super("menu");
  }

  create(): void {
    generateTextures(this);
    if (!reducedMotion && this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.cameras.main.setPostPipeline(BloomPipeline);
    }
    this.world = new Backdrop(this);
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.image(w / 2, h - 24, "station").setDepth(2).setAlpha(0.55).setDisplaySize(w, 70);
  }

  update(_t: number, delta: number): void {
    this.world.update(delta / 1000);
  }
}

import Phaser from "phaser";
import { reducedMotion } from "../systems/motion";
import { BloomPipeline } from "../vfx/BloomPipeline";
import { generateTextures } from "../vfx/textures";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    generateTextures(this);
    const renderer = this.game.renderer;
    if (renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      if (!renderer.pipelines.get("BloomPipeline")) {
        renderer.pipelines.addPostPipeline("BloomPipeline", BloomPipeline);
      }
    }
    if (!reducedMotion && renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.cameras.main.setPostPipeline(BloomPipeline);
    }
    this.scene.start("menu");
  }
}

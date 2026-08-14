import Phaser from "phaser";

let cached = -1;

/**
 * Phaser's built-in ADD is [ONE, DST_ALPHA], which scales the destination by the
 * framebuffer alpha. On a non-opaque buffer that darkens a rectangle the size of
 * every additive sprite's quad. Textures are uploaded premultiplied, so [ONE, ONE]
 * is the correct additive blend and never touches the destination.
 */
export function trueAdd(scene: Phaser.Scene): number {
  if (cached >= 0) return cached;
  const renderer = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const gl = renderer.gl;
  if (!gl) return Phaser.BlendModes.ADD;
  cached = renderer.addBlendMode([gl.ONE, gl.ONE], gl.FUNC_ADD);
  return cached;
}

import Phaser from "phaser";

const FRAG = `
#ifdef GL_ES
precision mediump float;
#endif
varying vec2 outTexCoord;
uniform sampler2D uMainSampler;
uniform float uIntensity;
uniform float uVignette;

void main() {
  vec2 uv = outTexCoord;
  vec4 color = texture2D(uMainSampler, uv);
  vec2 px = vec2(0.0016, 0.0024);
  vec4 acc = color * 0.28;
  acc += texture2D(uMainSampler, uv + vec2(px.x, 0.0)) * 0.12;
  acc += texture2D(uMainSampler, uv - vec2(px.x, 0.0)) * 0.12;
  acc += texture2D(uMainSampler, uv + vec2(0.0, px.y)) * 0.12;
  acc += texture2D(uMainSampler, uv - vec2(0.0, px.y)) * 0.12;
  acc += texture2D(uMainSampler, uv + px) * 0.08;
  acc += texture2D(uMainSampler, uv - px) * 0.08;
  acc += texture2D(uMainSampler, uv + vec2(px.x, -px.y)) * 0.08;
  float bright = max(acc.r, max(acc.g, acc.b));
  vec4 bloom = acc * smoothstep(0.62, 0.94, bright) * uIntensity;
  vec2 centered = uv - 0.5;
  float vig = 1.0 - uVignette * dot(centered, centered) * 1.4;
  gl_FragColor = vec4((color.rgb + bloom.rgb * 0.38) * vig, color.a);
}
`;

export class BloomPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({
      game,
      name: "BloomPipeline",
      fragShader: FRAG,
    });
  }

  onPreRender(): void {
    this.set1f("uIntensity", 0.72);
    this.set1f("uVignette", 0.36);
  }
}

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { isPhone } from "../systems/layout";
import { reducedMotion } from "../systems/motion";

export type WorldRenderer = {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer | null;
  bloom: UnrealBloomPass | null;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  resize: (w: number, h: number) => void;
  render: (scene: THREE.Scene, camera: THREE.Camera) => void;
  dispose: () => void;
};

export function createWorldRenderer(host: HTMLElement): WorldRenderer {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  host.replaceChildren(canvas);

  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !phone,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setClearColor(0x120e0a, 1);
  renderer.setPixelRatio(phone ? 1 : Math.min(2, window.devicePixelRatio || 1));

  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  const useBloom = !reducedMotion;

  if (useBloom) {
    composer = new EffectComposer(renderer);
    bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      phone ? 0.58 : 0.92,
      phone ? 0.36 : 0.52,
      phone ? 0.52 : 0.42,
    );
    composer.addPass(new RenderPass(new THREE.Scene(), new THREE.Camera()));
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  const state: WorldRenderer = {
    renderer,
    composer,
    bloom,
    canvas,
    width: 1,
    height: 1,
    resize(w, h) {
      state.width = Math.max(1, Math.floor(w));
      state.height = Math.max(1, Math.floor(h));
      renderer.setSize(state.width, state.height, true);
      composer?.setSize(state.width, state.height);
      bloom?.resolution.set(state.width, state.height);
    },
    render(scene, camera) {
      if (composer && bloom) {
        const pass = composer.passes[0] as RenderPass;
        pass.scene = scene;
        pass.camera = camera;
        composer.render();
        return;
      }
      renderer.render(scene, camera);
    },
    dispose() {
      composer?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };

  return state;
}

import * as THREE from "three";
import { isPhone } from "../systems/layout";
import { reducedMotion } from "../systems/motion";
import { fbm } from "./forge";
import { BLOOM_LAYER } from "../world/layers";

export type Gargantua = {
  readonly group: THREE.Group;
  update: (dt: number, camera: THREE.Camera) => void;
  prerender: (renderer: THREE.WebGLRenderer, camera: THREE.Camera) => void;
  dispose: () => void;
};

// Schwarzschild units, M = 1: horizon 2, photon sphere 3, shadow radius 3*sqrt(3).
const SHADOW_R = 5.196;
const DISK_IN = 6.2;
const DISK_OUT = 17;
const BOUND = 20;

/**
 * Gargantua. Null geodesics integrated with acc = -1.5 h^2 p / r^5, so the
 * wrap over the shadow is genuinely the far side of the disk lensed into view
 * rather than a painted hoop. Camera sits nearly in the disk plane and Doppler
 * is muted, as the film did.
 *
 * The march is far too expensive at native resolution, so it runs into a
 * fraction-scale target and is composited by a camera-facing billboard that
 * samples that target in screen space. The hard shadow edge stays in the main
 * scene at full resolution.
 */
export function buildGargantua(): Gargantua {
  const phone = isPhone();
  const group = new THREE.Group();

  // Opaque disc at the apparent shadow radius keeps stars and haze out of the core.
  const shadow = new THREE.Mesh(
    new THREE.SphereGeometry(SHADOW_R, phone ? 40 : 64, phone ? 28 : 48),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  group.add(shadow);

  const marchMat = marchMaterial(phone);
  const volume = new THREE.Mesh(new THREE.SphereGeometry(BOUND, phone ? 24 : 40, phone ? 16 : 28), marchMat);
  volume.frustumCulled = false;

  // The march lives in its own scene so it can be rendered small.
  const holeScene = new THREE.Scene();
  const holeRoot = new THREE.Group();
  holeRoot.matrixAutoUpdate = false;
  holeRoot.add(volume);
  holeScene.add(holeRoot);

  const target = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
  });
  target.texture.minFilter = THREE.LinearFilter;
  target.texture.magFilter = THREE.LinearFilter;
  target.texture.generateMipmaps = false;

  const screen = new THREE.Vector2(2, 2);
  const billboard = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUND * 2.5, BOUND * 2.5),
    new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uMap: { value: target.texture },
      },
      // Screen UVs come from clip space, not gl_FragCoord: the composer renders
      // at CSS resolution while the canvas buffer is 2x, so pixel coords would
      // sample the wrong region entirely.
      vertexShader: `
        varying vec4 vClip;
        void main() {
          vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = vClip;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec4 vClip;
        uniform sampler2D uMap;
        void main() {
          vec2 uv = vClip.xy / vClip.w * 0.5 + 0.5;
          vec3 c = texture2D(uMap, uv).rgb;
          if (!(max(max(c.r, c.g), c.b) > 0.003)) discard;
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    }),
  );
  billboard.frustumCulled = false;
  billboard.layers.enable(BLOOM_LAYER);
  group.add(billboard);

  group.scale.setScalar(phone ? 0.55 : 0.85);

  const rtScale = phone ? 0.3 : 0.45;
  const UP = new THREE.Vector3(0, 1, 0);
  const view = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const localCam = new THREE.Vector3();
  const camQuat = new THREE.Quaternion();
  const groupQuat = new THREE.Quaternion();
  const clearWas = new THREE.Color();
  let time = 0;

  return {
    group,
    update(dt: number, camera: THREE.Camera) {
      if (!reducedMotion) time += dt;

      // Aim the disk edge-on to the view axis. Sitting high in the sky, a
      // world-aligned disk would be seen from 25 degrees above and read as a
      // donut, so the spin axis is derived from where the camera actually is.
      view.copy(group.position).sub(camera.position).normalize();
      axis.copy(UP).addScaledVector(view, -UP.dot(view)).normalize();
      const inc = 0.14 + Math.sin(time * 0.05) * 0.014;
      axis.addScaledVector(view, Math.tan(inc)).normalize();
      group.quaternion.setFromUnitVectors(UP, axis);
      group.updateMatrixWorld(true);

      // Park the billboard between the camera and the whole march volume.
      localCam.copy(camera.position);
      group.worldToLocal(localCam);
      billboard.position.copy(localCam.normalize()).multiplyScalar(BOUND * 1.02);
      group.getWorldQuaternion(groupQuat);
      camera.getWorldQuaternion(camQuat);
      billboard.quaternion.copy(groupQuat.invert()).multiply(camQuat);

      marchMat.uniforms.uTime!.value = time;
    },
    prerender(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
      // Sized against CSS pixels because that is the resolution the composer
      // actually renders the scene at.
      renderer.getSize(screen);
      const w = Math.max(2, Math.round(screen.x * rtScale));
      const h = Math.max(2, Math.round(screen.y * rtScale));
      if (target.width !== w || target.height !== h) target.setSize(w, h);

      holeRoot.matrix.copy(group.matrixWorld);
      holeRoot.matrixWorldNeedsUpdate = true;
      holeRoot.updateMatrixWorld(true);
      marchMat.uniforms.uInvModel!.value.copy(volume.matrixWorld).invert();

      const prevTarget = renderer.getRenderTarget();
      renderer.getClearColor(clearWas);
      const alphaWas = renderer.getClearAlpha();
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      renderer.render(holeScene, camera);
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(clearWas, alphaWas);
    },
    dispose() {
      target.dispose();
      volume.geometry.dispose();
      marchMat.dispose();
    },
  };
}

/**
 * Disk in (angle, radius) space. Ridged noise gives the filamentary strands;
 * the angular coordinate is sheared by radius so they wind into the core.
 */
function diskMap(phone: boolean): THREE.CanvasTexture {
  const w = phone ? 512 : 1024;
  const h = phone ? 160 : 320;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);

  const lane = (a: number, u: number): number => {
    const swirl = u * 4.2;
    const s1 = fbm((a + swirl) * 26, u * 1.8, 19, 4);
    const s2 = fbm((a + swirl * 1.6) * 52, u * 3.6, 71, 3);
    const broad = fbm((a + swirl * 0.45) * 10, u * 1.2, 113, 3);
    const r1 = Math.max(0, 1 - Math.abs(s1 * 2 - 1));
    const r2 = Math.max(0, 1 - Math.abs(s2 * 2 - 1));
    const strand = Math.pow(r1, 2.6) * 0.64 + Math.pow(r2, 3.2) * 0.36;
    return Math.min(1, (0.22 + 0.78 * broad) * (0.16 + 1.5 * strand));
  };

  for (let y = 0; y < h; y++) {
    const u = y / (h - 1);
    const heat = Math.pow(1 - u, 1.55);
    const glow = Math.pow(Math.max(0, 1 - u * 2.1), 1.9);
    // Ragged outer boundary instead of a hard annulus cut.
    const rim = Math.pow(Math.max(0, 1 - Math.max(0, (u - 0.26) / 0.74)), 2.0);
    for (let x = 0; x < w; x++) {
      const a = x / w;
      let lanes = lane(a, u);
      // Crossfade the wrap seam, the noise is not periodic in angle.
      if (a > 0.92) {
        const t = (a - 0.92) / 0.08;
        lanes = lanes * (1 - t) + lane(a - 1, u) * t;
      }
      const dens = Math.min(1, lanes * (0.3 + heat * 1.3) * rim);
      if (dens < 0.008) continue;
      // Colour stays unpremultiplied; density lives in alpha alone and the
      // march applies it once.
      const white = Math.min(1, glow * 1.3);
      const i = (y * w + x) * 4;
      img.data[i] = 232 + 23 * white;
      img.data[i + 1] = 148 + 107 * white;
      img.data[i + 2] = 88 + 167 * white;
      img.data[i + 3] = Math.min(255, dens * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  // No mipmaps: sampled inside a march loop the implicit LOD derivatives are
  // meaningless and neighbouring fragments snap to different levels, which
  // shows up as a 2x2 checkerboard.
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function marchMaterial(phone: boolean): THREE.ShaderMaterial {
  const steps = phone ? 190 : 420;
  return new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.FrontSide,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uInvModel: { value: new THREE.Matrix4() },
      uDisk: { value: diskMap(phone) },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vWorld;
      uniform float uTime;
      uniform mat4 uInvModel;
      uniform sampler2D uDisk;

      const int STEPS = ${steps};
      const float HORIZON = 2.0;
      const float DISK_IN = ${DISK_IN.toFixed(2)};
      const float DISK_OUT = ${DISK_OUT.toFixed(2)};
      const float BOUND = ${BOUND.toFixed(2)};
      const float INV_2PI = 0.15915494;

      // Emission (rgb) and density (a) of a soft, flared slab, sampled every
      // step rather than only at plane crossings. Grazing rays then pick up the
      // long path that makes the mid-line blinding and the lensed arcs thick.
      vec4 gasAt(vec3 q, vec3 vel) {
        float rho = length(q.xz);
        if (rho < DISK_IN || rho > DISK_OUT) return vec4(0.0);

        float u = clamp((rho - DISK_IN) / (DISK_OUT - DISK_IN), 0.0, 1.0);
        // Thin ribbon, only gently flared. A tall slab reads as a rectangle
        // when seen edge-on, and buries the shadow behind its own glow.
        float thick = 0.25 + 0.055 * rho;
        float slab = exp(-pow(abs(q.y) / thick, 2.0));
        if (slab < 0.01) return vec4(0.0);
        // Feather both rims so the annulus never shows a straight cut.
        float edge = smoothstep(DISK_OUT, DISK_OUT * 0.68, rho) * smoothstep(DISK_IN, DISK_IN * 1.1, rho);
        if (edge < 0.01) return vec4(0.0);

        float ang = atan(q.z, q.x);
        // Keplerian shear: inner lanes sweep faster than outer.
        float drift = uTime * 0.045 * pow(rho / DISK_IN, -1.5);
        vec4 gas = texture2D(uDisk, vec2(ang * INV_2PI + drift, min(u, 0.995)));
        if (gas.a < 0.004) return vec4(0.0);

        // Muted beaming, as the film did, so the ring stays near symmetric.
        vec3 tang = normalize(vec3(-q.z, 0.0, q.x));
        float dop = 1.0 + 0.07 * dot(tang, -normalize(vel));

        // The inner edge runs orders of magnitude hotter than the wings; without
        // this the long tangential paths through the outer gas out-shine it.
        float hot = 0.02 + 14.0 * pow(1.0 - u, 2.6);
        float dens = gas.a * slab * edge;
        return vec4(gas.rgb * hot * pow(clamp(dop, 0.86, 1.16), 2.0), dens);
      }

      void main() {
        vec3 ro = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
        vec3 rd = normalize(mat3(uInvModel) * (vWorld - cameraPosition));

        // March from the bound sphere; skip the empty run in front of it.
        float b = dot(ro, rd);
        float c = dot(ro, ro) - BOUND * BOUND;
        float disc = b * b - c;
        if (disc < 0.0) discard;
        float enter = dot(ro, ro) > BOUND * BOUND ? -b - sqrt(disc) : 0.0;
        if (enter < 0.0) discard;

        vec3 p = ro + rd * enter;
        vec3 v = rd;
        vec3 hv = cross(p, v);
        float h2 = dot(hv, hv);

        vec3 col = vec3(0.0);
        float trans = 1.0;

        for (int i = 0; i < STEPS; i++) {
          float r = length(p);
          if (r < HORIZON * 1.02) break;
          if (r > BOUND * 1.02 && dot(p, v) > 0.0) break;

          // Steps must stay small through the lensing zone or grazing rays
          // numerically spiral in and the halo disappears. The outer wings are
          // low contrast and tolerate coarse steps.
          // Refinement is a smooth function of position: hard thresholds put a
          // visible step-size discontinuity into the image as a ring.
          float ay = abs(p.y);
          float near = smoothstep(18.0, 7.0, r);
          float plane = exp(-ay * ay * 0.08);
          float dt = clamp(r * 0.055, 0.02, 1.7) * mix(1.0, 0.3, max(near, plane * 0.62));

          float r2 = r * r;
          vec3 acc = -1.5 * h2 * p / (r2 * r2 * r);
          vec3 prev = p;
          v += acc * dt;
          p += v * dt;

          vec4 gas = gasAt(mix(prev, p, 0.5), v);
          if (gas.a > 0.0) {
            // Emission-absorption, so the near gas occludes the far gas and the
            // long grazing paths saturate instead of adding without bound.
            col += trans * gas.rgb * gas.a * dt;
            trans *= exp(-gas.a * dt * 0.06);
            if (trans < 0.05) break;
          }
        }

        // Inverted so a NaN from a diverging step discards instead of painting
        // the whole bounding sphere black.
        float lum = max(max(col.r, col.g), col.b);
        if (!(lum > 0.004)) discard;
        gl_FragColor = vec4(col * 0.42, 1.0);
      }
    `,
  });
}

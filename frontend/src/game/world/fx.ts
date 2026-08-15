import * as THREE from "three";
import type { Hull } from "../types";
import { isPhone } from "../systems/layout";
import { reducedMotion } from "../systems/motion";
import { fbm } from "../vfx/forge";
import { BLOOM_LAYER } from "./layers";

type Laser = { mesh: THREE.Object3D; life: number; max: number };
type Sprite = { mesh: THREE.Mesh; life: number; max: number; grow: number; spin: number };
type Cloud = {
  points: THREE.Points;
  vel: Float32Array;
  life: number;
  max: number;
  drag: number;
  grav: number;
};
type Shard = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  max: number;
};
type Volume = { mesh: THREE.Mesh; life: number; max: number; grow: number };
type Streak = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; max: number };
type Lamp = { light: THREE.PointLight; life: number; max: number; peak: number };

const Y_UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _tmp = new THREE.Vector3();

const SPEC: Record<Hull | "fail", { sparks: number; embers: number; debris: number; smoke: number; streaks: number; scale: number; pulses: number; kick: number }> = {
  fighter: { sparks: 80, embers: 64, debris: 18, smoke: 22, streaks: 22, scale: 2.4, pulses: 3, kick: 0.22 },
  cruiser: { sparks: 110, embers: 88, debris: 26, smoke: 28, streaks: 30, scale: 3.4, pulses: 4, kick: 0.3 },
  dreadnought: { sparks: 150, embers: 120, debris: 36, smoke: 36, streaks: 40, scale: 4.8, pulses: 5, kick: 0.4 },
  capital: { sparks: 210, embers: 170, debris: 48, smoke: 48, streaks: 52, scale: 7.0, pulses: 7, kick: 0.55 },
  supply: { sparks: 70, embers: 54, debris: 14, smoke: 24, streaks: 18, scale: 2.6, pulses: 3, kick: 0.2 },
  fail: { sparks: 100, embers: 80, debris: 22, smoke: 30, streaks: 26, scale: 3.2, pulses: 4, kick: 0.28 },
};

function finishTex(tex: THREE.CanvasTexture): THREE.CanvasTexture {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function glowTex(rgb: string, size = 64): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.28, `rgba(${rgb},0.7)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finishTex(new THREE.CanvasTexture(c));
}

function fireballTex(): THREE.CanvasTexture {
  const s = 320;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d")!;
  const mid = s / 2;
  const reach = mid * 0.72;
  const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, reach);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.1, "rgba(255,246,222,0.98)");
  g.addColorStop(0.26, "rgba(255,178,86,0.9)");
  g.addColorStop(0.46, "rgba(255,140,48,0.55)");
  g.addColorStop(0.68, "rgba(255,90,28,0.16)");
  g.addColorStop(0.88, "rgba(255,70,20,0)");
  g.addColorStop(1, "rgba(255,60,16,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(mid, mid, reach, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + fbm(i, 3, 9, 3) * 2;
    const r = 28 + fbm(i * 2.3, 7, 21, 4) * 70;
    const rad = 12 + fbm(i, 11, 33, 3) * 26;
    const cx = mid + Math.cos(a) * r;
    const cy = mid + Math.sin(a) * r;
    const blob = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    blob.addColorStop(0, "rgba(255,214,150,0.55)");
    blob.addColorStop(0.5, "rgba(255,140,50,0.22)");
    blob.addColorStop(1, "rgba(255,90,30,0)");
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return finishTex(new THREE.CanvasTexture(c));
}

function canvasMap(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  return finishTex(new THREE.CanvasTexture(c));
}

export function flameMap(): THREE.CanvasTexture {
  return canvasMap(80, 220, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const half = 38 * Math.pow(1 - t, 0.5) * (0.55 + 0.45 * Math.min(1, t * 7));
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - w / 2) / Math.max(half, 0.001);
        if (d >= 1) continue;
        const body = (1 - d * d) * Math.pow(1 - t, 1.15);
        const core = Math.pow(1 - d, 3) * Math.pow(1 - t, 2.6);
        const a = Math.min(1, body * 0.95 + core * 0.9);
        const i = (y * w + x) * 4;
        img.data[i] = 255 * a;
        img.data[i + 1] = Math.min(255, 118 + 134 * core + 40 * (1 - t)) * a;
        img.data[i + 2] = Math.min(255, 40 + 200 * core) * a;
        img.data[i + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

export function craterMap(): THREE.CanvasTexture {
  return canvasMap(160, 160, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = (x - s / 2) / (s / 2);
        const dy = (y - s / 2) / (s / 2);
        const warp = (fbm(x * 0.045, y * 0.045, 77, 4) - 0.5) * 0.38;
        const d = Math.sqrt(dx * dx + dy * dy) + warp;
        if (d > 0.98) continue;
        const rim = Math.max(0, 1 - Math.abs(d - 0.62) * 5.2);
        const hole = Math.max(0, 1 - d * 1.35);
        const a = Math.min(1, hole * 0.92 + rim * 0.55);
        const heat = rim * (0.55 + fbm(x * 0.08, y * 0.08, 19, 3) * 0.45);
        const i = (y * s + x) * 4;
        img.data[i] = (28 + heat * 210) * a;
        img.data[i + 1] = (18 + heat * 90) * a;
        img.data[i + 2] = (14 + heat * 28) * a;
        img.data[i + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

export function woundMap(): THREE.CanvasTexture {
  return canvasMap(160, 160, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = (x - s / 2) / (s / 2);
        const dy = (y - s / 2) / (s / 2);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1) continue;
        const core = Math.pow(Math.max(0, 1 - d * 3.4), 2.2);
        const mid = Math.pow(Math.max(0, 1 - d * 1.6), 1.6);
        const a = Math.min(1, core * 0.95 + mid * 0.45);
        if (a <= 0.01) continue;
        const i = (y * s + x) * 4;
        img.data[i] = 255 * a;
        img.data[i + 1] = (140 + 110 * core) * a;
        img.data[i + 2] = (40 + 180 * core) * a;
        img.data[i + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function smokeTex(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const n = fbm((x / s) * 5, (y / s) * 5, 41, 5);
      const dx = x / s - 0.5;
      const dy = y / s - 0.5;
      const fall = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2.05);
      const a = Math.min(1, Math.max(0, n - 0.38) * fall * fall * fall * 2.1);
      if (a < 0.02) continue;
      const i = (y * s + x) * 4;
      img.data[i] = 92 * a;
      img.data[i + 1] = 72 * a;
      img.data[i + 2] = 58 * a;
      img.data[i + 3] = a * 180;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finishTex(new THREE.CanvasTexture(c));
}

function streakTex(): THREE.CanvasTexture {
  const w = 160;
  const h = 36;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const v = Math.abs(y / (h - 1) - 0.5) * 2;
      const along = Math.pow(Math.sin(u * Math.PI), 1.15);
      const across = Math.pow(Math.max(0, 1 - v), 2.4);
      const core = Math.pow(Math.max(0, 1 - v * 3.2), 3) * along;
      const a = Math.min(1, along * across * 0.85 + core);
      const i = (y * w + x) * 4;
      img.data[i] = 255 * a;
      img.data[i + 1] = (210 + 45 * core) * a;
      img.data[i + 2] = (140 + 100 * core) * a;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finishTex(new THREE.CanvasTexture(c));
}

function fireballMat(hot = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: true,
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 1 },
      uHot: { value: hot },
    },
    vertexShader: `
      varying vec3 vObj;
      varying vec3 vView;
      uniform float uTime;
      float hash(vec3 p) {
        p = fract(p * vec3(443.897, 397.297, 491.187));
        p += dot(p, p.yxz + 19.19);
        return fract((p.x + p.y) * p.z);
      }
      float vnoise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        vec3 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), u.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), u.x), u.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), u.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), u.x), u.y),
          u.z);
      }
      void main() {
        float n = vnoise(position * 2.1 + uTime * 1.4);
        vec3 pos = position * (0.78 + n * 0.42);
        vObj = normalize(position);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vObj;
      varying vec3 vView;
      uniform float uTime;
      uniform float uFade;
      uniform float uHot;
      float hash(vec3 p) {
        p = fract(p * vec3(443.897, 397.297, 491.187));
        p += dot(p, p.yxz + 19.19);
        return fract((p.x + p.y) * p.z);
      }
      float vnoise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        vec3 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), u.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), u.x), u.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), u.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), u.x), u.y),
          u.z);
      }
      float fbm(vec3 p) {
        float s = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          s += vnoise(p) * a;
          p = p * 2.05 + 11.0;
          a *= 0.5;
        }
        return s;
      }
      void main() {
        vec3 p = normalize(vObj);
        float n = fbm(p * 3.6 + vec3(uTime * 1.7, uTime * 0.8, -uTime * 1.1));
        float n2 = fbm(p * 8.0 - uTime * 2.4);
        float fres = pow(1.0 - abs(dot(p, normalize(vView))), 2.4);
        float core = pow(max(0.0, 0.72 - n * 0.55 + n2 * 0.12), 3.4);
        float mid = pow(max(0.0, 0.95 - n * 0.7), 1.45);
        float a = clamp((core * 1.35 + mid * 0.5 + fres * 0.4) * uFade, 0.0, 1.0);
        vec3 ember = vec3(3.6, 0.22, 0.03);
        vec3 gold = vec3(9.5, 4.4, 0.7);
        vec3 plasma = vec3(12.0, 14.5, 18.0);
        vec3 col = mix(ember, gold, clamp(mid * uHot, 0.0, 1.0));
        col = mix(col, plasma, core * uHot);
        col += plasma * core * core * 2.2 * uHot;
        col += gold * fres * 0.55;
        if (a < 0.12) discard;
        gl_FragColor = vec4(col * uFade, a);
      }
    `,
  });
}

function shellMat(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
    uniforms: {
      uFade: { value: 1 },
    },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vN;
      varying vec3 vView;
      uniform float uFade;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 4.2);
        vec3 col = vec3(7.5, 4.2, 1.4) * fres;
        col += vec3(14.0, 12.0, 8.0) * pow(fres, 6.0);
        float a = fres * uFade * 0.85;
        if (a < 0.1) discard;
        gl_FragColor = vec4(col * uFade, a);
      }
    `,
  });
}

function pointMat(map: THREE.Texture, color: number, size: number): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    map,
    color,
    size,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
    premultipliedAlpha: true,
    alphaTest: 0.12,
  });
}

export type WoundLook = {
  smoke: number;
  fire: number;
  smokeSize: number;
  fireSize: number;
  engineBias: number;
  rate: number;
};

export class WoundEmitter {
  hurt = 0;
  private readonly smoke: THREE.Points;
  private readonly fire: THREE.Points;
  private readonly smokePos: Float32Array;
  private readonly smokeVel: Float32Array;
  private readonly smokeAge: Float32Array;
  private readonly firePos: Float32Array;
  private readonly fireVel: Float32Array;
  private readonly fireAge: Float32Array;
  private readonly nozzles: THREE.Vector3[] = [];
  private readonly vents: THREE.Vector3[] = [];
  private readonly look: WoundLook;
  private coughLeft = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly parent: THREE.Object3D,
    smokeMap: THREE.Texture,
    emberMap: THREE.Texture,
    private readonly nSmoke: number,
    private readonly nFire: number,
    look?: Partial<WoundLook>,
  ) {
    this.look = {
      smoke: look?.smoke ?? 0x6a5348,
      fire: look?.fire ?? 0xff7a32,
      smokeSize: look?.smokeSize ?? 0.95,
      fireSize: look?.fireSize ?? 0.28,
      engineBias: look?.engineBias ?? 0.6,
      rate: look?.rate ?? 1,
    };
    this.cacheNozzles();
    this.smokePos = new Float32Array(nSmoke * 3);
    this.smokeVel = new Float32Array(nSmoke * 3);
    this.smokeAge = new Float32Array(nSmoke);
    this.firePos = new Float32Array(nFire * 3);
    this.fireVel = new Float32Array(nFire * 3);
    this.fireAge = new Float32Array(nFire);
    for (let i = 0; i < nSmoke; i++) this.respawnSmoke(i, true);
    for (let i = 0; i < nFire; i++) this.respawnFire(i, true);

    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute("position", new THREE.BufferAttribute(this.smokePos, 3));
    this.smoke = new THREE.Points(
      smokeGeo,
      new THREE.PointsMaterial({
        map: smokeMap,
        color: this.look.smoke,
        size: this.look.smokeSize,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        premultipliedAlpha: true,
      }),
    );
    this.smoke.frustumCulled = false;

    const fireGeo = new THREE.BufferGeometry();
    fireGeo.setAttribute("position", new THREE.BufferAttribute(this.firePos, 3));
    this.fire = new THREE.Points(fireGeo, pointMat(emberMap, this.look.fire, this.look.fireSize));
    (this.fire.material as THREE.PointsMaterial).opacity = 0;
    this.fire.layers.enable(BLOOM_LAYER);
    this.fire.frustumCulled = false;

    scene.add(this.smoke, this.fire);
  }

  addVent(local: THREE.Vector3): void {
    this.vents.push(local.clone());
  }

  cough(): void {
    this.coughLeft = 0.16 + Math.random() * 0.18;
    const nFire = 6 + Math.floor(Math.random() * 10);
    const nSmoke = 3 + Math.floor(Math.random() * 6);
    for (let i = 0; i < Math.min(nFire, this.nFire); i++) this.respawnFire(i, false, true);
    for (let i = 0; i < Math.min(nSmoke, this.nSmoke); i++) this.respawnSmoke(i, false, true);
  }

  update(dt: number): void {
    const live = this.hurt > 0.04;
    const smokeMat = this.smoke.material as THREE.PointsMaterial;
    const fireMat = this.fire.material as THREE.PointsMaterial;
    smokeMat.opacity = live ? 0.18 + this.hurt * 0.68 : 0;
    fireMat.opacity = live ? 0.22 + this.hurt * 0.8 + this.coughLeft * 2.2 : 0;
    smokeMat.size = this.look.smokeSize * (0.75 + this.hurt * 0.7);
    this.coughLeft = Math.max(0, this.coughLeft - dt);
    if (!live) return;

    const rate = (0.45 + this.hurt * 0.95) * this.look.rate;
    for (let i = 0; i < this.nSmoke; i++) {
      this.smokeAge[i]! += dt * rate;
      if (this.smokeAge[i]! > 1) this.respawnSmoke(i, false);
      else {
        this.smokePos[i * 3]! += this.smokeVel[i * 3]! * dt;
        this.smokePos[i * 3 + 1]! += this.smokeVel[i * 3 + 1]! * dt;
        this.smokePos[i * 3 + 2]! += this.smokeVel[i * 3 + 2]! * dt;
        this.smokeVel[i * 3]! *= 1 - 0.35 * dt;
        this.smokeVel[i * 3 + 1]! += 0.55 * dt;
      }
    }
    for (let i = 0; i < this.nFire; i++) {
      this.fireAge[i]! += dt * (1.5 + this.hurt);
      if (this.fireAge[i]! > 1) this.respawnFire(i, false);
      else {
        this.firePos[i * 3]! += this.fireVel[i * 3]! * dt;
        this.firePos[i * 3 + 1]! += this.fireVel[i * 3 + 1]! * dt;
        this.firePos[i * 3 + 2]! += this.fireVel[i * 3 + 2]! * dt;
        this.fireVel[i * 3 + 1]! += 2.4 * dt;
      }
    }
    (this.smoke.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.fire.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.smoke, this.fire);
    this.smoke.geometry.dispose();
    this.fire.geometry.dispose();
  }

  private cacheNozzles(): void {
    this.parent.updateMatrixWorld(true);
    this.parent.traverse((o) => {
      if (!o.userData.engine) return;
      const local = new THREE.Vector3();
      o.getWorldPosition(local);
      this.parent.worldToLocal(local);
      this.nozzles.push(local);
    });
  }

  private origin(into: THREE.Vector3, engine: boolean): void {
    if (this.vents.length && Math.random() < 0.45) {
      into.copy(this.vents[Math.floor(Math.random() * this.vents.length)]!);
      into.x += (Math.random() - 0.5) * 0.1;
      into.y += (Math.random() - 0.5) * 0.1;
    } else if (engine && this.nozzles.length) {
      const n = this.nozzles[Math.floor(Math.random() * this.nozzles.length)]!;
      into.copy(n);
      into.x += (Math.random() - 0.5) * 0.12;
      into.y -= 0.12 + Math.random() * 0.18;
    } else {
      const a = Math.random() * Math.PI * 2;
      const r = 0.18 + Math.random() * 0.85;
      into.set(Math.cos(a) * r, (Math.random() - 0.45) * 0.9, 0.22 + Math.random() * 0.28);
    }
    this.parent.localToWorld(into);
  }

  private respawnSmoke(i: number, scatter: boolean, engine = false): void {
    this.origin(_tmp, engine || Math.random() < this.look.engineBias);
    this.smokePos[i * 3] = _tmp.x;
    this.smokePos[i * 3 + 1] = _tmp.y;
    this.smokePos[i * 3 + 2] = _tmp.z;
    this.smokeVel[i * 3] = (Math.random() - 0.5) * 0.45;
    this.smokeVel[i * 3 + 1] = 0.55 + Math.random() * 1.1;
    this.smokeVel[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
    this.smokeAge[i] = scatter ? Math.random() : 0;
  }

  private respawnFire(i: number, scatter: boolean, engine = false): void {
    this.origin(_tmp, engine || Math.random() < this.look.engineBias + 0.1);
    this.firePos[i * 3] = _tmp.x;
    this.firePos[i * 3 + 1] = _tmp.y;
    this.firePos[i * 3 + 2] = _tmp.z;
    this.fireVel[i * 3] = (Math.random() - 0.5) * 1.6;
    this.fireVel[i * 3 + 1] = 1.1 + Math.random() * 2.6;
    this.fireVel[i * 3 + 2] = (Math.random() - 0.5) * 0.9;
    this.fireAge[i] = scatter ? Math.random() : 0;
  }
}

export class FxRig {
  exposureKick = 0;
  private readonly scene: THREE.Scene;
  private gen = 0;
  private readonly lasers: Laser[] = [];
  private readonly sprites: Sprite[] = [];
  private readonly clouds: Cloud[] = [];
  private readonly shards: Shard[] = [];
  private readonly volumes: Volume[] = [];
  private readonly streaks: Streak[] = [];
  private readonly lamps: Lamp[] = [];
  private readonly beamGeo = new THREE.CylinderGeometry(0.05, 0.016, 1, 8, 1, true);
  private readonly beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe2b8,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private readonly haloMat = new THREE.MeshBasicMaterial({
    color: 0xe8a15a,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private readonly sparkTex = glowTex("255,236,200");
  private readonly emberTex = glowTex("255,120,40");
  private readonly fireTex = fireballTex();
  private readonly smokeMap = smokeTex();
  private readonly planeGeo = new THREE.PlaneGeometry(1, 1);
  private readonly shardGeo = new THREE.BoxGeometry(0.08, 0.05, 0.03);
  private readonly shardMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.4, 0.85, 0.22),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    premultipliedAlpha: true,
  });
  private readonly ballGeo = new THREE.SphereGeometry(1, 20, 16);
  private readonly shellGeo = new THREE.SphereGeometry(1, 18, 14);
  private readonly streakGeo = new THREE.PlaneGeometry(1, 1);
  private readonly streakMap = streakTex();
  private readonly sparkMat: THREE.PointsMaterial;
  private readonly emberMat: THREE.PointsMaterial;
  private readonly smokeMat: THREE.PointsMaterial;
  private readonly fireMat: THREE.MeshBasicMaterial;
  private readonly flashMat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sparkMat = pointMat(this.sparkTex, 0xfff1d0, 0.42);
    this.emberMat = pointMat(this.emberTex, 0xff6a28, 0.58);
    this.smokeMat = new THREE.PointsMaterial({
      map: this.smokeMap,
      color: 0x8a6a52,
      size: 1.15,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      premultipliedAlpha: true,
      alphaTest: 0.1,
    });
    this.fireMat = new THREE.MeshBasicMaterial({
      map: this.fireTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      premultipliedAlpha: true,
      alphaTest: 0.08,
    });
    this.flashMat = new THREE.MeshBasicMaterial({
      map: this.sparkTex,
      color: 0xfff6e4,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      premultipliedAlpha: true,
      alphaTest: 0.08,
    });
  }

  wound(parent: THREE.Object3D, look?: Partial<WoundLook>): WoundEmitter {
    const phone = isPhone();
    return new WoundEmitter(this.scene, parent, this.smokeMap, this.emberTex, phone ? 18 : 36, phone ? 16 : 28, look);
  }

  laser(from: THREE.Vector3, to: THREE.Vector3): void {
    const core = new THREE.Mesh(this.beamGeo, this.beamMat.clone());
    const halo = new THREE.Mesh(this.beamGeo, this.haloMat.clone());
    halo.scale.set(2.8, 1, 2.8);
    const group = new THREE.Group();
    group.add(halo, core);
    this.placeBeam(group, from, to);
    core.layers.enable(BLOOM_LAYER);
    halo.layers.enable(BLOOM_LAYER);
    this.scene.add(group);
    this.lasers.push({ mesh: group, life: reducedMotion ? 0.05 : 0.13, max: 0.13 });
  }

  flash(at: THREE.Vector3, scale = 0.7): void {
    this.sprite(at, this.flashMat, scale, reducedMotion ? 0.07 : 0.16, 2.4, 0xfff6e4, 3.2);
  }

  impact(at: THREE.Vector3): void {
    this.sprite(at, this.flashMat, 0.42, 0.08, 2.4, 0xffffff, 5);
    this.sprite(at, this.fireMat, 0.6, 0.16, 1.8, 0xffc878, 2.4);
    this.spawnCloud(at, isPhone() ? 12 : 20, 0.55, this.sparkMat, 0.4, 0.3, 9);
    this.spawnCloud(at, isPhone() ? 8 : 14, 0.4, this.emberMat, 0.5, 1.1, 5);
    if (!isPhone()) this.spawnStreaks(at, 8, 0.55);
    this.lamp(at, 12, 8, 0.16);
  }

  shock(at: THREE.Vector3, scale = 1): void {
    this.spawnShell(at, 0.2, 0.42, 3.4 * scale);
  }

  burst(at: THREE.Vector3, hull: Hull, fail = false): void {
    const spec = fail ? SPEC.fail : SPEC[hull];
    const phone = isPhone() ? 0.5 : 1;
    const motion = reducedMotion ? 0.35 : 1;
    const k = spec.scale * phone;
    const hot = fail ? 0.45 : 1;
    this.exposureKick = Math.max(this.exposureKick, spec.kick * (isPhone() ? 0.55 : 1));
    this.lamp(at, 28 + k * 10, 10 + k * 2.2, 0.32);
    this.spawnBall(at, k * 0.55, 0.48 + k * 0.03, k * 1.15, hot);
    this.spawnBall(at, k * 0.22, 0.22, k * 0.42, 1);
    this.spawnShell(at, k * 0.18, 0.38, k * 1.55);
    this.sprite(at, this.flashMat, k * 1.8, 0.1, 1.55, 0xffffff, 8);
    this.sprite(at, this.flashMat, k * 1.15, 0.18, 1.9, fail ? 0xff6a30 : 0xffc878, 3.4);
    this.sprite(at, this.fireMat, k * 0.95, 0.55, 2.4, fail ? 0xff7a44 : 0xffe2b0, 2.2);
    this.sprite(at, this.fireMat, k * 0.48, 0.28, 1.8, 0xfff6e8, 3.6);
    this.spawnCloud(at, Math.floor(spec.sparks * phone * motion), k, this.sparkMat, 0.65, 0.2, 18);
    this.spawnCloud(at, Math.floor(spec.embers * phone * motion), k * 0.95, this.emberMat, 1.05, 1.6, 10);
    if (!reducedMotion) this.spawnStreaks(at, Math.floor(spec.streaks * phone), k);
    if (!reducedMotion) this.spawnDebris(at, Math.floor(spec.debris * phone), k);
    if (!reducedMotion) {
      const stamp = this.gen;
      for (let i = 1; i < spec.pulses; i++) {
        window.setTimeout(() => {
          if (stamp !== this.gen) return;
          const o = new THREE.Vector3(
            at.x + (Math.random() - 0.5) * k * 1.35,
            at.y + (Math.random() - 0.5) * k * 0.95,
            at.z + (Math.random() - 0.5) * 0.4,
          );
          this.spawnBall(o, k * 0.22, 0.28, k * 0.48, hot);
          this.sprite(o, this.flashMat, k * 0.4, 0.1, 1.8, 0xffffff, 4);
          this.spawnCloud(o, Math.floor(spec.embers * 0.16 * phone), k * 0.35, this.emberMat, 0.45, 1.4, 6);
          this.lamp(o, 10 + k * 2, 7, 0.14);
        }, 80 * i);
      }
    }
  }

  pop(at: THREE.Vector3): void {
    this.sprite(at, this.flashMat, 0.55, 0.08, 2.1, 0xffffff, 5);
    this.sprite(at, this.fireMat, 0.7, 0.18, 1.7, 0xffc090, 2.2);
    this.spawnCloud(at, isPhone() ? 10 : 18, 0.5, this.sparkMat, 0.38, 0.3, 8);
    this.spawnCloud(at, isPhone() ? 6 : 12, 0.4, this.emberMat, 0.48, 1.4, 5);
    if (!isPhone()) this.spawnStreaks(at, 7, 0.45);
    this.lamp(at, 10, 7, 0.12);
  }

  sparks(at: THREE.Vector3, n: number): void {
    this.spawnCloud(at, n, 0.4, this.sparkMat, 0.4, 0.5, 8);
  }

  update(dt: number, camera: THREE.Camera): void {
    this.exposureKick = Math.max(0, this.exposureKick - dt * 2.4);

    for (let i = this.lamps.length - 1; i >= 0; i--) {
      const L = this.lamps[i]!;
      L.life -= dt;
      const u = Math.max(0, L.life / L.max);
      L.light.intensity = L.peak * u * u;
      if (L.life <= 0) {
        this.scene.remove(L.light);
        this.lamps.splice(i, 1);
      }
    }

    for (let i = this.volumes.length - 1; i >= 0; i--) {
      const v = this.volumes[i]!;
      v.life -= dt;
      const t = 1 - Math.max(0, v.life) / v.max;
      const ease = 1 - (1 - t) * (1 - t);
      v.mesh.scale.setScalar(0.12 + ease * v.grow);
      const mat = v.mesh.material as THREE.ShaderMaterial;
      if (mat.uniforms.uTime) mat.uniforms.uTime.value += dt;
      if (mat.uniforms.uFade) mat.uniforms.uFade.value = (1 - t) * (1 - t * 0.25);
      if (v.life <= 0) {
        this.scene.remove(v.mesh);
        mat.dispose();
        this.volumes.splice(i, 1);
      }
    }

    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i]!;
      s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(1 - 1.4 * dt);
      const u = Math.max(0, s.life / s.max);
      s.mesh.scale.x *= 1 + dt * 0.9;
      s.mesh.lookAt(camera.position);
      s.mesh.rotateZ(Math.atan2(s.vel.y, s.vel.x));
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = u;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        this.streaks.splice(i, 1);
      }
    }

    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const L = this.lasers[i]!;
      L.life -= dt;
      const a = Math.max(0, L.life / L.max);
      L.mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material instanceof THREE.MeshBasicMaterial) {
          m.material.opacity = a * (m.material.color.getHex() === 0xe8a15a ? 0.28 : 0.95);
        }
      });
      if (L.life <= 0) {
        this.scene.remove(L.mesh);
        this.lasers.splice(i, 1);
      }
    }

    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i]!;
      s.life -= dt;
      const t = 1 - Math.max(0, s.life) / s.max;
      const ease = 1 - (1 - t) * (1 - t);
      s.mesh.scale.setScalar(0.15 + ease * s.grow);
      s.mesh.rotation.z += s.spin * dt;
      s.mesh.lookAt(camera.position);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * (1 - t * 0.35);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        this.sprites.splice(i, 1);
      }
    }

    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const b = this.clouds[i]!;
      b.life -= dt;
      const pos = b.points.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let p = 0; p < pos.count; p++) {
        b.vel[p * 3]! *= 1 - b.drag * dt;
        b.vel[p * 3 + 1]! *= 1 - b.drag * dt;
        b.vel[p * 3 + 2]! *= 1 - b.drag * dt;
        b.vel[p * 3 + 1]! -= b.grav * dt;
        pos.setXYZ(
          p,
          pos.getX(p) + b.vel[p * 3]! * dt,
          pos.getY(p) + b.vel[p * 3 + 1]! * dt,
          pos.getZ(p) + b.vel[p * 3 + 2]! * dt,
        );
      }
      pos.needsUpdate = true;
      const mat = b.points.material as THREE.PointsMaterial;
      const u = Math.max(0, b.life / b.max);
      mat.opacity = u;
      mat.size = mat.userData.baseSize * (0.65 + u * 0.7);
      if (b.life <= 0) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.clouds.splice(i, 1);
      }
    }

    for (let i = this.shards.length - 1; i >= 0; i--) {
      const d = this.shards[i]!;
      d.life -= dt;
      d.vel.y -= 9 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      d.mesh.scale.setScalar(Math.max(0.04, d.life / d.max) * 0.7);
      if (d.mesh.material instanceof THREE.MeshBasicMaterial) {
        d.mesh.material.opacity = Math.max(0, d.life / d.max);
      }
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        (d.mesh.material as THREE.Material).dispose();
        this.shards.splice(i, 1);
      }
    }
  }

  clear(): void {
    this.gen += 1;
    this.exposureKick = 0;
    for (const L of this.lasers) this.scene.remove(L.mesh);
    for (const s of this.sprites) {
      this.scene.remove(s.mesh);
      (s.mesh.material as THREE.Material).dispose();
    }
    for (const c of this.clouds) {
      this.scene.remove(c.points);
      c.points.geometry.dispose();
      (c.points.material as THREE.Material).dispose();
    }
    for (const d of this.shards) {
      this.scene.remove(d.mesh);
      (d.mesh.material as THREE.Material).dispose();
    }
    for (const v of this.volumes) {
      this.scene.remove(v.mesh);
      (v.mesh.material as THREE.Material).dispose();
    }
    for (const s of this.streaks) {
      this.scene.remove(s.mesh);
      (s.mesh.material as THREE.Material).dispose();
    }
    for (const L of this.lamps) this.scene.remove(L.light);
    this.lasers.length = 0;
    this.sprites.length = 0;
    this.clouds.length = 0;
    this.shards.length = 0;
    this.volumes.length = 0;
    this.streaks.length = 0;
    this.lamps.length = 0;
  }

  private sprite(
    at: THREE.Vector3,
    proto: THREE.MeshBasicMaterial,
    scale: number,
    life: number,
    grow: number,
    tint?: number,
    hdr = 1,
  ): void {
    const mat = proto.clone();
    if (tint !== undefined) mat.color.setHex(tint);
    if (hdr > 1) mat.color.multiplyScalar(hdr);
    const mesh = new THREE.Mesh(this.planeGeo, mat);
    mesh.position.copy(at);
    mesh.scale.setScalar(scale * 0.2);
    mesh.rotation.z = Math.random() * Math.PI;
    mesh.layers.enable(BLOOM_LAYER);
    this.scene.add(mesh);
    this.sprites.push({ mesh, life, max: life, grow: scale * grow, spin: (Math.random() - 0.5) * 4 });
  }

  private spawnBall(at: THREE.Vector3, start: number, life: number, grow: number, hot: number): void {
    const mesh = new THREE.Mesh(this.ballGeo, fireballMat(hot));
    mesh.position.copy(at);
    mesh.scale.setScalar(start);
    mesh.layers.enable(BLOOM_LAYER);
    this.scene.add(mesh);
    this.volumes.push({ mesh, life, max: life, grow });
  }

  private spawnShell(at: THREE.Vector3, start: number, life: number, grow: number): void {
    const mesh = new THREE.Mesh(this.shellGeo, shellMat());
    mesh.position.copy(at);
    mesh.scale.setScalar(start);
    mesh.layers.enable(BLOOM_LAYER);
    this.scene.add(mesh);
    this.volumes.push({ mesh, life, max: life, grow });
  }

  private spawnStreaks(at: THREE.Vector3, count: number, scale: number): void {
    const n = Math.max(4, count);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI;
      _dir.set(Math.cos(a) * Math.sin(e), Math.cos(e) * 0.75, Math.sin(a) * Math.sin(e) * 0.7).normalize();
      const speed = (6 + Math.random() * 14) * scale;
      const mat = new THREE.MeshBasicMaterial({
        map: this.streakMap,
        color: new THREE.Color(6.5, 4.2, 1.6),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: true,
        premultipliedAlpha: true,
      });
      const mesh = new THREE.Mesh(this.streakGeo, mat);
      mesh.position.copy(at);
      mesh.scale.set(0.7 + Math.random() * 1.3 * scale, 0.055 + Math.random() * 0.04, 1);
      mesh.layers.enable(BLOOM_LAYER);
      this.scene.add(mesh);
      this.streaks.push({
        mesh,
        vel: _dir.clone().multiplyScalar(speed),
        life: 0.3 + Math.random() * 0.3,
        max: 0.6,
      });
    }
  }

  private lamp(at: THREE.Vector3, peak: number, distance: number, life: number): void {
    if (isPhone() || reducedMotion) return;
    if (this.lamps.length >= 4) {
      const old = this.lamps.shift()!;
      this.scene.remove(old.light);
    }
    const light = new THREE.PointLight(0xffd4a0, peak, distance, 2);
    light.position.copy(at);
    this.scene.add(light);
    this.lamps.push({ light, life, max: life, peak });
  }

  private spawnCloud(
    at: THREE.Vector3,
    count: number,
    scale: number,
    proto: THREE.PointsMaterial,
    life: number,
    grav: number,
    speed: number,
    bloom = true,
  ): void {
    const n = Math.max(4, count);
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = at.x;
      pos[i * 3 + 1] = at.y;
      pos[i * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI;
      const s = (speed * 0.35 + Math.random() * speed) * scale;
      vel[i * 3] = Math.cos(a) * Math.sin(e) * s;
      vel[i * 3 + 1] = Math.cos(e) * s * 0.75 + scale * 0.8;
      vel[i * 3 + 2] = Math.sin(a) * Math.sin(e) * s * 0.55;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = proto.clone();
    mat.userData.baseSize = proto.size * (0.7 + scale * 0.25);
    mat.size = mat.userData.baseSize;
    const points = new THREE.Points(geo, mat);
    if (bloom) points.layers.enable(BLOOM_LAYER);
    this.scene.add(points);
    this.clouds.push({ points, vel, life, max: life, drag: 0.8, grav });
  }

  private spawnDebris(at: THREE.Vector3, count: number, scale: number): void {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.shardGeo, this.shardMat.clone());
      mesh.layers.enable(BLOOM_LAYER);
      mesh.position.copy(at);
      mesh.scale.setScalar(0.35 + Math.random() * 0.7);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const a = Math.random() * Math.PI * 2;
      const s = (3 + Math.random() * 8) * scale;
      const vel = new THREE.Vector3(Math.cos(a) * s, 2 + Math.random() * 6, (Math.random() - 0.5) * s);
      this.scene.add(mesh);
      this.shards.push({
        mesh,
        vel,
        spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12),
        life: 0.7 + Math.random() * 0.7,
        max: 1.4,
      });
    }
  }

  private placeBeam(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
    _dir.copy(to).sub(from);
    const len = Math.max(0.05, _dir.length());
    _mid.copy(from).add(to).multiplyScalar(0.5);
    obj.position.copy(_mid);
    obj.scale.set(1, len, 1);
    obj.quaternion.setFromUnitVectors(Y_UP, _dir.normalize());
  }
}

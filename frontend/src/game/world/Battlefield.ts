import * as THREE from "three";
import { gunshipWorldScale, isPhone, keyboardReserve } from "../systems/layout";
import { reducedMotion } from "../systems/motion";
import { addFleetLights, envMap, fbm, planetAtmosphere, planetMaterial } from "../vfx/forge";
import { cloneHull, initFleet } from "./fleet";
import { FxRig } from "./fx";
import { BLOOM_LAYER } from "./layers";
import { createWorldRenderer, type WorldRenderer } from "./renderer";

const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _size = new THREE.Vector3();
const _box = new THREE.Box3();
const PLAY = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

function nebulaTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm((x / w) * 4.2, (y / h) * 2.4, 19, 5);
      const n2 = fbm((x / w) * 7, (y / h) * 4, 41, 4);
      const dx = x / w - 0.5;
      const dy = y / h - 0.5;
      const fall = Math.max(0, 1 - Math.sqrt(dx * dx * 2.4 + dy * dy * 3.2) * 1.7);
      const a = Math.min(1, Math.max(0, n - 0.38) * fall * 1.8);
      const i = (y * w + x) * 4;
      img.data[i] = (110 + n2 * 90) * a;
      img.data[i + 1] = (48 + n * 40) * a;
      img.data[i + 2] = (28 + n2 * 22) * a;
      img.data[i + 3] = a * 210;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function starfield(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(90, 32, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform float uTime;
      float hash(vec3 p) {
        p = fract(p * vec3(443.897, 397.297, 491.187));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }
      void main() {
        vec3 d = normalize(vDir);
        float lat = d.y * 0.5 + 0.5;
        vec3 neb = vec3(0.09, 0.05, 0.035) * (0.35 + lat * 0.5);
        neb += vec3(0.16, 0.06, 0.03) * pow(max(0.0, d.x * 0.4 + 0.2), 2.0);
        float field = 0.0;
        for (int i = 0; i < 3; i++) {
          float s = 80.0 + float(i) * 70.0;
          vec3 g = floor(d * s);
          float n = hash(g + float(i) * 17.0);
            if (n > 0.968 - float(i) * 0.006) {
            vec3 f = fract(d * s) - 0.5;
            float dist = length(f);
            float tw = 0.65 + 0.35 * sin(uTime * (2.0 + n * 6.0) + n * 40.0);
            field += smoothstep(0.1, 0.0, dist) * tw * (0.7 + float(i) * 0.35);
          }
        }
        vec3 star = vec3(1.0, 0.94, 0.84) * field * 0.7;
        gl_FragColor = vec4(neb + star, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

export class Battlefield {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  readonly fx: FxRig;
  readonly gunship: THREE.Group;
  readonly aegis: THREE.Mesh;
  width = 1;
  height = 1;
  combat = false;

  private readonly gfx: WorldRenderer;
  private readonly ray = new THREE.Raycaster();
  private readonly stars: THREE.Mesh;
  private readonly planet: THREE.Mesh;
  private readonly dust: THREE.Mesh[] = [];
  private readonly camBase = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3(0, 0.8, 0);
  private readonly gunMuzzle = new THREE.Vector3();
  private shakeAmp = 0;
  private shakeLeft = 0;
  private clock = 0;
  private gunSX = 0;
  private gunSY = 0;
  private onResize = () => this.fit();

  constructor(host: HTMLElement) {
    initFleet();
    this.gfx = createWorldRenderer(host);
    this.canvas = this.gfx.canvas;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.2, 200);
    this.scene.environment = envMap(this.gfx.renderer);
    addFleetLights(this.scene);

    this.stars = starfield();
    this.scene.add(this.stars);

    const detail = isPhone() ? 3 : 5;
    this.planet = new THREE.Mesh(new THREE.IcosahedronGeometry(7.4, detail), planetMaterial());
    this.planet.rotation.z = 0.34;
    this.scene.add(this.planet);

    const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(8.05, isPhone() ? 2 : 3), planetAtmosphere());
    this.planet.add(halo);

    const dustTex = nebulaTexture();
    for (let i = 0; i < (isPhone() ? 2 : 4); i++) {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(38, 18),
        new THREE.MeshBasicMaterial({
          map: dustTex,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      plane.position.set((i - 1.4) * 10, 4 + i * 1.4, -18 - i * 4);
      plane.rotation.z = i * 0.18;
      this.dust.push(plane);
      this.scene.add(plane);
    }

    this.gunship = cloneHull("gunship");
    this.gunship.rotation.x = -0.5;
    this.scene.add(this.gunship);

    this.aegis = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.035, 8, 48),
      new THREE.MeshBasicMaterial({
        color: 0xe8a15a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.aegis.rotation.x = Math.PI / 2.4;
    this.aegis.layers.enable(BLOOM_LAYER);
    this.scene.add(this.aegis);

    this.fx = new FxRig(this.scene);
    window.addEventListener("resize", this.onResize);
    this.fit();
  }

  get now(): number {
    return this.clock * 1000;
  }

  fit(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.gfx.resize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.fov = isPhone() ? 36 : 32;
    this.camera.updateProjectionMatrix();
    this.camBase.set(0, isPhone() ? -5.4 : -8.4, isPhone() ? 32 : 36);
    this.camera.position.copy(this.camBase);
    this.lookAt.set(0, isPhone() ? 1.8 : 3.0, 0);
    this.camera.lookAt(this.lookAt);
    this.layoutDeck();
    this.planet.position.set(isPhone() ? 10 : 16, isPhone() ? 7 : 11, -30);
  }

  layoutDeck(): void {
    const w = this.width;
    const deck = this.height - keyboardReserve();
    const home = deck - (isPhone() ? 48 : 88);
    this.gunSX = w / 2;
    this.gunSY = home;
    this.place(this.gunship, this.gunSX, this.gunSY);
    this.gunship.scale.setScalar(gunshipWorldScale());
    this.aegis.position.copy(this.gunship.position);
    this.aegis.scale.setScalar(this.gunship.scale.x * 2.4);
  }

  setGunScreen(x: number, y: number): void {
    this.gunSX = x;
    this.gunSY = y;
    this.place(this.gunship, x, y);
    this.aegis.position.copy(this.gunship.position);
  }

  place(obj: THREE.Object3D, sx: number, sy: number): void {
    obj.position.copy(this.toWorld(sx, sy));
  }

  toWorld(sx: number, sy: number, target = _hit): THREE.Vector3 {
    _ndc.set((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
    this.ray.setFromCamera(_ndc, this.camera);
    const hit = this.ray.ray.intersectPlane(PLAY, target);
    if (!hit) target.set((sx / this.width - 0.5) * 20, (0.5 - sy / this.height) * 12, 0);
    return target;
  }

  toScreen(v: THREE.Vector3): { x: number; y: number } {
    _proj.copy(v).project(this.camera);
    return {
      x: (_proj.x * 0.5 + 0.5) * this.width,
      y: (-_proj.y * 0.5 + 0.5) * this.height,
    };
  }

  screenSize(obj: THREE.Object3D): { w: number; h: number } {
    _box.setFromObject(obj);
    _box.getSize(_size);
    const a = this.toScreen(_box.min);
    const b = this.toScreen(_box.max);
    return { w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }

  muzzle(): THREE.Vector3 {
    this.gunMuzzle.copy(this.gunship.position);
    this.gunMuzzle.y += 1.15 * this.gunship.scale.y;
    this.gunMuzzle.z += 0.2;
    return this.gunMuzzle;
  }

  gunScreen(): { x: number; y: number } {
    return this.toScreen(this.gunship.position);
  }

  setCombat(on: boolean): void {
    this.combat = on;
    this.gunship.visible = true;
  }

  setAegis(on: boolean): void {
    const mat = this.aegis.material as THREE.MeshBasicMaterial;
    mat.opacity = on ? 0.55 : 0;
  }

  setSurge(on: boolean): void {
    this.gunship.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !(mesh.material instanceof THREE.MeshStandardMaterial)) return;
      mesh.material.emissive.setHex(on ? 0x4a2a10 : 0x000000);
      mesh.material.emissiveIntensity = on ? 0.35 : 0;
    });
  }

  pulseEngines(root: THREE.Object3D, duty: number, t: number): void {
    root.traverse((o) => {
      if (!o.userData.engine) return;
      const mesh = o as THREE.Mesh;
      const stall = duty < 0.35;
      const jitter = Math.sin(t * 38 + mesh.id) * 0.12 + Math.sin(t * 71) * 0.06;
      const kick = stall
        ? Math.random() < 0.18
          ? 0.55 + Math.random() * 1.1
          : 0.04 + Math.random() * 0.14
        : (0.72 + duty * 0.5) * (1 + jitter);
      mesh.scale.set(kick, kick, 1);
      if (mesh.material instanceof THREE.MeshBasicMaterial) {
        mesh.material.transparent = true;
        mesh.material.color.setHex(stall ? (Math.random() < 0.45 ? 0xff2a12 : 0xff7a32) : 0xffcf8a);
        mesh.material.opacity = stall ? kick * 0.75 : 0.45 + duty * 0.55;
      }
    });
  }

  shake(ms: number, amp: number): void {
    if (reducedMotion) return;
    this.shakeLeft = Math.max(this.shakeLeft, ms / 1000);
    this.shakeAmp = Math.max(this.shakeAmp, amp * 18);
  }

  later(ms: number, fn: () => void): number {
    return window.setTimeout(fn, ms);
  }

  update(dt: number): void {
    this.clock += dt;
    const t = this.clock;
    const starMat = this.stars.material as THREE.ShaderMaterial;
    starMat.uniforms.uTime!.value = t;
    this.planet.rotation.y += dt * 0.04;
    for (let i = 0; i < this.dust.length; i++) {
      this.dust[i]!.position.x += Math.sin(t * 0.07 + i) * dt * 0.08;
    }

    const bob = this.combat && !reducedMotion ? Math.sin(t * 1.85) * (isPhone() ? 2 : 4.5) : 0;
    this.place(this.gunship, this.gunSX, this.gunSY + bob);
    if (this.combat) this.pulseEngines(this.gunship, 1, t);

    this.aegis.position.copy(this.gunship.position);
    this.aegis.rotation.z += dt * 0.7;
    if ((this.aegis.material as THREE.MeshBasicMaterial).opacity > 0) {
      const pulse = 0.48 + Math.sin(t * 6) * 0.12;
      (this.aegis.material as THREE.MeshBasicMaterial).opacity = pulse;
    }

    if (this.shakeLeft > 0) {
      this.shakeLeft -= dt;
      const k = this.shakeAmp * (this.shakeLeft > 0 ? 1 : 0);
      this.camera.position.set(
        this.camBase.x + (Math.random() - 0.5) * k,
        this.camBase.y + (Math.random() - 0.5) * k * 0.6,
        this.camBase.z,
      );
      this.camera.lookAt(this.lookAt);
      if (this.shakeLeft <= 0) {
        this.camera.position.copy(this.camBase);
        this.camera.lookAt(this.lookAt);
        this.shakeAmp = 0;
      }
    }

    this.fx.update(dt, this.camera);
  }

  startLoop(tick: (dt: number) => void): void {
    const clock = new THREE.Clock();
    this.gfx.renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.04);
      this.update(dt);
      tick(dt);
      this.render();
    });
  }

  render(): void {
    this.gfx.renderer.toneMappingExposure = 1.12 + this.fx.exposureKick;
    this.gfx.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.fx.clear();
    this.gfx.dispose();
  }
}

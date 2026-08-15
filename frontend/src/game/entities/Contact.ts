import * as THREE from "three";
import { hullWorldScale, isPhone } from "../systems/layout";
import { reducedMotion } from "../systems/motion";
import type { Hull } from "../types";
import { cloneHull } from "../world/fleet";
import { craterMap, flameMap, woundMap, type WoundEmitter } from "../world/fx";
import { BLOOM_LAYER } from "../world/layers";
import type { Battlefield } from "../world/Battlefield";

export type { Hull };

type Mark = { crater: THREE.Mesh; glow: THREE.Mesh; lick: THREE.Mesh | null; spin: number; kind: WoundKind; pulse: number };
type Jet = { mesh: THREE.Mesh; phase: number; dead: boolean };
type Rock = "lurch" | "shimmy" | "list" | "settle";
type Stall = "cough" | "die" | "surge" | "uneven";
type WoundKind = "scorch" | "gash" | "vent" | "flare" | "hole";
type Tint = { r: number; g: number; b: number; emit: number };

const ROCKS: Rock[] = ["lurch", "shimmy", "list", "settle"];
const STALLS: Stall[] = ["cough", "die", "surge", "uneven"];
const KINDS: WoundKind[] = ["scorch", "gash", "vent", "flare", "hole"];
const TINTS: Tint[] = [
  { r: 62, g: 38, b: 28, emit: 0x3a1208 },
  { r: 48, g: 46, b: 44, emit: 0x1a1814 },
  { r: 92, g: 40, b: 16, emit: 0x5a1408 },
  { r: 38, g: 50, b: 58, emit: 0x081018 },
  { r: 72, g: 36, b: 48, emit: 0x2a0810 },
  { r: 54, g: 42, b: 28, emit: 0x2a1808 },
];
const GLOWS = [0xff8a40, 0xff5a22, 0xffd060, 0xff4020, 0xffc8a0, 0xff6a88];
const SMOKES = [0x6a5348, 0x3a3834, 0x4a3024, 0x2a2c30, 0x5a4030];
const FIRES = [0xff7a32, 0xff5520, 0xffb040, 0xff3a18, 0xff8866];
const FLASHES = [0xfff4e2, 0xffd0a0, 0xff8a50, 0xffe8c8];

function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(Math.random() * xs.length)]!;
}

let nextId = 1;

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const CRATER_TEX = craterMap();
const WOUND_TEX = woundMap();
const FLAME_TEX = flameMap();
const DECAL_GEO = new THREE.PlaneGeometry(1, 1);
const JET_GEO = new THREE.PlaneGeometry(0.32, 1.02);
const _world = new THREE.Vector3();

const SCORCH = new THREE.MeshBasicMaterial({
  map: CRATER_TEX,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  premultipliedAlpha: true,
  alphaTest: 0.08,
});
const WOUND = new THREE.MeshBasicMaterial({
  map: WOUND_TEX,
  color: 0xff8a40,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  premultipliedAlpha: true,
});
const LICK = new THREE.MeshBasicMaterial({
  map: FLAME_TEX,
  color: 0xffc878,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  premultipliedAlpha: true,
});
const JET = new THREE.MeshBasicMaterial({
  map: FLAME_TEX,
  color: 0xffb060,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  premultipliedAlpha: true,
});

export class Contact {
  readonly id = `c${nextId++}`;
  readonly hull: Hull;
  readonly mesh: THREE.Group;
  word: string;
  typed = 0;
  errors = 0;
  speedMul = 1;
  held = false;
  phases: string[] | null;
  phase = 0;
  sx: number;
  sy: number;
  private readonly world: Battlefield;
  private readonly reticle: THREE.Mesh;
  private readonly plume: WoundEmitter;
  private readonly marks: Mark[] = [];
  private readonly jets: Jet[] = [];
  private readonly seed: number;
  private readonly phaseOffset = Math.random() * Math.PI * 2;
  private readonly rock: Rock = pick(ROCKS);
  private readonly stall: Stall = pick(STALLS);
  private readonly tint: Tint = pick(TINTS);
  private readonly flashHex = pick(FLASHES);
  private readonly blotch = 0.15 + Math.random() * 0.7;
  private readonly sideBias = Math.random() < 0.45 ? (Math.random() < 0.5 ? -1 : 1) : 0;
  private readonly hitSide = Math.random() < 0.5 ? 1 : -1;
  private readonly spring = 9 + Math.random() * 5;
  private readonly damp = 9 + Math.random() * 4;
  private readonly limpAmp = 0.01 + Math.random() * 0.028;
  private readonly limpRate = 1.2 + Math.random() * 2.4;
  private readonly basePitch: number;
  private readonly engineDiscs: THREE.Mesh[] = [];
  private flashUntil = 0;
  private flicker = 0;
  private flameDuty = 1;
  private flameTimer = 0;
  private yaw = 0;
  private kickZ = 0;
  private kickX = 0;
  private velZ = 0;
  private velX = 0;
  private list = 0;
  private readonly baseColor = new Map<THREE.MeshStandardMaterial, number>();
  private halfW = 40;

  constructor(world: Battlefield, x: number, y: number, word: string, hull: Hull, phases?: string[]) {
    this.world = world;
    this.word = word;
    this.hull = hull;
    this.phases = phases ?? null;
    this.sx = x;
    this.sy = y;
    this.seed = Math.floor(Math.random() * 1e9);

    this.mesh = cloneHull(hull);
    this.mesh.scale.setScalar(hullWorldScale(hull));
    this.basePitch = hull === "supply" ? 0.55 : -0.4 - Math.random() * 0.14;
    this.mesh.rotation.x = this.basePitch;
    this.mesh.rotation.z = hull === "supply" ? 0 : Math.PI;
    world.scene.add(this.mesh);
    this.plume = world.fx.wound(this.mesh, {
      smoke: pick(SMOKES),
      fire: pick(FIRES),
      smokeSize: 0.5 + Math.random() * 0.45,
      fireSize: 0.2 + Math.random() * 0.22,
      engineBias: 0.25 + Math.random() * 0.65,
      rate: 0.65 + Math.random() * 0.9,
    });
    this.mountJets();

    this.mesh.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.material instanceof THREE.MeshStandardMaterial) {
        this.baseColor.set(mesh.material, mesh.material.color.getHex());
      }
    });

    this.reticle = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.03, 6, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffbe6e,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.reticle.rotation.x = Math.PI / 2.6;
    this.reticle.visible = false;
    this.reticle.layers.enable(BLOOM_LAYER);
    world.scene.add(this.reticle);
    this.syncPose();
    this.halfW = Math.max(16, world.screenSize(this.mesh).w * 0.5);
  }

  get x(): number {
    return this.sx;
  }

  get y(): number {
    return this.sy;
  }

  get done(): boolean {
    return this.typed >= this.word.length;
  }

  get integrity(): number {
    return this.typed / Math.max(1, this.word.length);
  }

  get screenH(): number {
    return this.world.screenSize(this.mesh).h;
  }

  lock(on: boolean): void {
    this.reticle.visible = on;
  }

  lift(px: number): void {
    this.sy = Math.max(-40, this.sy - px);
    this.syncPose();
  }

  advanceBoss(): boolean {
    if (!this.phases) return false;
    this.phase += 1;
    if (this.phase >= this.phases.length) return false;
    this.word = this.phases[this.phase]!;
    this.typed = 0;
    this.errors = 0;
    this.speedMul = 1;
    return true;
  }

  strike(): { x: number; y: number } {
    const mark = this.placeMark(0.52 + this.integrity * 0.55 + Math.random() * 0.22);
    this.flashUntil = this.world.now + (40 + Math.random() * 90);
    this.paintHull();
    if (mark.lick) mark.lick.visible = mark.kind === "flare" || mark.kind === "vent" || Math.random() < 0.55;
    this.plume.hurt = this.integrity;
    this.plume.cough();
    if (mark.kind === "vent") this.plume.addVent(mark.crater.position);
    this.recoil();
    if (this.hull !== "supply") {
      this.flameDuty = this.stall === "surge" ? 0.02 : 0.04 + Math.random() * 0.1;
      this.flameTimer = 0.06 + Math.random() * 0.16;
      if ((this.stall === "die" || Math.random() < 0.4) && this.jets.length) {
        const live = this.jets.map((_, i) => i).filter((i) => !this.jets[i]!.dead);
        if (live.length) this.jets[pick(live)]!.dead = true;
      }
    }
    const p = this.world.toScreen(mark.crater.getWorldPosition(_world));
    return p;
  }

  scarPhase(): void {
    this.placeMark(1.0);
    this.placeMark(0.82);
    this.flashUntil = this.world.now + 140;
    this.paintHull();
    this.plume.hurt = Math.max(this.plume.hurt, 0.55);
    this.plume.cough();
    this.recoil();
    for (const m of this.marks) {
      if (m.lick) m.lick.visible = m.kind !== "scorch" && m.kind !== "hole";
      if (m.kind === "vent") this.plume.addVent(m.crater.position);
    }
  }

  update(dt: number, fall: number, sway: number): void {
    const px = this.sx;
    const py = this.sy;
    this.sy += fall * this.speedMul * dt;
    this.sx += Math.sin(this.sy * 0.01 + this.sx * 0.004) * sway * dt;
    this.keepOnScreen();
    this.syncPose();

    const hurt = this.integrity;
    const vx = this.sx - px;
    const vy = this.sy - py;
    const want = Math.atan2(vx, Math.max(0.001, vy));
    const target = Math.max(-0.14, Math.min(0.14, want));
    this.yaw += (target - this.yaw) * Math.min(1, dt * 5);
    this.stepRock(dt, hurt);
    if (this.hull === "supply") {
      this.mesh.rotation.z += dt * (0.22 + hash(this.seed) * 0.28);
    } else {
      const limp = reducedMotion ? 0 : Math.sin((this.world.now / 1000) * this.limpRate + this.phaseOffset) * this.limpAmp * hurt;
      this.mesh.rotation.z = Math.PI + this.yaw + this.kickZ + this.list * hurt + limp;
      this.mesh.rotation.x = this.basePitch;
    }

    this.flicker += dt;
    this.plume.hurt = hurt;
    this.plume.update(dt);
    if (this.hull !== "supply") this.stepStall(dt, hurt);
    this.world.pulseEngines(this.mesh, this.hull === "supply" ? 1 : this.flameDuty, this.flicker);
    this.dimDeadEngines();
    this.syncJets(hurt);
    this.syncMarks();

    this.reticle.position.copy(this.mesh.position);
    this.reticle.scale.setScalar(this.mesh.scale.x * (this.hull === "capital" ? 3.2 : 2.1));
    this.reticle.rotation.z += dt * 1.2;

    if (this.world.now < this.flashUntil) this.flashWhite(true);
    else this.paintHull();
  }

  destroy(): void {
    this.plume.dispose();
    for (const m of this.marks) {
      this.mesh.remove(m.crater, m.glow);
      if (m.lick) this.mesh.remove(m.lick);
    }
    this.marks.length = 0;
    for (const j of this.jets) this.mesh.remove(j.mesh);
    this.jets.length = 0;
    this.world.scene.remove(this.mesh);
    this.world.scene.remove(this.reticle);
    this.reticle.geometry.dispose();
    (this.reticle.material as THREE.Material).dispose();
  }

  private syncPose(): void {
    this.world.place(this.mesh, this.sx, this.sy);
  }

  private keepOnScreen(): void {
    const w = this.world.width;
    const half = this.halfW;
    const inset = isPhone() ? 12 : 20;
    const minX = Math.min(inset + half, w * 0.28);
    const maxX = w - minX;
    this.sx = maxX > minX ? Math.min(Math.max(this.sx, minX), maxX) : w / 2;
  }

  private recoil(): void {
    if (reducedMotion) return;
    const p = 0.22 + Math.random() * 0.16;
    switch (this.rock) {
      case "lurch":
        this.velZ += this.hitSide * p * 0.48;
        break;
      case "shimmy":
        this.velZ += this.hitSide * p * 0.28;
        break;
      case "list":
        this.list = Math.max(-0.045, Math.min(0.045, this.list + this.hitSide * 0.01));
        this.velZ += this.hitSide * p * 0.22;
        break;
      case "settle":
        this.velZ += this.hitSide * p * 0.18;
        break;
    }
  }

  private stepRock(dt: number, _hurt: number): void {
    this.velZ += -this.kickZ * this.spring * dt;
    this.velZ *= Math.exp(-this.damp * dt);
    this.kickZ += this.velZ * dt;
    this.kickZ = Math.max(-0.05, Math.min(0.05, this.kickZ));
    this.kickX = 0;
    this.velX = 0;
  }

  private stepStall(dt: number, hurt: number): void {
    if (hurt < 0.05) {
      this.flameDuty = 1;
      this.flameTimer = 0;
      return;
    }
    this.flameTimer -= dt;
    if (this.flameTimer > 0) return;
    if (this.stall === "die" && hurt > 0.45 && this.jets.every((j) => j.dead || Math.random() < 0.35)) {
      this.flameDuty = 0.06 + Math.random() * 0.08;
      this.flameTimer = 0.2 + Math.random() * 0.35;
      if (Math.random() < 0.4) this.plume.cough();
      return;
    }
    if (this.flameDuty > 0.5) {
      this.flameDuty = this.stall === "surge" ? 0.02 : 0.04 + Math.random() * 0.1;
      this.flameTimer =
        this.stall === "surge" ? 0.12 + Math.random() * 0.1 : 0.04 + Math.random() * 0.12;
      this.plume.cough();
    } else {
      this.flameDuty = this.stall === "surge" ? 0.85 + Math.random() * 0.3 : 0.5 + Math.random() * 0.55;
      const hold =
        this.stall === "surge"
          ? 0.35 + Math.random() * 0.45
          : this.stall === "uneven"
            ? 0.05 + Math.random() * 0.22
            : Math.max(0.07, (0.24 - hurt * 0.16) * (0.4 + Math.random() * 0.65));
      this.flameTimer = hold;
    }
  }

  private mountJets(): void {
    if (this.hull === "supply") return;
    this.mesh.updateMatrixWorld(true);
    const nozzles: THREE.Vector3[] = [];
    this.mesh.traverse((o) => {
      if (!o.userData.engine) return;
      this.engineDiscs.push(o as THREE.Mesh);
      nozzles.push(this.mesh.worldToLocal(o.getWorldPosition(_world).clone()));
    });
    for (const local of nozzles) {
      const jet = new THREE.Mesh(JET_GEO, JET.clone());
      jet.position.copy(local);
      jet.position.y -= 0.62;
      jet.position.z += 0.1;
      jet.visible = false;
      jet.layers.enable(BLOOM_LAYER);
      this.mesh.add(jet);
      this.jets.push({ mesh: jet, phase: Math.random() * Math.PI * 2, dead: false });
    }
  }

  private dimDeadEngines(): void {
    for (let i = 0; i < this.engineDiscs.length; i++) {
      if (!this.jets[i]?.dead) continue;
      const disc = this.engineDiscs[i]!;
      disc.scale.set(0.12, 0.12, 1);
      if (disc.material instanceof THREE.MeshBasicMaterial) {
        disc.material.color.setHex(0x2a140c);
        disc.material.opacity = 0.2;
      }
    }
  }

  private syncJets(hurt: number): void {
    const stall = this.flameDuty < 0.35;
    for (const jet of this.jets) {
      const mat = jet.mesh.material as THREE.MeshBasicMaterial;
      if (jet.dead) {
        jet.mesh.visible = hurt > 0.08;
        const cough = Math.random() < 0.12 ? 0.35 + Math.random() * 0.5 : 0.04;
        jet.mesh.scale.set(0.35 + cough * 0.2, 0.4 + cough * 0.8, 1);
        mat.opacity = cough * 0.45;
        mat.color.setHex(0x4a2014);
        continue;
      }
      if (hurt < 0.04 && !stall) {
        jet.mesh.visible = false;
        continue;
      }
      jet.mesh.visible = true;
      const flicker = stall
        ? Math.random() < 0.4
          ? 0.45 + Math.random() * 1.35
          : 0.04 + Math.random() * 0.12
        : 0.65 + Math.sin(this.flicker * (22 + jet.phase * 4) + jet.phase) * 0.28 + hurt * 0.35;
      jet.mesh.scale.set(0.42 + flicker * 0.32, 0.55 + flicker * 1.15, 1);
      mat.opacity = Math.min(1, flicker * (0.35 + hurt * 0.7));
      mat.color.setHex(stall ? GLOWS[Math.floor(hash(jet.phase * 40) * GLOWS.length)]! : hurt > 0.45 ? 0xff7a32 : 0xffc878);
    }
  }

  private syncMarks(): void {
    const t = this.world.now / 1000;
    for (const m of this.marks) {
      const freq = 10 + m.pulse * 16;
      if (m.glow) {
        const pulse = 0.4 + Math.sin(t * freq + m.spin) * 0.28 + (m.kind === "flare" ? 0.15 : 0);
        (m.glow.material as THREE.MeshBasicMaterial).opacity = pulse;
        m.glow.scale.setScalar(0.85 + pulse * 0.3);
      }
      if (m.lick && m.lick.visible) {
        const lick = 0.55 + Math.sin(t * (18 + m.pulse * 14) + m.spin * 2) * 0.32 + Math.random() * 0.1;
        const tall = m.kind === "flare" ? 1.15 : m.kind === "vent" ? 0.85 : 0.7;
        m.lick.scale.set(0.55 + lick * 0.3, tall + lick * 0.65, 1);
        (m.lick.material as THREE.MeshBasicMaterial).opacity = 0.35 + lick * 0.55;
      }
    }
  }

  private placeMark(scale: number): Mark {
    const kind = pick(KINDS);
    const span = this.hull === "capital" ? 2.6 : this.hull === "dreadnought" ? 1.9 : this.hull === "cruiser" ? 1.45 : 1.15;
    const a = (hash(this.seed + this.marks.length * 17) + Math.random() * 0.35) * Math.PI * 2;
    const r = 0.2 + Math.random() * span;
    const crater = new THREE.Mesh(DECAL_GEO, SCORCH.clone());
    crater.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.42 + Math.random() * 0.14);
    const wide = kind === "gash" ? 1.35 + Math.random() * 0.5 : kind === "hole" ? 1.2 : 0.85 + Math.random() * 0.4;
    crater.scale.set(0.42 * scale * wide, 0.38 * scale * (kind === "gash" ? 0.45 : 1), 1);
    crater.rotation.z = a + (kind === "gash" ? Math.PI / 2 : 0);
    const glow = new THREE.Mesh(DECAL_GEO, WOUND.clone());
    (glow.material as THREE.MeshBasicMaterial).color.setHex(pick(GLOWS));
    glow.position.copy(crater.position);
    glow.position.z += 0.02;
    glow.scale.setScalar((kind === "hole" ? 0.52 : 0.38) * scale);
    glow.layers.enable(BLOOM_LAYER);
    const wantsLick = kind === "flare" || kind === "vent" || kind === "gash";
    const lick = wantsLick ? new THREE.Mesh(JET_GEO, LICK.clone()) : null;
    if (lick) {
      (lick.material as THREE.MeshBasicMaterial).color.setHex(pick(GLOWS));
      lick.position.set(crater.position.x, crater.position.y - 0.22 * scale, crater.position.z + 0.04);
      lick.scale.set(0.34 * scale, (kind === "flare" ? 0.72 : 0.5) * scale, 1);
      lick.visible = false;
      lick.layers.enable(BLOOM_LAYER);
      this.mesh.add(lick);
    }
    this.mesh.add(crater, glow);
    const mark = { crater, glow, lick, spin: a, kind, pulse: 0.4 + Math.random() };
    this.marks.push(mark);
    return mark;
  }

  private flashWhite(on: boolean): void {
    this.mesh.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !(mesh.material instanceof THREE.MeshStandardMaterial)) return;
      if (on) mesh.material.color.setHex(this.flashHex);
    });
  }

  private paintHull(): void {
    const t = this.integrity;
    this.mesh.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !(mesh.material instanceof THREE.MeshStandardMaterial)) return;
      const base = this.baseColor.get(mesh.material) ?? mesh.material.color.getHex();
      if (this.hull === "supply") {
        if (t < 0.02) mesh.material.color.setHex(base);
        else mesh.material.color.setRGB(mix(176, 48, t) / 255, mix(232, 56, t) / 255, mix(186, 40, t) / 255);
        return;
      }
      if (t < 0.02 && !this.held) {
        mesh.material.color.setHex(base);
        mesh.material.emissive.setHex(0x000000);
        return;
      }
      const local = this.mesh.worldToLocal(mesh.getWorldPosition(_world).clone());
      let k = t;
      if (this.sideBias !== 0 && Math.sign(local.x) !== this.sideBias && Math.abs(local.x) > 0.25) {
        k *= 0.18 + hash(this.seed + mesh.id) * 0.22;
      }
      const keep = hash(this.seed + mesh.id * 13);
      if (this.blotch > 0.45 && keep > 0.7) k *= 0.12 + keep * 0.15;
      else k *= 0.55 + keep * 0.5;
      const fromR = this.held ? 184 : 255;
      const fromG = this.held ? 196 : 244;
      const fromB = this.held ? 212 : 226;
      mesh.material.color.setRGB(
        mix(fromR, this.tint.r, k) / 255,
        mix(fromG, this.tint.g, k) / 255,
        mix(fromB, this.tint.b, k) / 255,
      );
      mesh.material.emissive.setHex(k > 0.18 ? this.tint.emit : 0x000000);
      mesh.material.emissiveIntensity = k * (0.25 + hash(this.seed + mesh.id * 7) * 0.4);
    });
  }
}

import * as THREE from "three";
import { isPhone } from "../systems/layout";
import { reducedMotion } from "../systems/motion";
import { BLOOM_LAYER } from "../world/layers";
import type { Battlefield } from "../world/Battlefield";

let nextId = 1;

export class Bolt {
  readonly id = `b${nextId++}`;
  readonly letter: string;
  readonly mesh: THREE.Group;
  sx: number;
  sy: number;
  private readonly world: Battlefield;
  private readonly sign: number;
  private readonly core: THREE.Mesh;
  private readonly glow: THREE.Mesh;
  private age = 0;
  private halfW = 16;

  constructor(world: Battlefield, x: number, y: number, letter: string, sign: number) {
    this.world = world;
    this.letter = letter;
    this.sign = sign;
    this.sx = x;
    this.sy = y;

    this.mesh = new THREE.Group();
    const scale = (isPhone() ? 0.22 : 0.34) * (0.88 + Math.abs(sign) * 0.06);
    this.core = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 1.15, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff7a44,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.glow = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 1.35, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff6a38,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.core.rotation.x = Math.PI;
    this.glow.rotation.x = Math.PI;
    this.core.layers.enable(BLOOM_LAYER);
    this.glow.layers.enable(BLOOM_LAYER);
    this.mesh.add(this.glow, this.core);
    this.mesh.scale.setScalar(scale);
    world.scene.add(this.mesh);
    this.syncPose();
    this.halfW = Math.max(8, world.screenSize(this.mesh).w * 0.45);
  }

  get x(): number {
    return this.sx;
  }

  get y(): number {
    return this.sy;
  }

  lift(px: number): void {
    this.sy = Math.max(-40, this.sy - px);
    this.syncPose();
  }

  update(dt: number, fall: number): void {
    this.age += dt;
    const fan = this.sign * (4 + this.age * 5);
    this.sx += fan * dt;
    this.sy += fall * dt;
    this.keepOnScreen();
    this.syncPose();
    this.mesh.rotation.z = Math.atan2(fan, fall);

    const pulse = reducedMotion ? 0 : Math.sin(this.age * 18 + this.sign) * 0.16;
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.32 + pulse;
  }

  destroy(): void {
    this.world.scene.remove(this.mesh);
    this.core.geometry.dispose();
    this.glow.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
    (this.glow.material as THREE.Material).dispose();
  }

  private syncPose(): void {
    this.world.place(this.mesh, this.sx, this.sy);
  }

  private keepOnScreen(): void {
    const w = this.world.width;
    const half = this.halfW;
    const inset = isPhone() ? 14 : 22;
    const minX = Math.min(inset + half, w * 0.22);
    const maxX = w - minX;
    this.sx = maxX > minX ? Math.min(Math.max(this.sx, minX), maxX) : w / 2;
  }
}

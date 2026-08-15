import * as THREE from "three";
import type { Hull } from "../types";
import {
  buildBomber,
  buildCapital,
  buildCrate,
  buildCruiser,
  buildDelta,
  buildDestroyer,
  buildDreadnought,
  buildFighter,
  buildGunboat,
  buildGunship,
  buildInterceptor,
  buildLeviathan,
  buildSupply,
} from "../vfx/forge";
import { BLOOM_LAYER } from "./layers";

export type FleetKind = Hull | "gunship";

const variants: Record<FleetKind, (() => THREE.Group)[]> = {
  fighter: [buildFighter, buildInterceptor, buildDelta],
  cruiser: [buildCruiser, buildGunboat, buildBomber],
  dreadnought: [buildDreadnought, buildDestroyer],
  capital: [buildCapital, buildLeviathan],
  supply: [buildSupply, buildCrate],
  gunship: [buildGunship],
};

const prototypes = new Map<FleetKind, THREE.Group[]>();

export function initFleet(): void {
  if (prototypes.size) return;
  (Object.keys(variants) as FleetKind[]).forEach((kind) => {
    prototypes.set(
      kind,
      variants[kind].map((build) => build()),
    );
  });
}

export function cloneHull(kind: FleetKind): THREE.Group {
  initFleet();
  const list = prototypes.get(kind);
  if (!list?.length) throw new Error(`missing hull ${kind}`);
  const src = list[Math.floor(Math.random() * list.length)]!;
  const g = src.clone(true);
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material;
    mesh.material = Array.isArray(mat) ? mat.map((m) => m.clone()) : mat.clone();
    const cloned = mesh.material;
    if (cloned instanceof THREE.MeshBasicMaterial) mesh.layers.enable(BLOOM_LAYER);
  });
  return g;
}

import * as THREE from "three";
import { BLOOM_LAYER } from "../world/layers";

const HULL = new THREE.MeshStandardMaterial({ color: 0x6d6b68, metalness: 0.96, roughness: 0.31 });
const PLATE = new THREE.MeshStandardMaterial({ color: 0x4a4842, metalness: 0.92, roughness: 0.44 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x231f1c, metalness: 0.88, roughness: 0.56 });
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc4863a, metalness: 1, roughness: 0.24 });
const OXIDE = new THREE.MeshStandardMaterial({ color: 0x8f3a22, metalness: 0.72, roughness: 0.55 });
const GLASS = new THREE.MeshStandardMaterial({
  color: 0x0d1a24,
  metalness: 0.4,
  roughness: 0.05,
  emissive: 0x1b4055,
  emissiveIntensity: 0.7,
});
const GLOW_WARM = new THREE.MeshBasicMaterial({ color: 0xffcf8a });
const GLOW_HOT = new THREE.MeshBasicMaterial({ color: 0xfff3dc });
const GLOW_RED = new THREE.MeshBasicMaterial({ color: 0xff5528 });
const GLOW_GREEN = new THREE.MeshBasicMaterial({ color: 0x63ff9b });

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(x * f, y * f, seed + i * 97) * amp;
    f *= 2;
    amp *= 0.5;
  }
  return sum;
}

function part(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (mat instanceof THREE.MeshBasicMaterial) m.layers.enable(BLOOM_LAYER);
  return m;
}

function planform(pts: [number, number][], depth: number, bevel = 0.08): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i]![0], pts[i]![1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

function mirrorPlan(half: [number, number][]): [number, number][] {
  const right = half.map(([x, y]) => [x, y] as [number, number]);
  const left = [...half].reverse().slice(1, -1).map(([x, y]) => [-x, y] as [number, number]);
  return [...right, ...left];
}

function greeble(g: THREE.Group, n: number, spanX: number, y0: number, y1: number, z: number, seed: number): void {
  for (let i = 0; i < n; i++) {
    const r1 = hash2(i, 7, seed);
    const r2 = hash2(i, 13, seed);
    const r3 = hash2(i, 29, seed);
    const w = 0.07 + r1 * 0.2;
    const h = 0.07 + r2 * 0.3;
    const d = 0.05 + r3 * 0.14;
    const x = (r1 - 0.5) * spanX;
    const y = y0 + (y1 - y0) * r2;
    const mat = r3 > 0.72 ? BRASS : r3 > 0.4 ? DARK : PLATE;
    g.add(part(new THREE.BoxGeometry(w, h, d), mat, x, y, z + d / 2));
    if (Math.abs(x) > 0.06) g.add(part(new THREE.BoxGeometry(w, h, d), mat, -x, y, z + d / 2));
  }
}

function thruster(g: THREE.Group, x: number, y: number, r: number, deck: number, hot = false): void {
  g.add(part(new THREE.CylinderGeometry(r, r * 1.16, r * 1.7, 16, 1, true), DARK, x, y, deck));
  g.add(part(new THREE.TorusGeometry(r * 1.05, r * 0.16, 8, 18), BRASS, x, y - r * 0.7, deck, Math.PI / 2));
  const disc = part(new THREE.CircleGeometry(r * 0.82, 18), hot ? GLOW_HOT : GLOW_WARM, x, y - r * 0.5, deck + r * 0.5);
  disc.userData.engine = true;
  g.add(disc);
}

function navLights(g: THREE.Group, x: number, y: number, z: number): void {
  g.add(part(new THREE.SphereGeometry(0.1, 10, 10), GLOW_RED, -x, y, z));
  g.add(part(new THREE.SphereGeometry(0.1, 10, 10), GLOW_GREEN, x, y, z));
}

function spine(g: THREE.Group, w: number, len: number, y: number, deck: number): void {
  g.add(part(new THREE.BoxGeometry(w, len, 0.42), PLATE, 0, y, deck + 0.2));
  g.add(part(new THREE.BoxGeometry(w * 0.55, len * 0.82, 0.5), DARK, 0, y, deck + 0.42));
  g.add(part(new THREE.BoxGeometry(w * 0.34, len * 0.5, 0.12), BRASS, 0, y + len * 0.14, deck + 0.68));
}

function metal(color: number, metalness = 0.94, roughness = 0.34): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

export function buildGunship(): THREE.Group {
  const g = new THREE.Group();
  const plan = mirrorPlan([
    [0, 3.5],
    [0.62, 1.9],
    [1.05, 0.7],
    [3.15, -0.5],
    [3.35, -1.55],
    [1.42, -1.35],
    [1.24, -2.6],
    [0.55, -2.95],
    [0, -3.05],
  ]);
  g.add(part(planform(plan, 0.62), HULL));
  g.add(part(planform(mirrorPlan([
    [0, 2.2],
    [0.5, 1.1],
    [0.72, -0.6],
    [0.5, -2.1],
    [0, -2.3],
  ]), 0.42), PLATE, 0, 0, 0.34));
  spine(g, 0.86, 3.1, 0.2, 0.4);
  const canopy = new THREE.SphereGeometry(0.46, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  g.add(part(canopy, GLASS, 0, 1.62, 0.5, -Math.PI / 2, 0, 0));
  g.add(part(new THREE.BoxGeometry(2.0, 0.3, 0.24), BRASS, 0, -0.35, 0.42));
  g.add(part(new THREE.BoxGeometry(0.5, 1.5, 0.3), DARK, 2.35, -0.85, 0.3));
  g.add(part(new THREE.BoxGeometry(0.5, 1.5, 0.3), DARK, -2.35, -0.85, 0.3));
  g.add(part(new THREE.BoxGeometry(0.16, 1.9, 0.16), PLATE, 1.35, 1.5, 0.28));
  g.add(part(new THREE.BoxGeometry(0.16, 1.9, 0.16), PLATE, -1.35, 1.5, 0.28));
  thruster(g, 0, -3.0, 0.44, 0.06, true);
  thruster(g, 1.18, -2.72, 0.32, 0.04);
  thruster(g, -1.18, -2.72, 0.32, 0.04);
  navLights(g, 3.3, -1.3, 0.28);
  greeble(g, 14, 3.4, -1.6, 1.4, 0.32, 11);
  return g;
}

export function buildFighter(): THREE.Group {
  const g = new THREE.Group();
  const plan = mirrorPlan([
    [0, 2.5],
    [0.4, 1.3],
    [0.62, 0.2],
    [2.05, -0.95],
    [2.1, -1.7],
    [0.85, -1.4],
    [0.7, -2.2],
    [0, -2.35],
  ]);
  g.add(part(planform(plan, 0.5), HULL));
  spine(g, 0.6, 2.4, 0.05, 0.32);
  const canopy = new THREE.SphereGeometry(0.32, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  g.add(part(canopy, GLASS, 0, 1.0, 0.42, -Math.PI / 2, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.34, 1.0, 0.24), OXIDE, 1.35, -0.72, 0.26));
  g.add(part(new THREE.BoxGeometry(0.34, 1.0, 0.24), OXIDE, -1.35, -0.72, 0.26));
  thruster(g, 0.44, -2.28, 0.3, 0.04, true);
  thruster(g, -0.44, -2.28, 0.3, 0.04, true);
  navLights(g, 2.05, -1.5, 0.22);
  greeble(g, 9, 2.0, -1.2, 1.1, 0.26, 23);
  return g;
}

export function buildCruiser(): THREE.Group {
  const g = new THREE.Group();
  const plan = mirrorPlan([
    [0, 3.1],
    [0.72, 2.0],
    [1.02, 0.4],
    [1.35, -1.5],
    [2.6, -1.85],
    [2.45, -2.6],
    [1.2, -2.5],
    [0.95, -3.2],
    [0, -3.35],
  ]);
  g.add(part(planform(plan, 0.72), HULL));
  spine(g, 1.15, 4.0, 0.1, 0.46);
  g.add(part(new THREE.BoxGeometry(1.7, 0.34, 0.26), BRASS, 0, 1.1, 0.5));
  g.add(part(new THREE.BoxGeometry(1.7, 0.34, 0.26), BRASS, 0, 0.2, 0.5));
  const canopy = new THREE.SphereGeometry(0.4, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  g.add(part(canopy, GLASS, 0, -1.5, 0.55, -Math.PI / 2, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.9, 1.5, 0.44), PLATE, 1.9, -1.1, 0.3));
  g.add(part(new THREE.BoxGeometry(0.9, 1.5, 0.44), PLATE, -1.9, -1.1, 0.3));
  g.add(part(new THREE.CylinderGeometry(0.16, 0.16, 1.5, 10), DARK, 1.9, 0.4, 0.4));
  g.add(part(new THREE.CylinderGeometry(0.16, 0.16, 1.5, 10), DARK, -1.9, 0.4, 0.4));
  thruster(g, 0, -3.3, 0.4, 0.08, true);
  thruster(g, 0.92, -3.1, 0.3, 0.06);
  thruster(g, -0.92, -3.1, 0.3, 0.06);
  navLights(g, 2.5, -2.2, 0.3);
  greeble(g, 16, 2.2, -2.0, 2.2, 0.4, 37);
  return g;
}

export function buildDreadnought(): THREE.Group {
  const g = new THREE.Group();
  const plan = mirrorPlan([
    [0, 3.7],
    [0.9, 2.6],
    [1.5, 0.8],
    [1.85, -1.2],
    [3.4, -1.6],
    [3.2, -2.7],
    [1.7, -2.5],
    [1.3, -3.5],
    [0, -3.7],
  ]);
  g.add(part(planform(plan, 0.92), HULL));
  spine(g, 1.7, 5.0, 0.05, 0.56);
  g.add(part(new THREE.BoxGeometry(2.5, 0.4, 0.3), BRASS, 0, 1.5, 0.62));
  g.add(part(new THREE.BoxGeometry(2.5, 0.4, 0.3), BRASS, 0, 0.5, 0.62));
  g.add(part(new THREE.BoxGeometry(2.5, 0.4, 0.3), BRASS, 0, -0.5, 0.62));
  g.add(part(new THREE.CylinderGeometry(0.55, 0.62, 0.5, 14), PLATE, 1.15, 1.9, 0.66));
  g.add(part(new THREE.CylinderGeometry(0.55, 0.62, 0.5, 14), PLATE, -1.15, 1.9, 0.66));
  g.add(part(new THREE.BoxGeometry(0.18, 1.5, 0.18), DARK, 1.15, 2.8, 0.78));
  g.add(part(new THREE.BoxGeometry(0.18, 1.5, 0.18), DARK, -1.15, 2.8, 0.78));
  g.add(part(new THREE.BoxGeometry(1.2, 1.8, 0.5), PLATE, 2.7, -1.9, 0.34));
  g.add(part(new THREE.BoxGeometry(1.2, 1.8, 0.5), PLATE, -2.7, -1.9, 0.34));
  g.add(part(new THREE.BoxGeometry(0.8, 0.3, 0.2), OXIDE, 2.7, -1.2, 0.6));
  g.add(part(new THREE.BoxGeometry(0.8, 0.3, 0.2), OXIDE, -2.7, -1.2, 0.6));
  const canopy = new THREE.SphereGeometry(0.5, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  g.add(part(canopy, GLASS, 0, -2.1, 0.66, -Math.PI / 2, 0, 0));
  thruster(g, 0, -3.7, 0.5, 0.1, true);
  thruster(g, 1.05, -3.45, 0.36, 0.08, true);
  thruster(g, -1.05, -3.45, 0.36, 0.08, true);
  navLights(g, 3.3, -2.3, 0.36);
  greeble(g, 22, 3.0, -2.6, 2.8, 0.5, 53);
  return g;
}

export function buildCapital(): THREE.Group {
  const g = new THREE.Group();
  const plan = mirrorPlan([
    [0, 5.6],
    [1.2, 4.2],
    [2.0, 1.8],
    [2.6, -1.4],
    [4.9, -2.2],
    [4.6, -3.6],
    [2.5, -3.3],
    [1.9, -4.6],
    [0, -4.9],
  ]);
  g.add(part(planform(plan, 1.3), HULL));
  g.add(part(planform(mirrorPlan([
    [0, 3.4],
    [1.1, 1.6],
    [1.5, -1.2],
    [1.0, -3.2],
    [0, -3.5],
  ]), 0.7), PLATE, 0, 0, 0.86));
  spine(g, 2.2, 6.4, 0, 0.98);
  for (const y of [2.4, 1.2, 0, -1.2, -2.4]) {
    g.add(part(new THREE.BoxGeometry(3.0, 0.42, 0.32), BRASS, 0, y, 1.16));
  }
  g.add(part(new THREE.BoxGeometry(1.5, 1.8, 0.9), PLATE, 0, 3.5, 1.3));
  g.add(part(new THREE.BoxGeometry(0.9, 1.0, 0.6), GLASS, 0, 3.6, 1.85));
  g.add(part(new THREE.BoxGeometry(0.22, 2.2, 0.22), DARK, 0, 4.9, 1.7));
  for (const s of [1, -1]) {
    g.add(part(new THREE.BoxGeometry(1.7, 2.4, 0.8), PLATE, s * 3.5, -2.6, 0.5));
    g.add(part(new THREE.BoxGeometry(1.1, 0.4, 0.3), OXIDE, s * 3.5, -1.6, 0.9));
    g.add(part(new THREE.CylinderGeometry(0.62, 0.7, 0.6, 14), PLATE, s * 1.9, 2.6, 1.1));
    g.add(part(new THREE.BoxGeometry(0.2, 1.9, 0.2), DARK, s * 1.9, 3.7, 1.25));
    g.add(part(new THREE.BoxGeometry(0.7, 2.6, 0.5), DARK, s * 2.3, 0.4, 0.95));
  }
  thruster(g, 0, -5.0, 0.7, 0.16, true);
  thruster(g, 1.5, -4.7, 0.52, 0.14, true);
  thruster(g, -1.5, -4.7, 0.52, 0.14, true);
  thruster(g, 2.8, -4.1, 0.4, 0.12);
  thruster(g, -2.8, -4.1, 0.4, 0.12);
  navLights(g, 4.8, -2.9, 0.7);
  greeble(g, 34, 4.4, -3.6, 4.0, 0.9, 71);
  return g;
}

export function buildSupply(): THREE.Group {
  const hull = new THREE.MeshStandardMaterial({ color: 0x3f5c4a, metalness: 0.9, roughness: 0.36 });
  const plate = new THREE.MeshStandardMaterial({ color: 0x2a4034, metalness: 0.88, roughness: 0.48 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15241c, metalness: 0.86, roughness: 0.58 });
  const band = new THREE.MeshStandardMaterial({ color: 0x8fb56a, metalness: 0.95, roughness: 0.28 });
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(1.0, 1.0, 3.0, 24), hull, 0, 0, 0, Math.PI / 2));
  g.add(part(new THREE.TorusGeometry(1.02, 0.12, 8, 26), band, 0, 0.95, 0, Math.PI / 2));
  g.add(part(new THREE.TorusGeometry(1.02, 0.12, 8, 26), band, 0, -0.95, 0, Math.PI / 2));
  g.add(part(new THREE.CylinderGeometry(1.04, 1.04, 0.5, 24), dark, 0, 0, 0, Math.PI / 2));
  g.add(part(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 18), GLOW_GREEN, 0, 0, 1.0, Math.PI / 2));
  g.add(part(new THREE.TorusGeometry(0.5, 0.1, 8, 20), band, 0, 0, 1.02, 0));
  g.add(part(new THREE.BoxGeometry(2.1, 0.28, 0.2), plate, 0, 1.35, 0.5));
  g.add(part(new THREE.BoxGeometry(2.1, 0.28, 0.2), plate, 0, -1.35, 0.5));
  g.add(part(new THREE.SphereGeometry(0.1, 10, 10), GLOW_GREEN, 0.7, 1.5, 0.6));
  g.add(part(new THREE.SphereGeometry(0.1, 10, 10), GLOW_GREEN, -0.7, 1.5, 0.6));
  greeble(g, 7, 1.2, -1.0, 1.0, 0.9, 91);
  return g;
}

/** Needle interceptor — fighter class. */
export function buildInterceptor(): THREE.Group {
  const hull = metal(0x5c646e, 0.97, 0.28);
  const plate = metal(0x3a4048, 0.92, 0.42);
  const dark = metal(0x1a1e24, 0.88, 0.55);
  const g = new THREE.Group();
  const plan = mirrorPlan([
    [0, 2.85],
    [0.18, 1.7],
    [0.24, 0.15],
    [0.95, -0.55],
    [1.0, -1.05],
    [0.28, -0.85],
    [0.22, -2.45],
    [0, -2.6],
  ]);
  g.add(part(planform(plan, 0.38, 0.05), hull));
  g.add(part(new THREE.BoxGeometry(0.28, 2.6, 0.28), plate, 0, 0.1, 0.28));
  g.add(part(new THREE.BoxGeometry(0.16, 1.1, 0.1), BRASS, 0, 0.7, 0.46));
  const canopy = new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  g.add(part(canopy, GLASS, 0, 1.55, 0.28, -Math.PI / 2, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.7, 0.12, 0.08), dark, 0, 1.9, 0.18));
  thruster(g, 0, -2.55, 0.28, 0.04, true);
  navLights(g, 0.95, -0.85, 0.16);
  greeble(g, 5, 0.7, -1.4, 1.2, 0.22, 101);
  return g;
}

/** Wide delta — fighter class. */
export function buildDelta(): THREE.Group {
  const hull = metal(0x3d3a36, 0.93, 0.4);
  const plate = metal(0x2a2622, 0.9, 0.5);
  const g = new THREE.Group();
  const plan = mirrorPlan([
    [0, 2.15],
    [0.55, 1.35],
    [2.35, -1.45],
    [2.15, -2.15],
    [0.45, -1.7],
    [0, -1.95],
  ]);
  g.add(part(planform(plan, 0.36, 0.06), hull));
  g.add(part(new THREE.BoxGeometry(0.7, 1.6, 0.22), plate, 0, 0.15, 0.26));
  g.add(part(new THREE.BoxGeometry(1.6, 0.16, 0.1), OXIDE, 0, 0.4, 0.28));
  const canopy = new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  g.add(part(canopy, GLASS, 0, 0.55, 0.3, -Math.PI / 2, 0, 0));
  thruster(g, 0.72, -1.85, 0.22, 0.03, true);
  thruster(g, -0.72, -1.85, 0.22, 0.03, true);
  navLights(g, 2.15, -1.7, 0.16);
  greeble(g, 8, 2.0, -1.4, 0.8, 0.2, 113);
  return g;
}

/** Long gunboat — cruiser class. */
export function buildGunboat(): THREE.Group {
  const hull = metal(0x4e5248, 0.94, 0.36);
  const plate = metal(0x35382f, 0.9, 0.48);
  const dark = metal(0x1c1e18, 0.86, 0.58);
  const g = new THREE.Group();
  const plan = mirrorPlan([
    [0, 3.45],
    [0.42, 2.5],
    [0.5, 0.3],
    [0.62, -2.1],
    [1.05, -2.45],
    [0.8, -3.15],
    [0, -3.3],
  ]);
  g.add(part(planform(plan, 0.58), hull));
  g.add(part(new THREE.BoxGeometry(0.55, 4.2, 0.36), plate, 0, 0.05, 0.4));
  g.add(part(new THREE.BoxGeometry(0.28, 1.8, 0.12), BRASS, 0, 0.8, 0.62));
  const canopy = new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  g.add(part(canopy, GLASS, 0, 2.1, 0.42, -Math.PI / 2, 0, 0));
  for (const s of [1, -1]) {
    g.add(part(new THREE.BoxGeometry(0.85, 1.3, 0.4), plate, s * 0.95, -0.2, 0.28));
    g.add(part(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 8), dark, s * 1.15, 0.55, 0.34));
    g.add(part(new THREE.BoxGeometry(0.18, 0.18, 0.18), OXIDE, s * 1.15, 1.15, 0.34));
  }
  thruster(g, 0.38, -3.2, 0.26, 0.05, true);
  thruster(g, -0.38, -3.2, 0.26, 0.05, true);
  navLights(g, 1.0, -2.5, 0.24);
  greeble(g, 10, 0.9, -2.2, 2.4, 0.36, 127);
  return g;
}

/** Fat bomber — cruiser class. */
export function buildBomber(): THREE.Group {
  const hull = metal(0x6b5848, 0.9, 0.42);
  const plate = metal(0x4a3c32, 0.88, 0.5);
  const dark = metal(0x241c16, 0.86, 0.58);
  const g = new THREE.Group();
  const plan = mirrorPlan([
    [0, 2.35],
    [0.95, 1.55],
    [1.55, 0.15],
    [1.75, -1.35],
    [1.45, -2.55],
    [0.7, -3.05],
    [0, -3.2],
  ]);
  g.add(part(planform(plan, 0.95, 0.1), hull));
  g.add(part(new THREE.BoxGeometry(1.4, 2.2, 0.5), plate, 0, -0.2, 0.62));
  g.add(part(new THREE.BoxGeometry(1.1, 0.28, 0.16), BRASS, 0, 0.4, 0.9));
  const canopy = new THREE.SphereGeometry(0.36, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  g.add(part(canopy, GLASS, 0, 1.15, 0.62, -Math.PI / 2, 0, 0));
  for (const s of [1, -1]) {
    g.add(part(new THREE.BoxGeometry(0.7, 1.1, 0.55), dark, s * 1.45, -0.85, 0.4));
    g.add(part(new THREE.BoxGeometry(0.55, 0.22, 0.18), OXIDE, s * 1.45, -0.4, 0.7));
  }
  thruster(g, 0, -3.15, 0.34, 0.08, true);
  thruster(g, 0.7, -2.95, 0.24, 0.06);
  thruster(g, -0.7, -2.95, 0.24, 0.06);
  navLights(g, 1.7, -1.5, 0.4);
  greeble(g, 12, 1.6, -2.0, 1.6, 0.55, 139);
  return g;
}

/** Twin-boom destroyer — dreadnought class. */
export function buildDestroyer(): THREE.Group {
  const hull = metal(0x3a3c42, 0.95, 0.32);
  const plate = metal(0x2a2c32, 0.92, 0.46);
  const dark = metal(0x14161a, 0.88, 0.56);
  const g = new THREE.Group();
  const boom = mirrorPlan([
    [0, 2.8],
    [0.38, 1.8],
    [0.42, -0.4],
    [0.5, -2.6],
    [0.32, -3.4],
    [0, -3.55],
  ]);
  g.add(part(planform(boom, 0.55), hull, 1.35, 0, 0));
  g.add(part(planform(boom, 0.55), hull, -1.35, 0, 0));
  g.add(part(new THREE.BoxGeometry(3.2, 0.7, 0.38), plate, 0, 0.2, 0.28));
  g.add(part(new THREE.BoxGeometry(1.4, 1.6, 0.7), plate, 0, 0.15, 0.55));
  g.add(part(new THREE.BoxGeometry(0.9, 0.7, 0.4), GLASS, 0, 0.35, 0.95));
  g.add(part(new THREE.BoxGeometry(0.16, 1.4, 0.16), dark, 0, 1.2, 0.85));
  g.add(part(new THREE.BoxGeometry(2.4, 0.22, 0.14), BRASS, 0, -0.8, 0.48));
  for (const s of [1, -1]) {
    g.add(part(new THREE.BoxGeometry(0.55, 1.2, 0.32), dark, s * 1.35, 1.4, 0.36));
    thruster(g, s * 1.35, -3.5, 0.3, 0.06, true);
    thruster(g, s * 1.7, -3.15, 0.22, 0.04);
  }
  navLights(g, 1.85, -2.4, 0.28);
  greeble(g, 14, 2.6, -2.4, 2.2, 0.42, 149);
  return g;
}

/** Blunt fortress — capital class. */
export function buildLeviathan(): THREE.Group {
  const hull = metal(0x2e2c2a, 0.94, 0.38);
  const plate = metal(0x1f1c1a, 0.9, 0.5);
  const dark = metal(0x12100e, 0.86, 0.6);
  const g = new THREE.Group();
  const plan = mirrorPlan([
    [0, 4.8],
    [1.6, 4.2],
    [2.2, 2.4],
    [2.5, -0.4],
    [3.8, -1.8],
    [3.6, -3.4],
    [2.2, -3.8],
    [1.4, -4.6],
    [0, -4.85],
  ]);
  g.add(part(planform(plan, 1.45, 0.1), hull));
  g.add(part(new THREE.BoxGeometry(3.4, 5.6, 0.7), plate, 0, 0.1, 0.95));
  for (const y of [2.0, 0.6, -0.8, -2.2]) {
    g.add(part(new THREE.BoxGeometry(3.8, 0.36, 0.28), BRASS, 0, y, 1.28));
  }
  g.add(part(new THREE.BoxGeometry(1.8, 2.2, 1.1), plate, 0, 2.6, 1.5));
  g.add(part(new THREE.BoxGeometry(1.1, 1.1, 0.7), GLASS, 0, 2.7, 2.1));
  g.add(part(new THREE.BoxGeometry(0.24, 2.0, 0.24), dark, 0.55, 3.9, 1.9));
  g.add(part(new THREE.BoxGeometry(0.24, 1.5, 0.24), dark, -0.55, 3.7, 1.9));
  for (const s of [1, -1]) {
    g.add(part(new THREE.BoxGeometry(1.5, 2.8, 0.85), plate, s * 2.7, -2.2, 0.55));
    g.add(part(new THREE.BoxGeometry(0.9, 0.35, 0.28), OXIDE, s * 2.7, -1.1, 1.0));
    g.add(part(new THREE.BoxGeometry(0.8, 2.2, 0.45), dark, s * 1.7, 0.8, 1.15));
  }
  thruster(g, 0, -4.85, 0.62, 0.14, true);
  thruster(g, 1.2, -4.55, 0.44, 0.12, true);
  thruster(g, -1.2, -4.55, 0.44, 0.12, true);
  thruster(g, 2.4, -3.9, 0.34, 0.1);
  thruster(g, -2.4, -3.9, 0.34, 0.1);
  navLights(g, 3.7, -2.6, 0.7);
  greeble(g, 28, 3.8, -3.4, 3.6, 0.95, 163);
  return g;
}

/** Box hauler — supply class. */
export function buildCrate(): THREE.Group {
  const hull = metal(0x3a5644, 0.88, 0.42);
  const plate = metal(0x24382c, 0.86, 0.52);
  const band = metal(0x8fb56a, 0.95, 0.28);
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(2.2, 1.7, 1.35), hull));
  g.add(part(new THREE.BoxGeometry(2.28, 0.22, 1.42), band, 0, 0.55, 0));
  g.add(part(new THREE.BoxGeometry(2.28, 0.22, 1.42), band, 0, -0.55, 0));
  g.add(part(new THREE.BoxGeometry(0.7, 0.7, 0.2), GLOW_GREEN, 0, 0, 0.72));
  g.add(part(new THREE.BoxGeometry(2.0, 0.16, 0.16), plate, 0, 0, 0.72));
  g.add(part(new THREE.CylinderGeometry(0.28, 0.34, 0.4, 12), plate, 0.7, -0.95, 0.4, Math.PI / 2));
  g.add(part(new THREE.CylinderGeometry(0.28, 0.34, 0.4, 12), plate, -0.7, -0.95, 0.4, Math.PI / 2));
  g.add(part(new THREE.SphereGeometry(0.1, 10, 10), GLOW_GREEN, 0.85, 0.7, 0.7));
  g.add(part(new THREE.SphereGeometry(0.1, 10, 10), GLOW_GREEN, -0.85, 0.7, 0.7));
  greeble(g, 6, 1.6, -0.6, 0.6, 0.7, 173);
  return g;
}

export function buildStation(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(30, 3.4, 1.6), HULL, 0, -1.0, 0));
  g.add(part(new THREE.BoxGeometry(30, 0.55, 0.6), BRASS, 0, 0.62, 0.9));
  g.add(part(new THREE.BoxGeometry(29, 1.1, 0.9), PLATE, 0, 0.05, 0.9));
  g.add(part(new THREE.BoxGeometry(30, 0.4, 0.5), DARK, 0, -0.62, 1.1));

  for (let i = -7; i <= 7; i++) {
    const x = i * 2.0;
    const r = hash2(i + 9, 3, 5);
    g.add(part(new THREE.BoxGeometry(1.15, 1.5, 0.85), PLATE, x, -1.5, 0.9));
    g.add(part(new THREE.BoxGeometry(0.8, 0.34, 0.3), r > 0.5 ? GLOW_WARM : DARK, x, -1.0, 1.4));
    if (r > 0.62) {
      g.add(part(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 12), DARK, x, 0.5, 1.5));
      g.add(part(new THREE.BoxGeometry(0.14, 1.4, 0.14), PLATE, x, 1.4, 1.6));
      g.add(part(new THREE.SphereGeometry(0.11, 8, 8), GLOW_RED, x, 2.15, 1.6));
    }
    if (r < 0.3) {
      g.add(part(new THREE.BoxGeometry(1.5, 0.7, 0.55), DARK, x, 0.3, 1.35));
      g.add(part(new THREE.BoxGeometry(1.1, 0.22, 0.2), GLOW_WARM, x, 0.3, 1.65));
    }
  }

  for (const s of [1, -1]) {
    g.add(part(new THREE.BoxGeometry(3.4, 2.6, 1.5), PLATE, s * 12.5, -0.4, 1.0));
    g.add(part(new THREE.CylinderGeometry(0.9, 1.05, 0.7, 16), HULL, s * 12.5, 0.6, 1.9));
    g.add(part(new THREE.TorusGeometry(0.62, 0.12, 8, 20), BRASS, s * 12.5, 0.6, 2.3));
    g.add(part(new THREE.BoxGeometry(0.18, 2.4, 0.18), DARK, s * 12.5, 2.2, 2.0));
    g.add(part(new THREE.SphereGeometry(0.14, 10, 10), GLOW_RED, s * 12.5, 3.4, 2.0));
  }

  g.add(part(new THREE.BoxGeometry(6.5, 2.0, 1.3), PLATE, 0, 0.4, 1.4));
  g.add(part(new THREE.BoxGeometry(5.2, 0.9, 0.5), GLASS, 0, 0.5, 2.1));
  g.add(part(new THREE.BoxGeometry(6.5, 0.28, 0.3), BRASS, 0, -0.7, 2.0));
  greeble(g, 30, 26, -2.2, 1.6, 1.2, 131);
  return g;
}

export function envMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "#5d5140");
  g.addColorStop(0.42, "#2b2620");
  g.addColorStop(0.72, "#14100c");
  g.addColorStop(1, "#241a12");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  const sun = ctx.createRadialGradient(70, 26, 2, 70, 26, 46);
  sun.addColorStop(0, "#fff2d6");
  sun.addColorStop(1, "rgba(255,242,214,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 256, 128);
  const warm = ctx.createRadialGradient(200, 96, 2, 200, 96, 60);
  warm.addColorStop(0, "#c4622a");
  warm.addColorStop(1, "rgba(196,98,42,0)");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  tex.dispose();
  return rt.texture;
}

export function addFleetLights(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0x28303c, 0.6));
  const key = new THREE.DirectionalLight(0xfff4e2, 3.6);
  key.position.set(-4, 6, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd4692c, 1.5);
  rim.position.set(5, -5, 2.5);
  scene.add(rim);
  const cool = new THREE.DirectionalLight(0x7aa6dc, 1.5);
  cool.position.set(4, 3, -4);
  scene.add(cool);
}

/** Lit gas giant with 3D noise — no UV wrap, no pole pinch. */
export function planetMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uKey: { value: new THREE.Vector3(-0.55, 0.42, 0.72).normalize() },
    },
    vertexShader: `
      varying vec3 vObj;
      varying vec3 vWorldN;
      varying vec3 vView;
      void main() {
        vObj = normalize(position);
        vWorldN = normalize(mat3(modelMatrix) * position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vObj;
      varying vec3 vWorldN;
      varying vec3 vView;
      uniform vec3 uKey;

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
        for (int i = 0; i < 6; i++) {
          s += vnoise(p) * a;
          p = p * 2.07 + 13.1;
          a *= 0.5;
        }
        return s;
      }
      void main() {
        vec3 p = normalize(vObj);
        float warp = fbm(p * 2.6 + 3.1);
        vec3 q = p + vec3(warp * 0.42, warp * 0.18, -warp * 0.28);
        float n = fbm(q * 7.2 + vec3(4.0, 1.2, -2.4));
        float n2 = fbm(q * 14.0 + 19.0);
        float bands = sin(q.y * 16.0 + warp * 5.5);
        bands += 0.45 * sin(q.y * 37.0 - n * 3.2);
        bands = bands * 0.5 + 0.5;
        float storms = smoothstep(0.58, 0.8, fbm(q * 5.5 + vec3(8.0, 2.0, 1.0)));
        float t = clamp(bands * 0.55 + n * 0.5 + n2 * 0.18, 0.0, 1.0);
        float polar = smoothstep(0.55, 0.92, abs(p.y));

        vec3 umber = vec3(0.16, 0.07, 0.04);
        vec3 rust = vec3(0.62, 0.22, 0.08);
        vec3 copper = vec3(0.92, 0.52, 0.22);
        vec3 cream = vec3(1.0, 0.82, 0.58);
        vec3 ice = vec3(0.78, 0.72, 0.68);
        vec3 albedo = mix(umber, rust, smoothstep(0.15, 0.45, t));
        albedo = mix(albedo, copper, smoothstep(0.4, 0.7, t));
        albedo = mix(albedo, cream, smoothstep(0.72, 0.95, t) * 0.85);
        albedo = mix(albedo, rust * 1.15, storms * 0.55);
        albedo = mix(albedo, ice, polar * 0.55);

        vec3 nn = normalize(vWorldN);
        vec3 view = normalize(vView);
        float ndl = max(0.0, dot(nn, uKey));
        float wrap = ndl * 0.88 + 0.12;
        float spec = pow(max(0.0, dot(reflect(-uKey, nn), view)), 28.0) * 0.22;
        float fres = pow(1.0 - max(0.0, dot(nn, view)), 2.6);
        vec3 col = albedo * wrap * 1.05;
        col += cream * spec * 0.55;
        col += vec3(1.0, 0.62, 0.28) * fres * 0.22;
        col += albedo * 0.03;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export function planetAtmosphere(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: {},
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
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 3.2);
        gl_FragColor = vec4(vec3(1.0, 0.62, 0.28) * fres * 0.22, fres);
      }
    `,
  });
}

export function planetTexture(): HTMLCanvasElement {
  const w = 1024;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const lat = (y / h) * 2 - 1;
    const phi = (y / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * Math.PI * 2;
      const px = Math.sin(phi) * Math.cos(lon);
      const py = Math.cos(phi);
      const pz = Math.sin(phi) * Math.sin(lon);
      const n = fbm(px * 3.2 + 4, py * 3.2 + pz * 3.2, 4, 6);
      const bands = 0.5 + 0.5 * Math.sin(lat * 9 + n * 5.5);
      const t = Math.min(1, Math.max(0, n * 0.75 + bands * 0.35));
      const polar = Math.min(1, Math.abs(lat) * 1.25);
      const r = 214 * t + 44 * (1 - t);
      const g = 118 * t + 26 * (1 - t);
      const b = 62 * t + 20 * (1 - t);
      const i = (y * w + x) * 4;
      img.data[i] = r * (1 - polar * 0.32) + 176 * polar * 0.32;
      img.data[i + 1] = g * (1 - polar * 0.32) + 158 * polar * 0.32;
      img.data[i + 2] = b * (1 - polar * 0.32) + 150 * polar * 0.32;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

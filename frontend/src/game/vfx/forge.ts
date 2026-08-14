import Phaser from "phaser";
import * as THREE from "three";

const SS = 2;

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
  g.add(part(new THREE.CircleGeometry(r * 0.82, 18), hot ? GLOW_HOT : GLOW_WARM, x, y - r * 0.5, deck + r * 0.5));
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

function buildGunship(): THREE.Group {
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

function buildFighter(): THREE.Group {
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

function buildCruiser(): THREE.Group {
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

function buildDreadnought(): THREE.Group {
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

function buildCapital(): THREE.Group {
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

function buildSupply(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(1.0, 1.0, 3.0, 24), HULL, 0, 0, 0, Math.PI / 2));
  g.add(part(new THREE.TorusGeometry(1.02, 0.12, 8, 26), BRASS, 0, 0.95, 0, Math.PI / 2));
  g.add(part(new THREE.TorusGeometry(1.02, 0.12, 8, 26), BRASS, 0, -0.95, 0, Math.PI / 2));
  g.add(part(new THREE.CylinderGeometry(1.04, 1.04, 0.5, 24), DARK, 0, 0, 0, Math.PI / 2));
  g.add(part(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 18), GLOW_WARM, 0, 0, 1.0, Math.PI / 2));
  g.add(part(new THREE.TorusGeometry(0.5, 0.1, 8, 20), BRASS, 0, 0, 1.02, 0));
  g.add(part(new THREE.BoxGeometry(2.1, 0.28, 0.2), OXIDE, 0, 1.35, 0.5));
  g.add(part(new THREE.BoxGeometry(2.1, 0.28, 0.2), OXIDE, 0, -1.35, 0.5));
  g.add(part(new THREE.SphereGeometry(0.1, 10, 10), GLOW_GREEN, 0.7, 1.5, 0.6));
  g.add(part(new THREE.SphereGeometry(0.1, 10, 10), GLOW_RED, -0.7, 1.5, 0.6));
  greeble(g, 7, 1.2, -1.0, 1.0, 0.9, 91);
  return g;
}

function buildStation(): THREE.Group {
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

function envMap(renderer: THREE.WebGLRenderer): THREE.Texture {
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

function lights(scene: THREE.Scene): void {
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

function frame(cam: THREE.OrthographicCamera, obj: THREE.Object3D, w: number, h: number, pad = 1.14): void {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const aspect = w / h;
  let halfW = size.x / 2;
  let halfH = size.y / 2;
  if (halfW / halfH > aspect) halfH = halfW / aspect;
  else halfW = halfH * aspect;
  cam.left = -halfW * pad;
  cam.right = halfW * pad;
  cam.top = halfH * pad;
  cam.bottom = -halfH * pad;
  cam.near = -60;
  cam.far = 60;
  cam.position.set(center.x, center.y - size.y * 0.06, center.z + 20);
  cam.lookAt(center.x, center.y, center.z);
  cam.updateProjectionMatrix();
}

function planetTexture(): HTMLCanvasElement {
  const w = 1024;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const lat = (y / h) * 2 - 1;
    for (let x = 0; x < w; x++) {
      const u = (x / w) * 12;
      const v = (y / h) * 6;
      const n = fbm(u, v, 4, 6);
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

function bakePlanet(
  renderer: THREE.WebGLRenderer,
  phaser: Phaser.Scene,
  key: string,
  size: number,
): void {
  const scene = new THREE.Scene();
  const albedo = new THREE.CanvasTexture(planetTexture());
  albedo.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(planetTexture());
  const mat = new THREE.MeshStandardMaterial({
    map: albedo,
    bumpMap: bump,
    bumpScale: 1.4,
    metalness: 0.02,
    roughness: 0.94,
  });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(4, 96, 64), mat);
  globe.rotation.z = 0.34;
  globe.rotation.y = 1.1;
  scene.add(globe);
  scene.add(new THREE.AmbientLight(0x1a2230, 0.5));
  const sun = new THREE.DirectionalLight(0xffe9c4, 4.4);
  sun.position.set(-6, 5, 6);
  scene.add(sun);
  const bounce = new THREE.DirectionalLight(0x8a3a20, 0.7);
  bounce.position.set(5, -3, 2);
  scene.add(bounce);

  const cam = new THREE.OrthographicCamera(-4.6, 4.6, 4.6, -4.6, -40, 40);
  cam.position.set(0, 0, 20);
  cam.lookAt(0, 0, 0);

  renderer.setSize(size * SS, size * SS, false);
  renderer.render(scene, cam);

  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d")!;
  const glow = ctx.createRadialGradient(size / 2, size / 2, size * 0.42, size / 2, size / 2, size * 0.52);
  glow.addColorStop(0, "rgba(232,161,90,0.5)");
  glow.addColorStop(0.55, "rgba(196,98,42,0.16)");
  glow.addColorStop(1, "rgba(196,98,42,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(renderer.domElement, 0, 0, size, size);

  if (phaser.textures.exists(key)) phaser.textures.remove(key);
  phaser.textures.addCanvas(key, out);

  globe.geometry.dispose();
  mat.dispose();
  albedo.dispose();
  bump.dispose();
}

function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}

export function forgeFleet(phaser: Phaser.Scene): void {
  if (phaser.textures.exists("gunship")) return;

  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.environment = envMap(renderer);
  lights(scene);

  const cam = new THREE.OrthographicCamera();

  const bake = (
    key: string,
    w: number,
    h: number,
    build: () => THREE.Group,
    pad = 1.14,
  ): HTMLCanvasElement => {
    const group = build();
    group.rotation.x = -0.16;
    scene.add(group);
    frame(cam, group, w, h, pad);
    renderer.setSize(w * SS, h * SS, false);
    renderer.render(scene, cam);

    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    out.getContext("2d")!.drawImage(renderer.domElement, 0, 0, w, h);

    if (phaser.textures.exists(key)) phaser.textures.remove(key);
    phaser.textures.addCanvas(key, out);

    scene.remove(group);
    disposeGroup(group);
    return out;
  };

  bake("station", 1600, 300, buildStation, 1.0);
  bake("gunship", 420, 340, buildGunship);
  bake("fighter", 210, 260, buildFighter);
  bake("cruiser", 260, 300, buildCruiser);
  bake("dreadnought", 330, 350, buildDreadnought);
  bake("capital", 600, 470, buildCapital);

  const pod = bake("supply", 200, 220, buildSupply);
  for (const word of ["HOLD", "AEGIS", "SHOVE", "SURGE", "MARK"]) {
    const key = `supply-${word.toLowerCase()}`;
    const out = document.createElement("canvas");
    out.width = pod.width;
    out.height = pod.height;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(pod, 0, 0);
    ctx.font = "700 26px Tektur, Archivo Narrow, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(10,8,6,0.9)";
    ctx.strokeText(word, out.width / 2, out.height * 0.74);
    ctx.fillStyle = "#ffe7c0";
    ctx.fillText(word, out.width / 2, out.height * 0.74);
    if (phaser.textures.exists(key)) phaser.textures.remove(key);
    phaser.textures.addCanvas(key, out);
  }

  bakePlanet(renderer, phaser, "planet", 512);

  renderer.dispose();
  renderer.forceContextLoss();
}

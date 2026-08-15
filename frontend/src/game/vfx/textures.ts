import Phaser from "phaser";
import { fbm, forgeFleet } from "./forge";

function canvasTex(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void {
  if (scene.textures.exists(key)) return;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { alpha: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  draw(ctx);
  scene.textures.addCanvas(key, c)?.refresh();
}

function rad(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r0: number,
  r1: number,
  stops: [number, string][],
): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

/** Radial falloff that lands on fully transparent black, so additive blends never box. */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string): void {
  ctx.fillStyle = rad(ctx, x, y, 0, r, [
    [0, `rgba(${rgb},1)`],
    [0.34, `rgba(${rgb},0.5)`],
    [0.68, `rgba(${rgb},0.13)`],
    [1, "rgba(0,0,0,0)"],
  ]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function generateTextures(scene: Phaser.Scene): void {
  forgeFleet(scene);

  canvasTex(scene, "star", 16, 16, (ctx) => {
    glow(ctx, 8, 8, 8, "255,246,224");
  });

  canvasTex(scene, "nebula", 512, 512, (ctx) => {
    const img = ctx.createImageData(512, 512);
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const u = (x / 512) * 4;
        const v = (y / 512) * 4;
        const warp = fbm(u * 1.7 + 3.1, v * 1.7 - 1.4, 17, 4);
        const n = fbm(u + warp * 1.6, v + warp * 1.6, 5, 6);
        const dx = x / 512 - 0.5;
        const dy = y / 512 - 0.5;
        const falloff = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2.1);
        const density = Math.max(0, n - 0.42) * falloff * falloff;
        const heat = Math.min(1, density * 3.4);
        const i = (y * 512 + x) * 4;
        const a = Math.min(255, density * 620);
        const k = a / 255;
        img.data[i] = (96 + heat * 150) * k;
        img.data[i + 1] = (46 + heat * 84) * k;
        img.data[i + 2] = (62 + heat * 26) * k;
        img.data[i + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  canvasTex(scene, "spark", 20, 20, (ctx) => {
    glow(ctx, 10, 10, 10, "255,248,232");
  });

  canvasTex(scene, "ember", 24, 24, (ctx) => {
    glow(ctx, 12, 12, 12, "255,132,58");
  });

  canvasTex(scene, "flash", 192, 192, (ctx) => {
    glow(ctx, 96, 96, 96, "255,250,238");
  });

  canvasTex(scene, "fireball", 320, 320, (ctx) => {
    ctx.fillStyle = rad(ctx, 160, 160, 0, 160, [
      [0, "rgba(255,255,255,1)"],
      [0.1, "rgba(255,246,222,0.98)"],
      [0.26, "rgba(255,178,86,0.9)"],
      [0.46, "rgba(226,92,40,0.62)"],
      [0.68, "rgba(122,40,18,0.26)"],
      [0.86, "rgba(40,14,8,0.07)"],
      [1, "rgba(0,0,0,0)"],
    ]);
    ctx.beginPath();
    ctx.arc(160, 160, 160, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + fbm(i, 3, 9, 3) * 2;
      const r = 40 + fbm(i * 2.3, 7, 21, 4) * 96;
      const s = 14 + fbm(i, 11, 33, 3) * 34;
      ctx.fillStyle = rad(ctx, 160 + Math.cos(a) * r, 160 + Math.sin(a) * r, 0, s, [
        [0, "rgba(255,214,150,0.55)"],
        [0.5, "rgba(232,120,50,0.22)"],
        [1, "rgba(0,0,0,0)"],
      ]);
      ctx.beginPath();
      ctx.arc(160 + Math.cos(a) * r, 160 + Math.sin(a) * r, s, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  canvasTex(scene, "shock", 320, 320, (ctx) => {
    ctx.fillStyle = rad(ctx, 160, 160, 0, 160, [
      [0, "rgba(0,0,0,0)"],
      [0.8, "rgba(0,0,0,0)"],
      [0.87, "rgba(255,186,112,0.16)"],
      [0.93, "rgba(255,248,232,0.92)"],
      [0.97, "rgba(255,176,96,0.24)"],
      [1, "rgba(0,0,0,0)"],
    ]);
    ctx.beginPath();
    ctx.arc(160, 160, 160, 0, Math.PI * 2);
    ctx.fill();
  });

  canvasTex(scene, "shard", 30, 46, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 30, 46);
    g.addColorStop(0, "#d8c9a6");
    g.addColorStop(0.45, "#7a6f5d");
    g.addColorStop(1, "#241f19");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(15, 2);
    ctx.lineTo(27, 30);
    ctx.lineTo(18, 44);
    ctx.lineTo(5, 34);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,214,160,0.5)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });

  canvasTex(scene, "smoke", 128, 128, (ctx) => {
    const img = ctx.createImageData(128, 128);
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const n = fbm((x / 128) * 5, (y / 128) * 5, 41, 5);
        const dx = x / 128 - 0.5;
        const dy = y / 128 - 0.5;
        const falloff = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2.05);
        const a = Math.min(190, Math.max(0, n - 0.34) * falloff * falloff * 930);
        const k = a / 255;
        const i = (y * 128 + x) * 4;
        img.data[i] = 108 * k;
        img.data[i + 1] = 86 * k;
        img.data[i + 2] = 74 * k;
        img.data[i + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  canvasTex(scene, "engine", 72, 72, (ctx) => {
    glow(ctx, 36, 36, 36, "255,166,84");
  });

  /** Downward copper lance. Tip at the bottom. Premultiplied for additive. */
  canvasTex(scene, "bolt", 48, 130, (ctx) => {
    const img = ctx.createImageData(48, 130);
    for (let y = 0; y < 130; y++) {
      const t = y / 129;
      const half = 3.2 + 18 * Math.pow(t, 0.65) * (1 - Math.pow(t, 3.4));
      for (let x = 0; x < 48; x++) {
        const d = Math.abs(x - 24) / Math.max(half, 0.001);
        if (d >= 1) continue;
        const body = (1 - d * d) * (0.25 + 0.75 * t);
        const core = Math.pow(1 - d, 2.6) * Math.pow(t, 0.45);
        const a = Math.min(1, body * 0.9 + core * 0.95);
        if (a <= 0) continue;
        const i = (y * 48 + x) * 4;
        img.data[i] = 255 * a;
        img.data[i + 1] = (72 + 150 * core + 40 * t) * a;
        img.data[i + 2] = (28 + 70 * core) * a;
        img.data[i + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  /** Teardrop plume, origin at the nozzle (top). Premultiplied so additive blending cannot box. */
  canvasTex(scene, "flame", 80, 220, (ctx) => {
    const img = ctx.createImageData(80, 220);
    for (let y = 0; y < 220; y++) {
      const t = y / 220;
      const half = 38 * Math.pow(1 - t, 0.5) * (0.55 + 0.45 * Math.min(1, t * 7));
      for (let x = 0; x < 80; x++) {
        const d = Math.abs(x - 40) / Math.max(half, 0.001);
        const i = (y * 80 + x) * 4;
        if (d >= 1) continue;
        const body = (1 - d * d) * Math.pow(1 - t, 1.15);
        const core = Math.pow(1 - d, 3) * Math.pow(1 - t, 2.6);
        const a = Math.min(1, body * 0.95 + core * 0.9);
        if (a <= 0) continue;
        const r = 255;
        const g = 118 + 134 * core + 40 * (1 - t);
        const b = 40 + 200 * core;
        img.data[i] = r * a;
        img.data[i + 1] = Math.min(255, g) * a;
        img.data[i + 2] = Math.min(255, b) * a;
        img.data[i + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  canvasTex(scene, "crater", 160, 160, (ctx) => {
    const img = ctx.createImageData(160, 160);
    for (let y = 0; y < 160; y++) {
      for (let x = 0; x < 160; x++) {
        const dx = (x - 80) / 80;
        const dy = (y - 80) / 80;
        const warp = (fbm(x * 0.045, y * 0.045, 77, 4) - 0.5) * 0.38;
        const d = Math.sqrt(dx * dx + dy * dy) + warp;
        if (d > 0.98) continue;
        const rim = Math.max(0, 1 - Math.abs(d - 0.62) * 5.2);
        const hole = Math.max(0, 1 - d * 1.35);
        const a = Math.min(1, hole * 0.92 + rim * 0.55);
        const heat = rim * (0.55 + fbm(x * 0.08, y * 0.08, 19, 3) * 0.45);
        const i = (y * 160 + x) * 4;
        img.data[i] = (28 + heat * 210) * a;
        img.data[i + 1] = (18 + heat * 90) * a;
        img.data[i + 2] = (14 + heat * 28) * a;
        img.data[i + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  canvasTex(scene, "wound", 160, 160, (ctx) => {
    const img = ctx.createImageData(160, 160);
    for (let y = 0; y < 160; y++) {
      for (let x = 0; x < 160; x++) {
        const dx = (x - 80) / 80;
        const dy = (y - 80) / 80;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1) continue;
        const core = Math.pow(Math.max(0, 1 - d * 3.4), 2.2);
        const mid = Math.pow(Math.max(0, 1 - d * 1.6), 1.6);
        const a = Math.min(1, core * 0.95 + mid * 0.45);
        if (a <= 0.01) continue;
        const i = (y * 160 + x) * 4;
        img.data[i] = 255 * a;
        img.data[i + 1] = (140 + 110 * core) * a;
        img.data[i + 2] = (40 + 180 * core) * a;
        img.data[i + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  canvasTex(scene, "reticle", 128, 128, (ctx) => {
    ctx.strokeStyle = "rgba(255,190,110,0.95)";
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
      const a0 = i * (Math.PI / 2) + 0.34;
      ctx.beginPath();
      ctx.arc(64, 64, 46, a0, a0 + 0.72);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,238,208,0.85)";
    ctx.lineWidth = 2;
    for (const [x0, y0, x1, y1] of [
      [64, 6, 64, 24],
      [64, 104, 64, 122],
      [6, 64, 24, 64],
      [104, 64, 122, 64],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x0!, y0!);
      ctx.lineTo(x1!, y1!);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,190,110,0.4)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(64, 64, 30, 0, Math.PI * 2);
    ctx.stroke();
  });

}

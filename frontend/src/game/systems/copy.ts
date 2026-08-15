import type { PowerId } from "../types";

export const POWER_NAME: Record<PowerId, string> = {
  hold: "BRAKE",
  aegis: "AEGIS",
  shove: "REPEL",
  surge: "SURGE",
  mark: "FOCUS",
};

export const POWER_LINE: Record<PowerId, string> = {
  hold: "BRAKE · Enemies slowed",
  aegis: "AEGIS · Absorbs one hit",
  shove: "REPEL · Pushed back",
  surge: "SURGE · Double points",
  mark: "FOCUS · Target enlarged",
};

export const POWER_BANNER: Record<PowerId, { title: string; sub: string }> = {
  hold: { title: "BRAKE", sub: "Enemies half speed — 5s" },
  aegis: { title: "AEGIS", sub: "Next hit absorbed" },
  shove: { title: "REPEL", sub: "Pushed back" },
  surge: { title: "SURGE", sub: "Double points — 8s" },
  mark: { title: "FOCUS", sub: "Target enlarged — 6s" },
};

export const SALVO_MAX = 2;

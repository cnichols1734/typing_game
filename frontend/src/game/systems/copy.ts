import type { PowerId } from "../types";

export const POWER_LINE: Record<PowerId, string> = {
  hold: "HOLD · inbound speed halved",
  aegis: "AEGIS · absorbs the next breach",
  shove: "SHOVE · throws every contact back",
  surge: "SURGE · score doubled, inbound hotter",
  mark: "MARK · locked word magnified",
};

export const POWER_BANNER: Record<PowerId, { title: string; sub: string }> = {
  hold: { title: "HOLD", sub: "Inbound speed halved — 5s" },
  aegis: { title: "AEGIS", sub: "Absorbs the next breach" },
  shove: { title: "SHOVE", sub: "Throws every contact back" },
  surge: { title: "SURGE", sub: "Score doubled. Inbound hotter — 8s" },
  mark: { title: "MARK", sub: "Locked word magnified — 6s" },
};

export const SALVO_MAX = 2;

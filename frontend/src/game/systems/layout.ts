import type { Hull } from "../types";

export function isPhone(): boolean {
  if (typeof window === "undefined") return false;
  const narrow = window.matchMedia("(max-width: 820px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1100;
  return narrow || coarse;
}

export function syncChrome(): void {
  document.documentElement.classList.toggle("phone", isPhone());
}

export function hullScale(hull: Hull): number {
  if (!isPhone()) {
    return hull === "capital" ? 0.54 : hull === "dreadnought" ? 0.48 : hull === "cruiser" ? 0.46 : 0.42;
  }
  return hull === "capital" ? 0.2 : hull === "dreadnought" ? 0.16 : hull === "cruiser" ? 0.14 : hull === "supply" ? 0.15 : 0.13;
}

export function gunshipScale(): number {
  return isPhone() ? 0.16 : 0.48;
}

export function stationHeight(): number {
  return isPhone() ? 64 : 150;
}

export function keyboardReserve(): number {
  if (!isPhone()) return 0;
  const kb = document.getElementById("deck-keys");
  if (kb && !kb.hidden && kb.offsetHeight > 40) return kb.offsetHeight;
  const landscape = window.innerHeight < 500;
  return landscape ? 156 : Math.min(248, Math.max(196, window.innerHeight * 0.3));
}

export function spawnPad(): number {
  return isPhone() ? 28 : 70;
}

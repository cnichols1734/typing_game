import type { Hull, PlayPlatform } from "../types";

export function isPhone(): boolean {
  if (typeof window === "undefined") return false;
  const narrow = window.matchMedia("(max-width: 820px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1100;
  return narrow || coarse;
}

export function playPlatform(): PlayPlatform {
  return isPhone() ? "mobile" : "desktop";
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

export function hullWorldScale(hull: Hull): number {
  if (!isPhone()) {
    return hull === "capital" ? 0.58 : hull === "dreadnought" ? 0.5 : hull === "cruiser" ? 0.46 : hull === "supply" ? 0.4 : 0.44;
  }
  return hull === "capital" ? 0.28 : hull === "dreadnought" ? 0.22 : hull === "cruiser" ? 0.2 : hull === "supply" ? 0.18 : 0.2;
}

export function gunshipWorldScale(): number {
  return isPhone() ? 0.22 : 0.48;
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
  if (!isPhone()) return 70;
  return Math.max(44, Math.round(window.innerWidth * 0.16));
}

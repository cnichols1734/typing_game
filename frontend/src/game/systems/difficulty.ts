function lateGame(round: number): number {
  return round > 5 ? 0.9 : 1;
}

/** Desktop reference: ~900px tall, gunline 150px up, spawn at -40. */
const REF_TRAVEL = 790;
const MOBILE_SPEED = 0.82;
const MOBILE_SPAWN = 1.18;

export function travelPace(travelPx: number, phone: boolean): number {
  const scale = Math.max(0.28, Math.min(1.12, travelPx / REF_TRAVEL));
  return scale * (phone ? MOBILE_SPEED : 1);
}

export function enemySpeed(round: number, travelPx = REF_TRAVEL, phone = false): number {
  let speed: number;
  if (round <= 3) speed = 28 * (1 + (round - 1) * 0.1);
  else if (round <= 7) speed = 28 * (1.3 + (round - 3) * 0.15);
  else if (round <= 15) speed = 28 * (1.9 + (round - 7) ** 0.8 * 0.18);
  else speed = 28 * (3.0 + (round - 15) ** 0.9 * 0.2);
  return speed * lateGame(round) * travelPace(travelPx, phone);
}

export function spawnInterval(round: number, surge: boolean, phone = false): number {
  let ms: number;
  if (round <= 3) ms = 2000 - (round - 1) * 150;
  else if (round <= 7) ms = 2000 - 450 - (round - 3) * 180;
  else if (round <= 15) ms = Math.max(900, 2000 - 1170 - (round - 7) * 120);
  else ms = Math.max(520, 2000 - 2130 - (round - 15) * 80);
  ms /= lateGame(round);
  if (phone) ms *= MOBILE_SPAWN;
  return surge ? ms * 0.82 : ms;
}

export function maxContacts(round: number, phone = false): number {
  let n: number;
  if (round <= 3) n = 2 + Math.floor((round - 1) / 2);
  else if (round <= 7) n = 3 + Math.floor((round - 3) / 2);
  else if (round <= 15) n = Math.min(7, 5 + Math.floor((round - 7) / 3));
  else n = 8;
  return phone ? Math.max(2, n - 1) : n;
}

export const WORDS_PER_ROUND = 8;
export const ROUND_BANNER_MS = 2200;

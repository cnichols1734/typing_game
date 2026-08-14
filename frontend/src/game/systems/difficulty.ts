export function enemySpeed(round: number): number {
  if (round <= 3) return 28 * (1 + (round - 1) * 0.1);
  if (round <= 7) return 28 * (1.3 + (round - 3) * 0.15);
  if (round <= 15) return 28 * (1.9 + (round - 7) ** 0.8 * 0.18);
  return 28 * (3.0 + (round - 15) ** 0.9 * 0.2);
}

export function spawnInterval(round: number, surge: boolean): number {
  let ms: number;
  if (round <= 3) ms = 2000 - (round - 1) * 150;
  else if (round <= 7) ms = 2000 - 450 - (round - 3) * 180;
  else if (round <= 15) ms = Math.max(900, 2000 - 1170 - (round - 7) * 120);
  else ms = Math.max(520, 2000 - 2130 - (round - 15) * 80);
  return surge ? ms * 0.82 : ms;
}

export function maxContacts(round: number): number {
  if (round <= 3) return 2 + Math.floor((round - 1) / 2);
  if (round <= 7) return 3 + Math.floor((round - 3) / 2);
  if (round <= 15) return Math.min(7, 5 + Math.floor((round - 7) / 3));
  return 8;
}

export const WORDS_PER_ROUND = 8;
export const ROUND_BANNER_MS = 2200;

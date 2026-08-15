import { chance, pick, type Rng } from "../systems/rng";
import type { Hull, PowerId } from "../types";
import { BOSS_PHASES, LONG_WORDS, MEDIUM_WORDS, SHORT_WORDS, SUPPLY_WORDS } from "./banks";

export const SYSTEM_WORD: Record<string, PowerId> = {
  brake: "hold",
  aegis: "aegis",
  repel: "shove",
  surge: "surge",
  focus: "mark",
};

const ALL = [...SHORT_WORDS, ...MEDIUM_WORDS, ...LONG_WORDS];

function initial(word: string): string {
  return word[0]!.toLowerCase();
}

function poolForRound(round: number, rng: Rng): readonly string[] {
  const rand = rng();
  if (round <= 2) {
    return rand < 0.72 ? SHORT_WORDS : MEDIUM_WORDS;
  }
  if (round <= 4) {
    if (rand < 0.35) return SHORT_WORDS;
    if (rand < 0.85) return MEDIUM_WORDS;
    return LONG_WORDS.filter((w) => w.length <= 8);
  }
  if (round <= 7) {
    const longChance = 0.1 * (round - 4);
    if (rand < Math.max(0.08, 0.28 - 0.08 * (round - 5))) return SHORT_WORDS;
    if (rand < 1 - longChance) return MEDIUM_WORDS;
    return LONG_WORDS.filter((w) => w.length < 10);
  }
  if (round <= 10) {
    if (rand < 0.12) return SHORT_WORDS;
    if (rand < 0.55) return MEDIUM_WORDS;
    const maxLen = Math.min(9, 6 + Math.floor((round - 8) / 1.5));
    return LONG_WORDS.filter((w) => w.length <= maxLen);
  }
  if (round <= 15) {
    if (rand < 0.08) return SHORT_WORDS;
    if (rand < 0.4) return MEDIUM_WORDS;
    return LONG_WORDS;
  }
  const longPct = Math.min(0.7, 0.5 + (round - 16) * 0.02);
  const extra = Math.min(0.4, 0.15 + (round - 16) * 0.025);
  if (rand < 0.05) return SHORT_WORDS;
  if (rand < 1 - longPct) return MEDIUM_WORDS;
  if (chance(rng, extra)) return LONG_WORDS.filter((w) => w.length >= 10);
  return LONG_WORDS.filter((w) => w.length >= 7 && w.length < 10);
}

export function hullForWord(word: string, supply = false): Hull {
  if (supply) return "supply";
  if (word.length <= 3) return "fighter";
  if (word.length <= 6) return "cruiser";
  return "dreadnought";
}

export function pickWord(round: number, used: Set<string>, rng: Rng): string | null {
  const preferred = poolForRound(round, rng);
  const tryPool = (pool: readonly string[]) => {
    const open = pool.filter((w) => !used.has(initial(w)));
    return open.length ? pick(rng, open) : null;
  };
  return tryPool(preferred) ?? tryPool(ALL);
}

export function pickSupply(used: Set<string>, rng: Rng): string | null {
  const open = SUPPLY_WORDS.filter((w) => !used.has(initial(w)));
  return open.length ? pick(rng, open) : null;
}

const ALPHA = "abcdefghijklmnopqrstuvwxyz".split("");

export function pickBoltLetters(reserved: Set<string>, rng: Rng, count = 3): string[] {
  const open = ALPHA.filter((ch) => !reserved.has(ch));
  const out: string[] = [];
  while (out.length < count && open.length) {
    const i = Math.floor(rng() * open.length);
    out.push(open.splice(i, 1)[0]!);
  }
  return out;
}

export function bossPhases(round: number, rng: Rng): [string, string] {
  const set = BOSS_PHASES[Math.floor((round / 3 - 1) % BOSS_PHASES.length)]!;
  if (rng() < 0.5) return [set[0], set[1]];
  const longs = LONG_WORDS.filter((w) => w.length >= 7);
  const a = pick(rng, longs);
  const b = pick(rng, longs.filter((w) => initial(w) !== initial(a))) || a;
  return [a, b];
}

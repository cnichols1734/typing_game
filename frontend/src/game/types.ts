export type Mode = "arcade";

export type ScorePeriod = "all" | "day";

export type Hull = "fighter" | "cruiser" | "dreadnought" | "capital" | "supply";

export type PowerId = "hold" | "aegis" | "shove" | "surge" | "mark";

export type Banner = { title: string; sub?: string };

export type RunSummary = {
  score: number;
  round: number;
  wpm: number;
  accuracy: number;
  bestStreak: number;
  mode: Mode;
  seed: string;
};

export type HudState = {
  score: number;
  round: number;
  shields: number;
  aegis: boolean;
  streak: number;
  multiplier: number;
  wpm: number;
  salvo: number;
  powers: { id: PowerId; remain: number }[];
};

export type ScoreRow = {
  id: number;
  callsign: string;
  score: number;
  round: number;
  wpm: number;
  accuracy: number;
  best_streak: number;
  mode: string;
  seed: string | null;
  created_at: string;
};


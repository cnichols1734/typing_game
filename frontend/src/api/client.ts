import type { DailyInfo, Mode, RunSummary, ScoreRow } from "../game/types";

async function json<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export function fetchHealth(): Promise<{ ok: boolean }> {
  return json("/api/health");
}

export function fetchDaily(): Promise<DailyInfo> {
  return json("/api/daily");
}

export function fetchScores(mode: Mode, limit = 12): Promise<{ scores: ScoreRow[] }> {
  return json(`/api/scores?mode=${mode}&limit=${limit}`);
}

export function postScore(run: RunSummary, callsign: string): Promise<{
  ok: boolean;
  kept?: boolean;
  id: number;
  score?: number;
}> {
  return json("/api/scores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callsign,
      score: run.score,
      round: run.round,
      wpm: run.wpm,
      accuracy: run.accuracy,
      best_streak: run.bestStreak,
      mode: run.mode,
      seed: run.seed,
    }),
  });
}

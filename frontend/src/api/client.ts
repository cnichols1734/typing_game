import type { PlayPlatform, RunSummary, ScorePeriod, ScoreRow } from "../game/types";
import { playPlatform } from "../game/systems/layout";

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

export function fetchScores(
  period: ScorePeriod,
  limit = 5,
  platform: PlayPlatform = playPlatform(),
): Promise<{ scores: ScoreRow[] }> {
  const params = new URLSearchParams({
    period,
    platform,
    limit: String(limit),
  });
  if (period === "day") {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    params.set("day", `${now.getFullYear()}-${month}-${day}`);
    params.set("tz", String(now.getTimezoneOffset()));
  }
  return json(`/api/scores?${params}`);
}

export function postScore(run: RunSummary, callsign: string): Promise<{
  ok: boolean;
  id: number;
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
      seed: run.seed,
      platform: run.platform,
    }),
  });
}

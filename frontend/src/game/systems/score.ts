export function streakMultiplier(streak: number): number {
  if (streak >= 25) return 3;
  if (streak >= 15) return 2.2;
  if (streak >= 8) return 1.6;
  if (streak >= 4) return 1.3;
  return 1;
}

export function wordPoints(length: number, streak: number, surge: boolean): number {
  const base = length * 10;
  const mult = streakMultiplier(streak) * (surge ? 2 : 1);
  return Math.round(base * mult);
}

export class Telemetry {
  correct = 0;
  missed = 0;
  private stamps: number[] = [];

  hit(): void {
    this.correct += 1;
    const now = performance.now();
    this.stamps.push(now);
    const cutoff = now - 5000;
    this.stamps = this.stamps.filter((t) => t >= cutoff);
  }

  miss(): void {
    this.missed += 1;
  }

  get wpm(): number {
    if (this.stamps.length < 2) return 0;
    const span = (this.stamps[this.stamps.length - 1]! - this.stamps[0]!) / 60000;
    if (span <= 0) return 0;
    return (this.stamps.length / 5) / Math.max(span, 1 / 60);
  }

  get accuracy(): number {
    const total = this.correct + this.missed;
    if (total === 0) return 1;
    return this.correct / total;
  }
}

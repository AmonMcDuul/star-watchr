import { AstroCard } from "../models/astro-card.model";

export interface BestHoursResult {
  from: number;
  to: number;
  avgScore: number;
}

export function findBestTwoHours(cards: AstroCard[]): BestHoursResult | null {
  if (cards.length < 2) return null;

  let best: BestHoursResult | null = null;

  for (let i = 0; i < cards.length - 1; i++) {
    const a = cards[i];
    const b = cards[i + 1];

    const hour = a.timepoint % 24;
    const isNight = hour >= 20 || hour <= 6;
    if (!isNight) continue;

    const avg = Math.round((a.score + b.score) / 2);

    if (!best || avg > best.avgScore) {
      best = {
        from: a.timepoint,
        to: b.timepoint,
        avgScore: avg,
      };
    }
  }

  return best;
}

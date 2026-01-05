import { AstroDataPoint } from '../models/astro-data-point.model';

function normalizeCloud(c: number) {
  return 1 - (c - 1) / 8;
}

function normalizeSeeing(s: number) {
  return (s - 1) / 7;
}

function normalizeTransparency(t: number) {
  return (t - 1) / 7;
}

export function calculateAstroScore(d: AstroDataPoint): number {
  const cloud = normalizeCloud(d.cloudcover);
  const seeing = normalizeSeeing(d.seeing);
  const transparency = normalizeTransparency(d.transparency);

  const score =
    cloud * 0.55 +
    seeing * 0.25 +
    transparency * 0.20;

  return Math.round(score * 100);
}

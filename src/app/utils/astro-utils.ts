import { AstroCardVM } from "../models/astro-card-viewmodel";
import { AstroDataPoint } from "../models/astro-data-point-model";

export function cloudLabelFromValue(value: number): string {
  if (value <= 2) return 'Perfect';
  if (value <= 4) return 'Helder';
  if (value <= 6) return 'Licht bewolkt';
  if (value <= 8) return 'Matig';
  return 'Slecht';
}

export function calculateScore(d: AstroDataPoint): number {
  return Math.round(
    (10 - d.cloudcover) * 2 +
    d.seeing * 1.5 +
    d.transparency * 1.5
  );
}

export function mapToAstroCardVM(d: AstroDataPoint): AstroCardVM {
  return {
    timepoint: d.timepoint,
    score: calculateScore(d),
    cloudLabel: cloudLabelFromValue(d.cloudcover),
    cloudcover: d.cloudcover,
    seeing: d.seeing,
    transparency: d.transparency,
    temperature: d.temp2m,
    wind: `${d.wind10m.direction} ${d.wind10m.speed}`,
  };
}

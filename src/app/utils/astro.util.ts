import { AstroCard } from '../models/astro-card.model';
import { AstroDataPoint } from '../models/astro-data-point.model';

export function calculateScore(d: AstroDataPoint): number {
  // gewogen, max ≈ 100
  const cloud = (9 - d.cloudcover) / 8;
  const seeing = d.seeing / 8;
  const transparency = d.transparency / 8;

  return Math.round(
    cloud * 50 +
    seeing * 25 +
    transparency * 25
  );
}

export function cloudLabelFromValue(v: number): string {
  if (v <= 2) return 'Perfect';
  if (v <= 4) return 'Helder';
  if (v <= 6) return 'Licht bewolkt';
  if (v <= 8) return 'Matig';
  return 'Slecht';
}

export function mapToAstroCardVM(
  d: AstroDataPoint,
  init: Date
): AstroCard {

  const base =
    init instanceof Date && !isNaN(init.getTime())
      ? new Date(init)
      : new Date();

  const hoursOffset =
    typeof d.timepoint === 'number'
      ? d.timepoint
      : 0;

  // forecasttijd = nu + timepoint
  const time = new Date(base.getTime() + hoursOffset * 3600_000);

  // afronden op hele uren (zoals 7timer)
  time.setMinutes(0, 0, 0);

  return {
    timepoint: d.timepoint,
    time,

    score: calculateScore(d),
    cloudLabel: cloudLabelFromValue(d.cloudcover),

    cloudcover: d.cloudcover,
    highCloudCover: -9999,
    midCloudCover: -9999,
    lowCloudCover: -9999,
    astroCloudcover: -9999,
    seeing: d.seeing,
    transparency: d.transparency,

    temperature: d.temp2m,
    windDir: d.wind10m.direction,
    windSpeed: d.wind10m.speed
  };
}

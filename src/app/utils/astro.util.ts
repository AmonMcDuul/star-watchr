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

  //voor de time dingetje hocus pocus stom
  const baseTime = init instanceof Date && !isNaN(init.getTime()) ? init.getTime() : Date.now();
  const hoursOffset = typeof d.timepoint === 'number' ? d.timepoint : 0;
  const oneDayMs = 24 * 60 * 60 * 1000;

  // const baseUtcTime = new Date();
  // baseUtcTime.setUTCHours(0,0,0,0); // begin van de dag in UTC

  // const time = new Date(baseUtcTime.getTime() + d.timepoint * 3600_000);

  return {
    timepoint: d.timepoint,
    time: new Date(baseTime + hoursOffset * 3600_000 - oneDayMs),
    // time: time,
    score: calculateScore(d),
    cloudLabel: cloudLabelFromValue(d.cloudcover),

    cloudcover: d.cloudcover,
    seeing: d.seeing,
    transparency: d.transparency,

    temperature: d.temp2m,
    windDir: d.wind10m.direction,
    windSpeed: d.wind10m.speed
  };
}

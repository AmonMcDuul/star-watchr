import { AstroCard } from '../models/astro-card.model';

function getHourlyVar(api: any, nameOptions: string[], i: number) {
  for (const n of nameOptions) {
    if (api.hourly && api.hourly[n] && api.hourly[n][i] !== undefined) {
      return api.hourly[n][i];
    }
  }
  return undefined;
}

export function mapOpenMeteoToAstroCards(api: any): AstroCard[] {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  return api.hourly.time
    .map((t: string, i: number) => ({ t: new Date(t), i }))
    .filter((x: { t: Date; i: number }) => x.t >= oneHourAgo)
    .map(({ t, i }: { t: Date; i: number }) => {
      const cloudTotal = getHourlyVar(api, ['cloudcover', 'cloud_cover'], i) ?? 0;
      const cloudHigh = getHourlyVar(api, ['cloudcover_high', 'cloud_cover_high'], i) ?? 0;
      const vis = getHourlyVar(api, ['visibility'], i) ?? 10000;
      const rh = getHourlyVar(api, ['relativehumidity_2m', 'relative_humidity_2m'], i) ?? null;
      const dew = getHourlyVar(api, ['dewpoint_2m', 'dew_point_2m'], i) ?? null;
      const t2m = getHourlyVar(api, ['temperature_2m', 'temp_2m'], i) ?? null;
      const sp = getHourlyVar(api, ['surface_pressure','pressure_msl'], i) ?? null;
      const ws10 = getHourlyVar(api, ['windspeed_10m','wind_speed_10m'], i) ?? null;
      const t850 = getHourlyVar(api, ['temperature_850hPa','temperature_850'], i) ?? null;
      const w500 = getHourlyVar(api, ['wind_speed_500hPa','wind_speed_500'], i) ?? null;

      const cloudScore = normalizeCloud(cloudTotal);

      const transparency = estimateTransparency(vis, rh, cloudHigh);

      const tempGradient = (t850 !== null && t2m !== null) ? (t2m - t850) : (t2m !== null && dew !== null ? t2m - dew : null);
      const seeing = estimateSeeing(ws10, sp, tempGradient, w500);

      const card: AstroCard = {
        time: t,
        timepoint: Math.round((t.getTime() - now.getTime()) / 3600_000),

        cloudcover: cloudScore,
        transparency,
        seeing,

        temperature: t2m,
        windSpeed: ws10,
        windDir: getHourlyVar(api, ['winddirection_10m','wind_direction_10m'], i),

        score: calculateScore({ cloudcover: cloudScore, transparency, seeing }),
        cloudLabel: ''
      };

      return card;
    });
}



function normalizeCloud(v: number): number {
  const scaled = Math.round((v / 100) * 8); // 0..8
  return Math.min(9, Math.max(1, 1 + scaled)); // maps 0->1, 100->9
}

function estimateTransparency(visibility: number, humidity: number | null, cloudHigh: number): number {
  let score = 3;

  if (visibility === undefined || visibility === null) {
    score = Math.max(1, score - 1);
  } else {
    if (visibility < 8000) score -= 1;   
    if (visibility < 4000) score -= 1;   
  }

  if (humidity !== null) {
    if (humidity > 85) score -= 1;       
  }

  if (cloudHigh !== undefined && cloudHigh !== null) {
    if (cloudHigh > 60) score -= 1;
  }

  return Math.max(1, Math.min(3, score));
}

function estimateSeeing(
  wind10m: number | null,
  surfacePressure: number | null,
  tempGradient: number | null,
  wind500hPa: number | null
): number {
  let s = 1;

  if (wind10m !== null) {
    if (wind10m > 8) s += 2;
    else if (wind10m > 4) s += 1;
  }

  if (tempGradient !== null) {
    const g = Math.abs(tempGradient);
    if (g > 10) s += 2;
    else if (g > 6) s += 1;
  }

  if (surfacePressure !== null && surfacePressure < 1010) {
    s += 1;
  }

  if (wind500hPa !== null) {
    if (wind500hPa > 80) s += 3;
    else if (wind500hPa > 50) s += 2;
    else if (wind500hPa > 30) s += 1;
  }

  s = Math.min(8, Math.max(1, Math.round(s)));

  return 9 - s;
}


function calculateScore(d: any): number {
  const cloudValue = 10 - d.cloudcover; 
  return Math.round(
    cloudValue * 5 +   
    (9 - d.seeing) * 3 / 8 * 3 + 
    d.transparency * 4
  );
}

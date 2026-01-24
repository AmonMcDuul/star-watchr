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
      // const cloudTotal = getHourlyVar(api, ['cloudcover', 'cloud_cover'], i) ?? 0;
      // const cloudHigh = getHourlyVar(api, ['cloudcover_high', 'cloud_cover_high'], i) ?? 0;
      const cloudTotal = getHourlyVar(api, ['cloudcover'], i) ?? 0;
      const cloudLow   = getHourlyVar(api, ['cloudcover_low'], i) ?? 0;
      const cloudMid   = getHourlyVar(api, ['cloudcover_mid'], i) ?? 0;
      const cloudHigh  = getHourlyVar(api, ['cloudcover_high'], i) ?? 0;
      const vis = getHourlyVar(api, ['visibility'], i) ?? 10000;
      const rh = getHourlyVar(api, ['relativehumidity_2m', 'relative_humidity_2m'], i) ?? null;
      const dew = getHourlyVar(api, ['dewpoint_2m', 'dew_point_2m'], i) ?? null;
      const t2m = getHourlyVar(api, ['temperature_2m', 'temp_2m'], i) ?? null;
      const sp = getHourlyVar(api, ['surface_pressure','pressure_msl'], i) ?? null;
      const ws10 = getHourlyVar(api, ['windspeed_10m','wind_speed_10m'], i) ?? null;
      const t850 = getHourlyVar(api, ['temperature_850hPa','temperature_850'], i) ?? null;
      const w500 = getHourlyVar(api, ['wind_speed_500hPa','wind_speed_500'], i) ?? null;

      const cloudScore = normalizeCloud(cloudTotal);
      const highCloudScore = normalizeCloud(cloudHigh);
      const midCloudScore = normalizeCloud(cloudMid);
      const lowCloudScore = normalizeCloud(cloudLow);

      let astroCloud = calculateAstroCloud(
        cloudLow,
        cloudMid,
        cloudHigh
      );
      //extra normalisatie
      if (cloudLow < 20 && cloudMid < 20 && cloudHigh > 40) {
        astroCloud = Math.max(2, astroCloud);
      }
      const transparency = estimateTransparency(vis, rh, cloudHigh);

      const tempGradient = (t850 !== null && t2m !== null) ? (t2m - t850) : (t2m !== null && dew !== null ? t2m - dew : null);
      const seeing = estimateSeeing(ws10, sp, tempGradient, w500);

      const card: AstroCard = {
        time: t,
        timepoint: Math.round((t.getTime() - now.getTime()) / 3600_000),

        cloudcover: cloudScore,
        highCloudCover: highCloudScore,
        midCloudCover: midCloudScore,
        lowCloudCover: lowCloudScore,
        astroCloudcover: astroCloud,
        transparency,
        seeing,

        temperature: t2m,
        windSpeed: ws10,
        windDir: getHourlyVar(api, ['winddirection_10m','wind_direction_10m'], i),

        score: calculateScore({ cloudcover: astroCloud, transparency, seeing }),
        cloudLabel: ''
      };

      return card;
    });
}



function normalizeCloud(v: number): number {
  const scaled = Math.round((v / 100) * 8); // 0..8
  return Math.min(9, Math.max(1, 1 + scaled)); // maps 0->1, 100->9
}

function calculateAstroCloud(
  low: number,
  mid: number,
  high: number
): number {
  const weighted =
    0.6 * low +
    0.3 * mid +
    0.1 * high;
  return normalizeCloud(weighted);
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
  let s = 3; 
  let penalties = 0;
  if (wind10m !== null) {
    if (wind10m > 7) penalties++;
  }

  if (tempGradient !== null) {
    if (Math.abs(tempGradient) > 10) penalties++;
  }

  if (surfacePressure !== null && surfacePressure < 1008) {
    penalties++;
  }

  if (wind500hPa !== null) {
    if (wind500hPa > 55) penalties++;
  }

  penalties = Math.min(2, penalties);

  s = 3 + penalties;

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

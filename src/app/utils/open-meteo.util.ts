import { AstroCard } from '../models/astro-card.model';


export function mapOpenMeteoToAstroCards(api: any): AstroCard[] {
  const now = new Date();

  return api.hourly.time
    .map((t: string, i: number) => ({ t: new Date(t), i }))
    .filter((x: { t: Date; i: number }) => x.t >= now)
    .map(({ t, i }: { t: Date; i: number }) => ({
      time: t,
      timepoint: Math.round((t.getTime() - now.getTime()) / 3600_000),
      
      cloudcover: normalizeCloud(api.hourly.cloudcover[i]),
      transparency: estimateTransparency(
        api.hourly.visibility[i],
        normalizeCloud(api.hourly.cloudcover[i])
      ),
      seeing: estimateSeeing(
        api.hourly.windspeed_10m[i],
        normalizeCloud(api.hourly.cloudcover[i])
      ),

      temperature: api.hourly.temperature_2m[i],
      windSpeed: api.hourly.windspeed_10m[i],
      windDir: api.hourly.winddirection_10m[i],

      score: 0,
      cloudLabel: ''
    }));
}



function normalizeCloud(v: number): number {
  return Math.min(9, Math.max(1, Math.round(v / 11)));
}

function estimateTransparency(visibility: number, cloud: number): number {
  if (visibility > 20000 && cloud <= 3) return 8;
  if (visibility > 15000) return 6;
  if (visibility > 8000) return 4;
  return 2;
}

function estimateSeeing(wind: number, cloud: number): number {
  if (wind < 2 && cloud <= 2) return 8;
  if (wind < 4) return 6;
  if (wind < 6) return 4;
  return 2;
}

function calculateScore(d: any): number {
  return Math.round(
    (9 - d.cloudcover) * 5 +
    d.seeing * 3 +
    d.transparency * 2
  );
}

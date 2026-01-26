import { Injectable, computed, inject, signal } from '@angular/core';
import { LocationService } from './location.service';
import SunCalc from 'suncalc';
import { PlanetVisibilityService } from './planet-visibility.server';
import { Body, Equator, Horizon, Observer } from 'astronomy-engine';
import { ForecastTimeService } from './forecast-time.service';
import { OpenMeteoService } from './open-meteo.service';

export type ForecastMode = '24h' | '24h/48h' | '48h/72h';
export type TimeWindowMode = 'coarse' | 'hourly';

@Injectable({ providedIn: 'root' })
export class ForecastContextService {
  private location = inject(LocationService);
  public planetVisibilityService = inject(PlanetVisibilityService);
  private openMeteoService = inject(OpenMeteoService);
  private time = inject(ForecastTimeService);

  private planetCache = new Map<string, string[]>();

  readonly mode = signal<ForecastMode>('24h');

  readonly astroDate = computed(() => {
    const cards = this.openMeteoService.cards();
    const offset = this.time.offsetHours();
    const stepHours = this.time.window().stepHours;

    if (!cards.length) return new Date();

    // eerste kaart + offset
    const firstIndex = Math.floor(offset / stepHours);
    const card = cards[firstIndex] ?? cards[cards.length - 1];

    const date = new Date(card.time);
    date.setHours(0, 0, 0, 0);

    return date;
  });

  readonly astroDateBase = computed(() => {
    const cards = this.openMeteoService.cards();
    if (!cards.length) return new Date();

    const card = cards[0]; 
    const date = new Date(card.time);
    date.setHours(0, 0, 0, 0);
    return date;
  });

  readonly lat = computed(() => this.location.selected()?.lat ?? 52.37);
  readonly lon = computed(() => this.location.selected()?.lon ?? 4.89);

  readonly sunTimes = computed(() => 
    SunCalc.getTimes(this.astroDate(), +this.lat(), +this.lon())
  );
  readonly moonTimes = computed(() => 
    SunCalc.getMoonTimes(this.astroDate(), +this.lat(), +this.lon())
  );

  readonly moonIllum = computed(() => 
    SunCalc.getMoonIllumination(this.astroDate())
  );
  
  readonly planetsToday = computed(() =>
    this.planetVisibilityService.visibility()
    .filter(p => p.date === this.astroDate().toISOString()
    .slice(0, 10))
  );

  readonly moonPhaseLabel = computed(() => {
      const p = this.moonIllum().phase;
      if (p < 0.03 || p > 0.97) return 'New Moon';
      if (p < 0.22) return 'Waxing Crescent';
      if (p < 0.28) return 'First Quarter';
      if (p < 0.47) return 'Waxing Gibbous';
      if (p < 0.53) return 'Full Moon';
      if (p < 0.72) return 'Waning Gibbous';
      if (p < 0.78) return 'Last Quarter';
      return 'Waning Crescent';
    });
    

  moonIllumMatrix(date: Date){
    var moonPhase = SunCalc.getMoonIllumination(date).phase
    if (moonPhase < 0.03 || moonPhase > 0.97) return 'New Moon';
    if (moonPhase < 0.22) return 'Waxing Crescent';
    if (moonPhase < 0.28) return 'First Quarter';
    if (moonPhase < 0.47) return 'Waxing Gibbous';
    if (moonPhase < 0.53) return 'Full Moon';
    if (moonPhase < 0.72) return 'Waning Gibbous';
    if (moonPhase < 0.78) return 'Last Quarter';
    return 'Waning Crescent';
  }

  setMode(mode: ForecastMode) {
    this.mode.set(mode);
  }

  isAstroNight(date: Date): 'full' | 'partial' | '' {
    const t = this.sunTimes();
    if (!t.nightEnd || !t.night) return '';

    const STEP_HOURS = 1;
    const HALF_STEP = STEP_HOURS / 2;

    const start = this.toMinutes(new Date(date.getTime() - HALF_STEP * 3600_000));
    const end = this.toMinutes(new Date(date.getTime() + HALF_STEP * 3600_000));

    const rise = this.toMinutes(t.nightEnd);
    const set = this.toMinutes(t.night);

    if (!this.overlaps(start, end, rise, set)) return '';
    if (start >= rise && end <= set) return 'full';

    return 'partial';
  }
  
moonUpAt(date: Date): 'full' | '' {
  const lat = +this.lat();
  const lon = +this.lon();

  const STEP_MS = 60 * 60 * 1000;
  const HALF_STEP_MS = STEP_MS / 2;

  const cellStart = date.getTime() - HALF_STEP_MS;
  const cellEnd   = date.getTime() + HALF_STEP_MS;

  const today = SunCalc.getMoonTimes(date, lat, lon);

  const yesterdayDate = new Date(date);
  yesterdayDate.setDate(date.getDate() - 1);
  const yesterday = SunCalc.getMoonTimes(yesterdayDate, lat, lon);

  return (
    this.overlapsMoon(today, cellStart, cellEnd) ||
    this.overlapsMoon(yesterday, cellStart, cellEnd)
  )
    ? 'full'
    : '';
}

private overlapsMoon(
  m: { rise?: Date; set?: Date },
  start: number,
  end: number
): boolean {
  if (!m.rise || !m.set) return false;

  let rise = m.rise.getTime();
  let set  = m.set.getTime();

  if (set < rise) {
    set += 24 * 60 * 60 * 1000;
  }

  return start < set && end > rise;
}




  planetsVisibleAt(date: Date): string[] {
    const key = date.getTime().toString();
    if (this.planetCache.has(key)) {
      return this.planetCache.get(key)!;
    }
  
    const observer = new Observer(
      +this.lat(),
      +this.lon(),
      0
    );
  
    const visible: string[] = [];
  
    for (const p of this.planetsToday()) {
      const body = Body[p.planet as keyof typeof Body];
  
      const equ = Equator(body, date, observer, true, true);
      const hor = Horizon(date, observer, equ.ra, equ.dec);
  
      if (hor.altitude > 0 && p.isAboveHorizonNow) {
        visible.push(p.planet.toLowerCase());
      }
    }
    this.planetCache.set(key, visible);
    return visible;
  }

  private toMinutes(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
  }

  private overlaps(start1: number, end1: number, start2: number, end2: number): boolean {
    const normalize = (s: number, e: number) => e < s ? [s, e + 1440] : [s, e];

    const [s1, e1] = normalize(start1, end1);
    const [s2, e2] = normalize(start2, end2);

    return e1 > s2 && s1 < e2;
  }
}

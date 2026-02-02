import { Injectable, computed, inject, signal } from '@angular/core';
import { LocationService } from './location.service';
import { ForecastContextService } from './forecast-context.service';
import { MessierJson, MessierObject } from '../models/messier.model';
import { Observer, Horizon } from 'astronomy-engine';
import { MessierTimeService } from './messier-time.service';

@Injectable({ providedIn: 'root' })
export class MessierService {

  private location = inject(LocationService);
  private context = inject(ForecastContextService);
  private time = inject(MessierTimeService);

  readonly difficultyFilter =
    signal<'Easy' | 'Moderate' | 'Hard' | 'Very Easy' | 'Very Hard' | null>(null);

  readonly seasonFilter =
    signal<'Winter' | 'Spring' | 'Summer' | 'Autumn' | null>(null);

  readonly constellationFilter =
    signal<string | null>(null);

  private raw = signal<MessierJson | null>(null);
  readonly loading = signal(false);

  async load() {
    if (this.raw()) return;

    this.loading.set(true);

    const res = await fetch('/assets/data/messier.json');
    this.raw.set(await res.json());

    this.loading.set(false);
  }

  readonly dateTime = computed(() => this.time.dateTime());

  readonly all = computed<MessierObject[]>(() =>
    this.raw() ? Object.values(this.raw()!.data) : []
  );

  readonly availableConstellations = computed(() => {
    const set = new Set<string>();

    this.all().forEach(m => {
      if (m.constellation) {
        set.add(m.constellation);
      }
    });

    return Array.from(set).sort();
  });


  readonly visible = computed(() => {

    if (!this.location.selected()) return [];

    const lat = this.location.selected()!.lat;
    const lon = this.location.selected()!.lon;
    const date = this.dateTime();

    const observer = new Observer(+lat, +lon, 0);

    const diffFilter = this.difficultyFilter();
    const seasonFilter = this.seasonFilter();
    const constFilter = this.constellationFilter();

    return this.all()

      .map(m => {

        const raDeg = this.raToDegrees(m.rightAscension);
        const decDeg = this.decToDegrees(m.declination);

        const hor = Horizon(date, observer, raDeg, decDeg);

        return {
          ...m,
          raDeg,
          decDeg,
          altitude: hor.altitude
        };
      })

      .filter(m => m.altitude > 10)

      .filter(m => {
        if (!diffFilter) return true;
        return m.viewingDifficulty === diffFilter;
      })

      .filter(m => {
        if (!seasonFilter) return true;
        return normalizeSeason(m.viewingSeason) === seasonFilter;
      })

      .filter(m => {
        if (!constFilter) return true;
        return m.constellation === constFilter;
      })

      .sort((a, b) => a.messierNumber - b.messierNumber);
  });


  private raToDegrees(ra: string): number {
    const [h, m, s] = ra.split(':').map(Number);
    return (h + m / 60 + s / 3600) * 15;
  }

  private decToDegrees(dec: string): number {
    const sign = dec.startsWith('-') ? -1 : 1;
    const [d, m, s] = dec.replace('+', '').replace('-', '').split(':').map(Number);
    return sign * (d + m / 60 + s / 3600);
  }
}


function normalizeSeason(v: string): 'Winter' | 'Spring' | 'Summer' | 'Autumn' {

  const s = v.toLowerCase();

  if (s.includes('winter')) return 'Winter';
  if (s.includes('spring')) return 'Spring';
  if (s.includes('summer')) return 'Summer';
  if (s.includes('autumn') || s.includes('fall')) return 'Autumn';

  return 'Summer';
}

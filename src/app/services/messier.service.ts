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
  
  private raw = signal<MessierJson | null>(null);
  readonly loading = signal(false);

  readonly hourOffset = signal(0);

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

  readonly seasonal = computed(() => {
    const m = this.context.astroDate().getMonth() + 1;
    const season =
      m === 12 || m <= 2 ? 'Winter' :
      m <= 5 ? 'Spring' :
      m <= 8 ? 'Summer' :
      'Autumn';

    return this.all().filter(o => o.viewingSeason === season);
  });

  readonly visible = computed(() => {
    const lat = this.location.selected()?.lat ?? 52.37;
    const lon = this.location.selected()?.lon ?? 4.89;
    const date = this.dateTime();

    const observer = new Observer(+lat, +lon, 0);

    return this.seasonal()
      .map(m => {
        const ra = this.raToDegrees(m.rightAscension);
        const dec = this.decToDegrees(m.declination);

        const hor = Horizon(date, observer, ra, dec);

        return {
          ...m,
          altitude: hor.altitude
        };
      })
      .filter(m => m.altitude > 0)
      .sort((a, b) => b.altitude - a.altitude);
  });

  shiftHours(delta: number) {
    this.hourOffset.update(v => v + delta);
  }

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

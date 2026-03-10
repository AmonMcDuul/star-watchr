import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { LocationService } from './location.service';
import { ForecastContextService } from './forecast-context.service';
import { MessierJson, MessierObject } from '../models/messier.model';
import { Observer, Horizon, AstroTime, RotateVector, Rotation_EQJ_EQD, SphereFromVector, VectorFromSphere, Rotation_EQD_EQJ, InverseRotation, HourAngle, Refraction, Rotation_ECL_HOR, Rotation_EQJ_HOR, SiderealTime, Body } from 'astronomy-engine';
import { MessierTimeService } from './messier-time.service';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class MessierService {
  private platformId = inject(PLATFORM_ID);
  private location = inject(LocationService);
  private context = inject(ForecastContextService);
  private time = inject(MessierTimeService);

  readonly difficultyFilter =
    signal<'Easy' | 'Moderate' | 'Hard' | 'Very Easy' | 'Very Hard' | null>(null);

  readonly seasonFilter =
    signal<'Winter' | 'Spring' | 'Summer' | 'Autumn' | null>(null);

  readonly constellationFilter =
    signal<string | null>(null);

  readonly altitudeFilter = 
    signal<number>(15);

  private messierRaw = signal<MessierJson | null>(null);
  private caldwellRaw = signal<MessierJson | null>(null);

  readonly loading = signal(false);

  readonly selectedMessier = signal<MessierObject | null>(null);
  readonly activeCatalog = signal<'M' | 'C'>('M');
  
  async load() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.messierRaw()) return;
    this.loading.set(true);
    const res = await fetch('/assets/data/messier.json');
    this.messierRaw.set(await res.json());
    this.loading.set(false);
  }
  async loadCaldwell() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.caldwellRaw()) return;
    this.loading.set(true);
    const res = await fetch('/assets/data/caldwell.json');
    this.caldwellRaw.set(await res.json());
    this.loading.set(false);
  }

  selectMessierByNumberAndCode(code: string, id: number | string | null) {
    this.selectedMessier.set(
      this.findByCodeAndNumber(code, id)
    );
  }

  getByNumberAndCode(c: string, n: number) {
    return this.findByCodeAndNumber(c, n);
  }

  private findByCodeAndNumber(code: string, id: number | string | null) {
    if (id == null) return null;

    const normalizedCode = code.toUpperCase();
    const normalizedNumber = Number(id);
    const normalizedFull = `${normalizedCode}${normalizedNumber}`;

    return this.realAll().find(m => {
      const objectCode = m.code;
      const objectNumber = m.messierNumber;

      return (
        (objectCode === normalizedCode && objectNumber === normalizedNumber) ||
        `${objectCode}${objectNumber}` === normalizedFull
      );
    }) ?? null;
  }

  readonly dateTime = computed(() => this.time.dateTime());

  readonly all = computed<MessierObject[]>(() => {
    const catalog = this.activeCatalog();

    if (catalog === 'M') {
      return this.messierRaw()
        ? Object.values(this.messierRaw()!.data)
        : [];
    }

    return this.caldwellRaw()
      ? Object.values(this.caldwellRaw()!.data)
      : [];
  });

  readonly realAll = computed<MessierObject[]>(() => {
    const messier = this.messierRaw()
      ? Object.values(this.messierRaw()!.data)
      : [];

    const caldwell = this.caldwellRaw()
      ? Object.values(this.caldwellRaw()!.data)
      : [];

    return [...messier, ...caldwell];
  });

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
    const altFilter = this.altitudeFilter();

    return this.all()

      .map(m => {

        const raDeg = this.raToDegrees(m.rightAscension);
        const decDeg = this.decToDegrees(m.declination);

        const time = new AstroTime(date);
        const sphereJ2000 = { lon: raDeg, lat: decDeg, dist: 1.0 };
        const vecJ2000 = VectorFromSphere(sphereJ2000, time);
        const rot_EQJ_HOR = Rotation_EQJ_HOR(time, observer);
        const vec_hor = RotateVector(rot_EQJ_HOR, vecJ2000);
        const sphere_hor = SphereFromVector(vec_hor);

        return {
          ...m,
          raDeg,
          decDeg,
          altitude: sphere_hor.lat
        };
      })

      .filter(m => m.altitude > altFilter)

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

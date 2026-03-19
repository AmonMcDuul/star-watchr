import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { LocationService } from './location.service';
import { ForecastContextService } from './forecast-context.service';
import { MessierJson, MessierObject } from '../models/messier.model';
import {
  Observer,
  AstroTime,
  RotateVector,
  SphereFromVector,
  VectorFromSphere,
  Rotation_EQJ_HOR,
} from 'astronomy-engine';
import { MessierTimeService } from './messier-time.service';
import { isPlatformBrowser } from '@angular/common';

import messierStaticJson from '../../assets/data/messier.json';
import caldwellStaticJson from '../../assets/data/caldwell.json';

type StaticMessierJson = {
  catalog: string;
  data: MessierObject[];
};

@Injectable({ providedIn: 'root' })
export class MessierService {
  private platformId = inject(PLATFORM_ID);
  private location = inject(LocationService);
  private context = inject(ForecastContextService);
  private time = inject(MessierTimeService);

  private messierStatic = this.normalizeStaticData(messierStaticJson.data);
  private caldwellStatic = this.normalizeStaticData(caldwellStaticJson.data);

  readonly difficultyFilter = signal<
    'Easy' | 'Moderate' | 'Hard' | 'Very Easy' | 'Very Hard' | null
  >(null);

  readonly seasonFilter = signal<'Winter' | 'Spring' | 'Summer' | 'Autumn' | null>(null);

  readonly constellationFilter = signal<string | null>(null);
  readonly altitudeFilter = signal<number>(15);

  private messierRaw = signal<MessierJson | null>(null);
  private caldwellRaw = signal<MessierJson | null>(null);

  readonly loading = signal(false);

  readonly selectedMessier = signal<MessierObject | null>(null);
  readonly activeCatalog = signal<'M' | 'C'>('M');

  // ----------------------
  // LOAD (runtime only)
  // ----------------------

  normalizeStaticData(data: any): MessierObject[] {
    if (Array.isArray(data)) {
      return data;
    }

    return Object.values(data);
  }

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

  // ----------------------
  // SELECT / FIND
  // ----------------------

  selectMessierByNumberAndCode(code: string, id: number | string | null) {
    this.selectedMessier.set(this.findByCodeAndNumber(code, id));
  }

  getByNumberAndCode(c: string, n: number) {
    return this.findByCodeAndNumber(c, n);
  }

  private findByCodeAndNumber(code: string, id: number | string | null) {
    if (id == null) return null;

    const normalizedCode = code.toUpperCase();
    const normalizedNumber = Number(id);
    const normalizedFull = `${normalizedCode}${normalizedNumber}`;

    return (
      this.realAll().find((m) => {
        return (
          (m.code === normalizedCode && m.messierNumber === normalizedNumber) ||
          `${m.code}${m.messierNumber}` === normalizedFull
        );
      }) ?? null
    );
  }

  // ----------------------
  // DATA
  // ----------------------

  readonly dateTime = computed(() => this.time.dateTime());

  readonly all = computed<MessierObject[]>(() => {
    const catalog = this.activeCatalog();

    if (catalog === 'M') {
      const raw = this.messierRaw();
      return raw ? Object.values(raw.data) : this.messierStatic;
    }

    const raw = this.caldwellRaw();
    return raw ? Object.values(raw.data) : this.caldwellStatic;
  });

  readonly realAll = computed<MessierObject[]>(() => {
    const messier = this.messierRaw() ? Object.values(this.messierRaw()!.data) : this.messierStatic;

    const caldwell = this.caldwellRaw()
      ? Object.values(this.caldwellRaw()!.data)
      : this.caldwellStatic;

    return [...messier, ...caldwell];
  });

  readonly availableConstellations = computed(() => {
    const set = new Set<string>();

    this.all().forEach((m) => {
      if (m.constellation) set.add(m.constellation);
    });

    return Array.from(set).sort();
  });

  // ----------------------
  // VISIBILITY
  // ----------------------

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
      .map((m) => {
        const raDeg = this.raToDegrees(m.rightAscension);
        const decDeg = this.decToDegrees(m.declination);

        const time = new AstroTime(date);
        const sphereJ2000 = { lon: raDeg, lat: decDeg, dist: 1.0 };
        const vecJ2000 = VectorFromSphere(sphereJ2000, time);
        const rot = Rotation_EQJ_HOR(time, observer);
        const vecHor = RotateVector(rot, vecJ2000);
        const sphereHor = SphereFromVector(vecHor);

        return {
          ...m,
          raDeg,
          decDeg,
          altitude: sphereHor.lat,
        };
      })
      .filter((m) => m.altitude > altFilter)
      .filter((m) => !diffFilter || m.viewingDifficulty === diffFilter)
      .filter((m) => !seasonFilter || normalizeSeason(m.viewingSeason) === seasonFilter)
      .filter((m) => !constFilter || m.constellation === constFilter)
      .sort((a, b) => a.messierNumber - b.messierNumber);
  });

  // ----------------------
  // UTILS
  // ----------------------

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

// ----------------------
// HELPERS
// ----------------------

function normalizeSeason(v: string): 'Winter' | 'Spring' | 'Summer' | 'Autumn' {
  const s = v.toLowerCase();

  if (s.includes('winter')) return 'Winter';
  if (s.includes('spring')) return 'Spring';
  if (s.includes('summer')) return 'Summer';
  if (s.includes('autumn') || s.includes('fall')) return 'Autumn';

  return 'Summer';
}

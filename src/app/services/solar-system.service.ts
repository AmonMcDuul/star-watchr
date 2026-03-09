import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { LocationService } from './location.service';
import { ForecastContextService } from './forecast-context.service';

import {
  Observer,
  AstroTime,
  RotateVector,
  Rotation_EQJ_HOR,
  SphereFromVector,
  VectorFromSphere
} from 'astronomy-engine';
import { SolarSystemBody } from '../models/solar-system/solar-system-body.model';
import { Asteroid } from '../models/solar-system/asteroid.model';
import { Comet } from '../models/solar-system/comet.model';
import { DwarfPlanet } from '../models/solar-system/dwarf-planet.model';
import { Moon } from '../models/solar-system/moon.model';
import { Planet } from '../models/solar-system/planet.model';
import { Sun } from '../models/solar-system/sun.model';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class SolarSystemService {
    private location = inject(LocationService);
    private context = inject(ForecastContextService);
    private platformId = inject(PLATFORM_ID);

    private sunRaw = signal<Sun | null>(null);
    private planetsRaw = signal<Planet[] | null>(null);
    private moonsRaw = signal<Moon[] | null>(null);
    private dwarfRaw = signal<DwarfPlanet[] | null>(null);
    private asteroidsRaw = signal<Asteroid[] | null>(null);
    private cometsRaw = signal<Comet[] | null>(null);

  readonly loading = signal(false);

  readonly selectedObject = signal<SolarSystemBody | null>(null);

  readonly typeFilter =
    signal<'planet' | 'moon' | 'dwarf' | 'asteroid' | 'comet' | null>(null);

  readonly altitudeFilter =
    signal<number>(0);

  async load() {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.planetsRaw()) return;

    this.loading.set(true);

    const [sun, planets, moons, dwarf, asteroids, comets] =
    await Promise.all([
        fetch('/assets/data/solar-system/star.json').then(r => r.json()),
        fetch('/assets/data/solar-system/planets.json').then(r => r.json()),
        fetch('/assets/data/solar-system/moons.json').then(r => r.json()),
        fetch('/assets/data/solar-system/dwarf-planets.json').then(r => r.json()),
        fetch('/assets/data/solar-system/asteroids.json').then(r => r.json()),
        fetch('/assets/data/solar-system/comets.json').then(r => r.json())
    ]);

    this.sunRaw.set(sun);
    this.planetsRaw.set(planets);
    this.moonsRaw.set(moons);
    this.dwarfRaw.set(dwarf);
    this.asteroidsRaw.set(asteroids);
    this.cometsRaw.set(comets);

    this.loading.set(false);

  }

    readonly sun = computed(() => this.sunRaw());

    readonly planets = computed<Planet[]>(() =>
      this.planetsRaw() ?? []
    );

    readonly moons = computed<Moon[]>(() =>
      this.moonsRaw() ?? []
    );

    readonly dwarfPlanets = computed<DwarfPlanet[]>(() =>
      this.dwarfRaw() ?? []
    );

    readonly asteroids = computed<Asteroid[]>(() =>
      this.asteroidsRaw() ?? []
    );

    readonly comets = computed<Comet[]>(() =>
      this.cometsRaw() ?? []
    );

    readonly planetsOfSun = computed(() =>
      this.planets()
    );

    moonsOfPlanet(planetId: string) {
      return this.moons()
        .filter(m => m.parentPlanet === planetId);
    }

    planetOfMoon(moonId: string) {
      const moon = this.moons()
        .find(m => m.id === moonId);

      if (!moon) return null;

      return this.planets()
        .find(p => p.id === moon.parentPlanet);

    }

    siblingMoons(moonId: string) {
      const moon = this.moons()
        .find(m => m.id === moonId);

      if (!moon) return [];

      return this.moons()
        .filter(m =>
          m.parentPlanet === moon.parentPlanet &&
          m.id !== moonId
        );

    }

  select(id: string) {
    this.selectedObject.set(
      this.all().find(o => o.id === id) ?? null
    );
  }

    readonly all = computed(() => {

    const sun = this.sun();
    const planets = this.planets();
    const moons = this.moons();
    const dwarf = this.dwarfPlanets();
    const asteroids = this.asteroids();
    const comets = this.comets();

    return [
        ...(sun ? [sun] : []),
        ...planets,
        ...moons,
        ...dwarf,
        ...asteroids,
        ...comets
    ];

    });

  readonly filtered = computed(() => {

    const type = this.typeFilter();

    if (!type) return this.all();

    return this.all().filter(o => o.type === type);

  });

  readonly visible = computed(() => {

    if (!this.location.selected()) return [];

    const lat = this.location.selected()!.lat;
    const lon = this.location.selected()!.lon;
    const date = this.context.astroDate();

    const observer = new Observer(+lat, +lon, 0);

    const altFilter = this.altitudeFilter();

    return this.filtered()

      .map(obj => {

        if (!obj.rightAscension || !obj.declination) return obj;

        const raDeg = this.raToDegrees(obj.rightAscension);
        const decDeg = this.decToDegrees(obj.declination);

        const time = new AstroTime(date);

        const sphere = { lon: raDeg, lat: decDeg, dist: 1 };

        const vec = VectorFromSphere(sphere, time);

        const rot = Rotation_EQJ_HOR(time, observer);

        const hor = RotateVector(rot, vec);

        const sphereHor = SphereFromVector(hor);

        return {
          ...obj,
          altitude: sphereHor.lat
        };

      })

    //   .filter(o => o.altitude === undefined || o.altitude > altFilter);

  });

  private raToDegrees(ra: string): number {

    const [h, m, s] = ra.split(':').map(Number);

    return (h + m / 60 + s / 3600) * 15;

  }

  private decToDegrees(dec: string): number {

    const sign = dec.startsWith('-') ? -1 : 1;

    const [d, m, s] =
      dec.replace('+', '').replace('-', '').split(':').map(Number);

    return sign * (d + m / 60 + s / 3600);

  }

}
import { Injectable, signal, computed } from '@angular/core';
import {
  Body,
  Observer,
  SearchRiseSet,
  Equator,
  Horizon,
} from 'astronomy-engine';
import { PlanetVisibility } from '../models/planet-visibility.model';

@Injectable({ providedIn: 'root' })
export class PlanetVisibilityService {
    readonly latitude = signal<number>(52);
    readonly longitude = signal<number>(5);
    readonly elevation = signal<number>(0);
    readonly date = signal<Date>(new Date());
  
    private planets = [
      Body.Mercury,
      Body.Venus,
      Body.Mars,
      Body.Jupiter,
      Body.Saturn,
      Body.Uranus,
      Body.Neptune
    ];
  
    readonly visibility = computed(() => {
      const lat = this.latitude();
      const lon = this.longitude();
      const elev = this.elevation();
      const baseDate = this.date();
  
      const observer = new Observer(lat, lon, elev);
      const now = new Date();
  
      const result: PlanetVisibility[] = [];
  
      for (const planet of this.planets) {
        const rise = SearchRiseSet(planet, observer, +1, baseDate, 1);
        const set = SearchRiseSet(planet, observer, -1, baseDate, 1);
  
        const equ = Equator(planet, now, observer, true, true);
        const hor = Horizon(now, observer, equ.ra, equ.dec);
  
        result.push({
          planet: Body[planet],
          date: baseDate.toISOString().slice(0, 10),
          riseDateTime: rise?.date.toISOString() ?? null,
          setDateTime: set?.date.toISOString() ?? null,
          isAboveHorizonNow: hor.altitude > 0
        });
      }
  
      return result;
    });
  
    setLocation(date: Date, lat: number, lon: number, elev = 0) {
      this.date.set(date);
      this.latitude.set(lat);
      this.longitude.set(lon);
      this.elevation.set(elev);
    }
  }
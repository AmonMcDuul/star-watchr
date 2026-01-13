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
  
    private matrixTimes(hours: number[] = [0,3,6,9,12,15,18,21]): Date[] {
      const baseDate = this.date();
      return hours.map(h => {
        const d = new Date(baseDate);
        d.setHours(h, 0, 0, 0);
        return d;
      });
    }
    
    isTimeBetween(time: Date, start: Date, end: Date) {
      const t = time.getHours() * 3600 + time.getMinutes() * 60 + time.getSeconds();
      const s = start.getHours() * 3600 + start.getMinutes() * 60 + start.getSeconds();
      const e = end.getHours() * 3600 + end.getMinutes() * 60 + end.getSeconds();
    
      if (s <= e) return t >= s && t <= e;
      return t >= s || t <= e;
    }

    readonly visibility = computed(() => {
      const lat = this.latitude();
      const lon = this.longitude();
      const elev = this.elevation();
      const baseDate = this.date();
  
      const observer = new Observer(lat, lon, elev);
      const now = new Date();
  
      const result: PlanetVisibility[] = [];
      const times = this.matrixTimes();

      for (const planet of this.planets) {
        const rise = SearchRiseSet(planet, observer, +1, baseDate, 1);
        const set = SearchRiseSet(planet, observer, -1, baseDate, 1);
  
        let isAboveHorizon = false;

        for (const time of times) {
          const equ = Equator(planet, time, observer, true, true);
          const hor = Horizon(time, observer, equ.ra, equ.dec);
    
          const visible =
            hor.altitude > 0 &&
            (!rise || !set || this.isTimeBetween(time, rise.date, set.date));
    
          if (visible) {
            isAboveHorizon = true;
            break; 
          }
        }
  
        result.push({
          planet: Body[planet],
          date: baseDate.toISOString().slice(0, 10),
          riseDateTime: rise?.date.toISOString() ?? null,
          setDateTime: set?.date.toISOString() ?? null,
          isAboveHorizonNow: isAboveHorizon
        });
      }
      console.log(result)
      return result;
    });
  
    setLocation(date: Date, lat: number, lon: number, elev = 0) {
      this.date.set(date);
      this.latitude.set(lat);
      this.longitude.set(lon);
      this.elevation.set(elev);
    }
  }
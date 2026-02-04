import { Injectable, signal } from '@angular/core';
import { Star } from '../models/star.model';
import { Constellation, ConstellationLine } from '../models/constellation.model';
import { STAR_ALIASES } from '../../assets/data/star-aliases.data';
import { CONSTELLATION_DEFS } from '../../assets/data/constellations.data';

@Injectable({ providedIn: 'root' })
export class StarCatalogService {
  private raw = signal<Star[] | null>(null);
  private constellationCache: Constellation[] | null = null;

  private nameIndex = new Map<string, Star>();
  readonly maxMagnitude = signal(5.0);
  readonly loading = signal(false);


async load() {

  if (this.raw()) return;

  this.loading.set(true);

  const res = await fetch('/assets/data/stars-mag6.json');
  const stars: Star[] = await res.json();

  this.raw.set(stars);

  this.buildNameIndex(stars);

  this.constellationCache = null;

  this.loading.set(false);
}


  private buildNameIndex(stars: Star[]) {

    this.nameIndex.clear();

    const reverseAlias = new Map<string,string>();

    Object.entries(STAR_ALIASES).forEach(([proper,bayer])=>{
      reverseAlias.set(bayer.toLowerCase(), proper.toLowerCase());
    });

    stars.forEach(s => {

      if (!s.name) return;

      const base = s.name.toLowerCase().trim();

      this.nameIndex.set(base, s);

      const proper = reverseAlias.get(base);
      if (proper) {
        this.nameIndex.set(proper, s);
      }

    });
  }


  findStarByName(name: string): Star | null {

    const key = name.toLowerCase().trim();

    return this.nameIndex.get(key) ?? null;
  }


  private buildConstellations(): Constellation[] {
    if (!this.raw()) {
      return [];
    }

    const result: Constellation[] = [];
    let missing = 0;

    CONSTELLATION_DEFS.forEach(def => {

      const lines: ConstellationLine[] = [];

      def.connections.forEach(([a,b]) => {

        const s1 = this.findStarByName(a);
        const s2 = this.findStarByName(b);

        if (!s1 || !s2) {
          missing++;
          return;
        }

        lines.push({
          from:{ra:s1.ra,dec:s1.dec},
          to:{ra:s2.ra,dec:s2.dec}
        });

      });

      if (lines.length) {
        result.push({
          name:def.name,
          abbreviation:def.abbreviation,
          lines
        });
      }

    });

    return result;
  }

  getConstellations(): Constellation[] {

    if (!this.raw()) return [];

    if (!this.constellationCache) {
      this.constellationCache = this.buildConstellations();
    }

    return this.constellationCache;
  }

  getConstellationsInView(
    ra: number,
    dec: number,
    radius: number
  ): Constellation[] {
    
    return this.getConstellations().filter(c => {
      const allLinesInView = c.lines.every(l => {
        const fromDist = this.angularDistanceDeg(ra, dec, l.from.ra, l.from.dec);
        const toDist = this.angularDistanceDeg(ra, dec, l.to.ra, l.to.dec);
        return fromDist <= radius && toDist <= radius;
      });
      
      return allLinesInView;
    });
  }

  getStarsNear(ra:number, dec:number, radius:number): Star[] {

    const stars = this.raw();
    if (!stars) return [];

    const maxMag = this.maxMagnitude();

    return stars.filter(s =>
      s.mag <= maxMag &&
      this.angularDistanceDeg(ra,dec,s.ra,s.dec) <= radius
    );
  }

  setStarDensity(level: 'sparse' | 'normal' | 'dense') {

    switch(level) {
      case 'sparse':
        this.maxMagnitude.set(4.0);
        break;

      case 'normal':
        this.maxMagnitude.set(5.0);
        break;

      case 'dense':
        this.maxMagnitude.set(6.0);
        break;
    }
  }


  private angularDistanceDeg(
    ra1:number, dec1:number,
    ra2:number, dec2:number
  ) {

    const d2r = Math.PI/180;

    const φ1 = dec1*d2r;
    const φ2 = dec2*d2r;

    const Δφ = (dec2-dec1)*d2r;
    const Δλ = (ra2-ra1)*d2r;

    const a =
      Math.sin(Δφ/2)**2 +
      Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;

    return 2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))/d2r;
  }

}

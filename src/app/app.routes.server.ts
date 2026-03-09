import { RenderMode, ServerRoute } from '@angular/ssr';

import caldwellCatalog from '../assets/data/caldwell.json';
import messierCatalog from '../assets/data/messier.json';

import planets from '../assets/data/solar-system/planets.json';
import moons from '../assets/data/solar-system/moons.json';
import dwarfPlanets from '../assets/data/solar-system/dwarf-planets.json';
import asteroids from '../assets/data/solar-system/asteroids.json';
import comets from '../assets/data/solar-system/comets.json';
import sun from '../assets/data/solar-system/star.json';

/* ---------------- DSO routes ---------------- */

const messierIds = Object.keys(messierCatalog.data).map(id => ({
  id: id.toLowerCase()
}));

const caldwellIds = caldwellCatalog.data.map((d: any) => ({
  id: `c${d.messierNumber}`
}));

/* ---------------- Solar system routes ---------------- */

const solarParams = [

  { type: 'sun', id: sun.id },

  ...planets.map((p: any) => ({
    type: 'planets',
    id: p.id
  })),

  ...moons.map((m: any) => ({
    type: 'moons',
    id: m.id
  })),

  ...dwarfPlanets.map((d: any) => ({
    type: 'dwarf-planets',
    id: d.id
  })),

  ...asteroids.map((a: any) => ({
    type: 'asteroids',
    id: a.id
  })),

  ...comets.map((c: any) => ({
    type: 'comets',
    id: c.id
  }))

];

export const serverRoutes: ServerRoute[] = [

  /* ---------------- DSO ---------------- */

  {
    path: 'dso/:id',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return [
        ...messierIds,
        ...caldwellIds
      ];
    }
  },

  /* ---------------- Solar system ---------------- */

  {
    path: 'solar-system/:type/:id',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return solarParams;
    }
  },

  /* ---------------- Everything else ---------------- */

  {
    path: '**',
    renderMode: RenderMode.Prerender
  }

];
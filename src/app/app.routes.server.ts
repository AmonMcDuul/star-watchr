import { RenderMode, ServerRoute } from '@angular/ssr';

import caldwellCatalog from '../assets/data/caldwell.json';
import messierCatalog from '../assets/data/messier.json';

const messierIds = Object.keys(messierCatalog.data).map(id => ({
  id: id.toLowerCase()
}));

const caldwellIds = caldwellCatalog.data.map((d: any) => ({
  id: `c${d.messierNumber}`
}));

export const serverRoutes: ServerRoute[] = [
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

  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
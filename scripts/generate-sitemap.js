const fs = require('fs');

const messier = require('../src/assets/data/messier.json');
const caldwell = require('../src/assets/data/caldwell.json');

const planets = require('../src/assets/data/solar-system/planets.json');
const moons = require('../src/assets/data/solar-system/moons.json');
const dwarf = require('../src/assets/data/solar-system/dwarf-planets.json');
const asteroids = require('../src/assets/data/solar-system/asteroids.json');
const comets = require('../src/assets/data/solar-system/comets.json');
const sun = require('../src/assets/data/solar-system/star.json');

const baseUrl = 'https://starwatchr.com';

const routes = [
  '/',
  '/about',
  '/contact',
  '/apod',
  '/solar-system',
  '/sky-atlas',
  '/dso-forecast'
];

const messierRoutes = Object.keys(messier.data)
  .map(id => `/dso/${id.toLowerCase()}`);

const caldwellRoutes = caldwell.data
  .map(d => `/dso/c${d.messierNumber}`);

const solarRoutes = [
  `/solar-system/sun/${sun.id}`,
  ...planets.map(p => `/solar-system/planets/${p.id}`),
  ...moons.map(m => `/solar-system/moons/${m.id}`),
  ...dwarf.map(d => `/solar-system/dwarf-planets/${d.id}`),
  ...asteroids.map(a => `/solar-system/asteroids/${a.id}`),
  ...comets.map(c => `/solar-system/comets/${c.id}`)
];

const allRoutes = [
  ...routes,
  ...messierRoutes,
  ...caldwellRoutes,
  ...solarRoutes
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allRoutes.map(r => `
  <url>
    <loc>${baseUrl}${r}</loc>
  </url>`).join('')}
</urlset>`;

fs.mkdirSync('dist/star-watchr/browser', { recursive: true });

fs.writeFileSync('dist/star-watchr/browser/sitemap.xml', xml);

console.log(`Generated sitemap with ${allRoutes.length} routes`);
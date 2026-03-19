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

// 👉 build timestamp (1x per build)
const lastmod = new Date().toISOString().split('T')[0];

// ----------------------
// STATIC ROUTES
// ----------------------

const routes = [
  { path: '/', priority: 1.0, changefreq: 'daily' },
  { path: '/about', priority: 0.5, changefreq: 'monthly' },
  { path: '/contact', priority: 0.5, changefreq: 'monthly' },
  { path: '/apod', priority: 0.8, changefreq: 'daily' },
  { path: '/solar-system', priority: 0.8, changefreq: 'weekly' },
  { path: '/sky-atlas', priority: 0.8, changefreq: 'weekly' },
  { path: '/dso-forecast', priority: 0.9, changefreq: 'daily' },
];

// ----------------------
// MESSIER
// ----------------------

const messierRoutes = Object.keys(messier.data).map((id) => ({
  path: `/dso/${id.toLowerCase()}`,
  priority: 0.7,
  changefreq: 'weekly',
}));

// ----------------------
// CALDWELL
// ----------------------

const caldwellRoutes = caldwell.data.map((d) => ({
  path: `/dso/c${d.messierNumber}`,
  priority: 0.7,
  changefreq: 'weekly',
}));

// ----------------------
// SOLAR SYSTEM
// ----------------------

const solarRoutes = [
  { path: `/solar-system/sun/${sun.id}`, priority: 0.7, changefreq: 'weekly' },

  ...planets.map((p) => ({
    path: `/solar-system/planets/${p.id}`,
    priority: 0.7,
    changefreq: 'weekly',
  })),

  ...moons.map((m) => ({
    path: `/solar-system/moons/${m.id}`,
    priority: 0.6,
    changefreq: 'monthly',
  })),

  ...dwarf.map((d) => ({
    path: `/solar-system/dwarf-planets/${d.id}`,
    priority: 0.6,
    changefreq: 'monthly',
  })),

  ...asteroids.map((a) => ({
    path: `/solar-system/asteroids/${a.id}`,
    priority: 0.5,
    changefreq: 'monthly',
  })),

  ...comets.map((c) => ({
    path: `/solar-system/comets/${c.id}`,
    priority: 0.5,
    changefreq: 'monthly',
  })),
];

// ----------------------
// MERGE
// ----------------------

const allRoutes = [...routes, ...messierRoutes, ...caldwellRoutes, ...solarRoutes];

// ----------------------
// XML GENERATION
// ----------------------

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allRoutes
  .map(
    (r) => `
  <url>
    <loc>${baseUrl}${r.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`,
  )
  .join('')}
</urlset>`;

// ----------------------
// WRITE
// ----------------------

fs.mkdirSync('dist/star-watchr/browser', { recursive: true });

fs.writeFileSync('dist/star-watchr/browser/sitemap.xml', xml);

console.log(`Generated sitemap with ${allRoutes.length} routes`);

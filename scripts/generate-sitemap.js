const fs = require('fs');

const messier = require('../src/assets/data/messier.json');
const caldwell = require('../src/assets/data/caldwell.json');

const baseUrl = 'https://starwatchr.com';

const routes = [
  '/',
  '/about',
  '/contact',
  '/alerts',
  '/apod',
  '/solar-system',
  '/sky-atlas',
  '/dso-forecast'
];

const messierRoutes = Object.keys(messier.data)
  .map(id => `/dso/${id.toLowerCase()}`);

const caldwellRoutes = caldwell.data
  .map(d => `/dso/c${d.messierNumber}`);

const allRoutes = [
  ...routes,
  ...messierRoutes,
  ...caldwellRoutes
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
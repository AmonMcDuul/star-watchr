const fs = require("fs");

const messier = require("../src/assets/data/messier.json");
const caldwell = require("../src/assets/data/caldwell.json");

const planets = require("../src/assets/data/solar-system/planets.json");
const moons = require("../src/assets/data/solar-system/moons.json");
const dwarf = require("../src/assets/data/solar-system/dwarf-planets.json");
const asteroids = require("../src/assets/data/solar-system/asteroids.json");
const comets = require("../src/assets/data/solar-system/comets.json");
const sun = require("../src/assets/data/solar-system/star.json");

const routes = [
  "/",
  "/about",
  "/contact",
  "/alerts",
  "/apod",
  "/solar-system",
  "/sky-atlas",
  "/dso-forecast"
];

const messierRoutes = Object.keys(messier.data)
  .map(k => `/dso/${k.toLowerCase()}`);

const caldwellRoutes = caldwell.data
  .map(d => `/dso/c${d.messierNumber}`);

/* solar system */

const solarRoutes = [
  `/solar-system/sun/${sun.id}`,
  ...planets.map(p => `/solar-system/planets/${p.id}`),
  ...moons.map(m => `/solar-system/moons/${m.id}`),
  ...dwarf.map(d => `/solar-system/dwarf-planets/${d.id}`),
  ...asteroids.map(a => `/solar-system/asteroids/${a.id}`),
  ...comets.map(c => `/solar-system/comets/${c.id}`)
];

routes.push(...messierRoutes);
routes.push(...caldwellRoutes);
routes.push(...solarRoutes);

fs.writeFileSync(
  "./src/prerender-routes.txt",
  routes.join("\n")
);

console.log(`Generated ${routes.length} prerender routes`);
const fs = require("fs");

const caldwell = require("../src/assets/data/caldwell.json");
const messier = require("../src/assets/data/messier.json");

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

const messierRoutes = Object.keys(messier.data).map(
  k => `/dso/${k.toLowerCase()}`
);

const caldwellRoutes = caldwell.data.map(
  d => `/dso/c${d.messierNumber}`
);

routes.push(...messierRoutes);
routes.push(...caldwellRoutes);

fs.writeFileSync(
  "./src/prerender-routes.txt",
  routes.join("\n")
);
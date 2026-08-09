import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SolarSystemService } from '../../services/solar-system.service';
import { AstroTime, Body, Equator, Observer } from "astronomy-engine";
import { LocationService } from "../../services/location.service";
import { MessierTimeService } from "../../services/messier-time.service";
import { AltitudeGraphComponent } from '../../components/altitude-graph/altitude-graph.component';
import { SolarOrbitComponent } from '../../components/solar-orbit/solar-orbit.component';
import { Moon } from '../../models/solar-system/moon.model';
import { SolarSystemBody } from '../../models/solar-system/solar-system-body.model';
import { SeoService } from '../../services/seo.service';

import { SolarSystemPageContentService } from '../../services/solar-system-page-content.service';
function isMoon(body: SolarSystemBody): body is Moon {
  return body.type === 'moon';
}

@Component({
  selector: 'app-solar-system-detail',
  imports: [CommonModule, RouterLink, AltitudeGraphComponent, SolarOrbitComponent],
  templateUrl: './solar-system-detail.component.html',
  styleUrl: './solar-system-detail.component.scss'
})
export class SolarSystemDetailComponent {
  readonly seo = inject(SeoService);
  solar = inject(SolarSystemService);
  route = inject(ActivatedRoute);
  location = inject(LocationService);
  private readonly pageContent = inject(SolarSystemPageContentService);
  readonly time = inject(MessierTimeService);

  private bodyMap: Record<string, Body> = {
    mercury: Body.Mercury,
    venus: Body.Venus,
    earth: Body.Earth,
    mars: Body.Mars,
    jupiter: Body.Jupiter,
    saturn: Body.Saturn,
    uranus: Body.Uranus,
    neptune: Body.Neptune,
    sun: Body.Sun,
    moon: Body.Moon
  };

  readonly id = signal<string | null>(
    this.route.snapshot.paramMap.get('id')
  );

  readonly routeType = signal<string | null>(
    this.route.snapshot.paramMap.get('type')
  );
  constructor() {

    this.solar.load();

    this.route.paramMap.subscribe(params => {
      this.id.set(params.get('id'));
      this.routeType.set(params.get('type'));
    });

    effect(() => {

      const o = this.object();
      if (!o) return;

      this.updateSeo(o);

    });

  }

  private updateSeo(o: SolarSystemBody) {
    const id = o.id.toLowerCase();
    const facts = this.pageContent.get(o);
    const category = this.routeType() ?? this.categoryFor(o);
    const diameter = facts?.physical.diameterKm;
    const orbitDays = facts?.orbit.orbitalPeriodDays;

    const title = `${o.name} - ${o.type} facts and observing guide | StarWatchr`;
    const description =
      `${o.name} is a ${o.type} in the Solar System. ` +
      (diameter ? `Diameter ${diameter.toLocaleString()} km. ` : '') +
      (orbitDays ? `Orbital period ${orbitDays.toLocaleString()} days. ` : '') +
      'Explore sourced facts, observing guidance and orbital context.';

    const canonical = `/solar-system/${category}/${id}`;
    this.seo.update(title, description, canonical, o.image);

    const additionalProperty = facts
      ? [
          { '@type': 'PropertyValue', name: 'Diameter', value: facts.physical.diameterKm, unitText: 'km' },
          { '@type': 'PropertyValue', name: 'Mean density', value: facts.physical.densityGcm3, unitText: 'g/cm3' },
          { '@type': 'PropertyValue', name: 'Orbital period', value: facts.orbit.orbitalPeriodDays, unitText: 'days' },
          { '@type': 'PropertyValue', name: 'Semi-major axis', value: facts.orbit.semiMajorAxisAU, unitText: 'AU' },
        ].filter((property) => property.value != null)
      : [];

    this.seo.setJsonLd(`solar-${category}-${id}-structured-data`, {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: `${o.name} solar system facts and observing guide`,
      description,
      url: this.seo.url(canonical),
      image: this.seo.url(o.image),
      isBasedOn: facts?.source.url,
      mainEntity: {
        '@type': 'Thing',
        name: o.name,
        identifier: `${o.type}:${o.id}`,
        additionalType: o.type,
        description: facts?.overview ?? o.summary,
        sameAs: facts?.source.url,
        additionalProperty,
      },
      isPartOf: { '@type': 'WebSite', name: 'StarWatchr', url: 'https://starwatchr.com' },
    });
  }
  private categoryFor(body: SolarSystemBody): string {
    if (body.id === 'sun') return 'sun';
    if (body.type === 'planet') return 'planets';
    if (body.type === 'moon') return 'moons';
    if (body.type === 'asteroid') return 'asteroids';
    if (body.type === 'comet') return 'comets';
    return 'dwarf-planets';
  }

  private matchesRouteCategory(body: SolarSystemBody, category: string | null): boolean {
    if (!category) return true;
    return this.categoryFor(body) === category;
  }

  readonly object = computed(() => {
    const id = this.id();
    const category = this.routeType();
    return this.solar.all().find(
      (body) => body.id === id && this.matchesRouteCategory(body, category),
    ) ?? null;
  });

  readonly content = computed(() => {
    const body = this.object();
    return body ? this.pageContent.get(body) : null;
  });
  /* ---------------- moons of planet ---------------- */

  readonly moons = computed(() => {

    const o = this.object();
    const moons = this.solar.moons();

    if (!o || o.type !== 'planet') return [];

    return moons.filter(m => m.planet === o.id);

  });

  /* ---------------- parent planet ---------------- */

  readonly parentPlanet = computed(() => {

    const o = this.object();
    const planets = this.solar.planets();

    if (!o || !isMoon(o)) return null;

    return planets.find(p => p.id === o.planet) ?? null;

  });

  /* ---------------- sibling moons ---------------- */

  readonly siblingMoons = computed(() => {

    const o = this.object();
    const moons = this.solar.moons();

    if (!o || !isMoon(o)) return [];

    return moons.filter(m =>
      m.planet === o.planet &&
      m.id !== o.id
    );

  });

  /* ---------------- planets ---------------- */

  readonly planets = computed(() =>
    this.solar.planets()
  );

  /* ---------------- selected planet ---------------- */

  readonly selectedPlanet = computed(() => {

    const o = this.object();

    if (!o) return undefined;

    if (o.type === 'planet') return o.id;

    if (isMoon(o)) return o.parentPlanet;

    return undefined;

  });

  /* ---------------- navigation ---------------- */

  readonly mainBodies = computed(() => {

    const sun = this.solar.sun();
    const planets = this.solar.planets();

    return [
      ...(sun ? [sun] : []),
      ...planets
    ];

  });

  /* ---------------- location ---------------- */

  readonly lat = computed(() => {

    const v = this.location.selected()?.lat;

    return v != null ? Number(v) : 0;

  });

  readonly lon = computed(() => {

    const v = this.location.selected()?.lon;

    return v != null ? Number(v) : 0;

  });

  /* ---------------- RA ---------------- */

  readonly raDeg = computed(() => {

    const o = this.object();
    if (!o) return 0;

    const body = this.bodyMap[o.id];
    if (!body) return 0;

    const observer = new Observer(
      this.lat(),
      this.lon(),
      0
    );

    const time = new AstroTime(this.time.dateTime());

    const eq = Equator(
      body,
      time,
      observer,
      true,
      true
    );

    return eq.ra * 15;

  });

  /* ---------------- DEC ---------------- */

  readonly decDeg = computed(() => {

    const o = this.object();
    if (!o) return 0;

    const body = this.bodyMap[o.id];
    if (!body) return 0;

    const observer = new Observer(
      this.lat(),
      this.lon(),
      0
    );

    const time = new AstroTime(this.time.dateTime());

    const eq = Equator(
      body,
      time,
      observer,
      true,
      true
    );

    return eq.dec;

  });

}

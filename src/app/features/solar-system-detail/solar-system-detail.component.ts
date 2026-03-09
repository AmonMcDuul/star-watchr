// import { Component, computed, inject, signal } from '@angular/core';
// import { ActivatedRoute, RouterLink } from '@angular/router';
// import { CommonModule, Location } from '@angular/common';
// import { SolarSystemService } from '../../services/solar-system.service';
// import { AstroTime, Body, Equator, Observer } from "astronomy-engine";
// import { LocationService } from "../../services/location.service";
// import { MessierTimeService } from "../../services/messier-time.service";
// import { AltitudeGraphComponent } from '../../components/altitude-graph/altitude-graph.component';
// import { SolarOrbitComponent } from '../../components/solar-orbit/solar-orbit.component';
// import { Moon } from '../../models/solar-system/moon.model';
// import { SolarSystemBody } from '../../models/solar-system/solar-system-body.model';

// function isMoon(body: SolarSystemBody): body is Moon {
//   return body.type === 'moon';
// }

// @Component({
//   selector: 'app-solar-system-detail',
//   imports: [CommonModule, RouterLink, AltitudeGraphComponent, SolarOrbitComponent],
//   templateUrl: './solar-system-detail.component.html',
//   styleUrl: './solar-system-detail.component.scss'
// })
// export class SolarSystemDetailComponent {
//   solar = inject(SolarSystemService);
//   route = inject(ActivatedRoute);
//   location = inject(LocationService);
//   readonly time = inject(MessierTimeService);

//   private bodyMap: Record<string, Body> = {
//     mercury: Body.Mercury,
//     venus: Body.Venus,
//     earth: Body.Earth,
//     mars: Body.Mars,
//     jupiter: Body.Jupiter,
//     saturn: Body.Saturn,
//     uranus: Body.Uranus,
//     neptune: Body.Neptune,
//     sun: Body.Sun,
//     moon: Body.Moon
//   };

//   readonly id = signal<string | null>(
//     this.route.snapshot.paramMap.get('id')
//   );

//   readonly object = computed(() =>
//     this.solar.all().find(o => o.id === this.id()) ?? null
//   );

// readonly moons = computed(() => {

//   const o = this.object();

//   if (!o || o.type !== 'planet') return [];

//   return this.solar.moons()
//     .filter(m => m.parentPlanet === o.id);

// });

// readonly parentPlanet = computed(() => {

//   const o = this.object();

//   if (!o || !isMoon(o)) return null;

//   return this.solar.planets()
//     .find(p => p.id === o.parentPlanet) ?? null;

// });

// readonly siblingMoons = computed(() => {

//   const o = this.object();

//   if (!o || !isMoon(o)) return [];

//   return this.solar.moons()
//     .filter(m =>
//       m.parentPlanet === o.parentPlanet &&
//       m.id !== o.id
//     );

// });

//   readonly planets = computed(() =>
//     this.solar.planets()
//   );

//   readonly selectedPlanet = computed(() => {
//     const o = this.object();
//     if (!o) return undefined;
//     if (o.type === 'planet') {
//       return o.id;
//     }
//     if (isMoon(o)) {
//       return o.parentPlanet;
//     }
//     return undefined;
//   });

//   constructor() {
//     this.solar.load();
//   }

//   ngOnInit(){
//     this.route.paramMap.subscribe(params => {
//       this.id.set(params.get('id'));
//     });
//   }

//   readonly mainBodies = computed(() => {

//     const sun = this.solar.sun();
//     const planets = this.solar.planets();

//     return [
//       ...(sun ? [sun] : []),
//       ...planets
//     ];

//   });

//   readonly lat = computed(() => {
//     const v = this.location.selected()?.lat;
//     return v != null ? Number(v) : 0;
//   });

//   readonly lon = computed(() => {
//     const v = this.location.selected()?.lon;
//     return v != null ? Number(v) : 0;
//   });

//   readonly raDeg = computed(() => {

//     const o = this.object();
//     if (!o) return 0;

//     const body = this.bodyMap[o.id];
//     if (!body) return 0;

//     const observer = new Observer(
//       this.lat(),
//       this.lon(),
//       0
//     );

//     const time = new AstroTime(this.time.dateTime());

//     const eq = Equator(
//       body,
//       time,
//       observer,
//       true,
//       true
//     );

//     return eq.ra * 15;

//   });

//   readonly decDeg = computed(() => {

//     const o = this.object();
//     if (!o) return 0;

//     const body = this.bodyMap[o.id];
//     if (!body) return 0;

//     const observer = new Observer(
//       this.lat(),
//       this.lon(),
//       0
//     );

//     const time = new AstroTime(this.time.dateTime());

//     const eq = Equator(
//       body,
//       time,
//       observer,
//       true,
//       true
//     );

//     return eq.dec;

//   });

// }

import { Component, computed, inject, signal } from '@angular/core';
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

  solar = inject(SolarSystemService);
  route = inject(ActivatedRoute);
  location = inject(LocationService);
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

  constructor() {

    console.log("SolarSystemDetailComponent init");

    this.solar.load();

    this.route.paramMap.subscribe(params => {

      const id = params.get('id');

      console.log("Route ID:", id);

      this.id.set(id);

    });

  }

  /* ---------------- object ---------------- */

  readonly object = computed(() => {

    const id = this.id();
    const all = this.solar.all();

    console.log("All objects loaded:", all.length);

    const found = all.find(o => o.id === id) ?? null;

    console.log("Object lookup:", id, found);

    return found;

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
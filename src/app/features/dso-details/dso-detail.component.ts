import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  OnDestroy,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import { MessierObject } from '../../models/messier.model';
import { MessierService } from '../../services/messier.service';
import { LocationService } from '../../services/location.service';
import { MessierTimeService } from '../../services/messier-time.service';

import { AladinMapComponent } from '../../components/star-map/aladin-map.component';
import { AltitudeGraphComponent } from '../../components/altitude-graph/altitude-graph.component';
import { StarhopAtlasComponent } from '../starhop-atlas/starhop-atlas.component';
import { SeoService } from '../../services/seo.service';
import { DSO_CATALOG } from '../../../assets/data/dso-catalog';
import { DsoPageContentService } from '../../services/dso-page-content.service';
import {
  Observer,
  AstroTime,
  VectorFromSphere,
  Rotation_EQJ_HOR,
  RotateVector,
  SphereFromVector,
} from 'astronomy-engine';

type SurveyKey = 'dss-color' | 'dss-red' | '2mass';

@Component({
  standalone: true,
  selector: 'app-dso-detail',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    AladinMapComponent,
    AltitudeGraphComponent,
    StarhopAtlasComponent,
  ],
  templateUrl: './dso-detail.component.html',
  styleUrls: ['./dso-detail.component.scss'],
})
export class DsoDetailComponent implements OnDestroy {
  private pageContent = inject(DsoPageContentService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messier = inject(MessierService);
  private injector = inject(Injector);
  private destroyRef = inject(DestroyRef);

  readonly location = inject(LocationService);
  readonly time = inject(MessierTimeService);
  readonly seo = inject(SeoService);

  readonly dso = computed<MessierObject | null>(() => this.messier.selectedMessier());

  private seoEffect = effect(
    () => {
      const dso = this.dso();
      if (!dso) return;

      const lat = this.lat();
      const lon = this.lon();
      const date = this.time.dateTime();

      this.updateSeo(dso);
    },
    { injector: this.injector },
  );

  dsoCatalog: any;
  showConstellations = true;
  showConstellationLabels = false;
  showOtherDsos = false;

  selectedSurvey: SurveyKey = 'dss-color';

  readonly raDeg = computed(() => (this.dso() ? this.raToDegrees(this.dso()!.rightAscension) : 0));

  readonly decDeg = computed(() => (this.dso() ? this.decToDegrees(this.dso()!.declination) : 0));

  readonly lat = computed(() => {
    const v = this.location.selected()?.lat;
    return v != null ? Number(v) : 0;
  });

  readonly lon = computed(() => {
    const v = this.location.selected()?.lon;
    return v != null ? Number(v) : 0;
  });

  readonly altitudeSeries = computed(() => {
    const dso = this.dso();
    if (!dso) return [];

    return this.getAltitudeSeries(dso);
  });

  constructor() {}

  async ngOnInit() {
    await Promise.all([this.messier.load(), this.messier.loadCaldwell()]);

    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.selectRouteObject(params.get('id')));
  }

  private selectRouteObject(id: string | null): void {
    if (!id) return;

    const number = Number.parseInt(id.replace(/[^\d]/g, ''), 10);
    const code = id.charAt(0).toUpperCase();
    const target = this.messier.getByNumberAndCode(code, number);

    if (target) this.messier.selectedMessier.set(target);
  }
  private updateSeo(dso: MessierObject) {
    const objectId = `${dso.code}${dso.messierNumber}`.toUpperCase();
    const content = this.pageContent.generate(dso);
    const facts = content.facts;
    const description = this.pageContent.seoDescription(dso);
    const title = `${dso.name} (${objectId}) - ${dso.type} in ${dso.constellation} | StarWatchr`;

    const path = `/dso/${objectId.toLowerCase()}`;
    this.seo.update(title, description, path, dso.image);

    const additionalProperty = [
      { '@type': 'PropertyValue', name: 'Magnitude', value: dso.magnitude },
      { '@type': 'PropertyValue', name: 'Right ascension', value: facts.coordinates.raDeg, unitText: 'degrees' },
      { '@type': 'PropertyValue', name: 'Declination', value: facts.coordinates.decDeg, unitText: 'degrees' },
      { '@type': 'PropertyValue', name: 'Angular major axis', value: facts.dimensions.majorArcmin, unitText: 'arcminutes' },
      { '@type': 'PropertyValue', name: 'Angular minor axis', value: facts.dimensions.minorArcmin, unitText: 'arcminutes' },
      { '@type': 'PropertyValue', name: 'Distance', value: dso.distance, unitText: 'light-years' },
    ].filter((property) => property.value != null);

    this.seo.setJsonLd(`dso-${objectId.toLowerCase()}-structured-data`, {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: `${dso.name} (${objectId}) observing and imaging guide`,
      description,
      url: this.seo.url(path),
      image: this.seo.url(dso.image),
      isBasedOn: facts.source.url,
      mainEntity: {
        '@type': 'Thing',
        name: `${dso.name} (${objectId})`,
        identifier: facts.catalogIdentifiers,
        additionalType: dso.type,
        description: facts.overview,
        sameAs: facts.source.url,
        additionalProperty,
      },
      isPartOf: { '@type': 'WebSite', name: 'StarWatchr', url: 'https://starwatchr.com' },
    });
  }
  ngOnDestroy(): void {
    this.messier.selectedMessier.set(null);
  }

  goBack() {
    this.router.navigateByUrl('/dso-forecast');
  }

  toggleConstellations() {
    this.showConstellations = !this.showConstellations;
  }

  toggleOtherDsos() {
    this.showOtherDsos = !this.showOtherDsos;
  }

  readonly content = computed(() => {
    const dso = this.dso();
    if (!dso) return null;

    return this.pageContent.generate(dso);
  });

  readonly relatedDsos = computed(() => {
    const current = this.dso();
    if (!current) return [];

    const currentId = `${current.code}${current.messierNumber}`.toLowerCase();
    return DSO_CATALOG
      .filter((item) => item.id !== currentId)
      .sort((a, b) => {
        const aScore = a.constellation === current.constellation
          ? 0
          : a.viewingSeason === current.viewingSeason ? 1 : 2;
        const bScore = b.constellation === current.constellation
          ? 0
          : b.viewingSeason === current.viewingSeason ? 1 : 2;
        return aScore - bScore || a.magnitude - b.magnitude;
      })
      .slice(0, 8);
  });
  private raToDegrees(ra: string): number {
    const [h, m, s] = ra.split(':').map(Number);
    return (h + m / 60 + s / 3600) * 15;
  }

  private decToDegrees(dec: string): number {
    const sign = dec.startsWith('-') ? -1 : 1;
    const [d, m, s] = dec.replace('+', '').replace('-', '').split(':').map(Number);
    return sign * (d + m / 60 + s / 3600);
  }

  private getAltitudeSeries(dso: MessierObject) {
    const series = [];

    const start = new Date(this.time.dateTime().getTime() - 12 * 3600_000);
    const samples = 96;

    for (let i = 0; i < samples; i++) {
      const t = new Date(start.getTime() + (i * (24 * 3600_000)) / (samples - 1));

      const altitude = this.calculateAltitude(dso, t);

      series.push({
        time: t,
        altitude,
      });
    }

    return series;
  }

  private calculateAltitude(dso: MessierObject, date: Date): number {
    const observer = new Observer(Number(this.lat()), Number(this.lon()), 0);

    const time = new AstroTime(date);

    const sphereJ2000 = {
      lon: this.raDeg(),
      lat: this.decDeg(),
      dist: 1.0,
    };

    const vecJ2000 = VectorFromSphere(sphereJ2000, time);

    const rot = Rotation_EQJ_HOR(time, observer);
    const vecHor = RotateVector(rot, vecJ2000);

    const sphereHor = SphereFromVector(vecHor);

    return sphereHor.lat;
  }
}

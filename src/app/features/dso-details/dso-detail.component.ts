import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MessierObject } from '../../models/messier.model';
import { MessierService } from '../../services/messier.service';
import { LocationService } from '../../services/location.service';
import { MessierTimeService } from '../../services/messier-time.service';

import { AladinMapComponent } from '../../components/star-map/aladin-map.component';
import { AltitudeGraphComponent } from '../../components/altitude-graph/altitude-graph.component';
import { StarhopAtlasComponent } from '../starhop-atlas/starhop-atlas.component';
import { SeoService } from '../../services/seo.service';
import  { DSO_CATALOG } from '../../../assets/data/dso-catalog';

type SurveyKey = 'dss-color' | 'dss-red' | '2mass';

@Component({
  standalone: true,
  selector: 'app-dso-detail',
  imports: [
    CommonModule,
    FormsModule,
    AladinMapComponent,
    AltitudeGraphComponent,
    StarhopAtlasComponent
  ],
  templateUrl: './dso-detail.component.html',
  styleUrls: ['./dso-detail.component.scss']
})
export class DsoDetailComponent implements OnDestroy {

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messier = inject(MessierService);

  readonly location = inject(LocationService);
  readonly time = inject(MessierTimeService);
  readonly seo = inject(SeoService);

  readonly dso = computed<MessierObject | null>(() =>
    this.messier.selectedMessier()
  );

  dsoCatalog: any;
  showConstellations = true;
  showConstellationLabels = false;
  showOtherDsos = false;

  selectedSurvey: SurveyKey = 'dss-color';

  readonly raDeg = computed(() =>
    this.dso() ? this.raToDegrees(this.dso()!.rightAscension) : 0
  );

  readonly decDeg = computed(() =>
    this.dso() ? this.decToDegrees(this.dso()!.declination) : 0
  );

  readonly lat = computed(() => {
    const v = this.location.selected()?.lat;
    return v != null ? Number(v) : 0;
  });

  readonly lon = computed(() => {
    const v = this.location.selected()?.lon;
    return v != null ? Number(v) : 0;
  });

  constructor() {
  }

  async ngOnInit() {

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    await this.messier.load();
    await this.messier.loadCaldwell();

    const parsed = parseInt(id.replace(/[^\d]/g, ''), 10);
    const prefix = id.charAt(0).toUpperCase();

    const target = this.messier.getByNumberAndCode(prefix, parsed);
    if (!target) return;

    this.messier.selectedMessier.set(target);

    this.updateSeo(target);

  }

  private updateSeo(dso: MessierObject) {

    const objectId = `${dso.code}${dso.messierNumber}`.toUpperCase();

    const title =
      `${dso.name} (${objectId}) – ${dso.type} in ${dso.constellation} | StarWatchr`;

    const description =
      `${dso.name} (${objectId}) is a ${dso.type.toLowerCase()} in ${dso.constellation}. ` +
      `Find ${objectId} with the interactive starhop map. ` +
      `Magnitude ${dso.magnitude}, size ${dso.size}.`;

    this.seo.update(
      title,
      description,
      `/dso/${objectId.toLowerCase()}`,
      dso.image
    );

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

  private raToDegrees(ra: string): number {
    const [h, m, s] = ra.split(':').map(Number);
    return (h + m / 60 + s / 3600) * 15;
  }

  private decToDegrees(dec: string): number {
    const sign = dec.startsWith('-') ? -1 : 1;
    const [d, m, s] = dec.replace('+', '').replace('-', '').split(':').map(Number);
    return sign * (d + m / 60 + s / 3600);
  }
}

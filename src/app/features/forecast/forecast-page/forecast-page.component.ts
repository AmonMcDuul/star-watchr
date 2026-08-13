import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { LocationSearchComponent } from "../../location-search/location-search.component";
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LocationService } from '../../../services/location.service';
import { ApiService } from '../../../services/api.service';
import { PlanetVisibilityService } from '../../../services/planet-visibility.server';
import { AstroMetainfoComponent } from "../astro-metainfo/astro-metainfo.component";
import { MatrixLegendComponent } from "../matrix-legend/matrix-legend.component";
import { OpenMeteoMatrixComponent } from "../open-meteo-matrix/open-meteo-matrix.component";
import { OpenMeteoService } from '../../../services/open-meteo.service';
import { UiPreferencesService } from '../../../services/ui-preferences.service';
import { PwaInstallService } from '../../../services/pwa-install.service';

@Component({
  selector: 'app-forecast-page',
  imports: [CommonModule, RouterLink, LocationSearchComponent, AstroMetainfoComponent, MatrixLegendComponent, OpenMeteoMatrixComponent],
  templateUrl: './forecast-page.component.html',
  styleUrl: './forecast-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForecastPageComponent implements OnInit{
  public openMeteoApi = inject(OpenMeteoService); 
  public location = inject(LocationService);
  private apiService = inject(ApiService);
  private planetVisibilityService = inject(PlanetVisibilityService);
  private ui = inject(UiPreferencesService);
  readonly pwaInstall = inject(PwaInstallService);

  openMeteo = signal(true);
  installHelp = signal<'ios' | 'unavailable' | null>(null);
  
  constructor(){
    const saved = this.location.selected();
    if (saved) {
      this.openMeteoApi.load(+saved.lat, +saved.lon);
      this.planetVisibilityService.setLocation(new Date(), +saved.lat, +saved.lon)
    } 
    this.ui.loadFromStorage();
  }

  ngOnInit(): void {
    this.apiService.setAlive().subscribe({
      error: err => console.error('setAlive error:', err)
    });
  }


  async installApp(): Promise<void> {
    const outcome = await this.pwaInstall.install();
    this.installHelp.set(
      outcome === 'ios-help' ? 'ios' : outcome === 'unavailable' ? 'unavailable' : null,
    );
  }

  dismissInstallHelp(): void {
    this.installHelp.set(null);
  }

}

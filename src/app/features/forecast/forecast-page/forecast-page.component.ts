import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { WeatherApiService } from '../../../services/weather-api.service';
import { LocationSearchComponent } from "../../location-search/location-search.component";
import { CommonModule } from '@angular/common';
import { LocationService } from '../../../services/location.service';
import { ApiService } from '../../../services/api.service';
import { PlanetVisibilityService } from '../../../services/planet-visibility.server';
import { SevenTimerMatrixComponent } from "../seventimer-matrix/seventimer-matrix.component";
import { AstroMetainfoComponent } from "../astro-metainfo/astro-metainfo.component";
import { MatrixLegendComponent } from "../matrix-legend/matrix-legend.component";
import { OpenMeteoMatrixComponent } from "../open-meteo-matrix/open-meteo-matrix.component";
import { OpenMeteoService } from '../../../services/open-meteo.service';
import { ForecastMatrixComponent } from '../forecast-matrix/forecast-matrix.component';

@Component({
  selector: 'app-forecast-page',
  imports: [CommonModule, LocationSearchComponent, AstroMetainfoComponent, MatrixLegendComponent, ForecastMatrixComponent, OpenMeteoMatrixComponent],
  templateUrl: './forecast-page.component.html',
  styleUrl: './forecast-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForecastPageComponent implements OnInit{
  public weatherApi = inject(WeatherApiService); 
  public openMeteoApi = inject(OpenMeteoService); 
  public location = inject(LocationService);
  private apiService = inject(ApiService);
  private planetVisibilityService = inject(PlanetVisibilityService);

  openMeteo = signal(true);
  
  constructor(){
    const saved = this.location.selected();
    if (saved) {
      this.weatherApi.load(+saved.lat, +saved.lon);
      this.openMeteoApi.load(+saved.lat, +saved.lon);
      this.planetVisibilityService.setLocation(new Date(), +saved.lat, +saved.lon)
    } 
  }

  ngOnInit(): void {
    this.apiService.setAlive().subscribe({
      error: err => console.error('setAlive error:', err)
    });
  }

}
import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { WeatherApiService } from '../../../services/weather-api.service';
import { LocationSearchComponent } from "../../location-search/location-search.component";
import { CommonModule } from '@angular/common';
import { ForecastMatrixComponent } from "../forecast-matrix/forecast-matrix.component";
import { LocationService } from '../../../services/location.service';
import { ApiService } from '../../../services/api.service';
import { PlanetVisibilityService } from '../../../services/planet-visibility.server';

@Component({
  selector: 'app-forecast-page',
  imports: [CommonModule, LocationSearchComponent, ForecastMatrixComponent],
  templateUrl: './forecast-page.component.html',
  styleUrl: './forecast-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForecastPageComponent implements OnInit{
  public weatherApi = inject(WeatherApiService); 
  public location = inject(LocationService);
  private apiService = inject(ApiService);
  private planetVisibilityService = inject(PlanetVisibilityService);

  constructor(){
    const saved = this.location.selected();
    if (saved) {
      this.weatherApi.load(+saved.lat, +saved.lon);
      this.planetVisibilityService.setLocation(new Date(), +saved.lat, +saved.lon)
    } else {
      this.weatherApi.load(52.37, 4.89);
      this.planetVisibilityService.setLocation(new Date(), 52.37, 4.89)
    }
  }

  ngOnInit(): void {
    this.apiService.setAlive().subscribe({
      error: err => console.error('setAlive error:', err)
    });
  }

}
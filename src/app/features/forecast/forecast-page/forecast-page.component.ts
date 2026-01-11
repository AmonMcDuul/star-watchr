import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WeatherApiService } from '../../../services/weather-api.service';
import { LocationSearchComponent } from "../../location-search/location-search.component";
import { CommonModule } from '@angular/common';
import { ForecastMatrixComponent } from "../forecast-matrix/forecast-matrix.component";
import { LocationService } from '../../../services/location.service';

@Component({
  selector: 'app-forecast-page',
  imports: [CommonModule, LocationSearchComponent, ForecastMatrixComponent],
  templateUrl: './forecast-page.component.html',
  styleUrl: './forecast-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForecastPageComponent {
  public weatherApi = inject(WeatherApiService); 
  public location = inject(LocationService);

  constructor(){
    const saved = this.location.selected();
    if (saved) {
      this.weatherApi.load(+saved.lat, +saved.lon);
    } else {
      this.weatherApi.load(52.37, 4.89);
    }
  }
}
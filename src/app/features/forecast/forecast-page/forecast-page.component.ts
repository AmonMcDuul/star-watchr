import { ChangeDetectionStrategy, Component } from '@angular/core';
import { WeatherApiService } from '../../../services/weather-api.service';
import { ForecastCardsComponent } from "../forecast-cards/forecast-cards.component";
import { LocationSearchComponent } from "../../location-search/location-search.component";
import { BestTwoHoursComponent } from "../best-two-hours/best-two-hours.component";
import { CommonModule } from '@angular/common';
import { ForecastMatrixComponent } from "../forecast-matrix/forecast-matrix.component";

@Component({
  selector: 'app-forecast-page',
  imports: [CommonModule, ForecastCardsComponent, LocationSearchComponent, BestTwoHoursComponent, ForecastMatrixComponent],
  templateUrl: './forecast-page.component.html',
  styleUrl: './forecast-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForecastPageComponent {
  constructor(public weather: WeatherApiService) {
    weather.load(52.37, 4.89);
  }
}
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { WeatherApiService } from '../../services/weather-api.service';

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class HomeComponent {
  constructor(public weatherApiService: WeatherApiService) {
    this.weatherApiService.loadAstroWeather(52.37, 4.89);
  }
}

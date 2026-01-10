import { ChangeDetectionStrategy, Component, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeatherApiService } from '../../../services/weather-api.service';

@Component({
  selector: 'app-forecast-cards',
  imports: [CommonModule],
  templateUrl: './forecast-cards.component.html',
  styleUrl: './forecast-cards.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class ForecastCardsComponent {
  public weatherApi = inject(WeatherApiService); 
}
import { ChangeDetectionStrategy, Component, computed, inject, Input } from '@angular/core';
import { findBestTwoHours } from '../../../utils/best-hours.util';
import { CommonModule } from '@angular/common';
import { WeatherApiService } from '../../../services/weather-api.service';

@Component({
  selector: 'app-best-two-hours',
  imports: [CommonModule],
  templateUrl: './best-two-hours.component.html',
  styleUrl: './best-two-hours.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class BestTwoHoursComponent {
  public weatherApi = inject(WeatherApiService); 

  readonly best = computed(() => findBestTwoHours(this.weatherApi.cards()));
}
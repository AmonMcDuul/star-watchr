import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeatherApiService } from '../../../services/weather-api.service';

@Component({
  selector: 'app-forecast-matrix',
  imports: [CommonModule],
  templateUrl: './forecast-matrix.component.html',
  styleUrl: './forecast-matrix.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class ForecastMatrixComponent {
  public weatherApi = inject(WeatherApiService); 
  mode = signal<'24h' | '24h/48h' | '48h/72h' | 'all'>('24h');
  cardsToShow = computed(() => {
    const list = this.weatherApi.cards();

    switch (this.mode()) {
      case '24h': return list.slice(0, 8);
      case '24h/48h': return list.slice(8, 16);
      case '48h/72h': return list.slice(16, 24);
      case 'all': return list;
    }
  });
}
import { ChangeDetectionStrategy, Component, Input, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeatherApiService } from '../../../services/weather-api.service';

@Component({
  selector: 'app-forecast-matrix',
  imports: [
    CommonModule,
  ],
  templateUrl: './forecast-matrix.component.html',
  styleUrl: './forecast-matrix.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class ForecastMatrixComponent {
  public weatherApi = inject(WeatherApiService); 
  cardsToShow = computed(() => {
    const list = this.weatherApi.cards();
    return list.slice(0, 7);
  });

  //7 datapunten
  
  show7(){
    this.cardsToShow = computed(() => {
      const list = this.weatherApi.cards();
      return list.slice(0, 7);
    });
  }

  showAll(){
    this.cardsToShow = computed(() => {
      const list = this.weatherApi.cards();
      return list;
    });
  }
}
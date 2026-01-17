import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { WeatherApiService } from '../../../services/weather-api.service';
import { ForecastContextService } from '../../../services/forecast-context.service';


@Component({
  selector: 'app-seventimer-matrix',
  imports: [CommonModule],
  templateUrl: './seventimer-matrix.component.html',
  styleUrl: './seventimer-matrix.component.scss',
})
export class SevenTimerMatrixComponent {
  public weatherApi = inject(WeatherApiService);
  public context = inject(ForecastContextService);

  hoverCard = signal<any | null>(null);
  tooltipX = 0;
  tooltipY = 0;
  mobileTooltipVisible = false;

  cardsToShow = computed(() => {
    const list = this.weatherApi.cards();
    switch (this.context.mode()) {
      case '24h': return list.slice(0, 8);
      case '24h/48h': return list.slice(8, 16);
      case '48h/72h': return list.slice(16, 24);
    }
  });

  onHover(c: any, event: MouseEvent | null) {
    this.hoverCard.set(c);
    if (event) {
      const matrixRect = (event.target as HTMLElement).closest('.matrix')?.getBoundingClientRect();
      if (matrixRect) {
        this.tooltipX = event.clientX - matrixRect.left + 10;
        this.tooltipY = event.clientY - matrixRect.top + 10;
      }
    }
  }

  onMobileHover(c: any, event: TouchEvent) {
    event.preventDefault(); 

    if (this.hoverCard() === c && this.mobileTooltipVisible) {
      this.hoverCard.set(null);
      this.mobileTooltipVisible = false;
    } else {
      this.hoverCard.set(c);
      this.mobileTooltipVisible = true;

      const matrixRect = (event.target as HTMLElement).closest('.matrix')?.getBoundingClientRect();
      if (matrixRect) {
        const touch = event.touches[0];
        this.tooltipX = touch.clientX - matrixRect.left + 10;
        this.tooltipY = touch.clientY - matrixRect.top + 10;
      }
    }
  }

  @HostListener('document:touchstart', ['$event'])
  onDocumentTouch(event: TouchEvent) {
    const matrix = document.querySelector('.matrix');
    if (!matrix?.contains(event.target as Node)) {
      this.hoverCard.set(null);
      this.mobileTooltipVisible = false;
    }
  }
}
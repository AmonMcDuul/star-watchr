import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  HostListener,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { OpenMeteoService } from '../../../services/open-meteo.service';
import { ForecastContextService } from '../../../services/forecast-context.service';
import { ForecastTimeService } from '../../../services/forecast-time.service';

@Component({
  selector: 'app-open-meteo-matrix',
  imports: [CommonModule],
  templateUrl: './open-meteo-matrix.component.html',
  styleUrl: './open-meteo-matrix.component.scss',
})
export class OpenMeteoMatrixComponent implements OnInit {
  public weatherApi = inject(OpenMeteoService);
  public context = inject(ForecastContextService);
  public time = inject(ForecastTimeService);

  hoverCard = signal<any | null>(null);
  tooltipX = 0;
  tooltipY = 0;
  mobileTooltipVisible = false;

  readonly pointsCount = signal(8);

  cardsToShow = computed(() => {
    const cards = this.weatherApi.cards();
    const { stepHours, windowHours } = this.time.window();
    const offset = this.time.offsetHours();

    const startIndex = Math.floor(offset / stepHours);
    // const count = windowHours / stepHours;
    const count = this.pointsCount();

    return cards.slice(startIndex, startIndex + count);
  });
  
  constructor() {
    const media = window.matchMedia('(max-width: 768px)');
    const mediaSmaller = window.matchMedia('(max-width: 350px)');

    const update = () => {
      if (mediaSmaller.matches) {
        this.pointsCount.set(6);
      } else if (media.matches) {
        this.pointsCount.set(7);
      } else {
        this.pointsCount.set(8);
      }
    };

    update();

    media.addEventListener('change', update);
    mediaSmaller.addEventListener('change', update);
  }

  ngOnInit() {
    this.time.mode.set('hourly');
  }

  // cardsToShow = computed(() => {
  //   const list = this.weatherApi.cards();
  //   switch (this.context.mode()) {
  //     case '24h': return list.slice(0, 8);
  //     case '24h/48h': return list.slice(8, 16);
  //     case '48h/72h': return list.slice(16, 24);
  //   }
  // });

  dayPlus(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }

  onHover(c: any, event: MouseEvent | null) {
    this.hoverCard.set(c);
    if (event) {
      const rect = (event.target as HTMLElement)
        .closest('.matrix')
        ?.getBoundingClientRect();
      if (rect) {
        this.tooltipX = event.clientX - rect.left + 10;
        this.tooltipY = event.clientY - rect.top + 10;
      }
    }
  }

  onMobileHover(c: any, event: TouchEvent) {
    event.preventDefault();
    if (this.hoverCard() === c && this.mobileTooltipVisible) {
      this.hoverCard.set(null);
      this.mobileTooltipVisible = false;
      return;
    }

    this.hoverCard.set(c);
    this.mobileTooltipVisible = true;

    const rect = (event.target as HTMLElement)
      .closest('.matrix')
      ?.getBoundingClientRect();
    if (rect) {
      const t = event.touches[0];
      this.tooltipX = t.clientX - rect.left + 10;
      this.tooltipY = t.clientY - rect.top + 10;
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

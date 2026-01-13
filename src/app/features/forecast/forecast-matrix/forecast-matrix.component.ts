import { ChangeDetectionStrategy, Component, HostListener, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeatherApiService } from '../../../services/weather-api.service';
import { LocationService } from '../../../services/location.service';
import SunCalc from 'suncalc';

@Component({
  selector: 'app-forecast-matrix',
  imports: [CommonModule],
  templateUrl: './forecast-matrix.component.html',
  styleUrl: './forecast-matrix.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class ForecastMatrixComponent {
  public weatherApi = inject(WeatherApiService); 
  public location = inject(LocationService);

  mode = signal<'24h' | '24h/48h' | '48h/72h' | 'all'>('24h');
  hoverCard = signal<any | null>(null);

  lat = computed(() => this.location.selected()?.lat ?? 52.37);
  lon = computed(() => this.location.selected()?.lon ?? 4.89);

  tooltipX = 0;
  tooltipY = 0;
  mobileTooltipVisible = false;

  cardsToShow = computed(() => {
    const list = this.weatherApi.cards();
    switch (this.mode()) {
      case '24h': return list.slice(0, 8);
      case '24h/48h': return list.slice(8, 16);
      case '48h/72h': return list.slice(16, 24);
      case 'all': return list;
    }
  });

  addDaysUtc(base: Date, days: number): Date {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }
  
  astroDate = computed(() => {
    const todayUtc = new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate()
    ));
  
    switch (this.mode()) {
      case '24h': return todayUtc;
      case '24h/48h': return this.addDaysUtc(todayUtc, 1);
      case '48h/72h': return this.addDaysUtc(todayUtc, 2);
      case 'all': return todayUtc;
    }
  });

  sunTimes = computed(() =>
    SunCalc.getTimes(this.astroDate(), +this.lat(), +this.lon())
  );

  moonTimes = computed(() =>
    SunCalc.getMoonTimes(this.astroDate(), +this.lat(), +this.lon())
  );

  moonIllum = computed(() =>
    SunCalc.getMoonIllumination(this.astroDate())
  );

  moonPhaseLabel = computed(() => {
    const p = this.moonIllum().phase;
    if (p < 0.03 || p > 0.97) return 'New Moon';
    if (p < 0.22) return 'Waxing Crescent';
    if (p < 0.28) return 'First Quarter';
    if (p < 0.47) return 'Waxing Gibbous';
    if (p < 0.53) return 'Full Moon';
    if (p < 0.72) return 'Waning Gibbous';
    if (p < 0.78) return 'Last Quarter';
    return 'Waning Crescent';
  });

// isAstroNight = (date: Date): boolean => {
//   const t = this.sunTimes();

//   const now = this.toMinutes(date);
//   const nightStart = this.toMinutes(t.night);   
//   const nightEnd = this.toMinutes(t.nightEnd);  

//   return now >= nightStart || now <= nightEnd;
// };

  isAstroNight(date: Date): 'full' | 'partial' | '' {
    const t = this.sunTimes();
    if (!t.nightEnd || !t.night) return '';

    const STEP_HOURS = 3;
    const HALF_STEP = STEP_HOURS / 2;

    const start = this.toMinutes(new Date(date.getTime() - HALF_STEP * 3600_000));
    const end = this.toMinutes(new Date(date.getTime() + HALF_STEP * 3600_000));

    const rise = this.toMinutes(t.nightEnd);
    const set = this.toMinutes(t.night);

    if (!this.overlaps(start, end, rise, set)) return '';
    if (start >= rise && end <= set) return 'full';

    return 'partial';
  }


  moonUpAt(date: Date): 'full' | 'partial' | '' {
    const m = this.moonTimes();
    if (!m.rise || !m.set) return '';

    const STEP_HOURS = 3;
    const HALF_STEP = STEP_HOURS / 2;

    const start = this.toMinutes(new Date(date.getTime() - HALF_STEP * 3600_000));
    const end = this.toMinutes(new Date(date.getTime() + HALF_STEP * 3600_000));

    const rise = this.toMinutes(m.rise);
    const set = this.toMinutes(m.set);

    if (!this.overlaps(start, end, rise, set)) return '';
    if (start >= rise && end <= set) return 'full';

    return 'partial';
  }



  private toMinutes(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
  }

  private overlaps(start1: number, end1: number, start2: number, end2: number): boolean {
    const normalize = (s: number, e: number) => e < s ? [s, e + 1440] : [s, e];

    const [s1, e1] = normalize(start1, end1);
    const [s2, e2] = normalize(start2, end2);

    return e1 > s2 && s1 < e2;
  }

  onHover(c: any, event: MouseEvent | null) {
    this.hoverCard.set(c);
    if (event) {
      const matrixRect = (event.target as HTMLElement).closest('.matrix')?.getBoundingClientRect();
      if (matrixRect) {
        this.tooltipX = event.clientX - matrixRect.left + 10; // 10px offset
        this.tooltipY = event.clientY - matrixRect.top + 10;
      }
    }
  }

  onMobileHover(c: any, event: TouchEvent) {
    event.preventDefault(); // voorkomt ongewenst scrollen

    if (this.hoverCard() === c && this.mobileTooltipVisible) {
      // tweede tap sluit de tooltip
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
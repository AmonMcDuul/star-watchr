import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
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

  cardsToShow = computed(() => {
    const list = this.weatherApi.cards();

    switch (this.mode()) {
      case '24h': return list.slice(0, 8);
      case '24h/48h': return list.slice(8, 16);
      case '48h/72h': return list.slice(16, 24);
      case 'all': return list;
    }
  });

  astroDate = computed(() => {
    const today = new Date();

    switch (this.mode()) {
      case '24h': return today;
      case '24h/48h': return this.addDays(today, 1);
      case '48h/72h': return this.addDays(today, 2);
      case 'all': return today;
    }
  });

  addDays(base: Date, days: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
  }

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

  isNight = (date: Date) => {
    const t = this.sunTimes();
    return date < t.dawn || date > t.dusk;
  };

  isAstroNight = (date: Date) => {
    const t = this.sunTimes();
    return date < t.nightEnd || date > t.night;
  };

  moonUpAt(date: Date): boolean {
    const m = this.moonTimes();
    if (!m.rise || !m.set) return false;
    return date >= m.rise && date <= m.set;
  }

}
import { Injectable, signal, computed } from "@angular/core";

export interface TimeWindow {
  stepHours: number; 
  windowHours: number;
}

@Injectable({ providedIn: 'root' })
export class ForecastTimeService {
  readonly mode = signal<'coarse' | 'hourly'>('coarse');

  readonly offsetHours = signal(0);

  readonly window = computed<TimeWindow>(() => {
    return this.mode() === 'hourly'
      ? { stepHours: 1, windowHours: 24 }
      : { stepHours: 3, windowHours: 24 };
  });

  readonly cardCount = computed(() =>
    this.window().windowHours / this.window().stepHours
  );

  shift(hours: number) {
    this.offsetHours.update(v => Math.max(0, v + hours));
  }

  reset() {
    this.offsetHours.set(0);
  }
}

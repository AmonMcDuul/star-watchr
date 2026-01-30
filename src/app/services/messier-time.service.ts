import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MessierTimeService {
  private readonly STEP = 1; 

  readonly offsetHours = signal(0);

  readonly dateTime = computed(() => {
    const d = new Date();
    d.setHours(d.getHours() + this.offsetHours());
    return d;
  });

  shift(hours: number) {
    this.offsetHours.update(v => v + hours);
  }

  reset() {
    this.offsetHours.set(0);
  }

  shiftDays(days: number) {
    this.reset();
    this.shift(days * 24);
  }
}

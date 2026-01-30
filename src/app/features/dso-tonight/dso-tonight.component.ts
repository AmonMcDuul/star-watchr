import { Component, inject, OnInit, signal } from '@angular/core';
import { MessierService } from '../../services/messier.service';
import { CommonModule } from '@angular/common';
import { MessierTimeService } from '../../services/messier-time.service';
import { ForecastContextService } from '../../services/forecast-context.service';
import { LocationSearchComponent } from "../location-search/location-search.component";
import { LocationService } from '../../services/location.service';

@Component({
  selector: 'app-dso-tonight',
  imports: [CommonModule, LocationSearchComponent],
  templateUrl: './dso-tonight.component.html',
  styleUrl: './dso-tonight.component.scss',
})
export class DsoTonightComponent implements OnInit {
  messier = inject(MessierService);
  location = inject(LocationService)
  time = inject(MessierTimeService);
  context = inject(ForecastContextService);

  readonly selected = signal<number | null>(null);

  ngOnInit() {
    this.messier.load();
  }

  select(n: number) {
    this.selected.update(v => v === n ? null : n);
  }

  dayPlus(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }

  isActiveDay(days: number): boolean {
    const base = this.context.astroDate();
    const target = new Date();
    target.setHours(target.getHours() + this.time.offsetHours());

    const diff =
      Math.floor((target.getTime() - base.getTime()) / (24 * 3600_000));

    return diff === days;
  }
}
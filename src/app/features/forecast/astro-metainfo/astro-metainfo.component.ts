import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { ForecastContextService } from '../../../services/forecast-context.service';
import { PlanetVisibilityService } from '../../../services/planet-visibility.server';

@Component({
  selector: 'app-astro-metainfo',
  imports: [CommonModule],
  templateUrl: './astro-metainfo.component.html',
  styleUrl: './astro-metainfo.component.scss',
})
export class AstroMetainfoComponent {
  public context = inject(ForecastContextService);
  public planetVisibilityService = inject(PlanetVisibilityService);

  readonly planetTimesToday = computed(() => {
    const all = this.planetVisibilityService.visibility(); 
    const today = this.context.astroDate().toISOString().slice(0, 10);
  
    return all
      .filter(p => p.date === today && p.isAboveHorizonNow)
      .map(p => ({
        planet: p.planet.toLowerCase(),
        rise: p.riseDateTime ? new Date(p.riseDateTime) : null,
        set: p.setDateTime ? new Date(p.setDateTime) : null
      }));
  });

  constructor() {
    effect(() => {
      this.planetVisibilityService.setLocation(this.context.astroDate(), +this.context.lat(), +this.context.lon());
      // this.planetCache.clear();
    });
  }
}

import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SolarSystemService } from '../../services/solar-system.service';

type Category =
  | 'sun'
  | 'planets'
  | 'moons'
  | 'dwarf-planets'
  | 'asteroids'
  | 'comets';

@Component({
  selector: 'app-solar-system',
  imports: [RouterLink],
  templateUrl: './solar-system.component.html',
  styleUrl: './solar-system.component.scss',
})
export class SolarSystemComponent {
  solar = inject(SolarSystemService);
  activeCategories = signal<Set<Category>>(new Set(['sun', 'planets']));
  mapSize: 'compact' | 'normal' | 'large' = 'normal';
  constructor() {
    this.solar.load();
  }

  toggleCategory(c: Category) {

    const set = new Set(this.activeCategories());

    if (set.has(c)) {
      set.delete(c);
    } else {
      set.add(c);
    }

    this.activeCategories.set(set);
  }

  showAll() {

    this.activeCategories.set(
      new Set([
        'sun',
        'planets',
        'moons',
        'dwarf-planets',
        'asteroids',
        'comets'
      ])
    );

  }

  showNone() {
    this.activeCategories.set(new Set());
  }

}
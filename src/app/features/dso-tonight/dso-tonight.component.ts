import { Component, inject, OnInit, signal } from '@angular/core';
import { MessierService } from '../../services/messier.service';
import { CommonModule } from '@angular/common';
import { MessierTimeService } from '../../services/messier-time.service';
import { ForecastContextService } from '../../services/forecast-context.service';
import { LocationSearchComponent } from "../location-search/location-search.component";
import { LocationService } from '../../services/location.service';
import { MessierObject } from '../../models/messier.model'; 
import { Router } from '@angular/router';

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
  router = inject(Router);
  
  readonly selected = signal<number | null>(null);
  mapSize: 'compact' | 'normal' | 'large' = 'normal';


  ngOnInit() {
    this.messier.load();
  }
  
  difficultyLevel(diff: string): number {
    switch (diff) {
      case 'Very Easy': return 1;
      case 'Easy': return 2;
      case 'Moderate': return 3;
      case 'Hard': return 4;
      case 'Very Hard': return 5;
      default: return 0;
    }
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
    
    const diff = Math.floor((target.getTime() - base.getTime()) / (24 * 3600_000));
    
    return diff === days;
  }
  
  goToDso(m: MessierObject) {
    this.messier.selectMessierByNumber(m.messierNumber);
    this.router.navigate(['/dso', 'M' + m.messierNumber]);
  }

  setDifficulty(v:
    'Easy' | 'Moderate' | 'Hard' | 'Very Easy' | 'Very Hard' | null) {
    this.messier.difficultyFilter.set(v);
  }

  setSeason(v: 'Winter' | 'Spring' | 'Summer' | 'Autumn' | null) {
    this.messier.seasonFilter.set(v);
  }

  setConstellation(v: string | null) {
    this.messier.constellationFilter.set(v);
  }

  setAltitude(n: number){
    this.messier.altitudeFilter.set(n);
  }

  clearFilters() {
    this.messier.difficultyFilter.set(null);
    this.messier.seasonFilter.set(null);
    this.messier.constellationFilter.set(null);
    this.messier.altitudeFilter.set(15);
  }


}
import { Component, inject, OnInit, signal } from '@angular/core';
import { MessierService } from '../../services/messier.service';
import { CommonModule } from '@angular/common';
import { MessierTimeService } from '../../services/messier-time.service';
import { ForecastContextService } from '../../services/forecast-context.service';
import { LocationSearchComponent } from "../location-search/location-search.component";
import { LocationService } from '../../services/location.service';
import { StarhopMapComponent } from "../starhop-map/starhop-map.component";
import { MessierObject } from '../../models/messier.model'; 

@Component({
  selector: 'app-dso-tonight',
  imports: [CommonModule, LocationSearchComponent, StarhopMapComponent],
  templateUrl: './dso-tonight.component.html',
  styleUrl: './dso-tonight.component.scss',
})
export class DsoTonightComponent implements OnInit {
  messier = inject(MessierService);
  location = inject(LocationService)
  time = inject(MessierTimeService);
  context = inject(ForecastContextService);

  readonly selected = signal<number | null>(null);
  readonly starhopOpen = signal<MessierObject | null>(null); 

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
    
    const diff = Math.floor((target.getTime() - base.getTime()) / (24 * 3600_000));
    
    return diff === days;
  }
  
  openStarhop(m: MessierObject) {
    this.starhopOpen.set(m);
  }
  
  closeStarhop() {
    this.starhopOpen.set(null);
  }

  parseRa(raString: string): number {
    const parts = raString.split(':').map(parseFloat);
    if (parts.length !== 3) return 0;
    const [hours, minutes, seconds] = parts;
    const decimalHours = hours + minutes/60 + seconds/3600;
    return decimalHours * 15; 
  }

  parseDec(decString: string): number {
    const sign = decString.trim().startsWith('-') ? -1 : 1;
    const clean = decString.replace(/[+-]/, '');
    const parts = clean.split(':').map(parseFloat);
    if (parts.length !== 3) return 0;
    const [degrees, minutes, seconds] = parts;
    return sign * (degrees + minutes/60 + seconds/3600);
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

  clearFilters() {
    this.messier.difficultyFilter.set(null);
    this.messier.seasonFilter.set(null);
    this.messier.constellationFilter.set(null);
  }


}
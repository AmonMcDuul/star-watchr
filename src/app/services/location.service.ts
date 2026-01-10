import { Injectable, signal, effect, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LocationResult } from '../models/location-result.model';

@Injectable({ providedIn: 'root' })
export class LocationService {
  private _http = inject(HttpClient);

  private readonly _results = signal<LocationResult[]>([]);
  readonly results = this._results.asReadonly();

  private readonly _selected = signal<LocationResult | null>(this.loadFromStorage());
  readonly selected = this._selected.asReadonly();

  private readonly _query = signal('');
  private debounceTimer: any;
  private cache = new Map<string, LocationResult[]>();

  constructor() {
    effect(() => {
      const selected = this._selected();
      if (selected) {
        localStorage.setItem('lastLocation', JSON.stringify(selected));
      }
    });

    effect(() => {
      const query = this._query();
      if (!query || query.length < 2) {
        this._results.set([]);
        return;
      }

      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.fetch(query), 300);
    });
  }

  setQuery(query: string) {
    this._query.set(query);
  }

  clearResults() {
    this._results.set([]);
  }

  
  selectLocation(loc: LocationResult) {
    this._selected.set({
      display_name: loc.display_name,
      lat: loc.lat,
      lon: loc.lon,
    });
  }
  
  private fetch(query: string) {
    if (this.cache.has(query)) {
      this._results.set(this.cache.get(query)!);
      return;
    }
  
    this._http.get<LocationResult[]>(
      'https://nominatim.openstreetmap.org/search',
      {
        params: { q: query, format: 'json', limit: '5' }
      }
    ).subscribe(results => {
      const uniqueResults = results.filter((r, i, arr) =>
        arr.findIndex(x => x.display_name === r.display_name) === i
      );
  
      this.cache.set(query, uniqueResults);
      this._results.set(uniqueResults);

    });
  }
  
  private loadFromStorage(): LocationResult | null {
    const raw = localStorage.getItem('lastLocation');
    return raw ? JSON.parse(raw) : null;
  }

}

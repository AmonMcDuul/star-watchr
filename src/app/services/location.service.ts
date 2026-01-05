import { Injectable, signal, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface LocationResult {
  display_name: string;
  lat: string;
  lon: string;
}

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly _results = signal<LocationResult[]>([]);
  readonly results = this._results.asReadonly();

  private readonly _query = signal('');
  private debounceTimer: any;
  private cache = new Map<string, LocationResult[]>();

  constructor(private http: HttpClient) {
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
  
  private fetch(query: string) {
    if (this.cache.has(query)) {
      this._results.set(this.cache.get(query)!);
      return;
    }
  
    this.http.get<LocationResult[]>(
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
  
}

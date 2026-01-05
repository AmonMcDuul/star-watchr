import { Injectable, signal } from '@angular/core';
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

  constructor(private http: HttpClient) {}

  search(query: string) {
    if (!query) {
      this._results.set([]);
      return;
    }

    this.http.get<LocationResult[]>(
      'https://nominatim.openstreetmap.org/search',
      {
        params: {
          q: query,
          format: 'json',
          limit: 5,
        }
      }
    ).subscribe(r => this._results.set(r));
  }
}

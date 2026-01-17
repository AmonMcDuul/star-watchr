import { HttpClient } from '@angular/common/http';
import { Injectable, signal, computed, inject } from '@angular/core';
import { AstroCard } from '../models/astro-card.model';
import { mapOpenMeteoToAstroCards } from '../utils/open-meteo.util';

@Injectable({ providedIn: 'root' })
export class OpenMeteoService {
  private http = inject(HttpClient);

  private _data = signal<any | null>(null);
  private _loading = signal(false);
  private _error = signal<string | null>(null);

  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly cards = computed<AstroCard[]>(() => {
    if (!this._data()) return [];
    return mapOpenMeteoToAstroCards(this._data());
  });

  load(lat: number, lon: number) {
    this._loading.set(true);

    this.http.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: lat.toString(),
        longitude: lon.toString(),
        hourly: [
          'cloudcover',
          'cloudcover_high',
          'cloudcover_mid',
          'cloudcover_low',
          'temperature_2m',
          'windspeed_10m',
          'winddirection_10m',
          'visibility'
        ],
        timezone: 'auto'
      }
    }).subscribe({
      next: r => {
        this._data.set(r);
        this._loading.set(false);
      },
      error: () => {
        this._error.set('Open-Meteo load failed');
        this._loading.set(false);
      }
    });
  }
}

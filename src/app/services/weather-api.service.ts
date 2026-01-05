import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AstroCardVM } from '../models/astro-card.model';
import { AstroWeatherResponse } from '../models/astro-weather-response.model';
import { mapToAstroCardVM } from '../utils/astro.util';

@Injectable({ providedIn: 'root' })
export class WeatherApiService {
  private readonly baseUrl = 'https://www.7timer.info/bin/api.pl';

  private readonly _data = signal<AstroWeatherResponse | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  private readonly forecast = computed(() =>
    this._data()?.dataseries.filter(d => d.cloudcover !== -9999) ?? []
  );

  readonly cards = computed<AstroCardVM[]>(() =>
    this.forecast().map(mapToAstroCardVM)
  );

  constructor(private http: HttpClient) {}

  loadAstroWeather(lat: number, lon: number) {
    this._loading.set(true);
    this._error.set(null);

    this.http.get<AstroWeatherResponse>(this.baseUrl, {
      params: {
        lat,
        lon,
        product: 'astro',
        output: 'json',
      }
    }).subscribe({
      next: data => {
        this._data.set(data);
        this._loading.set(false);
      },
      error: () => {
        this._error.set('Kon astro-weer niet laden');
        this._loading.set(false);
      }
    });
  }
}

import { HttpClient } from "@angular/common/http";
import { AstroWeatherResponse } from "../models/astro-weather-response.model";
import { Injectable, signal, computed, inject } from "@angular/core";
import { mapToAstroCardVM } from "../utils/astro.util";

@Injectable({ providedIn: 'root' })
export class WeatherApiService {
  private _http = inject(HttpClient); 

  private readonly _data = signal<AstroWeatherResponse | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly cards = computed(() => {
    const r = this._data();
    if (!r) return [];

    const init = new Date(r.init);

    return r.dataseries
      // .filter(d => d.cloudcover !== -9999)
      .map(d => mapToAstroCardVM(d, init));
  });

  load(lat: number, lon: number) {
    this._loading.set(true);
    this._error.set(null);
  
    this._http.get<AstroWeatherResponse>('https://www.7timer.info/bin/astro.php', {
      params: {
        lat: lat.toString(),
        lon: lon.toString(),
        ac: '0', 
        unit: 'metric',
        output: 'json',
        tzshift: '0'
      }
    }).subscribe({
      next: r => {
        this._data.set(r);
        this._loading.set(false);
      },
      error: () => {
        this._error.set("Can't load astro-weather");
        this._loading.set(false);
      }
    });
  }
  
}

import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly userSeedKey = 'analytics_user_seed';
  private apiUrl = 'https://starwatchr-api.azurewebsites.net'

  constructor(private http: HttpClient) {}

  private getUserSeed(): string {
    let seed = localStorage.getItem(this.userSeedKey);
    if (!seed) {
      seed = crypto.randomUUID();
      localStorage.setItem(this.userSeedKey, seed);
    }
    return seed;
  }

  trackPageView(path: string) {
    const payload = {
      userSeed: this.getUserSeed(),
      day: new Date().toISOString().slice(0, 10),
      path
    };

    this.http.post(`${this.apiUrl}/metrics/pageview`, payload, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe();
  }
} 

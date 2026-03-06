import { HttpClient } from "@angular/common/http";
import { Injectable, inject, PLATFORM_ID } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly userSeedKey = 'analytics_user_seed';
  private apiUrl = 'https://starwatchr-api.azurewebsites.net';

  private platformId = inject(PLATFORM_ID);

  constructor(private http: HttpClient) {}

  private getUserSeed(): string {
    if (!isPlatformBrowser(this.platformId)) {
      return 'ssg';
    }

    let seed = localStorage.getItem(this.userSeedKey);

    if (!seed) {
      seed = crypto.randomUUID();
      localStorage.setItem(this.userSeedKey, seed);
    }

    return seed;
  }

  trackPageView(path: string) {
    if (!isPlatformBrowser(this.platformId)) return;

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
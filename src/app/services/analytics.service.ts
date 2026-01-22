import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly userSeedKey = 'analytics_user_seed';

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

    this.http.post('/analytics/pageview', payload)
      .subscribe({ error: () => {} });
  }
}

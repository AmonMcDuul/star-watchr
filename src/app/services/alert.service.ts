import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AlertService {
  subscribe(email: string, minScore: number) {
    console.log('subscribe alert', email, minScore);
  }
}

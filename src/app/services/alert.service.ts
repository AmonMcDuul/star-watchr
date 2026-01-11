import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AlertService {
  subscribe(email: string) {
    console.log('subscribe alert', email);
  }
}

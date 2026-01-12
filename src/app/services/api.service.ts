import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { NasaApod } from '../models/NasaApod.model';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = 'https://starwatchr-api.azurewebsites.net'

  constructor(private http: HttpClient) {}

  setAlive(): Observable<void> {
    return this.http.get<any>(`${this.apiUrl}/Email/setalive`);
  }

  sendEmail(subject: string, body: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/Email/send`, {
      subject,
      body
    });
  }

  getTodayApod(): Observable<NasaApod> {
    return this.http.get<NasaApod>(`${this.apiUrl}/NasaApod/today`);
  }
}

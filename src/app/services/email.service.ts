import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class EmailService {
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
}

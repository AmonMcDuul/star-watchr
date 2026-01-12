import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private apiUrl = 'https://starwatchr.azurewebsites.net'

  constructor(private http: HttpClient) {}

  setAlive(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/Email/setalive`);
  }

  sendEmail(subject: string, body: string): Observable<any> {
    const url = `${this.apiUrl}/Email/send`;
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    const emailRequest = { subject, body };

    return this.http.post<any>(url, emailRequest, { headers });
  }
}

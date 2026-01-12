import { Component, inject, signal } from '@angular/core';
import { NasaApod } from '../../models/NasaApod.model';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-apod',
  imports: [],
  templateUrl: './apod.component.html',
  styleUrl: './apod.component.scss',
})

export class ApodComponent {
  private api = inject(ApiService);

  apod = signal<NasaApod | null>(null);
  loading = signal(true);
  error = signal(false);

  constructor() {
    this.loadApod();
  }

  loadApod() {
    this.api.getTodayApod().subscribe({
      next: (apod) => {
        this.apod.set(apod);
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }
}

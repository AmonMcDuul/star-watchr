import { Component, inject } from '@angular/core';
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

  apod?: NasaApod;
  loading = true;
  error = false;

  ngOnInit(): void {
    this.api.getTodayApod().subscribe({
      next: apod => {
        this.apod = apod;
        this.loading = false;
      },
      error: err => {
        console.error('APOD load failed', err);
        this.error = true;
        this.loading = false;
      }
    });
  }
}

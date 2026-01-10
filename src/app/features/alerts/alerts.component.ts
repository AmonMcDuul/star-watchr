import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-alerts',
  imports: [CommonModule, FormsModule],
  templateUrl: './alerts.component.html',
  styleUrl: './alerts.component.scss',
})
export class AlertsComponent {
  email = '';
  subscribed = false;

  conditions = {
    cloudCover: '≤ 3',
    seeing: '≥ 6',
    transparency: '≥ 6',
    nightOnly: true,
  };

  submit() {
    if (!this.email) return;

    console.log('Subscribed:', this.email);

    this.subscribed = true;
  }
}

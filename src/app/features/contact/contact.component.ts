import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-contact',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
})
export class ContactComponent implements OnInit{
  private apiService = inject(ApiService);

  submitAttempted = false;
  showConfirmation = false;

  contactForm = new FormGroup({
    idea: new FormControl('', Validators.required),
    name: new FormControl(''),
    email: new FormControl('', [Validators.required, Validators.email]),
    honeypot: new FormControl('')
  });

  ngOnInit(): void {
    this.apiService.setAlive().subscribe({
      error: err => console.error('setAlive error:', err)
    });
  }

  showError(controlName: string): boolean {
    const control = this.contactForm.get(controlName);
    return !!(
      control &&
      control.invalid &&
      (control.touched || this.submitAttempted)
    );
  }

  onSubmit(): void {
    this.submitAttempted = true;

    if (this.contactForm.get('honeypot')?.value) {
      return;
    }

    if (this.contactForm.invalid) {
      return;
    }

    const body =
      'Idea: ' + this.contactForm.get('idea')?.value + '\n\n' +
      'Name: ' + (this.contactForm.get('name')?.value || '—') + '\n' +
      'Email: ' + this.contactForm.get('email')?.value;

    this.apiService.sendEmail(
      'New message from StarWatchr',
      body
    ).subscribe({
      next: () => {
        this.showConfirmation = true;
        this.contactForm.reset();
        this.submitAttempted = false;

        setTimeout(() => {
          this.showConfirmation = false;
        }, 8000);
      },
      error: err => {
        console.error('sendEmail error:', err);
      }
    });
  }
}
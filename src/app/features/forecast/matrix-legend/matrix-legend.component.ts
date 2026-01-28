import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { UiPreferencesService } from '../../../services/ui-preferences.service';

@Component({
  selector: 'app-matrix-legend',
  imports: [CommonModule],
  templateUrl: './matrix-legend.component.html',
  styleUrl: './matrix-legend.component.scss',
})
export class MatrixLegendComponent {
  showCalculationInfo = false;
  public ui = inject(UiPreferencesService);

  toggleCalculationInfo(): void {
    this.showCalculationInfo = !this.showCalculationInfo;
  }
}
